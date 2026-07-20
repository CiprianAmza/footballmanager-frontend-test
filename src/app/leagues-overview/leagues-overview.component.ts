import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface QualificationZones {
  locGroup: number[];        // 1-based positions that go straight to LoC group stage
  locQualifying: number[];   // → LoC qualifying round
  locPreliminary: number[];  // → LoC preliminary
  starsCup: number[];        // → Stars Cup
}

interface TeamRow {
  position: number;
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
}

interface LeagueOverview {
  competitionId: number;
  name: string;
  nationId: number;
  rank: number;
  qualificationZones: QualificationZones;
  topTeams: TeamRow[];
  totalTeams: number;
}

interface CupOverviewMatch {
  matchIndex: number;
  team1Name: string | null;
  team2Name: string | null;
  score: string | null;
}

interface CupOverview {
  competitionId: number;
  name: string;
  nationId: number;
  rank: number;
  totalRounds: number;
  lastPlayedRound: number;
  currentRoundName: string;
  focusRound: number;
  focusRoundMatches: CupOverviewMatch[];
}

interface CompetitionCatalogItem {
  competitionId: number;
  name: string;
  nationId: number;
  typeId: number;
}

interface CompetitionCatalogResponse {
  id?: number;
  competitionId?: number;
  name: string;
  nationId?: number;
  typeId: number;
}

interface StatisticLeader {
  rank: number;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  appearances: number;
  minutes?: number;
  value: number;
  per90?: number | null;
}

interface GoldenBootLeader extends Omit<StatisticLeader, 'value'> {
  goals: number;
  assists: number;
  firstLeagueGoals: number;
  secondLeagueGoals: number;
  weightedGoals: number;
  weightedGoalPoints: number;
  weightedAssistPoints: number;
  awardPoints?: number;
}

interface LeagueStrengthTier {
  maximumRank: number;
  multiplier: number;
}

interface LeagueStrengthEntry {
  rank: number;
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
  averageTopElevenRating: number;
  multiplier: number;
  teamCount: number;
  completeTeamCount: number;
}

interface LeagueStrengthTable {
  season: number;
  topPlayersPerTeam: number;
  defaultMultiplier: number;
  tiers: LeagueStrengthTier[];
  ranking: LeagueStrengthEntry[];
}

interface StatisticCategory {
  key: string;
  title: string;
  unit: string;
  leaders: StatisticLeader[];
}

interface SeasonOverviewStatistics {
  season: number;
  scope: StatisticsScope;
  scopeLabel: string;
  scoringTitle: string;
  goldenBoot: GoldenBootLeader[];
  goldenBootRule: string;
  goldenBootGoalWeight?: number;
  goldenBootAssistWeight?: number;
  leagueStrength?: LeagueStrengthTable;
  categoriesScope: string;
  categories: StatisticCategory[];
}

interface TeamValueRow {
  rank: number;
  teamId: number;
  teamName: string;
  color1: string | null;
  color2: string | null;
  reputation: number;
  managerName: string;
  currentFormation: string;
  currentXiRating: number;
  bestFormation: string;
  bestPossibleXiRating: number;
  squadMarketValue: number;
  playerCount: number;
}

interface TeamValuesResponse {
  season: number;
  ratingDefinition: string;
  teams: TeamValueRow[];
}

interface WorldBestPlayer {
  slot: string;
  slotPosition: string;
  xPercent: number;
  yPercent: number;
  playerId: number;
  playerName: string;
  naturalPosition: string;
  overallRating: number;
  positionRating: number;
  age: number;
  teamId: number;
  teamName: string;
  teamColor1: string | null;
  teamColor2: string | null;
  nationId: number;
  baseFaceId: number;
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  eyeColor: number;
  faceShape: number;
  noseShape: number;
  eyeShape: number;
  mouthShape: number;
  browShape: number;
  species: string;
}

interface WorldBestXiResponse {
  season: number;
  formation: string;
  selectionRule: string;
  totalRating: number;
  players: WorldBestPlayer[];
}

type OverviewView = 'all' | 'leagues' | 'cups' | 'statistics' | 'team-values' | 'world-xi';
type TeamValueSort = 'power' | 'market' | 'reputation';
type StatisticsScope = 'LEAGUE' | 'CUP' | 'EUROPEAN' | 'ALL';

