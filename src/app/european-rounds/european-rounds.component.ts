import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, distinctUntilChanged, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { CalendarEntry } from '../competition-calendar/competition-calendar.component';
import { DetailsView } from '../competition-details/competition-details.data';
import { CompetitionStage, LEADER_CATEGORIES, LeagueCompetitionData, LeagueMatch, PlayerStats } from '../league-competition/league-competition.data';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface MatchResult {
  id?: number;
  team1Id: number;
  team2Id: number;
  teamName1: string;
  teamName2: string;
  score: string;
  roundId: number;
  competitionId: number;
  seasonNumber: number;
  winnerTeamId?: number | null;
  decidedBy?: 'NORMAL' | 'EXTRA_TIME' | 'PENALTIES' | 'AGGREGATE' | 'FIRST_LEG' | null;
  matchIndex?: number;
  day?: number;
  tieId?: number;
  legNumber?: number;
  penaltyTeam1Score?: number | null;
  penaltyTeam2Score?: number | null;
  aggregateTeam1Score?: number | null;
  aggregateTeam2Score?: number | null;
}

interface ResultGroup {
  key: string;
  matches: MatchResult[];
  twoLeg: boolean;
  winnerTeamId: number | null;
}

interface GroupStanding {
  teamId: number;
  teamName: string;
  groupNumber: number;
  potNumber: number;
  games: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface DrawTeam {
  teamId: number;
  teamName: string;
  coefficient: number;
  reputation: number;
}

interface DrawPot {
  potNumber: number;
  label: string;
  teams: DrawTeam[];
}

interface DrawPairing {
  team1: DrawTeam;
  team2: DrawTeam;
  twoLeg: boolean;
}

interface DrawGroup {
  groupNumber: number;
  teams: DrawTeam[];
}

interface EuropeanDraw {
  matchday: number;
  round: number;
  stageLabel: string;
  drawDay: number;
  drawDate: string;
  matchDay: number;
  matchDate: string;
  daysUntilDraw: number;
  status: 'POTS_PUBLISHED' | 'WAITING_FOR_TEAMS' | 'DRAW_COMPLETED';
  statusLabel: string;
  knownTeams: number;
  expectedTeams: number;
  pots: DrawPot[];
  pairings: DrawPairing[];
  groups: DrawGroup[];
}

type EuropeanView = 'overview' | 'stages' | 'draws' | 'groups' | 'matches' | 'stats' | 'awards' | 'history' | 'news';

@Component({
  selector: 'app-european-rounds',
  templateUrl: './european-rounds.component.html',
  styleUrls: ['./european-rounds.component.css']
})
export class EuropeanRoundsComponent implements OnInit, OnDestroy {
  private readonly destroyed = new Subject<void>();
  readonly tabs: { key: EuropeanView; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'draws', label: 'Draws' },
    { key: 'groups', label: 'Groups' }, { key: 'matches', label: 'Matches' },
    { key: 'news', label: 'News' }, { key: 'stats', label: 'Stats' }, { key: 'awards', label: 'Awards' }, { key: 'history', label: 'History' }
  ];
  readonly metrics = LEADER_CATEGORIES;
  statsMetric = '';
  view: EuropeanView = 'overview';
  readonly recordTabs: { key: DetailsView | 'players'; label: string }[] = [
    { key: 'record-overview', label: 'Overview' }, { key: 'players', label: 'Players' }, { key: 'record-attendance', label: 'Attendance' },
    { key: 'record-results', label: 'Results' }, { key: 'record-sequences', label: 'Sequences' }, { key: 'record-clubs', label: 'Clubs' }
  ];
  recordView: DetailsView | 'players' = 'record-overview';
  readonly overviewDetails: { key: DetailsView; label: string }[] = [
    { key: 'teams', label: 'Teams' }, { key: 'rules', label: 'Rules' }, { key: 'managers', label: 'Managers' },
    { key: 'tickets', label: 'Season tickets' }, { key: 'stadiums', label: 'Stadiums' }
  ];
  overviewDetail?: DetailsView;
  readonly statsDetails: { key: DetailsView; label: string }[] = [
    { key: 'team-overview', label: 'Team overview' }, { key: 'team-stats', label: 'Team detailed' },
    { key: 'player-overview', label: 'Player overview' }, { key: 'player-stats', label: 'Player detailed' }, { key: 'referees', label: 'Referees' },
    { key: 'injuries', label: 'Injury table' }, { key: 'suspensions', label: 'Suspensions' }
  ];
  statsDetail?: DetailsView;
  historyView: 'records' | 'winners' | 'notes' | 'create-note' = 'records';
  allMatches: LeagueMatch[] = [];
  groupFilter = 0;
  loading = true;
  loadError = false;
  playerStats: PlayerStats | null = null;
  upcoming: LeagueMatch[] = [];
  recentResults: LeagueMatch[] = [];
  matchView: 'results' | 'fixtures' | 'schedule' | 'review' = 'results';
  scheduleCalendar = false;
  drawEvents: CalendarEntry[] = [];
  private requestedRound: number | null = null;
  private requestedDraw: number | null = null;
  positions = false;

