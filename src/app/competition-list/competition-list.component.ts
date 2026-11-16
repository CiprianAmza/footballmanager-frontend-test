import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, distinctUntilChanged, forkJoin, map, of, Subscription } from 'rxjs';
import { LeagueCompetitionData, Standing } from '../league-competition/league-competition.data';
import { leaguePositionTimeline } from '../league-competition/league-position-timeline';
import { urlApp } from '../app.component';
import { ChairmanClubSummary } from '../chairman-club/chairman-club.models';
import { AuthService } from '../services/auth.service';
import { ChairmanClubService } from '../services/chairman-club.service';
import { TeamService } from '../services/team.service';

interface SeasonObjective {
  competitionId: number;
  objectiveType: string;
  description: string;
  targetValue: number;
  status: string;
}

interface ClubPlayerLeader { playerId: number; playerName: string; value: number; }
interface ClubCompetitionLeaders {
  competitionId: number;
  goals: ClubPlayerLeader[];
  assists: ClubPlayerLeader[];
  rating: ClubPlayerLeader[];
}

interface GroupStanding {
  teamId: number;
  teamName: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
  qualificationRoute?: string;
  qualificationFinal?: boolean;
}

interface CardDetail {
  standings?: Standing[];
  positions?: { round: number; rank: number }[];
  unavailable?: boolean;
}

interface CompetitionData {
  competitionId: number;
  name: string;
  typeId: number;
  tier?: number;
  kind?: string;
  categoryLabel?: string;
  scopeLabel?: string;
  formatLabel?: string;
  tierLabel?: string;
  games?: number;
  wins?: number;
  draws?: number;
  loses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  points?: number;
  form?: string;
  position?: number;
  totalTeams?: number;
  currentRound?: number;
  groupNumber?: number;
  groupStandings?: GroupStanding[];
  status?: string;
  statusLabel?: string;
  entryStage?: string;
  currentStage?: string;
  stageReached?: string;
  start?: {
    round: number;
    stage: string;
    started: boolean;
  };
  nextMatch?: {
    round: number;
    stage: string;
    day?: number;
    date?: string;
    legNumber?: number;
    opponentTeamId: number;
    opponentTeamName: string;
    venue: 'HOME' | 'AWAY';
  };
  elimination?: {
    round: number;
    stage: string;
    day?: number;
    date?: string;
    byTeamId: number;
    byTeamName: string;
    reason?: 'GROUP_TABLE' | 'KNOCKOUT_LOSS';
    score?: string;
    decidedBy?: string;
  };
}

@Component({
  selector: 'app-competition-list',
  templateUrl: './competition-list.component.html',
  styleUrls: ['./competition-list.component.css']
})
export class CompetitionsListComponent implements OnInit, OnDestroy {

  competitions: CompetitionData[] = [];
  cardDetails = new Map<number, CardDetail>();
  objectives = new Map<number, SeasonObjective>();
  leaders = new Map<number, ClubCompetitionLeaders>();
  leadersUnavailable = false;
  loadingLeaders = false;
  private contextRequest?: Subscription;
  private managerContext?: Subscription;
  private teamRequest?: Subscription;
  readonly leaderMetrics = [
    { key: 'goals', label: 'Top scorer' }, { key: 'assists', label: 'Most assists' }, { key: 'rating', label: 'Best average rating' }
  ] as const;
  readonly shortcuts = [
    { view: 'team-overview', label: 'Team Stats' }, { view: 'player-overview', label: 'Player Stats' }, { view: 'rules', label: 'Rules' }
  ] as const;
  controlledClubs: ChairmanClubSummary[] = [];
  selectedTeamId: number | null = null;
  selectedTeamName = '';
  chairmanView = false;
  loading = true;
  errorMessage = '';
  emptyMessage = '';

  get viewTeamId(): number {
    return this.selectedTeamId || this.teamService.teamId;
  }

  constructor(private http: HttpClient,
              private teamService: TeamService,
              private router: Router,
              private route: ActivatedRoute,
              private authService: AuthService,
              private chairmanClubService: ChairmanClubService,
              private competitionData: LeagueCompetitionData) {}

  openCompetition(comp: CompetitionData): void {
    void this.router.navigate(this.competitionLink(comp));
  }

  competitionLink(comp: CompetitionData): (string | number)[] {
    return comp.kind === 'MULTI_STAGE' || comp.typeId === 4 || comp.typeId === 5
      ? ['/european-rounds', comp.competitionId, this.teamService.currentSeason]
      : ['/competition', comp.competitionId];
  }

  shortcutLink(comp: CompetitionData, view: string): (string | number)[] {
    if (this.isLeague(comp)) return ['/competition', comp.competitionId, view === 'rules' ? 'rules' : 'stats'];
    return this.competitionLink(comp);
  }

  shortcutParams(comp: CompetitionData, view: string) {
    if (this.isLeague(comp)) return view === 'rules' ? {} : { view };
    return view === 'rules' ? { detail: 'rules' } : { view: 'stats', detail: view };
  }

