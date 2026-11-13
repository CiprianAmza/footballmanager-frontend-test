import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import {
  CalendarEntry, CompetitionOption, DEFAULT_FILTERS, MonthGroup, Outcome, ScheduleFilters,
  ScheduleRow, ScheduleSummary, ScheduleView, buildRows, competitionOptions, defaultSelection,
  filterRows, formBefore, groupByMonth, hasActiveFilters, summarise
} from './schedule-model';

const VIEWS = ['fixtures', 'calendar'] as const;
type ScheduleViewMode = typeof VIEWS[number];
type DetailTab = 'overview' | 'stats' | 'lineups' | 'h2h';

export interface MatchEvent {
  id: number;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  teamId1: number;
  teamId2: number;
  minute: number;
  eventType: string;
  playerId: number;
  playerName: string;
  teamId: number;
  details: string;
}

interface PreviewSide {
  teamId: number;
  name: string;
  form: Outcome[] | null;
  position: number | null;
}

interface MatchPreview {
  home: PreviewSide;
  away: PreviewSide;
  prediction: string | null;
  powerHome: number | null;
  powerAway: number | null;
}

interface CalendarDay {
  day: number;
  rows: ScheduleRow[];
}

interface CalendarMonth extends MonthGroup {
  days: CalendarDay[];
}

const MONTH_DAYS: Record<string, number> = {
  January: 31, February: 29, March: 31, April: 30, May: 31, June: 30, July: 31,
  August: 31, September: 30, October: 31, November: 30, December: 31
};

@Component({
  selector: 'app-fixtures',
  templateUrl: './fixtures.component.html',
  styleUrls: ['./fixtures.component.css']
})
export class FixturesComponent implements OnInit, OnDestroy, OnChanges {

  /** Set when the schedule is embedded (Club info → Matches); query params are then prefixed. */
  @Input() teamIdInput?: number;

  teamId = 0;
  teamName = 'Club';
  view: ScheduleViewMode = 'fixtures';
  season = 0;
  currentSeason = 1;
  seasons: number[] = [1];

  rows: ScheduleRow[] = [];
  filtered: ScheduleRow[] = [];
  months: MonthGroup[] = [];
  calendarMonths: CalendarMonth[] = [];
  competitions: CompetitionOption[] = [];
  /** Totals for the visible (filtered) matches, shown in the summary strip. */
  summary: ScheduleSummary = summarise([]);
  /** Totals for the whole season, shown in the page heading. */
  seasonTotals: ScheduleSummary = summarise([]);
  filters: ScheduleFilters = { ...DEFAULT_FILTERS };
  loading = false;
  loadError = false;

  selected: ScheduleRow | null = null;
  detailTab: DetailTab = 'overview';
  matchSummary: any = null;
  matchEvents: MatchEvent[] = [];
  matchStats: any = null;
  h2h: any = null;
  preview: MatchPreview | null = null;
  loadingSummary = false;
  loadingStats = false;
  loadingH2h = false;
  loadingPreview = false;
  loadingForm = false;