  competitionId!: number;
  season!: number;
  competitionName: string = '';
  maxSeason: number = 1;
  typeId: number = 0;
  totalRounds: number = 0;
  groupRounds: number = 0;
  qualifyingRounds: number = 0;

  // Group stage data
  groups: Map<number, GroupStanding[]> = new Map();
  groupNumbers: number[] = [];

  // All match results by round
  rounds: Map<number, MatchResult[]> = new Map();
  resultGroups: Map<number, ResultGroup[]> = new Map();
  roundNumbers: number[] = [];

  selectedRound: number = 1;
  stageLabels: Map<number, string> = new Map();
  stages: { stage: CompetitionStage; dates: string[]; upcoming: number; results: number; draw?: EuropeanDraw }[] = [];
  readonly stagePhases: Record<string, string> = {
    QUALIFYING: 'Qualifying', GROUP: 'Group stage', KNOCKOUT: 'Knockout', FINAL: 'Final'
  };
  draws: EuropeanDraw[] = [];
  selectedDrawMatchday: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private teamService: TeamService,
    private router: Router,
    private data: LeagueCompetitionData
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroyed)).subscribe(query => {
      const view = query.get('view');
      this.view = view === 'stages' ? view : this.tabs.find(tab => tab.key === view)?.key || 'overview';
      this.statsMetric = query.get('metric') || '';
      const list = query.get('list');
      this.scheduleCalendar = list === 'calendar';
      this.matchView = this.scheduleCalendar ? 'schedule' : list === 'fixtures' || list === 'schedule' || list === 'review' ? list : 'results';
      const rawRound = query.get('round');
      this.requestedRound = rawRound != null && Number.isInteger(Number(rawRound)) ? Number(rawRound) : null;
      if (this.requestedRound != null && this.roundNumbers.includes(this.requestedRound)) this.selectRound(this.requestedRound);
      this.positions = query.get('table') === 'positions';
      this.overviewDetail = this.overviewDetails.find(tab => tab.key === query.get('detail'))?.key;
      this.statsDetail = this.statsDetails.find(tab => tab.key === query.get('detail'))?.key
          || (query.has('metric') ? 'player-stats' : 'team-overview');
      const archive = query.get('archive');
      this.recordView = this.recordTabs.find(tab => tab.key === query.get('record'))?.key || 'record-overview';
      this.historyView = archive === 'winners' || archive === 'notes' || archive === 'create-note' ? archive : 'records';
      this.groupFilter = Number(query.get('group')) || 0;
      this.requestedDraw = Number(query.get('draw')) || null;
      if (this.draws.some(draw => draw.matchday === this.requestedDraw)) this.selectedDrawMatchday = this.requestedDraw;
    });
    this.route.paramMap.pipe(
      map(params => [Number(params.get('competitionId')), Number(params.get('season')) || this.teamService.currentSeason] as const),
      distinctUntilChanged(([oldId, oldSeason], [id, season]) => oldId === id && oldSeason === season),
      switchMap(([id, season]) => {
        this.competitionId = id;
        this.season = season;
        this.loading = true;
        this.loadError = false;
        this.draws = [];
        this.stages = [];
        this.groupNumbers = [];
        this.roundNumbers = [];
        this.playerStats = null;
        this.upcoming = [];
        return this.loadData(id, season);
      }),
      takeUntil(this.destroyed)
    ).subscribe(result => {
      this.loading = false;
      if (!result) {
        this.loadError = true;
        return;
      }
      this.applyData(result);
    });
    this.data.season().pipe(takeUntil(this.destroyed)).subscribe({
      next: season => this.maxSeason = Number(season),
      error: () => this.maxSeason = Math.max(this.maxSeason, this.season)
    });
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }

  private loadData(id: number, season: number) {
    return forkJoin({
      name: this.http.get(urlApp + `/competition/getCompetitionName/${id}`, { responseType: 'text' }),
      info: this.http.get<{ typeId: number; totalRounds: number; groupRounds: number; qualifyingRounds: number;
        stages?: CompetitionStage[] }>(urlApp + `/competition/getCupRoundCount/${id}`),
      stages: this.data.stages(String(id), season).pipe(catchError(() => of([] as CompetitionStage[]))),
      draws: this.http.get<EuropeanDraw[]>(urlApp + `/competition/europeanDraws/${id}/${season}`),
      groups: this.http.get<GroupStanding[]>(urlApp + `/competition/getEuropeanGroups/${id}/${season}`),
      matches: this.http.get<MatchResult[]>(urlApp + `/competition/getMatchesByCompetitionAndSeason/${id}/${season}`),
      stats: this.data.playerStats(String(id), season).pipe(catchError(() => of(null))),
      schedule: this.data.schedule(String(id), season).pipe(catchError(() => of([] as LeagueMatch[])))
    }).pipe(catchError(() => of(null)));
  }

  private applyData({ name, info, stages, draws, groups, matches, stats, schedule }: {
    name: string; info: { typeId: number; totalRounds: number; groupRounds: number; qualifyingRounds: number;
      stages?: CompetitionStage[] }; stages: CompetitionStage[]; draws: EuropeanDraw[]; groups: GroupStanding[];
    matches: MatchResult[]; stats: PlayerStats | null; schedule: LeagueMatch[];
  }): void {
    this.competitionName = name;
    this.typeId = info.typeId || 0;
    this.totalRounds = info.totalRounds || 0;
    this.groupRounds = info.groupRounds || 0;
    this.qualifyingRounds = info.qualifyingRounds || 0;
    const seasonStages = stages.length ? stages : info.stages || [];
    this.stageLabels = new Map(seasonStages.map(stage => [stage.round, stage.label]));
    this.draws = draws || [];
    this.drawEvents = this.draws.map(draw => ({ day: draw.drawDay, title: draw.stageLabel + ' draw',
      query: { view: 'draws', draw: draw.matchday } }));
    const nextDraw = this.draws.find(draw => draw.status !== 'DRAW_COMPLETED');
    const requestedDraw = this.draws.find(draw => draw.matchday === this.requestedDraw);
    this.selectedDrawMatchday = (requestedDraw || nextDraw || this.draws[this.draws.length - 1])?.matchday ?? null;
    this.playerStats = stats;
    this.upcoming = schedule.filter(match => !match.score);
    this.allMatches = schedule;
    this.recentResults = schedule.filter(match => match.score).sort((a, b) => (b.day || 0) - (a.day || 0)).slice(0, 5);
    this.groups = new Map();
    for (const row of groups) {
      const standings = this.groups.get(row.groupNumber) || [];
      standings.push(row);
      this.groups.set(row.groupNumber, standings);
    }
    this.groups.forEach(standings => standings.sort((a, b) =>
      b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor));
    this.groupNumbers = [...this.groups.keys()].sort((a, b) => a - b);

    this.rounds = new Map();
    for (const match of matches) {
      const round = this.rounds.get(match.roundId) || [];
      round.push(match);
      this.rounds.set(match.roundId, round);
    }
    this.resultGroups = new Map();
    this.rounds.forEach((roundMatches, round) => {
      roundMatches.sort((a, b) => this.matchOrder(a) - this.matchOrder(b));
      this.resultGroups.set(round, this.buildResultGroups(roundMatches));
    });
    this.roundNumbers = [...this.rounds.keys()].sort((a, b) => a - b);
    this.stages = seasonStages.map(stage => {
      const fixtures = schedule.filter(match => match.round === stage.round);
      const draw = this.draws.find(draw => draw.round === stage.round);
      const dates = [...new Set(fixtures.sort((a, b) => (a.day || 0) - (b.day || 0))
        .flatMap(match => match.date ? [match.date] : []))];
      return {
        stage, draw, dates: dates.length ? dates : draw?.matchDate ? [draw.matchDate] : [],
        upcoming: fixtures.filter(match => !match.score).length,
        results: this.rounds.get(stage.round)?.length ?? 0
      };
    });
    this.selectedRound = this.requestedRound != null && this.roundNumbers.includes(this.requestedRound)
      ? this.requestedRound : this.roundNumbers[this.roundNumbers.length - 1] ?? 1;
  }

  get hasGroupStage(): boolean {
    return this.typeId === 4 || this.typeId === 5;
  }

  get visibleGroups(): number[] {
    return this.groupNumbers.includes(this.groupFilter) ? [this.groupFilter] : this.groupNumbers;
  }

  selectGroup(group: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'merge',
      queryParams: { group: group || null } });
  }

  positionHistory(group: number): { rounds: number[]; teams: { team: GroupStanding; positions: (number | null)[] }[] } {
    const groupTeams = this.groups.get(group) || [];
    const teamIds = new Set(groupTeams.map(team => team.teamId));
    const matches = this.allMatches.filter(match => this.stageLabels.get(match.round)?.startsWith('Group')
      && match.team1Id != null && match.team2Id != null && teamIds.has(match.team1Id) && teamIds.has(match.team2Id)
      && !!match.score);
    const rounds = [...new Set(matches.map(match => match.round))].sort((a, b) => a - b);
    const totals = new Map(groupTeams.map(team => [team.teamId, { points: 0, goals: 0, difference: 0 }]));
    const snapshots = rounds.map(round => {
      for (const match of matches.filter(row => row.round === round)) {
        const score = match.score?.match(/^(\d+)\s*-\s*(\d+)/);
        if (!score) continue;
        const homeGoals = +score[1];
        const awayGoals = +score[2];
        const home = totals.get(match.team1Id!)!;
        const away = totals.get(match.team2Id!)!;
        home.points += homeGoals === awayGoals ? 1 : homeGoals > awayGoals ? 3 : 0;
        away.points += homeGoals === awayGoals ? 1 : awayGoals > homeGoals ? 3 : 0;
        home.goals += homeGoals;
        away.goals += awayGoals;
        home.difference += homeGoals - awayGoals;
        away.difference += awayGoals - homeGoals;
      }
      const ranked = [...totals.entries()].sort(([, a], [, b]) =>
        b.points - a.points || b.difference - a.difference || b.goals - a.goals);
      return new Map(ranked.map(([id, stats], index) => {
        const tied = ranked.findIndex(([, other]) => other.points === stats.points &&
          other.difference === stats.difference && other.goals === stats.goals);
        return [id, Math.min(index, tied) + 1];
      }));
    });
    return { rounds, teams: groupTeams.map(team => ({ team, positions: snapshots.map(snapshot => snapshot.get(team.teamId) ?? null) })) };
  }

  get visibleUpcoming(): LeagueMatch[] {
    const selected = this.requestedRound;
    return selected == null ? this.upcoming : this.upcoming.filter(match => match.round === selected);
  }

  get overviewMatches(): LeagueMatch[] {
    return this.upcoming.length ? this.upcoming.slice(0, 5) : this.allMatches.slice(-5);
  }

  selectRound(r: number): void {
    this.selectedRound = r;
  }

  getRoundLabel(r: number): string {
    return this.stageLabels.get(r) || `Round ${r}`;
  }

  changeSeason(delta: number): void {
    const newSeason = this.season + delta;
    if (newSeason >= 1 && newSeason <= this.maxSeason) {
      void this.router.navigate(['/european-rounds', this.competitionId, newSeason],
        { queryParamsHandling: 'preserve' });
    }
  }

  getMatchesForRound(): MatchResult[] {
    return this.rounds.get(this.selectedRound) || [];
  }

  getResultGroupsForRound(): ResultGroup[] {
    return this.resultGroups.get(this.selectedRound) || [];
  }

  mainScore(match: MatchResult): string {
    const parsed = this.scorePair(match.score);
    if (!parsed) return match.score;

    // Compatibility with rows written by the old simulator: it selected an
    // extra-time winner but persisted only the 90-minute score. The old API
    // also lacks the new structured decider fields, so show the minimum valid
    // final score instead of an impossible tied "AET" result.
    if (match.decidedBy === 'EXTRA_TIME' && !this.hasStructuredDecider(match)
        && match.winnerTeamId != null) {
      if (match.winnerTeamId === match.team1Id) parsed[0]++;
      if (match.winnerTeamId === match.team2Id) parsed[1]++;
    }
    return `${parsed[0]} – ${parsed[1]}`;
  }

  decisionBadge(match: MatchResult): string | null {
    if (match.decidedBy === 'PENALTIES') return 'PENS';
    if (match.decidedBy === 'EXTRA_TIME') return 'AET';
    if (match.decidedBy === 'FIRST_LEG') return 'LEG 1';
    return null;
  }

  isWinner(match: MatchResult, teamId: number): boolean {
    return match.winnerTeamId === teamId;
  }

  isLoser(match: MatchResult, teamId: number): boolean {
    return match.winnerTeamId != null && match.winnerTeamId !== teamId;
  }

  penaltyScore(match: MatchResult): string | null {
    if (match.penaltyTeam1Score != null && match.penaltyTeam2Score != null) {
      return `${match.penaltyTeam1Score} – ${match.penaltyTeam2Score}`;
    }
    const legacy = match.score?.match(/pens(?:alties)?\s*(\d+)\s*[-–]\s*(\d+)/i);
    return legacy ? `${legacy[1]} – ${legacy[2]}` : null;
  }

  groupWinnerName(group: ResultGroup): string {
    const winnerId = group.winnerTeamId;
    if (winnerId == null) return '';
    for (const match of group.matches) {
      if (match.team1Id === winnerId) return match.teamName1;
      if (match.team2Id === winnerId) return match.teamName2;
    }
    return '';
  }

  groupAggregate(group: ResultGroup): string | null {
    const secondLeg = group.matches.find(match => match.legNumber === 2);
    if (!secondLeg) return null;
    if (secondLeg.aggregateTeam1Score != null && secondLeg.aggregateTeam2Score != null) {
      // The card follows leg one's A/B order; leg two is played B/A.
      return `${secondLeg.aggregateTeam2Score} – ${secondLeg.aggregateTeam1Score}`;
    }
    const legacy = secondLeg.score?.match(/agg\s*(\d+)\s*[-–]\s*(\d+)/i);
    // Legacy rows stored the aggregate in first-leg A/B order even though the
    // second-leg team columns are B/A.
    if (!legacy) return null;
    let teamA = Number(legacy[1]);
    let teamB = Number(legacy[2]);
    if (secondLeg.decidedBy === 'EXTRA_TIME' && teamA === teamB && group.winnerTeamId != null) {
      const firstLeg = group.matches.find(match => match.legNumber === 1);
      if (firstLeg?.team1Id === group.winnerTeamId) teamA++;
      if (firstLeg?.team2Id === group.winnerTeamId) teamB++;
    }
    return `${teamA} – ${teamB}`;
  }

  groupPenaltyScore(group: ResultGroup): string | null {
    const decider = group.matches.find(match => match.decidedBy === 'PENALTIES');
    if (!decider) return null;
    if (decider.penaltyTeam1Score != null && decider.penaltyTeam2Score != null) {
      return `${decider.penaltyTeam2Score} – ${decider.penaltyTeam1Score}`;
    }
    const score = this.penaltyScore(decider);
    if (!score) return null;
    const parts = score.split(' – ');
    return `${parts[1]} – ${parts[0]}`;
  }

  groupDecision(group: ResultGroup): MatchResult['decidedBy'] {
    return group.matches.find(match => match.winnerTeamId != null)?.decidedBy ?? null;
  }

  groupDecidedBy(group: ResultGroup): string | null {
    const decision = this.groupDecision(group);
    if (decision === 'PENALTIES') return 'Advanced after penalty shootout';
    if (decision === 'EXTRA_TIME') return 'Advanced after extra time';
    return group.winnerTeamId != null ? 'Won on aggregate' : null;
  }

  legLabel(match: MatchResult): string {
    return match.legNumber === 2 ? 'Leg 2' : 'Leg 1';
  }

  private buildResultGroups(matches: MatchResult[]): ResultGroup[] {
    const grouped = new Map<string, MatchResult[]>();
    matches.forEach((match, index) => {
      const key = match.tieId && match.tieId > 0
        ? `tie-${match.tieId}`
        : `match-${match.id ?? `${match.team1Id}-${match.team2Id}-${index}`}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(match);
    });

    return Array.from(grouped.entries()).map(([key, groupMatches]) => {
      groupMatches.sort((a, b) => this.matchOrder(a) - this.matchOrder(b));
      return {
        key,
        matches: groupMatches,
        twoLeg: groupMatches.length > 1 && groupMatches.some(match => (match.legNumber || 0) > 0),
        winnerTeamId: groupMatches.find(match => match.winnerTeamId != null)?.winnerTeamId ?? null
      };
    }).sort((a, b) => this.matchOrder(a.matches[0]) - this.matchOrder(b.matches[0]));
  }

  private matchOrder(match: MatchResult): number {
    const slot = match.matchIndex && match.matchIndex > 0
      ? match.matchIndex
      : (match.tieId && match.tieId > 0 ? match.tieId : 1_000_000 + (match.id || 0));
    return slot * 10 + (match.legNumber || 0);
  }

  private scorePair(score: string): [number, number] | null {
    const match = score?.match(/^(\d+)\s*[-–]\s*(\d+)/);
    return match ? [Number(match[1]), Number(match[2])] : null;
  }

  private hasStructuredDecider(match: MatchResult): boolean {
    return Object.prototype.hasOwnProperty.call(match, 'aggregateTeam1Score')
      || Object.prototype.hasOwnProperty.call(match, 'penaltyTeam1Score');
  }

  getPotLabel(potNumber: number): string {
    if (potNumber > 0) return 'P' + potNumber;
    return '';
  }

  get selectedDraw(): EuropeanDraw | null {
    return this.draws.find(draw => draw.matchday === this.selectedDrawMatchday) || null;
  }

  selectDraw(matchday: number): void {
    this.selectedDrawMatchday = Number(matchday);
  }

  drawStatusClass(status: EuropeanDraw['status']): string {
    return status.toLowerCase().replace(/_/g, '-');
  }

}
