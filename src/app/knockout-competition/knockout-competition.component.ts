import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, distinctUntilChanged, map, Observable, of, shareReplay,
  startWith, Subject, switchMap, takeUntil } from 'rxjs';
import { DetailsView } from '../competition-details/competition-details.data';
import { CupOdds, LEADER_CATEGORIES, LeagueCompetitionData, LeagueInfo, LeagueMatch, LeagueOverview, isLeague } from '../league-competition/league-competition.data';

type View = 'overview' | 'bracket' | 'stats' | 'awards' | 'history' | 'news' | 'matches' | 'chances';
type Load<T> = { value: T | null; error: boolean };

@Component({
  selector: 'app-knockout-competition',
  templateUrl: './knockout-competition.component.html',
  styleUrls: ['./knockout-competition.component.css']
})
export class KnockoutCompetitionComponent implements OnInit, OnDestroy {
  private readonly destroyed = new Subject<void>();
  readonly metrics = LEADER_CATEGORIES;
  readonly tabs: { key: View; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'bracket', label: 'Bracket' }, { key: 'matches', label: 'Matches' },
    { key: 'chances', label: 'Chances' }, { key: 'news', label: 'News' }, { key: 'stats', label: 'Stats' },
    { key: 'awards', label: 'Awards' }, { key: 'history', label: 'History' }
  ];
  /** Chances to win (design DESIGN_MEDIA_SI_COMPETITII §4.2): national cups this season only, not the Super Cup. */
  cupOdds?: Observable<Load<CupOdds>>;

  get visibleTabs(): { key: View; label: string }[] {
    return this.superCup ? this.tabs.filter(tab => tab.key !== 'chances') : this.tabs;
  }
  id = '';
  info?: LeagueInfo;
  loading = true;
  failed = false;
  season = 0;
  currentSeason = 0;
  seasons: number[] = [];
  view: View = 'overview';
  historyView: 'records' | 'landscape' | 'winners' | 'notes' | 'create-note' = 'records';
  readonly recordTabs: { key: DetailsView | 'players'; label: string }[] = [
    { key: 'record-overview', label: 'Overview' }, { key: 'players', label: 'Players' }, { key: 'record-attendance', label: 'Attendance' },
    { key: 'record-results', label: 'Results' }, { key: 'record-sequences', label: 'Sequences' }, { key: 'record-clubs', label: 'Clubs' }
  ];
  recordView: DetailsView | 'players' = 'record-overview';
  readonly overviewDetails: { key: DetailsView; label: string }[] = [
    { key: 'round-history', label: 'Past progress' }, { key: 'teams', label: 'Teams' }, { key: 'rules', label: 'Rules' }, { key: 'managers', label: 'Managers' },
    { key: 'tickets', label: 'Season tickets' }, { key: 'stadiums', label: 'Stadiums' }
  ];
  overviewDetail?: DetailsView;
  readonly statsDetails: { key: DetailsView; label: string }[] = [
    { key: 'team-overview', label: 'Team overview' }, { key: 'team-stats', label: 'Team detailed' },
    { key: 'player-overview', label: 'Player overview' }, { key: 'player-stats', label: 'Player detailed' }, { key: 'referees', label: 'Referees' },
    { key: 'injuries', label: 'Injury table' }, { key: 'suspensions', label: 'Suspensions' }
  ];
  statsDetail?: DetailsView;
  matchView: 'matchday' | 'schedule' | 'review' = 'matchday';
  scheduleCalendar = false;
  matches?: Observable<Load<LeagueMatch[]>>;
  selectedRound: number | null = null;
  statsMetric = '';
  overview?: Observable<Load<LeagueOverview>>;
  stats?: ReturnType<KnockoutCompetitionComponent['loadStats']>;

  constructor(private data: LeagueCompetitionData, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id$ = this.route.paramMap.pipe(map(params => params.get('competitionId') || ''), distinctUntilChanged());
    id$.pipe(switchMap(id => {
      this.loading = true;
      this.failed = false;
      this.info = undefined;
      this.season = 0;
      return combineLatest([this.data.info(id), this.data.season()]).pipe(
        map(([info, season]) => ({ id, info, season: Number(season) })),
        catchError(() => of(null))
      );
    }), switchMap(context => {
      this.loading = false;
      if (!context?.info.name) {
        this.failed = true;
        return of(null);
      }
      const { id, info, season } = context;
      if (isLeague(info)) {
        void this.router.navigate(['/competition', id, 'overview'], { replaceUrl: true, queryParamsHandling: 'preserve' });
        return of(null);
      }
      if (info.kind === 'MULTI_STAGE' || [4, 5].includes(info.typeId)) {
        void this.router.navigate(['/european-rounds', id, this.selectedSeason(season)], { replaceUrl: true, queryParams: { ...this.route.snapshot.queryParams, season: null } });
        return of(null);
      }
      this.id = id;
      this.info = info;
      this.currentSeason = season;
      this.seasons = Array.from({ length: season }, (_, i) => season - i);
      return this.route.queryParamMap.pipe(map(query => {
        this.view = this.tabs.find(tab => tab.key === query.get('view'))?.key || 'overview';
        const archive = query.get('archive');
        this.recordView = this.recordTabs.find(tab => tab.key === query.get('record'))?.key || 'record-overview';
        this.historyView = archive === 'landscape' || archive === 'winners' || archive === 'notes' || archive === 'create-note' ? archive : 'records';
        this.overviewDetail = this.overviewDetails.find(tab => tab.key === query.get('detail'))?.key;
        this.statsDetail = this.statsDetails.find(tab => tab.key === query.get('detail'))?.key
          || (query.has('metric') ? 'player-stats' : 'team-overview');
        const list = query.get('list');
        this.scheduleCalendar = list === 'calendar';
        this.matchView = this.scheduleCalendar ? 'schedule' : list === 'schedule' || list === 'review' ? list : 'matchday';
        const round = query.get('round');
        this.selectedRound = round != null && Number.isInteger(Number(round)) ? Number(round) : null;
        this.statsMetric = query.get('metric') || '';
        return this.selectedSeason(season);
      }), distinctUntilChanged());
    }), takeUntil(this.destroyed)).subscribe(season => {
      if (season == null) return;
      this.season = season;
      this.overview = this.load(this.data.overview(this.id, season));
      this.stats = this.loadStats();
      this.matches = this.load(this.data.schedule(this.id, season));
      // Read only when the Chances view is opened (the first answer of a season simulates the whole bracket).
      this.cupOdds = season === this.currentSeason && !this.superCup ? this.load(this.data.cupOdds(this.id)) : undefined;
    });
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }

  get superCup(): boolean {
    return this.info?.kind === 'SHOWCASE' || this.info?.typeId === 6;
  }

  query(view: View, metric?: string) {
    return { view: view === 'overview' ? null : view,
      season: this.season === this.currentSeason ? null : this.season, metric: metric || null };
  }

  /** A chance as a percentage: "<1%" for a sliver, "—" for none. */
  chance(value: number): string {
    if (!value) return '—';
    if (value < 0.005) return '<1%';
    if (value > 0.995 && value < 1) return '>99%';
    return `${Math.round(value * 100)}%`;
  }

  rounds(rows: LeagueMatch[]): number[] {
    return [...new Set(rows.filter(match => this.matchView !== 'review' || match.score).map(match => match.round))];
  }

  activeRound(rows: LeagueMatch[]): number | null {
    const rounds = this.rounds(rows);
    if (this.selectedRound !== null && rounds.includes(this.selectedRound)) return this.selectedRound;
    return rows.find(row => !row.score)?.round ?? rounds[rounds.length - 1] ?? null;
  }

  selectRound(round: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'merge', queryParams: { round } });
  }

  roundMatches(rows: LeagueMatch[], round: number | null): LeagueMatch[] {
    return rows.filter(row => row.round === round && (this.matchView !== 'review' || !!row.score));
  }

  changeSeason(season: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParamsHandling: 'merge',
      queryParams: { season: season === this.currentSeason ? null : season } });
  }

  private selectedSeason(current: number): number {
    const selected = Number(this.route.snapshot.queryParamMap.get('season'));
    return Number.isInteger(selected) && selected > 0 && selected <= current ? selected : current;
  }

  private loadStats() {
    return this.load(this.data.playerStats(this.id, this.season));
  }

  private load<T>(request: Observable<T>): Observable<Load<T>> {
    return request.pipe(map(value => ({ value, error: false })),
      startWith({ value: null, error: false }), catchError(() => of({ value: null, error: true })),
      shareReplay({ bufferSize: 1, refCount: true }));
  }
}
