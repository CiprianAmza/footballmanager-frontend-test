import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { CompetitionHubService, WorldCompetition } from '../services/competition-hub.service';
import { TeamService } from '../services/team.service';

interface ValueRankingRow {
  rank: number;
  personId: number;
  personName: string;
  teamId: number | null;
  teamName: string | null;
  score: number;
  goals: number;
  assists: number;
  appearances: number;
  competitions: number;
  seasons: number;
  predictedPosition: number | null;
  actualPosition: number | null;
  resultLabel: string | null;
  positionDelta: number | null;
  outcomePoints: number;
  expectedPoints: number;
  competitionPrestige: number;
  exactOpeningPrediction: boolean;
  currentTeamId: number | null;
  currentTeamName: string | null;
  trophies: TrophyWon[];
  performances: ManagerPerformance[];
}

interface TrophyWon { season: number; competitionId: number; competitionName: string; }

interface ManagerPerformance {
  season: number;
  competitionId: number;
  competitionName: string;
  teamId: number;
  teamName: string;
  matchesManaged: number;
  value: number;
  predictedPosition: number | null;
  actualPosition: number | null;
  resultLabel: string | null;
  positionDelta: number | null;
  outcomePoints: number;
  expectedPoints: number;
  competitionPrestige: number;
  scoreWeight: number;
  titleBonus: number;
  exactOpeningPrediction: boolean;
  trophyWon: boolean;
}

interface ValueRankingResponse {
  subject: 'players' | 'managers';
  scope: 'season' | 'all-time';
  season: number | null;
  competitionId: number | null;
  currentSeason: number;
  scoringVersion: string;
  rows: ValueRankingRow[];
}

type SortDirection = 'asc' | 'desc';
type SortValue = number | string | null;
type RankingSort = 'rank' | 'name' | 'club' | 'score' | 'matches' | 'goals' | 'assists'
  | 'competitions' | 'seasons' | 'trophies' | 'results' | 'prediction' | 'position'
  | 'delta' | 'outcome' | 'prestige';
type DetailSort = 'season' | 'club' | 'competition' | 'prediction' | 'finish' | 'delta'
  | 'outcome' | 'expected' | 'prestige' | 'scoreWeight' | 'titleBonus' | 'matches' | 'value' | 'trophy';

@Component({
  selector: 'app-value-rankings',
  templateUrl: './value-rankings.component.html',
  styleUrls: ['./value-rankings.component.css']
})
export class ValueRankingsComponent implements OnInit, OnDestroy {
  subject: 'players' | 'managers' = 'players';
  scope: 'season' | 'all-time' = 'season';
  season = 1;
  competitionId: number | null = null;
  competitions: WorldCompetition[] = [];
  data?: ValueRankingResponse;
  sortedRows: ValueRankingRow[] = [];
  sortKey: RankingSort = 'score';
  sortDirection: SortDirection = 'desc';
  sortedPerformances: ManagerPerformance[] = [];
  detailSortKey: DetailSort = 'season';
  detailSortDirection: SortDirection = 'desc';
  loading = false;
  error = '';
  expandedManagerKey: string | null = null;
  private subscriptions = new Subscription();

  constructor(private http: HttpClient, private hub: CompetitionHubService,
              private route: ActivatedRoute, public teamService: TeamService) {}

  ngOnInit(): void {
    this.season = this.teamService.currentSeason;
    this.subscriptions.add(this.route.queryParamMap.subscribe(params => {
      const subject = params.get('subject');
      const scope = params.get('scope');
      this.subject = subject === 'managers' ? 'managers' : 'players';
      this.scope = scope === 'all-time' ? 'all-time' : 'season';
      this.season = Number(params.get('season')) || this.teamService.currentSeason;
      this.competitionId = Number(params.get('competitionId')) || null;
      this.load();
    }));
    this.subscriptions.add(this.hub.worldOverview().subscribe({
      next: result => this.competitions = result.competitions,
      error: () => this.competitions = []
    }));
    this.subscriptions.add(this.teamService.refresh$.subscribe(() => {
      if (this.scope === 'season' && this.season === this.teamService.currentSeason) this.load();
    }));
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.expandedManagerKey = null;
    this.sortedPerformances = [];
    const managerOnly: RankingSort[] = ['results'];
    const playerOnly: RankingSort[] = ['goals', 'assists'];
    const competitionOnly: RankingSort[] = ['prediction', 'position', 'delta', 'outcome', 'prestige'];
    if ((this.subject === 'players' && managerOnly.includes(this.sortKey))
        || (this.subject === 'managers' && playerOnly.includes(this.sortKey))
        || (this.scope !== 'all-time' && this.sortKey === 'seasons')
        || (!this.competitionId && competitionOnly.includes(this.sortKey))) {
      this.sortKey = 'score';
      this.sortDirection = 'desc';
    }
    let params = new HttpParams().set('subject', this.subject).set('scope', this.scope);
    if (this.scope === 'season') params = params.set('season', this.season);
    if (this.competitionId) params = params.set('competitionId', this.competitionId);
    this.subscriptions.add(this.http.get<ValueRankingResponse>(`${urlApp}/value-rankings`, { params }).subscribe({
      next: data => { this.data = data; this.applySort(); this.loading = false; },
      error: () => { this.error = 'The value rankings could not be loaded.'; this.loading = false; }
    }));
  }