  objectiveStatus(objective: SeasonObjective, comp: CompetitionData): string {
    if (objective.status === 'achieved') return 'Achieved';
    if (objective.status === 'failed') return 'Missed';
    if (objective.objectiveType === 'league_position' && comp.games && comp.position && objective.targetValue) {
      return comp.position <= objective.targetValue ? 'On track' : 'Below target';
    }
    if (objective.objectiveType === 'cup_round' || objective.objectiveType === 'european_round') {
      if (comp.status === 'WINNER') return 'Achieved';
      const isRoundTarget = !/^win\b/i.test(objective.description);
      const reached = isRoundTarget && comp.currentRound != null && comp.currentRound >= objective.targetValue
        && (comp.start?.started !== false || objective.targetValue === 0);
      if (reached) return 'Target reached';
      if (comp.elimination || ['ELIMINATED', 'RUNNER_UP', 'DROPPED_TO_STARS_CUP'].includes(comp.status || '')) return 'Below target';
    }
    return 'In progress';
  }

  matchPage(comp: CompetitionData, round: number, fixture = true) {
    if (this.isLeague(comp)) return { view: 'matchday', round };
    return { view: 'matches', round, list: fixture && this.isEuropean(comp) ? 'fixtures' : null };
  }

  matchPageLink(comp: CompetitionData): (string | number)[] {
    return this.isLeague(comp) ? ['/competition', comp.competitionId, 'matches'] : this.competitionLink(comp);
  }

  groupOutcome(route?: string): string {
    switch (route) {
      case 'DIRECT': return 'Qualified';
      case 'PLAYOFF': return 'Playoff';
      case 'DROPPED_TO_STARS_CUP': return 'Stars Cup';
      case 'ELIMINATED': return 'Eliminated';
      default: return '—';
    }
  }

  positionSummary(positions: { round: number; rank: number }[]): string {
    return positions.map(position => 'Matchday ' + position.round + ': ' + position.rank).join(', ');
  }

  positionPoints(positions: { rank: number }[], clubs: number): string {
    return positions.map((position, index) =>
      (positions.length === 1 ? 50 : 3 + index * 94 / (positions.length - 1)) + ',' +
      (4 + (position.rank - 1) * 28 / Math.max(1, clubs - 1))
    ).join(' ');
  }

  ngOnDestroy(): void {
    this.managerContext?.unsubscribe();
    this.contextRequest?.unsubscribe();
    this.teamRequest?.unsubscribe();
  }

  ngOnInit(): void {
    this.chairmanView = this.authService.careerRole === 'CHAIRMAN';
    if (this.chairmanView) {
      this.loadCompetitions();
    } else {
      this.managerContext = combineLatest([this.teamService.teamId$, this.teamService.currentSeason$]).pipe(
        distinctUntilChanged(([oldTeam, oldSeason], [team, season]) => oldTeam === team && oldSeason === season)
      ).subscribe(() => this.loadCompetitions());
    }
  }

  loadCompetitions(): void {
    this.loading = true;
    this.errorMessage = '';
    this.emptyMessage = '';
    if (this.chairmanView) {
      this.loadChairmanClubContext();
      return;
    }
    this.loadTeamCompetitions(this.teamService.teamId);
  }

  selectChairmanClub(teamId: number | string): void {
    const normalizedTeamId = Number(teamId);
    const club = this.controlledClubs.find(item => item.teamId === normalizedTeamId);
    if (!club || normalizedTeamId === this.selectedTeamId) return;

    this.selectedTeamId = club.teamId;
    this.selectedTeamName = club.name;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teamId: club.teamId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.loading = true;
    this.errorMessage = '';
    this.emptyMessage = '';
    this.loadTeamCompetitions(club.teamId);
  }

  private loadChairmanClubContext(): void {
    this.contextRequest?.unsubscribe();
    this.contextRequest = this.chairmanClubService.clubs('CONTROLLED').subscribe({
      next: clubs => {
        this.controlledClubs = (clubs || [])
          .filter(club => club.controlledByPrincipal && Number.isSafeInteger(club.teamId) && club.teamId > 0)
          .sort((left, right) => left.name.localeCompare(right.name) || left.teamId - right.teamId);
        if (this.controlledClubs.length === 0) {
          this.selectedTeamId = null;
          this.selectedTeamName = '';
          this.competitions = [];
          this.loading = false;
          this.emptyMessage = 'You do not currently control a club. Acquire control to view a club\'s competitions.';
          return;
        }

        const requestedTeamId = Number(this.route.snapshot.queryParamMap.get('teamId'));
        const selectedClub = this.controlledClubs.find(club => club.teamId === requestedTeamId)
          || this.controlledClubs[0];
        this.selectedTeamId = selectedClub.teamId;
        this.selectedTeamName = selectedClub.name;
        this.loadTeamCompetitions(selectedClub.teamId);
      },
      error: () => {
        this.controlledClubs = [];
        this.competitions = [];
        this.loading = false;
        this.errorMessage = 'Controlled clubs could not be loaded. Check the connection and try again.';
      }
    });
  }