@Component({
  selector: 'app-leagues-overview',
  templateUrl: './leagues-overview.component.html',
  styleUrls: ['./leagues-overview.component.css']
})
export class LeaguesOverviewComponent implements OnInit, OnDestroy {

  season: number = 1;
  leagues: LeagueOverview[] = [];
  cups: CupOverview[] = [];
  competitions: CompetitionCatalogItem[] = [];
  competitionSearch: string = '';
  catalogLoading: boolean = false;
  catalogError: string = '';

  topN: number = 5;
  topNOptions: number[] = [5, 10];

  view: OverviewView = 'all';

  statistics?: SeasonOverviewStatistics;
  statisticsLoading: boolean = false;
  statisticsError: string = '';
  statisticsScope: StatisticsScope = 'LEAGUE';
  readonly statisticsScopes: { key: StatisticsScope; label: string }[] = [
    { key: 'LEAGUE', label: 'League' },
    { key: 'CUP', label: 'Cup' },
    { key: 'EUROPEAN', label: 'European' },
    { key: 'ALL', label: 'All' }
  ];

  teamValues?: TeamValuesResponse;
  teamValuesLoading = false;
  teamValuesError = '';
  teamValueSearch = '';
  teamValueSort: TeamValueSort = 'power';

  worldBestXi?: WorldBestXiResponse;
  worldBestXiLoading = false;
  worldBestXiError = '';

  // Per-league visibility — keyed by competitionId. Default true.
  visibleLeagues: { [id: number]: boolean } = {};
  visibleCups: { [id: number]: boolean } = {};
  filterOpen: boolean = false;

  loading: boolean = false;
  private refreshSub?: Subscription;