  get seasons(): number[] {
    return Array.from({ length: this.teamService.currentSeason }, (_, i) => this.teamService.currentSeason - i);
  }

  get competitionName(): string {
    return this.competitions.find(c => c.competitionId === this.competitionId)?.name || 'All competitions';
  }

  get exactCount(): number { return this.data?.rows.filter(row => row.exactOpeningPrediction).length || 0; }
  get needsContextNote(): boolean { return !!this.data?.rows.some(row => !row.exactOpeningPrediction); }
  get isLive(): boolean { return this.scope === 'season' && this.season === this.teamService.currentSeason; }

  get managerColspan(): number {
    return 8 + (this.scope === 'all-time' ? 1 : 0) + (this.competitionId ? 5 : 0);
  }

  managerRowKey(row: ValueRankingRow): string {
    return `${row.personId}-${row.teamId ?? 'all'}`;
  }

  toggleManager(row: ValueRankingRow): void {
    const key = this.managerRowKey(row);
    this.expandedManagerKey = this.expandedManagerKey === key ? null : key;
    this.applyDetailSort();
  }

  sortBy(key: RankingSort): void {
    this.sortDirection = this.sortKey === key
      ? (this.sortDirection === 'desc' ? 'asc' : 'desc')
      : this.initialDirection(key);
    this.sortKey = key;
    this.applySort();
  }

  sortArrow(key: RankingSort): string {
    return this.sortKey === key ? (this.sortDirection === 'desc' ? ' ↓' : ' ↑') : '';
  }

  sortState(key: RankingSort): 'ascending' | 'descending' | 'none' {
    return this.sortKey === key ? (this.sortDirection === 'desc' ? 'descending' : 'ascending') : 'none';
  }

  private applySort(): void {
    const value = (row: ValueRankingRow): SortValue => {
      switch (this.sortKey) {
        case 'rank': return row.rank;
        case 'name': return row.personName;
        case 'club': return row.currentTeamName;
        case 'matches': return row.appearances;
        case 'goals': return row.goals;
        case 'assists': return row.assists;
        case 'competitions': return row.competitions;
        case 'seasons': return row.seasons;
        case 'trophies': return row.trophies?.length || 0;
        case 'results': return row.performances?.length || 0;
        case 'prediction': return row.predictedPosition;
        case 'position': return row.actualPosition;
        case 'delta': return row.positionDelta;
        case 'outcome': return row.outcomePoints;
        case 'prestige': return row.competitionPrestige;
        default: return row.score;
      }
    };
    this.sortedRows = [...(this.data?.rows || [])].sort((a, b) =>
      this.compare(value(a), value(b), this.sortDirection)
        || b.score - a.score || a.personName.localeCompare(b.personName));
  }

  sortDetailBy(key: DetailSort): void {
    this.detailSortDirection = this.detailSortKey === key
      ? (this.detailSortDirection === 'desc' ? 'asc' : 'desc')
      : this.initialDirection(key);
    this.detailSortKey = key;
    this.applyDetailSort();
  }

  detailSortArrow(key: DetailSort): string {
    return this.detailSortKey === key ? (this.detailSortDirection === 'desc' ? ' ↓' : ' ↑') : '';
  }

  detailSortState(key: DetailSort): 'ascending' | 'descending' | 'none' {
    return this.detailSortKey === key
      ? (this.detailSortDirection === 'desc' ? 'descending' : 'ascending') : 'none';
  }

  private applyDetailSort(): void {
    const details = this.data?.rows.find(row => this.managerRowKey(row) === this.expandedManagerKey)
      ?.performances || [];
    const value = (row: ManagerPerformance): SortValue => {
      switch (this.detailSortKey) {
        case 'season': return row.season;
        case 'club': return row.teamName;
        case 'competition': return row.competitionName;
        case 'prediction': return row.predictedPosition;
        case 'finish': return row.actualPosition;
        case 'delta': return row.positionDelta;
        case 'outcome': return row.outcomePoints;
        case 'expected': return row.exactOpeningPrediction ? row.expectedPoints : null;
        case 'prestige': return row.competitionPrestige;
        case 'scoreWeight': return row.scoreWeight;
        case 'titleBonus': return row.titleBonus;
        case 'matches': return row.matchesManaged;
        case 'value': return row.value;
        case 'trophy': return row.trophyWon ? 1 : 0;
      }
    };
    this.sortedPerformances = [...details].sort((a, b) =>
      this.compare(value(a), value(b), this.detailSortDirection)
        || b.season - a.season || a.competitionName.localeCompare(b.competitionName));
  }

  private initialDirection(key: RankingSort | DetailSort): SortDirection {
    return ['rank', 'name', 'club', 'competition', 'prediction', 'position', 'finish'].includes(key)
      ? 'asc' : 'desc';
  }

  private compare(a: SortValue, b: SortValue, direction: SortDirection): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const result = typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
      : Number(a) - Number(b);
    return direction === 'asc' ? result : -result;
  }
}