  private loadTeamCompetitions(teamId: number): void {
    this.teamRequest?.unsubscribe();
    this.cardDetails.clear();
    this.objectives.clear();
    this.leaders.clear();
    this.leadersUnavailable = false;
    this.loadingLeaders = false;
    const requests = new Subscription();
    this.teamRequest = requests;
    if (!Number.isSafeInteger(teamId) || teamId <= 0) {
      this.competitions = [];
      this.loading = false;
      this.emptyMessage = 'No active club is selected.';
      return;
    }
    requests.add(this.http.get<CompetitionData[]>(urlApp + `/competition/getTeamCompetitions/${teamId}`).subscribe({
      next: data => {
        this.competitions = this.dedupe(data || []).sort((a, b) => Number(this.isLeague(b)) - Number(this.isLeague(a)));
        this.loading = false;
        if (this.competitions.length === 0) {
          this.emptyMessage = `No active competition memberships are available for ${this.selectedTeamName || 'this team'}.`;
        } else {
          this.loadCardDetails(teamId, requests);
        }
      },
      error: () => {
        this.competitions = [];
        this.loading = false;
        this.errorMessage = 'Competitions could not be loaded. Check the connection and try again.';
      }
    }));
  }

  private loadCardDetails(teamId: number, requests: Subscription): void {
    const season = this.teamService.currentSeason;
    this.loadingLeaders = true;
    requests.add(this.http.get<SeasonObjective[]>(`${urlApp}/objectives/${teamId}/${season}`).subscribe({
      next: rows => this.objectives = new Map(rows.map(row => [row.competitionId, row])),
      error: () => this.objectives.clear()
    }));
    requests.add(this.http.get<ClubCompetitionLeaders[]>(`${urlApp}/stats/team/${teamId}/season/${season}/competition-leaders`).subscribe({
      next: rows => {
        this.leaders = new Map(rows.map(row => [row.competitionId, row]));
        this.loadingLeaders = false;
      },
      error: () => {
        this.leadersUnavailable = true;
        this.loadingLeaders = false;
      }
    }));
    for (const comp of this.competitions) {
      const id = String(comp.competitionId);
      if (this.isLeague(comp)) {
        requests.add(forkJoin({
          standings: this.competitionData.standings(id, season, season),
          results: this.competitionData.results(id, season).pipe(catchError(() => of([])))
        }).pipe(map(({ standings, results }) => {
          const timeline = leaguePositionTimeline(results, standings);
          const club = timeline.clubs.find(row => row.club.teamId === teamId);
          return { standings, positions: timeline.rounds.map((round, index) => ({ round, rank: club?.ranks[index] ?? 0 }))
            .filter(row => row.rank > 0) };
        })).subscribe({
          next: detail => this.cardDetails.set(comp.competitionId, detail),
          error: () => this.cardDetails.set(comp.competitionId, { unavailable: true })
        }));
      }
    }
  }

  /**
   * Backend now returns one entry per competition. Defensive guard: collapse any
   * duplicate competitionId (e.g. a European comp listed once per qualification
   * round) so the grid never shows duplicate cards.
   */
  trackByCompId(_index: number, comp: CompetitionData): number {
    return comp.competitionId;
  }

  private dedupe(data: CompetitionData[]): CompetitionData[] {
    const seen = new Map<number, CompetitionData>();
    for (const comp of data) {
      if (!seen.has(comp.competitionId)) {
        seen.set(comp.competitionId, comp);
      }
    }
    return Array.from(seen.values());
  }

  isLeague(comp: CompetitionData): boolean {
    return comp.kind === 'LEAGUE' || comp.typeId === 1 || comp.typeId === 3;
  }

  isCup(comp: CompetitionData): boolean {
    return comp.kind === 'KNOCKOUT' || comp.kind === 'SHOWCASE' || comp.typeId === 2 || comp.typeId === 6;
  }

  isEuropean(comp: CompetitionData): boolean {
    return comp.kind === 'MULTI_STAGE' || comp.typeId === 4 || comp.typeId === 5;
  }

  getFormArray(form: string | undefined): string[] {
    if (!form) return [];
    return form.replace(/[^WDL]/g, '').slice(-5).split('');
  }

  getCompetitionColor(comp: CompetitionData): string {
    switch (comp.typeId) {
      case 1: return '#38003c'; // League purple
      case 2: return '#e74c3c'; // Cup red
      case 3: return '#2c3e50'; // Second league dark
      case 4: return '#2e3192'; // Champions blue
      case 5: return '#009460'; // Stars Cup green
      case 6: return '#d5a500'; // Super Cup gold
      case 7: return '#4fc3f7'; // Diamond League
      default: return '#95a5a6';
    }
  }

}
