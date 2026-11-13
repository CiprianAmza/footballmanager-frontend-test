import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, distinctUntilChanged, forkJoin, map, merge, Observable,
  of, shareReplay, startWith, Subject, switchMap, takeUntil } from 'rxjs';
import { withTitleOdds } from './title-odds';
import { TitleRacePoint } from '../competition-view/title-race-chart.component';
import { leaguePositionTimeline } from './league-position-timeline';
import { resultRecords, sequences } from '../competition-details/match-records';
import { DetailsView } from '../competition-details/competition-details.data';
import { LegacyRecordsData } from '../competition-records/competition-records.component';
import { ClubEconomyRow } from '../services/competition-hub.service';
import { GameEventsService } from '../services/game-events.service';
import { Availability, Club, ClubManager, isLeague, LEADER_CATEGORIES, LeagueCompetitionData,
  LeagueInfo, LeagueMatch, LeagueOdds, LineupPlayer, LineupProfile, LeagueOverview, LeagueQualification, LeagueTransfer,
  PlayerStats, ManagerSeason, Podium, Standing, TransferRumour } from './league-competition.data';

type Section = 'structure' | 'tickets' | 'sponsorships' | 'managers' | 'rules' | 'stadiums' | 'overview' | 'standings' | 'media-prediction' | 'chances' | 'matches' | 'stats' | 'transfers' | 'analysis' | 'news' | 'awards' | 'history';
type Panel<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; value: T };
const SECTIONS: Section[] = ['structure', 'tickets', 'sponsorships', 'managers', 'rules', 'stadiums', 'overview', 'standings', 'media-prediction', 'chances', 'matches', 'stats', 'transfers', 'analysis', 'news', 'awards', 'history'];

@Component({
  selector: 'app-league-competition',
  templateUrl: './league-competition.component.html',
  styleUrls: ['./league-competition.component.css']
})
export class LeagueCompetitionComponent implements OnInit, OnDestroy {
  private readonly destroyed = new Subject<void>();
  private readonly reload = new Subject<void>();
  private readonly roundChange = new Subject<number>();
  readonly min = Math.min;
  private readonly tableSorts = new Map<string, { column: string; direction: 'ascending' | 'descending' }>();
  private readonly tableCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  readonly matchTabs = [
    { key: 'matchday', label: 'Fixtures & results' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'review', label: 'Competition review' }
  ] as const;
  readonly transferTypes = ['All', 'Transfer', 'Loan'] as const;
  readonly overviewLeaders = LEADER_CATEGORIES.slice(0, 3);
  readonly primaryNav = [
    { section: 'overview', label: 'Overview' }, { section: 'matches', label: 'Matches' },
    { section: 'news', label: 'News' }, { section: 'stats', label: 'Stats' },
    { section: 'transfers', label: 'Transfers' }, { section: 'awards', label: 'Awards' },
    { section: 'history', label: 'History' }
  ];
  readonly overviewNav = [
    { section: 'overview', label: 'Summary' }, { section: 'standings', label: 'League table' },
    { section: 'media-prediction', label: 'Media Prediction' }, { section: 'chances', label: 'Title chances' },
    { section: 'rules', label: 'Rules' },
    { section: 'structure', label: 'Structure' }, { section: 'managers', label: 'Managers' },
    { section: 'stadiums', label: 'Stadiums' }, { section: 'tickets', label: 'Season tickets' },
    { section: 'sponsorships', label: 'Sponsorship income' }
  ];

