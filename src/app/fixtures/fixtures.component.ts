import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, forkJoin, from, of } from 'rxjs';
import { catchError, map, mergeMap, toArray } from 'rxjs/operators';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import {
  CalendarEntry, CalendarMonthGrid, CompetitionOption, DEFAULT_FILTERS, MonthGroup, Outcome, ScheduleFilters,
  ScheduleRow, ScheduleSummary, ScheduleView, SortKey, UNDATED_MONTH, Venue, WEEKDAYS, buildCalendarMonth,
  buildRows, competitionOptions, defaultSelection, filterRows, firstWeekdays, formBefore, groupByMonth,
  hasActiveFilters, hasPanelFilters, ordinalPosition, relativeDay, sortRows, summarise
} from './schedule-model';

const VIEWS = ['fixtures', 'calendar'] as const;
type ScheduleViewMode = typeof VIEWS[number];
type ListMode = 'fixtures' | 'goalscorers';
type PanelView = 'match' | 'meetings';

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

interface Goal {
  playerId?: number | null;
  playerName: string;
  minute: number | null;
  teamId?: number | null;
  details?: string | null;
  penalty?: boolean | null;
  ownGoal?: boolean | null;
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

interface OwnPlayer {
  playerId: number;
  playerName: string;
  position: string;
  /** null = unused substitute ("-" in FM). */
  rating: number | null;
  substitute: boolean;
  goals: number;
  yellow: boolean;
  red: boolean;
  motm: boolean;
}

/** One row of /teams/availability/{teamId}: an injury or a suspension. */
interface AvailabilityRow {
  playerId: number;
  playerName: string;
  type: string;
  label: string;
  remaining: number;
  remainingUnit: string;
  competitionId: number | null;
}

@Component({
  selector: 'app-fixtures',
  templateUrl: './fixtures.component.html',
  styleUrls: ['./fixtures.component.css']
})
export class FixturesComponent implements OnInit, OnDestroy, OnChanges {

  /** Set when the schedule is embedded (Club info → Matches); query params are then prefixed. */
  @Input() teamIdInput?: number;

  readonly weekdays = WEEKDAYS;
  readonly undatedLabel = UNDATED_MONTH;

  teamId = 0;
  teamName = 'Club';
  view: ScheduleViewMode = 'fixtures';
  listMode: ListMode = 'fixtures';
  season = 0;
  currentSeason = 1;
  seasons: number[] = [1];

  rows: ScheduleRow[] = [];
  filtered: ScheduleRow[] = [];
  /** Fixtures list groups: by month for the date sort, a single flat group otherwise. */
  listGroups: MonthGroup[] = [];
  calendarGrids: CalendarMonthGrid[] = [];
  calendarIndex = 0;
  competitions: CompetitionOption[] = [];
  summary: ScheduleSummary = summarise([]);
  seasonTotals: ScheduleSummary = summarise([]);
  filters: ScheduleFilters = { ...DEFAULT_FILTERS, competitions: [], venues: [] };
  filterPanelOpen = false;
  sortKey: SortKey = 'date';
  sortDesc = false;
  loading = false;
  loadError = false;

  /** Own league standing for the heading, from the next-match preview (current season only). */
  standing: { position: number; league: string } | null = null;

  selected: ScheduleRow | null = null;
  panelView: PanelView = 'match';
  matchSummary: any = null;
  matchEvents: MatchEvent[] = [];
  matchLineup: any = null;
  h2h: any = null;
  preview: MatchPreview | null = null;
  opponentPosition: number | null = null;
  teamNews: { home: string[] | null; away: string[] | null } = { home: null, away: null };
  loadingSummary = false;
  loadingH2h = false;
  loadingPreview = false;
  loadingForm = false;

  /** Goalscorers view: scorers per fixture key; `incomplete` when the save lacks some goals. */
  scorersByMatch = new Map<string, { goals: Goal[]; incomplete: boolean }>();
  loadingScorers = false;