  private opponentRows = new Map<string, ScheduleRow[]>();
  private requestedMatchKey: string | null = null;
  private loadSub?: Subscription;
  private detailSubs: Subscription[] = [];
  private subs: Subscription[] = [];
  private initialised = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private teamService: TeamService
  ) {}

  get embedded(): boolean { return !!this.teamIdInput; }
  private get seasonParam(): string { return this.embedded ? 'fixturesSeason' : 'season'; }
  private get viewParam(): string { return this.embedded ? 'fixturesTab' : 'tab'; }
  private get matchParam(): string { return this.embedded ? 'fixturesMatch' : 'match'; }

  ngOnInit(): void {
    this.initialised = true;
    this.subs.push(this.teamService.currentSeason$.subscribe(season => {
      this.currentSeason = Math.max(1, Number(season) || 1);
      this.seasons = Array.from({ length: this.currentSeason }, (_, i) => this.currentSeason - i);
      if (!this.route.snapshot.queryParamMap.get(this.seasonParam) && this.season !== this.currentSeason) {
        this.season = this.currentSeason;
        this.load();
      }
    }));
    // Query params first, so the first request already targets the season in the URL.
    this.subs.push(this.route.queryParamMap.subscribe(params => this.applyQueryParams(params)));
    this.subs.push(this.route.paramMap.subscribe(params => {
      const teamId = this.teamIdInput || Number(params.get('teamId')) || this.teamService.teamId;
      if (teamId && teamId !== this.teamId) {
        this.teamId = teamId;
        this.resetTeamState();
        this.load();
      }
    }));
    // /fixtures without an id follows the managed club once the app knows it.
    this.subs.push(this.teamService.teamId$.subscribe(teamId => {
      if (!this.teamIdInput && !this.route.snapshot.paramMap.get('teamId') && teamId && teamId !== this.teamId) {
        this.teamId = teamId;
        this.resetTeamState();
        this.load();
      }
    }));
    this.subs.push(this.teamService.refresh$.subscribe(() => this.load(true)));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.initialised || !changes['teamIdInput'] || !this.teamIdInput || this.teamIdInput === this.teamId) return;
    this.teamId = this.teamIdInput;
    this.resetTeamState();
    this.load();
  }

  ngOnDestroy(): void {
    this.subs.forEach(sub => sub.unsubscribe());
    this.loadSub?.unsubscribe();
    this.clearDetailRequests();
  }

  // ---------------------------------------------------------------- URL state

  private applyQueryParams(params: ParamMap): void {
    const view = params.get(this.viewParam) as ScheduleViewMode | null;
    this.view = view && VIEWS.includes(view) ? view : 'fixtures';
    this.requestedMatchKey = params.get(this.matchParam);

    const requestedSeason = Number(params.get(this.seasonParam));
    const season = requestedSeason > 0 ? requestedSeason : this.currentSeason;
    if (season !== this.season) {
      this.season = season;
      this.load();
    } else if (this.requestedMatchKey && this.requestedMatchKey !== this.selected?.key) {
      const row = this.rows.find(r => r.key === this.requestedMatchKey);
      if (row) this.select(row, false);
    }
  }

  private updateUrl(params: Record<string, string | number | null>, replaceUrl = false): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl });
  }

  setView(view: ScheduleViewMode): void {
    this.updateUrl({ [this.viewParam]: view === 'fixtures' ? null : view });
  }

  changeSeason(season: number): void {
    this.updateUrl({ [this.seasonParam]: season === this.currentSeason ? null : season, [this.matchParam]: null });
  }

  // ---------------------------------------------------------------- data

  private resetTeamState(): void {
    this.rows = [];
    this.filtered = [];
    this.months = [];
    this.calendarMonths = [];
    this.selected = null;
    this.opponentRows.clear();
    this.fetchTeamName();
  }

  private fetchTeamName(): void {
    if (!this.teamId) return;
    this.http.get(`${urlApp}/teams/getTeamNameById/${this.teamId}`, { responseType: 'text' })
      .subscribe({ next: name => this.teamName = name || 'Club', error: () => this.teamName = 'Club' });
  }

  load(keepSelection = false): void {
    if (!this.teamId || !this.season) return;
    const teamId = this.teamId;
    const season = this.season;
    const previousKey = keepSelection ? this.selected?.key : null;
    this.loading = !keepSelection;
    this.loadError = false;
    this.loadSub?.unsubscribe();
    this.loadSub = forkJoin({
      schedule: this.http.get<ScheduleView[]>(`${urlApp}/match/getScheduleForSeasonNumber/${season}/${teamId}`),
      calendar: this.http.get<CalendarEntry[]>(`${urlApp}/match/calendar/${teamId}/${season}`).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ schedule, calendar }) => {
        this.loading = false;
        this.opponentRows.clear();
        this.rows = buildRows(schedule || [], teamId, calendar || []);
        this.applyFilters(false);
        const wanted = this.requestedMatchKey || previousKey;
        const row = (wanted && this.rows.find(r => r.key === wanted)) || defaultSelection(this.filtered);
        if (row) this.select(row, false, keepSelection && row.key === previousKey);
        else this.selected = null;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
        this.rows = [];
        this.applyFilters(false);
        this.selected = null;
      }
    });
  }

  // ---------------------------------------------------------------- filters

  applyFilters(reselect = true): void {
    if (this.filters.show === 'fixtures') this.filters.result = 'all';
    this.filtered = filterRows(this.rows, this.filters);
    this.months = groupByMonth(this.filtered);
    this.calendarMonths = this.months.map(month => ({ ...month, days: this.monthDays(month) }));
    this.competitions = competitionOptions(this.rows);
    this.summary = summarise(this.filtered);
    this.seasonTotals = summarise(this.rows);
    if (reselect && this.selected && !this.filtered.includes(this.selected)) {
      const row = defaultSelection(this.filtered);
      if (row) this.select(row);
      else this.selected = null;
    }
  }

  clearFilters(): void {
    this.filters = { ...DEFAULT_FILTERS };
    this.applyFilters();
  }

  get filtersActive(): boolean {
    return hasActiveFilters(this.filters);
  }

  get nextMatch(): ScheduleRow | null {
    return this.season === this.currentSeason ? this.rows.find(row => !row.played) ?? null : null;
  }

  // ---------------------------------------------------------------- selection

  select(row: ScheduleRow, writeUrl = true, keepDetail = false): void {
    const previous = this.selected;
    this.selected = row;
    if (writeUrl) this.updateUrl({ [this.matchParam]: row.key }, true);
    // A background refresh keeps the open panel unless that match has just been played.
    if (keepDetail && previous?.key === row.key && previous.played === row.played) return;
    this.clearDetailRequests();
    this.detailTab = 'overview';
    this.matchSummary = null;
    this.matchEvents = [];
    this.matchStats = null;
    this.h2h = null;
    this.preview = null;
    this.loadHeadToHead(row);
    if (row.played) this.loadPlayedDetail(row);
    else this.loadPreview(row);
  }

  setDetailTab(tab: DetailTab): void {
    this.detailTab = tab;
    if (tab === 'stats' && this.selected?.played && !this.matchStats && !this.loadingStats) {
      this.loadStats(this.selected);
    }
  }

  private clearDetailRequests(): void {
    this.detailSubs.forEach(sub => sub.unsubscribe());
    this.detailSubs = [];
    this.loadingSummary = this.loadingStats = this.loadingH2h = this.loadingPreview = this.loadingForm = false;
  }

  private matchPath(row: ScheduleRow): string {
    const s = row.source;
    return `${s.competitionId}/${s.seasonNumber}/${s.roundNumber}/${s.teamId1}/${s.teamId2}`;
  }

  private loadPlayedDetail(row: ScheduleRow): void {
    this.loadingSummary = true;
    this.detailSubs.push(forkJoin({
      summary: this.http.get<any>(`${urlApp}/match/summary/${this.matchPath(row)}`).pipe(catchError(() => of(null))),
      events: this.http.get<MatchEvent[]>(`${urlApp}/match/matchEvents/${this.matchPath(row)}`).pipe(catchError(() => of([])))
    }).subscribe(({ summary, events }) => {
      this.matchSummary = summary;
      this.matchEvents = (events || []).filter(event => event.eventType !== 'assist');
      this.loadingSummary = false;
    }));
  }

  private loadStats(row: ScheduleRow): void {
    this.loadingStats = true;
    this.detailSubs.push(this.http.get<any>(`${urlApp}/match/stats/${this.matchPath(row)}`)
      .pipe(catchError(() => of(null)))
      .subscribe(data => {
        this.matchStats = data?.available ? data : null;
        this.loadingStats = false;
      }));
  }

  private loadHeadToHead(row: ScheduleRow): void {
    if (!row.opponentId) return;
    this.loadingH2h = true;
    this.detailSubs.push(this.http.get<any>(`${urlApp}/match/h2h/${this.teamId}/${row.opponentId}`)
      .pipe(catchError(() => of(null)))
      .subscribe(data => {
        this.h2h = data;
        this.loadingH2h = false;
      }));
  }

  private loadPreview(row: ScheduleRow): void {
    const own: PreviewSide = { teamId: this.teamId, name: this.teamName, form: formBefore(this.rows, row.day), position: null };
    const opponent: PreviewSide = { teamId: row.opponentId || 0, name: row.opponentName, form: null, position: null };
    const preview: MatchPreview = row.venue === 'H'
      ? { home: own, away: opponent, prediction: null, powerHome: null, powerAway: null }
      : { home: opponent, away: own, prediction: null, powerHome: null, powerAway: null };
    this.preview = preview;

    // Positions and prediction: per-fixture preview (current season), falling back to the
    // legacy next-match preview on backends that do not expose the fixture route yet.
    if (row.source.seasonNumber === this.currentSeason && row.competitionKind !== 'friendly') {
      this.loadingPreview = true;
      const isNext = this.nextMatch?.key === row.key;
      this.detailSubs.push(this.http.get<any>(`${urlApp}/match/preview/${this.matchPath(row)}`).pipe(
        catchError(() => isNext ? this.http.get<any>(`${urlApp}/match/preview/${this.teamId}`) : of(null)),
        catchError(() => of(null))
      ).subscribe(data => {
        this.loadingPreview = false;
        if (!data || Number(data.homeTeamId) !== row.homeTeamId || Number(data.awayTeamId) !== row.awayTeamId) return;
        preview.home.position = Number(data.homeLeaguePosition) || null;
        preview.away.position = Number(data.awayLeaguePosition) || null;
        preview.prediction = data.prediction || null;
        preview.powerHome = Number(data.homePowerRating) || null;
        preview.powerAway = Number(data.awayPowerRating) || null;
        if (!opponent.form) opponent.form = this.parseForm(row.venue === 'H' ? data.awayForm : data.homeForm);
      }));
    }
    if (!row.opponentId) return;

    const cacheKey = `${row.opponentId}-${row.source.seasonNumber}`;
    const cached = this.opponentRows.get(cacheKey);
    if (cached) {
      opponent.form = formBefore(cached, row.day);
      return;
    }
    this.loadingForm = true;
    this.detailSubs.push(this.http.get<ScheduleView[]>(
      `${urlApp}/match/getScheduleForSeasonNumber/${row.source.seasonNumber}/${row.opponentId}`
    ).pipe(catchError(() => of(null))).subscribe(schedule => {
      this.loadingForm = false;
      if (!schedule) return;
      const opponentRows = buildRows(schedule, row.opponentId as number);
      this.opponentRows.set(cacheKey, opponentRows);
      opponent.form = formBefore(opponentRows, row.day);
    }));
  }

  private parseForm(form: string | null | undefined): Outcome[] | null {
    const results = String(form || '').toUpperCase().replace(/[^WDL]/g, '').slice(-5).split('') as Outcome[];
    return results.length ? results : null;
  }

  // ---------------------------------------------------------------- template helpers

  trackByRow = (_: number, row: ScheduleRow) => row.key;
  trackByMonth = (_: number, month: MonthGroup) => month.label;
  trackByDay = (_: number, day: CalendarDay) => day.day;

  get selectedHomeName(): string {
    if (!this.selected) return '';
    return this.selected.venue === 'H' ? this.teamName : this.selected.opponentName;
  }

  get selectedAwayName(): string {
    if (!this.selected) return '';
    return this.selected.venue === 'H' ? this.selected.opponentName : this.teamName;
  }

  get lastMeeting(): any {
    const meetings = (this.h2h?.meetings || []).filter((m: any) => !this.selected
      || !(Number(m.competitionId) === this.selected.competitionId && Number(m.roundNumber) === this.selected.source.roundNumber
        && Number(m.seasonNumber) === this.selected.source.seasonNumber));
    return meetings[0] || null;
  }

  outcomeLabel(outcome: Outcome | null): string {
    return outcome === 'W' ? 'Win' : outcome === 'D' ? 'Draw' : outcome === 'L' ? 'Loss' : '';
  }

  private monthDays(month: MonthGroup): CalendarDay[] {
    const length = MONTH_DAYS[month.label];
    if (!length) return [];
    const byDay = new Map<number, ScheduleRow[]>();
    month.rows.forEach(row => {
      if (row.dayOfMonth) byDay.set(row.dayOfMonth, [...(byDay.get(row.dayOfMonth) || []), row]);
    });
    return Array.from({ length }, (_, i) => ({ day: i + 1, rows: byDay.get(i + 1) || [] }));
  }

  goalsFor(teamId: number): { playerId?: number; playerName: string; minute: number }[] {
    const goals = this.matchSummary?.goals;
    if (Array.isArray(goals) && goals.length) return goals.filter((goal: any) => Number(goal.teamId) === teamId);
    return this.matchEvents.filter(event => event.eventType === 'goal' && event.teamId === teamId);
  }

  cards(): MatchEvent[] {
    return this.matchEvents.filter(event => event.eventType === 'red_card');
  }

  statWidth(home: any, away: any): number {
    const h = parseFloat(home) || 0;
    const a = parseFloat(away) || 0;
    return h + a === 0 ? 50 : Math.round(h / (h + a) * 100);
  }

  isHigher(first: any, second: any): boolean {
    return (parseFloat(first) || 0) > (parseFloat(second) || 0);
  }

  ratingClass(rating: number): string {
    return rating >= 8 ? 'high' : rating >= 6.5 ? 'mid' : 'low';
  }

  h2hDecision(meeting: any): string | null {
    switch (String(meeting?.decidedBy || '').toUpperCase()) {
      case 'PENALTIES': return 'pens';
      case 'EXTRA_TIME': return 'a.e.t.';
      case 'AGGREGATE': return 'agg.';
      case 'FIRST_LEG': return '1st leg';
      default: return null;
    }
  }
}