  history?: Observable<Panel<Podium[]>>;
  liveXi?: Observable<Panel<{ formation: string; players: LineupPlayer[] }>>;
  venues?: Observable<Panel<(Standing & { stadium?: string; capacity?: number })[]>>;
  managers?: Observable<Panel<{ club: Standing; manager: ClubManager }[]>>;
  managerHistory?: Observable<Panel<{ club: Standing; managers: ManagerSeason[] }[]>>;
  availability?: Observable<Panel<{ club: Standing; rows: Availability[] }[]>>;
  transferWindow?: Observable<Panel<boolean>>;
  rumours?: Observable<Panel<TransferRumour[]>>;
  sponsorships?: Observable<Panel<{ club: Standing; revenue: number }[]>>;
  schedule?: Observable<Panel<LeagueMatch[]>>;
  upcoming?: Observable<Panel<LeagueMatch[]>>;
  readonly statTabs = [
    { key: 'team-overview', label: 'Team overview' }, { key: 'clubs', label: 'Team detailed' },
    { key: 'player-overview', label: 'Player overview' }, { key: 'players', label: 'Player detailed' },
    { key: 'referees', label: 'Referees' }, { key: 'injuries', label: 'Injury table' }, { key: 'suspensions', label: 'Suspensions' }
  ] as const;
  newsMode: 'headlines' | 'rumours' = 'headlines';
  transferManagersView = false;
  transferWindowView = false;
  news?: Observable<Panel<{ champion: Club | null; transfers: LeagueTransfer[]; results: LeagueMatch[] }>>;
  records?: Observable<Panel<LegacyRecordsData>>;
  clubLineups?: ReturnType<LeagueCompetitionComponent['loadClubLineup']>;
  lineupMode: 'best' | 'manager' = 'best';
  selectedPitchPlayer?: LineupPlayer;
  pitchProfile?: Observable<Panel<LineupProfile>>;
  lineupClubId = 0;
  matchMode: 'matchday' | 'schedule' | 'review' = 'matchday';
  scheduleCalendar = false;
  private requestedRound: number | null = null;
  historyMode: 'podium' | 'records' | 'positions' | 'notes' | 'create-note' = 'podium';
  readonly recordTabs = [
    { key: 'overview', label: 'Overview' }, { key: 'attendance', label: 'Attendance' },
    { key: 'results', label: 'Results' }, { key: 'sequences', label: 'Sequences' },
    { key: 'clubs', label: 'Clubs' }, { key: 'players', label: 'Players' }
  ] as const;
  recordMode: typeof this.recordTabs[number]['key'] = 'overview';
  attendance?: Observable<Panel<ClubEconomyRow[]>>;
  transferPage = 0;
  readonly transferPageSize = 25;

  id = '';
  section: Section = 'overview';
  season = 0;
  currentSeason = 0;
  seasons: number[] = [];
  info: Panel<LeagueInfo> = { state: 'loading' };
  standings?: Observable<Panel<Standing[]>>;
  qualification?: Observable<Panel<LeagueQualification>>;
  overview?: Observable<Panel<LeagueOverview>>;
  /** This season's chances (null for a past season) and the title race behind them. */
  odds?: Observable<Panel<LeagueOdds | null>>;
  titleRace?: Observable<Panel<TitleRacePoint[]>>;
  results?: Observable<Panel<LeagueMatch[]>>;
  fixtures?: Observable<Panel<LeagueMatch[]>>;
  playerStats?: Observable<Panel<PlayerStats>>;
  transfers?: Observable<Panel<{ clubs: Standing[]; rows: LeagueTransfer[] }>>;
  matchRounds: number[] = [];
  activeRound = 0;
  latestRound = 0;
  nextRound = 0;
  statScope: typeof this.statTabs[number]['key'] = 'team-overview';
  statsMetric = '';

  get statsRankingView(): DetailsView | undefined {
    if (this.statScope === 'players') return 'player-stats';
    if (this.statScope === 'clubs') return 'team-stats';
    if (this.statScope === 'team-overview' || this.statScope === 'player-overview') return this.statScope;
    return undefined;
  }
  transferClub = 0;
  transferType: 'All' | LeagueTransfer['kind'] = 'All';

  constructor(private data: LeagueCompetitionData, private route: ActivatedRoute,
              private router: Router, private events: GameEventsService) {}

