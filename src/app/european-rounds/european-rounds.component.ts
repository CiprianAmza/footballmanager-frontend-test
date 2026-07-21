import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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

@Component({
  selector: 'app-european-rounds',
  templateUrl: './european-rounds.component.html',
  styleUrls: ['./european-rounds.component.css']
})
export class EuropeanRoundsComponent implements OnInit {

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
  draws: EuropeanDraw[] = [];
  selectedDrawMatchday: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.competitionId = Number(params['competitionId']);
      this.season = Number(params['season']) || this.teamService.currentSeason;
      this.loadData();
    });
    this.http.get<string>(urlApp + '/competition/getCurrentSeason', { responseType: 'text' as 'json' })
      .subscribe(s => this.maxSeason = Number(s));
  }

  loadData(): void {
    // Load competition name
    this.http.get(urlApp + `/competition/getCompetitionName/${this.competitionId}`, { responseType: 'text' })
      .subscribe(name => this.competitionName = name);

    // Load round info for correct labels
    this.http.get<any>(urlApp + `/competition/getCupRoundCount/${this.competitionId}`)
      .subscribe(info => {
        this.typeId = info.typeId || 0;
        this.totalRounds = info.totalRounds || 0;
        this.groupRounds = info.groupRounds || 0;
        this.qualifyingRounds = info.qualifyingRounds || 0;
        this.stageLabels = new Map((info.stages || []).map((stage: any) => [Number(stage.round), stage.label]));
      });

    this.http.get<EuropeanDraw[]>(urlApp + `/competition/europeanDraws/${this.competitionId}/${this.season}`)
      .subscribe(data => {
        this.draws = data || [];
        const nextDraw = this.draws.find(draw => draw.status !== 'DRAW_COMPLETED');
        const fallback = this.draws.length > 0 ? this.draws[this.draws.length - 1] : null;
        this.selectedDrawMatchday = (nextDraw || fallback)?.matchday ?? null;
      });

    // Load group standings (only relevant for LoC, but safe to call for any)
    this.http.get<GroupStanding[]>(urlApp + `/competition/getEuropeanGroups/${this.competitionId}/${this.season}`)
      .subscribe(data => {
        this.groups = new Map();
        data.forEach(s => {
          if (!this.groups.has(s.groupNumber)) {
            this.groups.set(s.groupNumber, []);
          }
          this.groups.get(s.groupNumber)!.push(s);
        });
        this.groups.forEach((standings) => {
          standings.sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
            return b.goalsFor - a.goalsFor;
          });
        });
        this.groupNumbers = Array.from(this.groups.keys()).sort();
      });

    // Load all match results for this competition and season
    this.http.get<MatchResult[]>(urlApp + `/competition/getMatchesByCompetitionAndSeason/${this.competitionId}/${this.season}`)
      .subscribe(data => {
        this.rounds = new Map();
        this.resultGroups = new Map();
        data.forEach(m => {
          if (!this.rounds.has(m.roundId)) {
            this.rounds.set(m.roundId, []);
          }
          this.rounds.get(m.roundId)!.push(m);
        });
        this.rounds.forEach((matches, round) => {
          matches.sort((a, b) => this.matchOrder(a) - this.matchOrder(b));
          this.resultGroups.set(round, this.buildResultGroups(matches));
        });
        this.roundNumbers = Array.from(this.rounds.keys()).sort((a, b) => a - b);
        if (this.roundNumbers.length > 0) {
          this.selectedRound = this.roundNumbers[0];
        }
      });
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
      this.season = newSeason;
      this.loadData();
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

  groupDecidedBy(group: ResultGroup): string | null {
    const decider = group.matches.find(match => match.winnerTeamId != null);
    if (decider?.decidedBy === 'PENALTIES') return 'Won on penalties';
    if (decider?.decidedBy === 'EXTRA_TIME') return 'Won after extra time';
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