  constructor(
    private http: HttpClient,
    public teamService: TeamService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const requestedView = this.route.snapshot.queryParamMap.get('view') as OverviewView | null;
    if (requestedView && ['all', 'leagues', 'cups', 'statistics', 'team-values', 'world-xi'].includes(requestedView)) {
      this.view = requestedView;
    }
    this.loadAll();
    // Refresh whenever the game advances so standings update in-place
    this.refreshSub = this.teamService.refresh$.subscribe(() => this.loadAll());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  setView(v: OverviewView): void {
    this.view = v;
    if (v === 'statistics' && !this.statistics) this.loadStatistics();
    if (v === 'team-values' && !this.teamValues) this.loadTeamValues();
    if (v === 'world-xi' && !this.worldBestXi) this.loadWorldBestXi();
  }

  setTopN(n: number): void {
    this.topN = n;
    this.loadLeagues();
  }

  toggleLeagueVisibility(id: number): void {
    this.visibleLeagues[id] = !this.visibleLeagues[id];
  }

  toggleCupVisibility(id: number): void {
    this.visibleCups[id] = !this.visibleCups[id];
  }

  selectAllLeagues(visible: boolean): void {
    for (const l of this.leagues) this.visibleLeagues[l.competitionId] = visible;
  }
  selectAllCups(visible: boolean): void {
    for (const c of this.cups) this.visibleCups[c.competitionId] = visible;
  }

  get visibleLeagueList(): LeagueOverview[] {
    return this.leagues.filter(l => this.visibleLeagues[l.competitionId] !== false);
  }
  get visibleCupList(): CupOverview[] {
    return this.cups.filter(c => this.visibleCups[c.competitionId] !== false);
  }

  get filteredCompetitions(): CompetitionCatalogItem[] {
    const query = this.competitionSearch.trim().toLocaleLowerCase();
    if (!query) return this.competitions;
    return this.competitions.filter(competition => competition.name.toLocaleLowerCase().includes(query));
  }

  get visibleTeamValues(): TeamValueRow[] {
    const query = this.teamValueSearch.trim().toLocaleLowerCase();
    const rows = (this.teamValues?.teams || []).filter(team =>
      !query || team.teamName.toLocaleLowerCase().includes(query)
    );
    return [...rows].sort((left, right) => {
      if (this.teamValueSort === 'market') return right.squadMarketValue - left.squadMarketValue;
      if (this.teamValueSort === 'reputation') return right.reputation - left.reputation;
      return right.bestPossibleXiRating - left.bestPossibleXiRating;
    });
  }

  loadAll(): void {
    this.loadCompetitionCatalog();
    this.loadLeagues();
    this.loadCups();
    if (this.view === 'statistics') this.loadStatistics();
    if (this.view === 'team-values') this.loadTeamValues();
    if (this.view === 'world-xi') this.loadWorldBestXi();
  }

  loadTeamValues(): void {
    this.teamValuesLoading = true;
    this.teamValuesError = '';
    this.http.get<TeamValuesResponse>(`${urlApp}/overview/team-values`).subscribe({
      next: data => {
        this.teamValues = data;
        this.teamValuesLoading = false;
      },
      error: () => {
        this.teamValuesError = 'Team values could not be loaded.';
        this.teamValuesLoading = false;
      }
    });
  }

  loadWorldBestXi(): void {
    this.worldBestXiLoading = true;
    this.worldBestXiError = '';
    this.http.get<WorldBestXiResponse>(`${urlApp}/overview/world-best-xi`).subscribe({
      next: data => {
        this.worldBestXi = data;
        this.worldBestXiLoading = false;
      },
      error: () => {
        this.worldBestXiError = 'World Best XI could not be loaded.';
        this.worldBestXiLoading = false;
      }
    });
  }

  setTeamValueSort(sort: TeamValueSort): void {
    this.teamValueSort = sort;
  }

  teamValueSortLabel(): string {
    if (this.teamValueSort === 'market') return 'Squad market value';
    if (this.teamValueSort === 'reputation') return 'Club reputation';
    return 'Best possible XI';
  }

  formatMoney(value: number): string {
    if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
    return `€${value}`;
  }

  powerPercent(team: TeamValueRow): number {
    const maximum = Math.max(...(this.teamValues?.teams || []).map(row => row.bestPossibleXiRating), 1);
    return Math.max(3, team.bestPossibleXiRating * 100 / maximum);
  }

  loadStatistics(): void {
    const season = this.teamService.currentSeason || this.season || 1;
    this.statisticsLoading = true;
    this.statisticsError = '';
    this.http.get<SeasonOverviewStatistics>(
      `${urlApp}/stats/overview/${season}?limit=10&scope=${this.statisticsScope}`
    ).subscribe({
      next: data => {
        this.statistics = data;
        this.statisticsLoading = false;
      },
      error: () => {
        this.statisticsError = 'Season statistics could not be loaded.';
        this.statisticsLoading = false;
      }
    });
  }

  setStatisticsScope(scope: StatisticsScope): void {
    if (this.statisticsScope === scope) return;
    this.statisticsScope = scope;
    this.loadStatistics();
  }

  loadCompetitionCatalog(): void {
    this.catalogLoading = true;
    this.catalogError = '';
    this.http.get<CompetitionCatalogResponse[]>(`${urlApp}/competition/getAllCompetitions`).subscribe({
      next: data => {
        const unique = new Map<number, CompetitionCatalogItem>();
        for (const item of data || []) {
          const competitionId = item.competitionId ?? item.id;
          if (!competitionId || unique.has(competitionId)) continue;
          unique.set(competitionId, {
            competitionId,
            name: item.name,
            nationId: item.nationId ?? 0,
            typeId: item.typeId
          });
        }
        this.competitions = Array.from(unique.values())
          .sort((left, right) => left.name.localeCompare(right.name));
        this.catalogLoading = false;
      },
      error: () => {
        this.catalogError = 'Competitions could not be loaded.';
        this.catalogLoading = false;
      }
    });
  }

  openCompetition(competition: CompetitionCatalogItem): void {
    if (this.isEuropean(competition)) {
      this.router.navigate([
        '/european-rounds',
        competition.competitionId,
        this.teamService.currentSeason || this.season || 1
      ]);
      return;
    }
    this.router.navigate(['/comp', competition.competitionId]);
  }

  isEuropean(competition: CompetitionCatalogItem): boolean {
    return competition.typeId === 4 || competition.typeId === 5;
  }

  competitionType(competition: CompetitionCatalogItem): string {
    switch (competition.typeId) {
      case 1: return 'First League';
      case 2: return 'National Cup';
      case 3: return 'Second League';
      case 4: return 'Champions Competition';
      case 5: return 'European Cup';
      case 6: return 'Super Cup';
      default: return 'Competition';
    }
  }

  competitionMark(competition: CompetitionCatalogItem): string {
    if (competition.typeId === 4) return 'CL';
    if (competition.typeId === 5) return 'SC';
    if (competition.typeId === 2) return 'CUP';
    if (competition.typeId === 6) return 'SUP';
    return competition.typeId === 3 ? 'L2' : 'L1';
  }

  competitionColor(competition: CompetitionCatalogItem): string {
    switch (competition.typeId) {
      case 1: return '#7c5cff';
      case 2: return '#ff5d5d';
      case 3: return '#3ba4d8';
      case 4: return '#2d6cdf';
      case 5: return '#14a37f';
      case 6: return '#d5a500';
      default: return '#95a5a6';
    }
  }

  competitionDescription(competition: CompetitionCatalogItem): string {
    if (competition.typeId === 1 || competition.typeId === 3) {
      return 'Standings, fixtures, results and season statistics.';
    }
    if (competition.typeId === 2) return 'Cup rounds, fixtures and results.';
    if (competition.typeId === 6) return 'League champion versus cup winner.';
    return 'Group stage and knockout rounds.';
  }

  competitionScope(competition: CompetitionCatalogItem): string {
    return this.isEuropean(competition) || competition.nationId === 0
      ? 'International'
      : 'Domestic';
  }

  trackCompetition(_index: number, competition: CompetitionCatalogItem): number {
    return competition.competitionId;
  }

  loadLeagues(): void {
    this.loading = true;
    this.http.get<{ season: number; topN: number; leagues: LeagueOverview[] }>(
      `${urlApp}/competition/leaguesOverview?topN=${this.topN}`
    ).subscribe({
      next: (data) => {
        this.season = data.season;
        this.leagues = data.leagues;
        // First-time: mark all visible by default. Preserve user toggles afterwards.
        for (const l of this.leagues) {
          if (this.visibleLeagues[l.competitionId] === undefined) {
            this.visibleLeagues[l.competitionId] = true;
          }
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadCups(): void {
    this.http.get<{ season: number; cups: CupOverview[] }>(
      `${urlApp}/competition/cupsOverview`
    ).subscribe({
      next: (data) => {
        this.cups = data.cups;
        for (const c of this.cups) {
          if (this.visibleCups[c.competitionId] === undefined) {
            this.visibleCups[c.competitionId] = true;
          }
        }
      }
    });
  }

  cupRoundName(cup: CupOverview): string {
    if (cup.focusRound <= 1 || cup.totalRounds <= 0) {
      return cup.currentRoundName || `Round ${Math.max(1, cup.focusRound)}`;
    }

    const fromEnd = cup.totalRounds - cup.focusRound + 1;
    switch (fromEnd) {
      case 1: return 'Final';
      case 2: return 'Semi-Final';
      case 3: return 'Quarter-Final';
      case 4: return 'Round of 16';
      case 5: return 'Round of 32';
      default: return `Round ${cup.focusRound}`;
    }
  }

  /**
   * Maps a 1-based position to a CSS qualification class for row coloring.
   * Priority: LoC group > LoC qualifying > LoC preliminary > Stars Cup > nothing.
   */
  zoneFor(zones: QualificationZones, position: number, totalTeams: number): string {
    if (zones.locGroup.includes(position)) return 'zone-loc-group';
    if (zones.locQualifying.includes(position)) return 'zone-loc-qual';
    if (zones.locPreliminary.includes(position)) return 'zone-loc-prelim';
    if (zones.starsCup.includes(position)) return 'zone-stars-cup';
    // Relegation: bottom 2 positions of the league (only if we're showing enough rows)
    if (totalTeams > 0 && position >= totalTeams - 1) return 'zone-relegation';
    return '';
  }

  /**
   * Short tag shown next to the position number for the legend feel.
   */
  zoneTag(zones: QualificationZones, position: number, totalTeams: number): string {
    if (zones.locGroup.includes(position)) return 'LoC G';
    if (zones.locQualifying.includes(position)) return 'LoC Q';
    if (zones.locPreliminary.includes(position)) return 'LoC P';
    if (zones.starsCup.includes(position)) return 'SC';
    if (totalTeams > 0 && position >= totalTeams - 1) return 'R';
    return '';
  }

  formChar(c: string): string {
    return c.toUpperCase();
  }
}