  ngOnInit(): void {
    const routeId = this.route.paramMap.pipe(map(params => params.get('competitionId') || ''), distinctUntilChanged());
    combineLatest([routeId, this.reload.pipe(startWith(undefined))]).pipe(
      switchMap(([id]) => this.panel(forkJoin({ info: this.data.info(id), season: this.data.season() })).pipe(
        map(context => ({ id, context }))
      )),
      switchMap(({ id, context }) => {
        if (context.state !== 'ready') {
          this.info = { state: context.state };
          return of(null);
        }
        const { info, season } = context.value;
        if (!info.name) {
          this.info = { state: 'error' };
          return of(null);
        }
        if (!isLeague(info)) {
          void this.router.navigate(['/competition', id], { queryParamsHandling: 'preserve', replaceUrl: true });
          return of(null);
        }
        if (this.id !== id) {
          this.id = id;
          this.tableSorts.clear();
          this.lineupClubId = 0;
        }
        this.season = 0;
        this.info = { state: 'ready', value: info };
        this.currentSeason = Number(season);
        this.seasons = Array.from({ length: this.currentSeason }, (_, i) => this.currentSeason - i);
        return combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
          map(([params, query]) => {
            const requested = params.get('section') as Section;
            const nextSection = SECTIONS.includes(requested) ? requested : 'overview';
            if (this.section !== nextSection) {
              this.matchMode = 'matchday';
              this.historyMode = 'podium';
              this.transferPage = 0;
            }
            this.section = nextSection;
            const subpage = query.get('view');
            if (nextSection === 'matches') {
              this.matchMode = this.matchTabs.find(tab => tab.key === subpage)?.key || 'matchday';
              this.scheduleCalendar = query.get('list') === 'calendar';
              const raw = query.get('round');
              this.requestedRound = raw != null && Number.isInteger(Number(raw)) ? Number(raw) : null;
              if (this.requestedRound != null && this.matchRounds.includes(this.requestedRound)) {
                this.selectRound(this.requestedRound);
              }
            }
            if (nextSection === 'stats') {
              this.statScope = this.statTabs.find(tab => tab.key === subpage)?.key || (query.has('metric') ? 'players' : 'team-overview');
              this.statsMetric = query.get('metric') || '';
            }
            if (nextSection === 'news') this.newsMode = subpage === 'rumours' ? 'rumours' : 'headlines';
            this.transferWindowView = nextSection === 'transfers' && subpage === 'window';
            this.transferManagersView = nextSection === 'transfers' && subpage === 'managers';
            if (nextSection === 'transfers') {
              const type = this.transferTypes.find(item => item === subpage) || 'All';
              if (type !== this.transferType) this.transferPage = 0;
              this.transferType = type;
            }
            if (nextSection === 'history') {
              this.historyMode = subpage === 'records' || subpage === 'positions' || subpage === 'notes' || subpage === 'create-note' ? subpage : 'podium';
              this.recordMode = this.recordTabs.find(tab => tab.key === query.get('metric'))?.key || 'overview';
            }
            const club = Number(query.get('club'));
            const isCurrent = !query.get('season') || Number(query.get('season')) === this.currentSeason;
            const lineup = nextSection === 'media-prediction' && isCurrent && Number.isInteger(club) && club > 0 ? club : 0;
            if (lineup !== this.lineupClubId) this.selectLineup(lineup);
            const candidate = Number(query.get('season'));
            return Number.isInteger(candidate) && candidate > 0 && candidate <= this.currentSeason
              ? candidate : this.currentSeason;
          }),
          distinctUntilChanged(),
          switchMap(selected => merge(this.events.on('standings'), this.events.on('transfers')).pipe(
            startWith(undefined),
            map(() => selected)
          ))
        );
      }),
      takeUntil(this.destroyed)
    ).subscribe(season => {
      if (season == null) return;
      if (season !== this.currentSeason && season === this.season && this.standings) return;
      this.season = season;
      this.loadSeason();
    });
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }

  retry(): void {
    this.reload.next();
  }

  selectSeason(season: number): void {
    void this.router.navigate([], { relativeTo: this.route,
      queryParams: { season: season === this.currentSeason ? null : season }, queryParamsHandling: 'merge' });
  }

  get overviewActive(): boolean {
    return this.section === 'analysis' || this.overviewNav.some(item => item.section === this.section);
  }

  get seasonQuery(): { season: number | null } {
    return { season: this.season === this.currentSeason ? null : this.season };
  }

  subpage(view: string) {
    return { ...this.seasonQuery, view };
  }

  selectPredictionRow(event: MouseEvent, teamId: number): void {
    if (this.season !== this.currentSeason || (event.target as HTMLElement).closest('a, button')) return;
    void this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'merge',
      queryParams: { club: teamId } });
  }

  sortTable(table: string, column: string, descending = false): void {
    const previous = this.tableSorts.get(table);
    const direction = previous?.column === column
      ? previous.direction === 'ascending' ? 'descending' : 'ascending'
      : descending ? 'descending' : 'ascending';
    this.tableSorts.set(table, { column, direction });
    if (table === 'transfers') this.transferPage = 0;
  }

  sortDirection(table: string, column: string): 'ascending' | 'descending' | null {
    const sort = this.tableSorts.get(table);
    return sort?.column === column ? sort.direction : null;
  }

  sorted<T>(table: string, rows: readonly T[] | undefined): readonly T[] {
    const sort = this.tableSorts.get(table);
    if (!sort || !rows?.length) return rows || [];
    if (sort.column === '$rank') return sort.direction === 'ascending' ? rows : [...rows].reverse();
    const read = (row: T) => sort.column === '$availability'
      ? this.activeAvailability((row as { rows: Availability[] }).rows).length
      : sort.column.split('.').reduce<unknown>((field, key) => (field as Record<string, unknown> | null)?.[key], row);
    const multiplier = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      if (left == null || left === '') return right == null || right === '' ? 0 : 1;
      if (right == null || right === '') return -1;
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber : this.tableCollator.compare(String(left), String(right));
      return multiplier * comparison;
    });
  }

  private bestClub(rows: Standing[], metric: 'points' | 'wins' | 'goalsFor'): Standing | undefined {
    return [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric]))[0];
  }

  readonly positionTimeline = leaguePositionTimeline;

  seasonRecords(rows: Standing[]) {
    return [
      { label: 'Most points', club: this.bestClub(rows, 'points'), metric: 'points' as const },
      { label: 'Most wins', club: this.bestClub(rows, 'wins'), metric: 'wins' as const },
      { label: 'Most goals', club: this.bestClub(rows, 'goalsFor'), metric: 'goalsFor' as const }
    ];
  }

  readonly resultRecords = resultRecords;
  readonly sequences = sequences;

  activeAvailability(rows: Availability[]) {
    return rows.filter(row => this.statScope === 'injuries' ? row.type === 'INJURY'
      : row.type === 'SUSPENSION' && row.competitionId === Number(this.id));
  }

  selectRound(round: number): void {
    this.activeRound = round;
    this.roundChange.next(round);
  }

  stepRound(step: number): void {
    const next = this.matchRounds[this.matchRounds.indexOf(this.activeRound) + step];
    if (next != null) this.selectRound(next);
  }

  mark(team: Standing, context?: LeagueQualification): string {
    if (context?.hasLowerTier && context.relegationFrom != null && team.position >= context.relegationFrom) {
      return 'relegated';
    }
    return context?.qualifications?.find(row => row.teamId === team.teamId)?.route || '';
  }

  hasQualification(context: LeagueQualification, route: string): boolean {
    return context.qualifications?.some(row => row.route === route) || false;
  }

  rowFor(cell: number): number {
    return Math.floor(cell / 5) + 1;
  }

  latestMatches(results: LeagueMatch[]): LeagueMatch[] {
    const last = Math.max(0, ...results.map(match => match.round));
    return results.filter(match => match.round === last);
  }

  predictionSource(data: LeagueOverview): string {
    if (data.teams?.every(team => team.landscapeDataSource === 'HISTORICAL_SNAPSHOT')) {
      return 'Saved season snapshot';
    }
    if (this.season === this.currentSeason) return 'Live estimate based on best XI rating and reputation';
    if (data.teams?.some(team => team.landscapeDataSource === 'HISTORICAL_SNAPSHOT')) {
      return 'Recalculated estimate using saved and live club data';
    }
    return 'Recalculated estimate using current squads';
  }

  /** The five clubs with the best title chance now, drawn in the title race (each keeps its colour). */
  raceTeams(odds: LeagueOdds): number[] {
    return [...odds.rows].sort((a, b) => b.title - a.title || a.position - b.position).slice(0, 5).map(row => row.teamId);
  }

  /** A chance as a percentage: "<1%" for a sliver, "—" for none. */
  chance(value: number): string {
    if (!value) return '—';
    if (value < 0.005) return '<1%';
    if (value > 0.995 && value < 1) return '>99%';
    return `${Math.round(value * 100)}%`;
  }

  selectPitchPlayer(player: LineupPlayer): void {
    this.selectedPitchPlayer = player;
    this.pitchProfile = this.panel(this.data.playerProfile(player.playerId));
  }

  setLineupMode(mode: 'best' | 'manager'): void {
    if (this.lineupMode === mode) return;
    this.lineupMode = mode;
    this.clearPitchSelection();
  }

  private clearPitchSelection(): void {
    this.selectedPitchPlayer = undefined;
    this.pitchProfile = undefined;
  }

  selectLineup(teamId: number): void {
    this.clearPitchSelection();
    this.lineupClubId = teamId;
    this.lineupMode = 'best';
    this.clubLineups = teamId ? this.loadClubLineup(teamId) : undefined;
  }

  leagueLineup(records: LegacyRecordsData): LineupPlayer[] {
    const cells: Record<string, number[]> = {
      GK: [27], DR: [24], DC: [23, 21], DL: [20], DM: [17], MC: [13, 11], AMR: [9], AML: [5], ST: [2]
    };
    return (records.seasonBestEleven || []).flatMap(pick => {
      const cell = cells[pick.slot]?.shift();
      if (cell == null) return [];
      return [{
        playerId: pick.player.playerId, name: pick.player.playerName, label: pick.slot,
        cell, rating: pick.player.averageRating, club: pick.player.teamName, teamId: pick.player.teamId || undefined
      }];
    });
  }

  roundResults(matches: LeagueMatch[], round: number): LeagueMatch[] {
    return matches.filter(match => match.round === round);
  }

  resultRounds(matches: LeagueMatch[]): number[] {
    return [...new Set(matches.map(match => match.round))].sort((a, b) => b - a);
  }

  private loadClubLineup(teamId: number) {
    return this.panel(this.data.clubLineups(teamId));
  }

  getTransfers(rows: LeagueTransfer[]): LeagueTransfer[] {
    return rows.filter(row => (this.transferType === 'All' || row.kind === this.transferType)
      && (!this.transferClub || row.fromId === this.transferClub || row.toId === this.transferClub));
  }

  private loadSeason(): void {
    const { id, season, currentSeason } = this;
    this.clearPitchSelection();
    this.activeRound = 0;
    this.matchRounds = [];
    this.latestRound = 0;
    this.nextRound = 0;
    this.transferClub = 0;
    this.transferPage = 0;

    const standings = this.data.standings(id, season, currentSeason).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    const overview = this.data.overview(id, season).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    const results = this.data.results(id, season).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.standings = this.panel(standings);
    this.qualification = this.panel(this.data.qualification(id, season));
    // Chances exist for the season being played only: they come from the table and the matches still to play.
    const odds: Observable<LeagueOdds | null> = season === currentSeason
      ? this.data.odds(id).pipe(shareReplay({ bufferSize: 1, refCount: true }))
      : of(null);
    this.odds = this.panel(odds);
    this.titleRace = this.panel(season === currentSeason ? this.data.titleRace(id) : of([]));
    this.overview = this.panel(combineLatest([overview, odds.pipe(catchError(() => of(null)))]).pipe(
      map(([value, chances]) => withTitleOdds(value, chances))));
    this.results = this.panel(results);
    this.playerStats = this.panel(this.data.playerStats(id, season));
    const transfers = this.data.transfers(season, standings).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.transfers = this.panel(transfers);
    this.history = this.panel(this.data.history(id));
    this.attendance = this.panel(this.data.attendance(id));
    this.news = this.panel(forkJoin({ overview, transfers, results }).pipe(map(value => ({
      champion: value.overview.champion, transfers: value.transfers.rows, results: this.latestMatches(value.results).slice(0, 5)
    }))));
    this.records = this.panel(this.data.records(id, season));
    const schedule = this.data.schedule(id, season).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.schedule = this.panel(schedule);
    this.upcoming = this.panel(schedule.pipe(map(matches => {
      const nextRound = matches.find(match => !match.score)?.round;
      return matches.filter(match => match.round === nextRound && !match.score);
    })));
    this.fixtures = this.panel(schedule.pipe(switchMap(matches => {
      this.latestRound = Math.max(0, ...matches.filter(match => match.score).map(match => match.round));
      this.nextRound = matches.find(match => !match.score)?.round || 0;
      this.matchRounds = [...new Set(matches.map(match => match.round))];
      if (this.requestedRound != null && this.matchRounds.includes(this.requestedRound)) this.activeRound = this.requestedRound;
      else if (!this.matchRounds.includes(this.activeRound)) this.activeRound = this.nextRound || this.latestRound;
      return this.roundChange.pipe(startWith(this.activeRound), map(round => this.roundResults(matches, round)));
    })));
    this.liveXi = this.panel(this.data.leagueBestXi(id));
    this.venues = this.panel(this.data.venues(standings));
    this.managers = this.panel(this.data.managers(standings));
    this.managerHistory = this.panel(this.data.managerHistory(season, standings));
    this.availability = this.panel(this.data.availability(standings));
    this.transferWindow = this.panel(this.data.transferWindow());
    this.rumours = this.panel(this.data.rumours(id));
    this.sponsorships = this.panel(this.data.sponsorships(season, standings));
  }

  private panel<T>(source: Observable<T>): Observable<Panel<T>> {
    return source.pipe(
      map((value): Panel<T> => ({ state: 'ready', value })),
      startWith({ state: 'loading' } as Panel<T>),
      catchError(() => of({ state: 'error' } as Panel<T>)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}