  private rawSchedule: ScheduleView[] = [];
  private rawCalendar: CalendarEntry[] = [];
  private opponentRows = new Map<string, ScheduleRow[]>();
  private requestedMatchKey: string | null = null;
  private loadSub?: Subscription;
  private scorersSub?: Subscription;
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
    // The game date anchors weekdays and "N days" labels; rebuild when it moves.
    this.subs.push(this.teamService.currentDay$.subscribe(() => {
      if (this.rawSchedule.length) this.rebuildRows();
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
    this.scorersSub?.unsubscribe();
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
    if (!season || season < 1 || season > this.currentSeason) return;
    this.updateUrl({ [this.seasonParam]: season === this.currentSeason ? null : season, [this.matchParam]: null });
  }

  // ---------------------------------------------------------------- data

  private resetTeamState(): void {
    this.rows = [];
    this.rawSchedule = [];
    this.rawCalendar = [];
    this.filtered = [];
    this.listGroups = [];
    this.calendarGrids = [];
    this.selected = null;
    this.standing = null;
    this.opponentRows.clear();
    this.scorersByMatch.clear();
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
    this.scorersSub?.unsubscribe();
    this.loadingScorers = false;
    this.loadSub = forkJoin({
      schedule: this.http.get<ScheduleView[]>(`${urlApp}/match/getScheduleForSeasonNumber/${season}/${teamId}`),
      calendar: this.http.get<CalendarEntry[]>(`${urlApp}/match/calendar/${teamId}/${season}`).pipe(catchError(() => of([]))),
      standing: season === this.currentSeason
        ? this.http.get<any>(`${urlApp}/match/preview/${teamId}`).pipe(catchError(() => of(null)))
        : of(null)
    }).subscribe({
      next: ({ schedule, calendar, standing }) => {
        this.loading = false;
        this.opponentRows.clear();
        this.scorersByMatch.clear();
        this.rawSchedule = schedule || [];
        this.rawCalendar = calendar || [];
        this.standing = this.standingFrom(standing, teamId);
        this.rebuildRows();
        const wanted = this.requestedMatchKey || previousKey;
        const row = (wanted && this.rows.find(r => r.key === wanted)) || defaultSelection(this.filtered);
        if (row) this.select(row, false, keepSelection && row.key === previousKey);
        else this.selected = null;
        this.focusCalendarOn(this.selected);
        if (this.listMode === 'goalscorers') this.loadScorers();
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
        this.rawSchedule = [];
        this.rows = [];
        this.applyFilters(false);
        this.selected = null;
      }
    });
  }

  private standingFrom(preview: any, teamId: number): { position: number; league: string } | null {
    if (!preview) return null;
    const home = Number(preview.homeTeamId) === teamId;
    const position = Number(home ? preview.homeLeaguePosition : preview.awayLeaguePosition);
    return position > 0 && preview.competitionName ? { position, league: preview.competitionName } : null;
  }

  private rebuildRows(): void {
    const anchor = this.teamService.currentDay > 0 && this.teamService.dayOfWeek
      ? { season: this.currentSeason, day: this.teamService.currentDay, dayOfWeek: this.teamService.dayOfWeek }
      : null;
    const selectedKey = this.selected?.key;
    this.rows = buildRows(this.rawSchedule, this.teamId, this.rawCalendar, anchor);
    this.applyFilters(false);
    if (selectedKey) {
      const row = this.rows.find(r => r.key === selectedKey);
      if (row) this.selected = row;
    }
  }

  // ---------------------------------------------------------------- filters, sorting, calendar

  applyFilters(reselect = true): void {
    if (this.filters.show === 'fixtures') this.filters.result = 'all';
    this.filtered = filterRows(this.rows, this.filters);
    this.competitions = competitionOptions(this.rows);
    this.summary = summarise(this.filtered);
    this.seasonTotals = summarise(this.rows);
    this.buildListGroups();
    this.buildCalendar();
    if (reselect && this.selected && !this.filtered.includes(this.selected)) {
      const row = defaultSelection(this.filtered);
      if (row) this.select(row);
      else this.selected = null;
    }
  }

  private buildListGroups(): void {
    this.listGroups = this.sortKey === 'date'
      ? groupByMonth(this.sortDesc ? [...this.filtered].reverse() : this.filtered, !this.sortDesc)
      : [{ label: '', rows: sortRows(this.filtered, this.sortKey, this.sortDesc) }];
  }

  private buildCalendar(): void {
    const months = groupByMonth(this.filtered.filter(row => row.dateKnown), true);
    const firsts = firstWeekdays(months);
    const previousLabel = this.calendarGrids[this.calendarIndex]?.label;
    this.calendarGrids = months.map((month, i) => buildCalendarMonth(month, firsts[i]));
    const keep = this.calendarGrids.findIndex(grid => grid.label === previousLabel);
    this.calendarIndex = keep >= 0 ? keep : Math.min(this.calendarIndex, Math.max(0, this.calendarGrids.length - 1));
  }

  get undatedRows(): ScheduleRow[] {
    return this.filtered.filter(row => !row.dateKnown);
  }

  private focusCalendarOn(row: ScheduleRow | null): void {
    if (!row?.dateKnown) return;
    const index = this.calendarGrids.findIndex(grid => grid.label === row.monthLabel);
    if (index >= 0) this.calendarIndex = index;
  }

  shiftMonth(step: number): void {
    this.calendarIndex = Math.max(0, Math.min(this.calendarGrids.length - 1, this.calendarIndex + step));
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) this.sortDesc = !this.sortDesc;
    else {
      this.sortKey = key;
      this.sortDesc = false;
    }
    this.buildListGroups();
  }

  sortIndicator(key: SortKey): string {
    return this.sortKey === key ? (this.sortDesc ? '▼' : '▲') : '';
  }

  toggleCompetition(key: string): void {
    // Unchecking from the "all" state keeps every other competition.
    const current = this.filters.competitions.length ? this.filters.competitions : this.competitions.map(c => c.key);
    const set = new Set(current);
    set.has(key) ? set.delete(key) : set.add(key);
    this.filters.competitions = set.size === this.competitions.length ? [] : Array.from(set);
    this.applyFilters();
  }

  toggleAllCompetitions(): void {
    this.filters.competitions = [];
    this.applyFilters();
  }

  toggleVenue(venue: Venue): void {
    const current = this.filters.venues.length ? this.filters.venues : ['H', 'A'] as Venue[];
    const set = new Set(current);
    set.has(venue) ? set.delete(venue) : set.add(venue);
    this.filters.venues = set.size === 2 ? [] : Array.from(set);
    this.applyFilters();
  }

  isCompetitionChecked(key: string): boolean {
    return !this.filters.competitions.length || this.filters.competitions.includes(key);
  }

  isVenueChecked(venue: Venue): boolean {
    return !this.filters.venues.length || this.filters.venues.includes(venue);
  }

  resetPanelFilters(): void {
    this.filters = { ...this.filters, competitions: [], venues: [], result: 'all' };
    this.applyFilters();
  }

  clearFilters(): void {
    this.filters = { ...DEFAULT_FILTERS, competitions: [], venues: [] };
    this.applyFilters();
  }

  get filtersActive(): boolean {
    return hasActiveFilters(this.filters);
  }

  get panelFiltered(): boolean {
    return hasPanelFilters(this.filters);
  }

  get nextMatch(): ScheduleRow | null {
    return this.season === this.currentSeason ? this.rows.find(row => !row.played) ?? null : null;
  }

  // ---------------------------------------------------------------- goalscorers view

  setListMode(mode: ListMode): void {
    this.listMode = mode;
    if (mode === 'goalscorers') this.loadScorers();
  }

  private loadScorers(): void {
    if (this.scorersByMatch.size || this.loadingScorers) return;
    const teamId = this.teamId;
    const season = this.season;
    const played = this.rows.filter(row => row.played && row.reportLink);
    this.loadingScorers = true;
    // Fallback for backends without the season endpoint: one summary per played match.
    type Entry = [string, { goals: Goal[]; incomplete: boolean }];
    const perMatch = (): Observable<Entry[]> => from(played).pipe(
      mergeMap(row => this.http.get<any>(`${urlApp}/match/summary/${this.matchPath(row)}`).pipe(
        map(summary => [row.key, { goals: (summary?.goals || []) as Goal[], incomplete: !summary }] as Entry),
        catchError(() => of([row.key, { goals: [], incomplete: true }] as Entry))
      ), 4),
      toArray()
    );
    this.scorersSub = this.http.get<any[]>(`${urlApp}/match/goalscorers/${season}/${teamId}`).pipe(
      map(list => (list || []).map(item => [
        `${item.competitionId}-${item.roundNumber}-${item.teamId1}-${item.teamId2}`,
        { goals: (item.goals || []) as Goal[], incomplete: (item.unknownFields || []).includes('goals') }
      ] as Entry)),
      catchError(() => perMatch())
    ).subscribe(entries => {
      this.loadingScorers = false;
      if (teamId !== this.teamId || season !== this.season) return;
      entries.forEach(([key, value]) => this.scorersByMatch.set(key, value));
    });
  }

  /** Own goalscorers for the Goalscorers view (friendlies store none). */
  ownScorers(row: ScheduleRow): string {
    if (!row.played) return '';
    if (row.competitionKind === 'friendly') return '—';
    const entry = this.scorersByMatch.get(row.key);
    if (!entry) return this.loadingScorers ? '…' : '—';
    const mine = entry.goals.filter(goal => this.isGoalFor(goal, this.teamId));
    const text = mine.map(goal => this.goalText(goal)).join(', ');
    if (entry.incomplete) return text ? `${text} (incomplete)` : 'Not recorded';
    return text || 'None';
  }

  // ---------------------------------------------------------------- selection

  select(row: ScheduleRow, writeUrl = true, keepDetail = false): void {
    const previous = this.selected;
    this.selected = row;
    if (writeUrl) this.updateUrl({ [this.matchParam]: row.key }, true);
    // A background refresh keeps the open panel unless that match has just been played.
    if (keepDetail && previous?.key === row.key && previous.played === row.played) return;
    this.clearDetailRequests();
    this.panelView = 'match';
    this.matchSummary = null;
    this.matchEvents = [];
    this.matchLineup = null;
    this.h2h = null;
    this.preview = null;
    this.opponentPosition = row.opponentPosition;
    this.teamNews = { home: null, away: null };
    this.loadHeadToHead(row);
    if (row.played) this.loadPlayedDetail(row);
    else {
      this.loadPreview(row);
      this.loadTeamNews(row);
    }
  }

  openMeetings(): void {
    this.panelView = 'meetings';
  }

  closeMeetings(): void {
    this.panelView = 'match';
  }

  private clearDetailRequests(): void {
    this.detailSubs.forEach(sub => sub.unsubscribe());
    this.detailSubs = [];
    this.loadingSummary = this.loadingH2h = this.loadingPreview = this.loadingForm = false;
  }

  private matchPath(row: ScheduleRow): string {
    const s = row.source;
    return `${s.competitionId}/${s.seasonNumber}/${s.roundNumber}/${s.teamId1}/${s.teamId2}`;
  }

  private loadPlayedDetail(row: ScheduleRow): void {
    this.loadingSummary = true;
    this.detailSubs.push(forkJoin({
      summary: this.http.get<any>(`${urlApp}/match/summary/${this.matchPath(row)}`).pipe(catchError(() => of(null))),
      events: this.http.get<MatchEvent[]>(`${urlApp}/match/matchEvents/${this.matchPath(row)}`).pipe(catchError(() => of([]))),
      lineup: this.http.get<any>(`${urlApp}/match/playerRatings/${this.matchPath(row)}`).pipe(catchError(() => of(null)))
    }).subscribe(({ summary, events, lineup }) => {
      this.matchSummary = summary;
      this.matchEvents = events || [];
      this.matchLineup = lineup;
      this.loadingSummary = false;
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

  /**
   * FM "team news": injuries still running on match day and suspensions that
   * apply to this competition, from the squad availability feed.
   */
  private loadTeamNews(row: ScheduleRow): void {
    const daysUntil = row.day !== null && this.teamService.currentDay > 0 && row.source.seasonNumber === this.currentSeason
      ? row.day - this.teamService.currentDay : 0;
    const news = (teamId: number): Observable<string[] | null> => teamId > 0
      ? this.http.get<AvailabilityRow[]>(`${urlApp}/teams/availability/${teamId}`).pipe(
        map(items => (items || [])
          .filter(item => item.type === 'INJURY'
            ? Number(item.remaining) > daysUntil
            : item.competitionId == null || Number(item.competitionId) === row.competitionId)
          .map(item => item.type === 'INJURY'
            ? `${item.playerName} out (${(item.label || 'injury').toLowerCase()})`
            : `${item.playerName} suspended (${item.remaining} ${item.remainingUnit})`)),
        catchError(() => of(null)))
      : of(null);
    this.detailSubs.push(forkJoin({ home: news(row.homeTeamId), away: news(row.awayTeamId) })
      .subscribe(result => this.teamNews = result));
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
        if (!this.opponentPosition) this.opponentPosition = opponent.position;
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
  trackByPlayer = (_: number, player: OwnPlayer) => player.playerId;

  /** FM subtitle: "4th in Literature League - Next Match: Kuntuna (H) (6 days)". */
  get headingLine(): string {
    if (this.season !== this.currentSeason) {
      const t = this.seasonTotals;
      return `Season ${this.season} · ${t.played} played · ${t.wins}W ${t.draws}D ${t.losses}L`;
    }
    const parts: string[] = [];
    if (this.standing) parts.push(`${ordinalPosition(this.standing.position)} in ${this.standing.league}`);
    const next = this.nextMatch;
    if (next) {
      const when = relativeDay(next.day, this.teamService.currentDay);
      parts.push(`Next Match: ${next.opponentName} (${next.venue})${when ? ` (${when})` : ''}`);
    } else if (this.rows.length) {
      parts.push('No matches left this season');
    }
    return parts.join(' - ') || `Season ${this.season}`;
  }

  /** Panel header, FM style: "OPPONENT (H) (80 DAYS AGO)". */
  panelHeading(row: ScheduleRow): string {
    const when = row.source.seasonNumber === this.currentSeason
      ? relativeDay(row.day, this.teamService.currentDay)
      : `season ${row.source.seasonNumber}`;
    return `${row.opponentName} (${row.venue})${when ? ` (${when})` : ''}`;
  }

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

  ordinal(position: number | null): string {
    return ordinalPosition(position);
  }

  outcomeLabel(outcome: Outcome | null): string {
    return outcome === 'W' ? 'Win' : outcome === 'D' ? 'Draw' : outcome === 'L' ? 'Loss' : '';
  }

  private allGoals(): Goal[] {
    const goals = this.matchSummary?.goals;
    if (Array.isArray(goals) && goals.length) return goals;
    return this.matchEvents.filter(event => event.eventType === 'goal');
  }

  private isOwnGoal(goal: Goal): boolean {
    return !!goal.ownGoal || /own goal/i.test(goal.details || '');
  }

  private isGoalFor(goal: Goal, teamId: number): boolean {
    // An own goal counts for the other side; the backend reports the scoring player's team.
    return this.isOwnGoal(goal) ? Number(goal.teamId) !== teamId : Number(goal.teamId) === teamId;
  }

  goalText(goal: Goal): string {
    const minute = goal.minute != null ? `${goal.minute}'` : '';
    if (this.isOwnGoal(goal)) return `${goal.playerName} o.g.${minute ? ` (${minute})` : ''}`;
    if (goal.penalty || /penalt/i.test(goal.details || '')) return `${goal.playerName} (pen${minute ? ` ${minute}` : ''})`;
    return minute ? `${goal.playerName} ${minute}` : goal.playerName;
  }

  goalsFor(teamId: number): Goal[] {
    return this.allGoals().filter(goal => this.isGoalFor(goal, teamId));
  }

  /**
   * FM player list for the own club: the full match squad from /match/playerRatings
   * (starters, used and unused substitutes) when stored, otherwise the players
   * who appeared, from the summary ratings.
   */
  get ownPlayers(): OwnPlayer[] {
    if (!this.selected || !this.matchSummary) return [];
    const ownHome = this.selected.venue === 'H';
    const appeared: any[] = (ownHome ? this.matchSummary.homePlayerRatings : this.matchSummary.awayPlayerRatings) || [];
    const lineup: any[] = (ownHome ? this.matchLineup?.homeLineup : this.matchLineup?.awayLineup) || [];
    const byId = new Map(appeared.map(p => [Number(p.playerId), p]));
    const ids = (type: string) => new Set(this.matchEvents.filter(e => e.eventType === type).map(e => Number(e.playerId)));
    const yellow = ids('yellow_card');
    const red = ids('red_card');
    const motmId = Number(this.matchSummary.manOfTheMatchPlayerId);
    const source = lineup.length
      ? [...lineup].sort((a, b) => Number(!!a.substitute) - Number(!!b.substitute) || (a.positionIndex ?? 0) - (b.positionIndex ?? 0))
      : appeared;
    return source.map(p => {
      const id = Number(p.playerId);
      const played = byId.get(id);
      const rating = played && typeof played.rating === 'number' ? played.rating
        : !lineup.length && typeof p.rating === 'number' ? p.rating : null;
      return {
        playerId: id,
        playerName: p.playerName,
        position: p.position || played?.position || '',
        rating: rating && rating > 0 ? rating : null,
        substitute: !!p.substitute,
        goals: Number(played?.goals ?? p.goals) || 0,
        yellow: yellow.has(id),
        red: red.has(id),
        motm: motmId === id
      };
    });
  }

  goalIcons(count: number): number[] {
    return Array.from({ length: Math.min(count, 5) });
  }

  ratingClass(rating: number | null): string {
    if (rating === null) return 'none';
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
