import { Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, forkJoin, from, of } from 'rxjs';
import { catchError, map, mergeMap, toArray } from 'rxjs/operators';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import {
  CalendarEntry, CalendarMonthGrid, CalendarWeek, WeekDay, CompetitionOption, DEFAULT_FILTERS, GoalLike, ListItem, MonthGroup,
  Outcome, ScheduleFilters, ScheduleRow, ScheduleSummary, ScheduleView, ScorerText, SortKey, UNDATED_MONTH, Venue,
  WEEKDAYS, attendanceText, buildCalendarMonth, buildRows, buildWeeks, competitionOptions, daysBetween, defaultSelection, filterRows,
  firstWeekdays, formBefore, freeDates, groupByMonth, groupScorers, hasActiveFilters, hasPanelFilters, isFreeDate,
  isOwnGoal, mergeFreeDates, ordinalPosition, panelGoalText, relativeLabel, seasonCalendar, seasonMonths, sortRows,
  summarise
} from './schedule-model';

const VIEWS = ['fixtures', 'calendar'] as const;
type ScheduleViewMode = typeof VIEWS[number];
type ListMode = 'fixtures' | 'goalscorers';
type CalendarSub = 'calendar' | 'list';
type CalendarMode = 'week' | 'month' | 'year';
type ColumnKey = 'date' | 'opposition' | 'venue' | 'result' | 'competition';

const COLUMN_STORAGE = 'fm.schedule.columns';
const SELECTION_STORAGE = 'fm.schedule.selection';

/** Positional order used for the player list when the formation order is not stored. */
const POSITION_ORDER = ['GK', 'SW', 'DR', 'DC', 'DL', 'WBR', 'WBL', 'DM', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'FR', 'FL', 'ST', 'CF'];

export interface MatchEvent {
  id: number;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  teamId1: number;
  teamId2: number;
  minute: number;
  addedTime?: number | null;
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

interface OwnPlayer {
  playerId: number;
  playerName: string;
  /** null = unused substitute ("-" in FM). */
  rating: number | null;
  substitute: boolean;
  goals: number;
  yellow: boolean;
  red: boolean;
  injured: boolean;
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

interface MeetingsRow {
  position: number;
  teamId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

interface YearDay {
  day: number | null;
  title: string;
  kind: 'official' | 'friendly' | null;
  today: boolean;
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
  readonly columnLabels: { key: ColumnKey; label: string; title: string }[] = [
    { key: 'date', label: 'Date', title: 'Date of fixture' },
    { key: 'opposition', label: 'Opposition', title: 'Opposition club' },
    { key: 'venue', label: 'Venue', title: 'Venue: Home or Away' },
    { key: 'result', label: 'Result', title: 'Result, your score first' },
    { key: 'competition', label: 'Competition', title: 'Competition and stage' }
  ];

  teamId = 0;
  teamName = 'Club';
  view: ScheduleViewMode = 'fixtures';
  listMode: ListMode = 'fixtures';
  season = 0;
  currentSeason = 1;
  seasons: number[] = [1];

  rows: ScheduleRow[] = [];
  filtered: ScheduleRow[] = [];
  /** Fixtures list groups: by month for the date sort (with free dates when asked), flat otherwise. */
  listGroups: MonthGroup<ListItem>[] = [];
  competitions: CompetitionOption[] = [];
  summary: ScheduleSummary = summarise([]);
  seasonTotals: ScheduleSummary = summarise([]);
  filters: ScheduleFilters = { ...DEFAULT_FILTERS, competitions: [], venues: [] };
  filterPanelOpen = false;
  filterPinned = false;
  customOpen = false;
  columns: Record<ColumnKey, boolean> = { date: true, opposition: true, venue: true, result: true, competition: true };
  sortKey: SortKey = 'date';
  sortDesc = false;
  loading = false;
  loadError = false;

  // Calendar
  calendarSub: CalendarSub = 'calendar';
  calendarMode: CalendarMode = 'month';
  calendarGrids: CalendarMonthGrid[] = [];
  calendarIndex = 0;
  weeks: CalendarWeek[] = [];
  weekIndex = 0;
  yearMonths: { label: string; weeks: YearDay[][] }[] = [];
  listMonths: MonthGroup[] = [];

  /** Own league standing for the heading, from the next-match preview. */
  standing: { position: number; league: string } | null = null;
  /** The next match of the current season, for the heading on any season. */
  currentNext: ScheduleRow | null = null;
  /** Current league table positions by team id (own league, current season). */
  leaguePositions = new Map<number, number>();

  selected: ScheduleRow | null = null;
  meetingsOpponent: number | null = null;
  matchSummary: any = null;
  matchEvents: MatchEvent[] = [];
  matchLineup: any = null;
  h2h: any = null;
  preview: MatchPreview | null = null;
  teamNews: { home: string[] | null; away: string[] | null } = { home: null, away: null };
  loadingSummary = false;
  loadingH2h = false;
  loadingPreview = false;
  loadingForm = false;

  /** Goalscorers view: scorers per fixture key; `incomplete` when the save lacks some goals. */
  scorersByMatch = new Map<string, { goals: GoalLike[]; incomplete: boolean }>();
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
    private teamService: TeamService,
    private host: ElementRef<HTMLElement>
  ) {
    this.columns = { ...this.columns, ...this.readStorage<Record<ColumnKey, boolean>>(COLUMN_STORAGE, {} as any) };
  }

  get embedded(): boolean { return !!this.teamIdInput; }
  private get seasonParam(): string { return this.embedded ? 'fixturesSeason' : 'season'; }
  private get viewParam(): string { return this.embedded ? 'fixturesTab' : 'tab'; }
  private get matchParam(): string { return this.embedded ? 'fixturesMatch' : 'match'; }
  private get meetingsParam(): string { return this.embedded ? 'fixturesMeetings' : 'meetings'; }

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

  /** An unpinned Filter flyout closes on any click outside it, as in FM. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target || !this.host.nativeElement.contains(target)) {
      if (!this.filterPinned) this.filterPanelOpen = false;
      this.customOpen = false;
      return;
    }
    if (this.filterPanelOpen && !this.filterPinned && !target.closest('.filter-flyout, .filter-btn')) this.filterPanelOpen = false;
    if (this.customOpen && !target.closest('.custom-menu, .custom-btn')) this.customOpen = false;
  }

  // ---------------------------------------------------------------- URL state

  private applyQueryParams(params: ParamMap): void {
    const view = params.get(this.viewParam) as ScheduleViewMode | null;
    this.view = view && VIEWS.includes(view) ? view : 'fixtures';
    this.requestedMatchKey = params.get(this.matchParam);
    this.meetingsOpponent = Number(params.get(this.meetingsParam)) || null;
    this.ensureMeetings();

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
    this.updateUrl({ [this.viewParam]: view === 'fixtures' ? null : view, [this.meetingsParam]: null });
  }

  changeSeason(season: number): void {
    if (!season || season < 1 || season > this.currentSeason) return;
    this.updateUrl({
      [this.seasonParam]: season === this.currentSeason ? null : season, [this.matchParam]: null, [this.meetingsParam]: null
    });
  }

  /** FM Previous Meetings is its own page; Back returns to the schedule. */
  openMeetings(row: ScheduleRow): void {
    if (row.opponentId) this.updateUrl({ [this.meetingsParam]: row.opponentId });
  }

  closeMeetings(): void {
    this.updateUrl({ [this.meetingsParam]: null });
  }

  // ---------------------------------------------------------------- storage

  private readStorage<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : fallback;
    } catch {
      return fallback;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  private rememberSelection(row: ScheduleRow): void {
    const stored = this.readStorage<Record<string, string>>(SELECTION_STORAGE, {});
    stored[`${this.teamId}-${row.source.seasonNumber}`] = row.key;
    this.writeStorage(SELECTION_STORAGE, stored);
  }

  private rememberedSelection(): string | null {
    return this.readStorage<Record<string, string>>(SELECTION_STORAGE, {})[`${this.teamId}-${this.season}`] || null;
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
    this.currentNext = null;
    this.leaguePositions.clear();
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
    const current = this.currentSeason;
    this.loadSub = forkJoin({
      schedule: this.http.get<ScheduleView[]>(`${urlApp}/match/getScheduleForSeasonNumber/${season}/${teamId}`),
      calendar: this.http.get<CalendarEntry[]>(`${urlApp}/match/calendar/${teamId}/${season}`).pipe(catchError(() => of([]))),
      standing: this.http.get<any>(`${urlApp}/match/preview/${teamId}`).pipe(catchError(() => of(null))),
      // FM keeps the current-season subtitle on every season.
      currentSchedule: season === current
        ? of(null)
        : this.http.get<ScheduleView[]>(`${urlApp}/match/getScheduleForSeasonNumber/${current}/${teamId}`).pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ schedule, calendar, standing, currentSchedule }) => {
        this.loading = false;
        this.opponentRows.clear();
        this.scorersByMatch.clear();
        this.rawSchedule = schedule || [];
        this.rawCalendar = calendar || [];
        this.standing = this.standingFrom(standing, teamId);
        this.rebuildRows();
        this.currentNext = season === current
          ? this.rows.find(row => !row.played) ?? null
          : buildRows(currentSchedule || [], teamId, [], this.anchor()).find(row => !row.played) ?? null;
        this.loadLeagueTable();
        const wanted = this.requestedMatchKey || previousKey || this.rememberedSelection();
        const row = (wanted && this.rows.find(r => r.key === wanted)) || defaultSelection(this.filtered);
        if (row) this.select(row, false, keepSelection && row.key === previousKey);
        else this.selected = null;
        this.focusCalendarOn(this.selected);
        this.ensureMeetings();
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

  /** Current table of the club's league: positions for played-match cards and cup previews. */
  private loadLeagueTable(): void {
    const league = (this.season === this.currentSeason ? this.rows : [])
      .find(row => row.competitionKind === 'league' && row.competitionLink);
    this.leaguePositions.clear();
    if (!league) return;
    this.http.get<any[]>(`${urlApp}/competition/getTeams/${league.competitionLink}`).pipe(catchError(() => of([])))
      .subscribe(table => {
        (table || []).forEach(team => {
          if (Number(team.position) > 0) this.leaguePositions.set(Number(team.teamId), Number(team.position));
        });
        this.buildCalendar();
      });
  }

  private anchor() {
    return this.teamService.currentDay > 0 && this.teamService.dayOfWeek
      ? { season: this.currentSeason, day: this.teamService.currentDay, dayOfWeek: this.teamService.dayOfWeek }
      : null;
  }

  private rebuildRows(): void {
    const selectedKey = this.selected?.key;
    this.rows = buildRows(this.rawSchedule, this.teamId, this.rawCalendar, this.anchor());
    this.applyFilters(false);
    if (selectedKey) {
      const row = this.rows.find(r => r.key === selectedKey);
      if (row) this.selected = row;
    }
  }

  // ---------------------------------------------------------------- filters, sorting, columns

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
    if (this.sortKey !== 'date') {
      this.listGroups = [{ label: '', rows: sortRows(this.filtered, this.sortKey, this.sortDesc) }];
      return;
    }
    const items: ListItem[] = this.filters.freeDates ? mergeFreeDates(this.filtered, freeDates(this.rows)) : this.filtered;
    this.listGroups = groupByMonth(this.sortDesc ? [...items].reverse() : items, !this.sortDesc);
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

  toggleColumn(key: ColumnKey): void {
    if (key === 'opposition') return;
    this.columns = { ...this.columns, [key]: !this.columns[key] };
    this.writeStorage(COLUMN_STORAGE, this.columns);
  }

  resetColumns(): void {
    this.columns = { date: true, opposition: true, venue: true, result: true, competition: true };
    this.writeStorage(COLUMN_STORAGE, this.columns);
  }

  get visibleColumnCount(): number {
    return 1 + Object.values(this.columns).filter(Boolean).length + (this.listMode === 'goalscorers' ? 1 : 0);
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

  toggleFreeDates(): void {
    this.filters.freeDates = !this.filters.freeDates;
    this.applyFilters();
  }

  isCompetitionChecked(key: string): boolean {
    return !this.filters.competitions.length || this.filters.competitions.includes(key);
  }

  isVenueChecked(venue: Venue): boolean {
    return !this.filters.venues.length || this.filters.venues.includes(venue);
  }

  resetPanelFilters(): void {
    this.filters = { ...this.filters, competitions: [], venues: [], result: 'all', freeDates: false };
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

  // ---------------------------------------------------------------- calendar

  private buildCalendar(): void {
    const months = seasonMonths(this.filtered);
    const firsts = firstWeekdays(months);
    const previousLabel = this.calendarGrids[this.calendarIndex]?.label;
    this.calendarGrids = months.map((month, i) => buildCalendarMonth(month, firsts[i], months[i - 1], months[i + 1]));
    const keep = this.calendarGrids.findIndex(grid => grid.label === previousLabel);
    this.calendarIndex = keep >= 0 ? keep : Math.min(this.calendarIndex, Math.max(0, this.calendarGrids.length - 1));

    const previousWeek = this.weeks[this.weekIndex]?.label;
    this.weeks = buildWeeks(this.filtered.filter(row => row.dateKnown).length ? this.filtered : []);
    const keepWeek = this.weeks.findIndex(week => week.label === previousWeek);
    this.weekIndex = keepWeek >= 0 ? keepWeek : Math.min(this.weekIndex, Math.max(0, this.weeks.length - 1));

    const calendar = seasonCalendar(this.rows);
    const today = this.season === this.currentSeason && calendar && this.teamService.currentDay > 0
      ? calendar(this.teamService.currentDay) : null;
    this.yearMonths = this.calendarGrids.map(grid => ({
      label: grid.label,
      weeks: grid.weeks.map(week => week.map(cell => {
        if (cell.outside) return { day: null, title: '', kind: null, today: false };
        const official = cell.rows.find(r => r.competitionKind !== 'friendly');
        const match = official || cell.rows[0];
        const isToday = !!today && today.dayOfMonth === cell.day && grid.label === this.monthName(today.monthIndex);
        return {
          day: cell.day,
          kind: match ? (official ? 'official' : 'friendly') : null,
          today: isToday,
          title: match ? `${match.longDateLabel}\n${this.homeAway(match)}\n(${match.competitionLabel})` : ''
        } as YearDay;
      }))
    }));
    this.listMonths = groupByMonth(this.filtered);
  }

  private monthName(monthIndex: number): string {
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
      'November', 'December'][monthIndex];
  }

  get undatedRows(): ScheduleRow[] {
    return this.filtered.filter(row => !row.dateKnown);
  }

  private focusCalendarOn(row: ScheduleRow | null): void {
    if (!row?.dateKnown) return;
    const index = this.calendarGrids.findIndex(grid => grid.label === row.monthLabel);
    if (index >= 0) this.calendarIndex = index;
    const week = this.weeks.findIndex(w => w.days.some(d => d.rows.includes(row)));
    if (week >= 0) this.weekIndex = week;
  }

  shiftMonth(step: number): void {
    this.calendarIndex = Math.max(0, Math.min(this.calendarGrids.length - 1, this.calendarIndex + step));
  }

  shiftWeek(step: number): void {
    this.weekIndex = Math.max(0, Math.min(this.weeks.length - 1, this.weekIndex + step));
  }

  /** "Home v Away" with the club's own name, as on FM calendar hovers and Week lines. */
  homeAway(row: ScheduleRow, joiner = 'v'): string {
    const home = row.venue === 'H' ? this.teamName : row.opponentName;
    const away = row.venue === 'H' ? row.opponentName : this.teamName;
    return `${home} ${joiner} ${away}`;
  }

  /** Opponent league position: the backend's (upcoming) or the current table (current season). */
  positionOf(row: ScheduleRow): number | null {
    if (row.opponentPosition) return row.opponentPosition;
    if (row.source.seasonNumber !== this.currentSeason || !row.opponentId) return null;
    return this.leaguePositions.get(row.opponentId) ?? null;
  }

  /** Calendar › List and Week show the home side first, like FM. */
  homeFirstScore(row: ScheduleRow): string {
    return row.played ? `${row.extraTime ? 'e ' : ''}${row.homeGoals} - ${row.awayGoals}` : '';
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
    type Entry = [string, { goals: GoalLike[]; incomplete: boolean }];
    // Fallback for backends without the season endpoint: one summary per played match.
    const perMatch = (): Observable<Entry[]> => from(played).pipe(
      mergeMap(row => this.http.get<any>(`${urlApp}/match/summary/${this.matchPath(row)}`).pipe(
        map(summary => [row.key, { goals: (summary?.goals || []) as GoalLike[], incomplete: !summary }] as Entry),
        catchError(() => of([row.key, { goals: [], incomplete: true }] as Entry))
      ), 4),
      toArray()
    );
    this.scorersSub = this.http.get<any[]>(`${urlApp}/match/goalscorers/${season}/${teamId}`).pipe(
      map(list => (list || []).map(item => [
        `${item.competitionId}-${item.roundNumber}-${item.teamId1}-${item.teamId2}`,
        { goals: (item.goals || []) as GoalLike[], incomplete: (item.unknownFields || []).includes('goals') }
      ] as Entry)),
      catchError(() => perMatch())
    ).subscribe(entries => {
      this.loadingScorers = false;
      if (teamId !== this.teamId || season !== this.season) return;
      entries.forEach(([key, value]) => this.scorersByMatch.set(key, value));
    });
  }

  /** FM Goalscorers cell: own scorers grouped per player; opponent own goals in grey. */
  ownScorers(row: ScheduleRow): ScorerText[] {
    if (!row.played) return [];
    if (row.competitionKind === 'friendly') return [{ text: '—', ownGoal: false }];
    const entry = this.scorersByMatch.get(row.key);
    if (!entry) return [{ text: this.loadingScorers ? '…' : '—', ownGoal: false }];
    const grouped = groupScorers(entry.goals.filter(goal => this.isGoalFor(goal, this.teamId)));
    if (entry.incomplete) {
      return grouped.length ? [...grouped, { text: '(incomplete)', ownGoal: true }] : [{ text: 'Not recorded', ownGoal: true }];
    }
    return grouped.length ? grouped : [{ text: 'None', ownGoal: false }];
  }

  // ---------------------------------------------------------------- selection

  select(row: ScheduleRow, writeUrl = true, keepDetail = false): void {
    const previous = this.selected;
    this.selected = row;
    this.rememberSelection(row);
    if (writeUrl) this.updateUrl({ [this.matchParam]: row.key }, true);
    if (!this.filterPinned) this.filterPanelOpen = false;
    // A background refresh keeps the open panel unless that match has just been played.
    if (keepDetail && previous?.key === row.key && previous.played === row.played) return;
    this.clearDetailRequests();
    this.matchSummary = null;
    this.matchEvents = [];
    this.matchLineup = null;
    this.h2h = null;
    this.preview = null;
    this.teamNews = { home: null, away: null };
    this.loadHeadToHead(row);
    if (row.played) this.loadPlayedDetail(row);
    else {
      this.loadPreview(row);
      this.loadTeamNews(row);
    }
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

  /** Previous Meetings opened from a link: load that pair even if it is not the selected match. */
  private ensureMeetings(): void {
    if (!this.meetingsOpponent || !this.teamId) return;
    if (this.h2h && Number(this.h2h.teamBId) === this.meetingsOpponent) return;
    if (this.selected?.opponentId === this.meetingsOpponent && this.loadingH2h) return;
    this.loadingH2h = true;
    this.http.get<any>(`${urlApp}/match/h2h/${this.teamId}/${this.meetingsOpponent}`).pipe(catchError(() => of(null)))
      .subscribe(data => {
        this.h2h = data;
        this.loadingH2h = false;
      });
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
    // League positions come from the league table: a cup fixture's preview ranks the cup instead.
    own.position = this.standing?.position ?? null;
    opponent.position = this.positionOf(row);

    if (row.source.seasonNumber === this.currentSeason && row.competitionKind !== 'friendly') {
      this.loadingPreview = true;
      const isNext = this.nextMatch?.key === row.key;
      this.detailSubs.push(this.http.get<any>(`${urlApp}/match/preview/${this.matchPath(row)}`).pipe(
        catchError(() => isNext ? this.http.get<any>(`${urlApp}/match/preview/${this.teamId}`) : of(null)),
        catchError(() => of(null))
      ).subscribe(data => {
        this.loadingPreview = false;
        if (!data || Number(data.homeTeamId) !== row.homeTeamId || Number(data.awayTeamId) !== row.awayTeamId) return;
        if (row.competitionKind === 'league') {
          preview.home.position = Number(data.homeLeaguePosition) || preview.home.position;
          preview.away.position = Number(data.awayLeaguePosition) || preview.away.position;
        }
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

  isFree = isFreeDate;
  trackByItem = (_: number, item: ListItem) => item.key;
  trackByRow = (_: number, row: ScheduleRow) => row.key;
  trackByMonth = (_: number, month: MonthGroup<any>) => month.label;
  trackByPlayer = (_: number, player: OwnPlayer) => player.playerId;
  trackByTeam = (_: number, row: MeetingsRow) => row.teamId;
  trackByIndex = (index: number) => index;
  hasRows = (day: WeekDay) => day.rows.length > 0;

  asRow(item: ListItem): ScheduleRow {
    return item as ScheduleRow;
  }

  /** FM subtitle, always about the current season: "4th in Literature League - Next Match: X (H) (6 days)". */
  get headingLine(): string {
    const parts: string[] = [];
    if (this.standing) parts.push(`${ordinalPosition(this.standing.position)} in ${this.standing.league}`);
    const next = this.currentNext;
    if (next) {
      const when = relativeLabel(daysBetween(this.currentSeason, next.day, this.currentSeason, this.teamService.currentDay));
      parts.push(`Next Match: ${next.opponentName} (${next.venue})${when ? ` (${when})` : ''}`);
    } else if (this.season === this.currentSeason && this.rows.length) {
      parts.push('No matches left this season');
    }
    return parts.join(' - ') || `Season ${this.currentSeason}`;
  }

  /** Panel header, FM style: "OPPONENT (H) (80 DAYS AGO)", across seasons too. */
  panelHeading(row: ScheduleRow): string {
    const when = relativeLabel(daysBetween(row.source.seasonNumber, row.day, this.currentSeason, this.teamService.currentDay));
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

  /** FM Previous Meetings table: both clubs ranked by points over every meeting. */
  get meetingsTable(): MeetingsRow[] {
    const h = this.h2h;
    if (!h) return [];
    const rows: MeetingsRow[] = [
      { position: 0, teamId: h.teamAId, name: h.teamAName, played: 0, won: h.teamAWins, drawn: h.draws, lost: h.teamBWins,
        goalsFor: h.teamAGoals, goalsAgainst: h.teamBGoals, points: 0 },
      { position: 0, teamId: h.teamBId, name: h.teamBName, played: 0, won: h.teamBWins, drawn: h.draws, lost: h.teamAWins,
        goalsFor: h.teamBGoals, goalsAgainst: h.teamAGoals, points: 0 }
    ];
    rows.forEach(r => {
      r.played = r.won + r.drawn + r.lost;
      r.points = r.won * 3 + r.drawn;
    });
    rows.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
    rows.forEach((r, i) => r.position = i + 1);
    return rows;
  }

  ordinal(position: number | null): string {
    return ordinalPosition(position);
  }

  /** Date of a previous meeting when that match is in the loaded season, otherwise its season. */
  meetingDate(meeting: any): string {
    const row = this.rows.find(r => r.competitionId === Number(meeting.competitionId)
      && r.source.roundNumber === Number(meeting.roundNumber) && r.source.seasonNumber === Number(meeting.seasonNumber)
      && r.homeTeamId === Number(meeting.homeTeamId));
    return row?.dateKnown ? row.dateLabel : `Season ${meeting.seasonNumber}`;
  }

  /** FM Calendar › List date: "4th Aug". */
  listDate(row: ScheduleRow): string {
    return row.dayOfMonth ? `${ordinalPosition(row.dayOfMonth)} ${row.monthLabel.slice(0, 3)}` : '—';
  }

  get meetingsOpponentName(): string {
    if (!this.h2h) return '';
    return Number(this.h2h.teamAId) === this.teamId ? this.h2h.teamBName : this.h2h.teamAName;
  }

  /** Competition pages open on the current season unless told otherwise. */
  competitionQuery(row: ScheduleRow): { season: number } | null {
    return row.source.seasonNumber !== this.currentSeason ? { season: row.source.seasonNumber } : null;
  }

  outcomeLabel(outcome: Outcome | null): string {
    return outcome === 'W' ? 'Win' : outcome === 'D' ? 'Draw' : outcome === 'L' ? 'Loss' : '';
  }

  private allGoals(): GoalLike[] {
    const goals = this.matchSummary?.goals;
    if (Array.isArray(goals) && goals.length) return goals;
    return this.matchEvents.filter(event => event.eventType === 'goal');
  }

  private isGoalFor(goal: GoalLike, teamId: number): boolean {
    // An own goal counts for the other side; the backend reports the scoring player's team.
    return isOwnGoal(goal) ? Number(goal.teamId) !== teamId : Number(goal.teamId) === teamId;
  }

  /** FM panel scorers under each side, one line per goal: "Name (27)", "Name (pen 75)". */
  scorersFor(teamId: number): ScorerText[] {
    return this.allGoals()
      .filter(goal => this.isGoalFor(goal, teamId))
      .map(goal => ({ text: panelGoalText(goal), ownGoal: isOwnGoal(goal) }));
  }

  /**
   * FM player list for the own club, in formation order: the stored match squad
   * from /match/playerRatings (starters, then the bench with "-" for unused
   * substitutes); otherwise the players who appeared, ordered by position.
   */
  get ownPlayers(): OwnPlayer[] {
    if (!this.selected || !this.matchSummary) return [];
    const ownHome = this.selected.venue === 'H';
    const appeared: any[] = ((ownHome ? this.matchSummary.homePlayerRatings : this.matchSummary.awayPlayerRatings) || [])
      .filter((p: any) => Number(p.playerId) > 0);
    const lineup: any[] = (ownHome ? this.matchLineup?.homeLineup : this.matchLineup?.awayLineup) || [];
    const byId = new Map(appeared.map(p => [Number(p.playerId), p]));
    const ids = (type: string) => new Set(this.matchEvents.filter(e => e.eventType === type).map(e => Number(e.playerId)));
    const yellow = ids('yellow_card');
    const red = ids('red_card');
    const injured = ids('injury');
    const rank = (position: string) => {
      const index = POSITION_ORDER.indexOf((position || '').toUpperCase());
      return index < 0 ? POSITION_ORDER.length : index;
    };
    const source = lineup.length
      ? [...lineup].sort((a, b) => Number(!!a.substitute) - Number(!!b.substitute) || (a.positionIndex ?? 0) - (b.positionIndex ?? 0))
      : [...appeared].sort((a, b) => rank(a.position) - rank(b.position));
    return source.map(p => {
      const id = Number(p.playerId);
      const played = byId.get(id);
      const rating = played && typeof played.rating === 'number' ? played.rating
        : !lineup.length && typeof p.rating === 'number' ? p.rating : null;
      return {
        playerId: id,
        playerName: p.playerName,
        rating: rating && rating > 0 ? rating : null,
        substitute: !!p.substitute,
        goals: Number(played?.goals ?? p.goals) || 0,
        yellow: yellow.has(id),
        red: red.has(id),
        injured: injured.has(id)
      };
    });
  }

  /** "Attendance: 2,727 (13 Away)" from the post-match summary, when the match stored its crowd. */
  get attendanceLine(): string | null {
    return attendanceText(this.matchSummary?.attendance, this.matchSummary?.awayAttendance);
  }

  goalIcons(count: number): number[] {
    return Array.from({ length: Math.min(count, 5) });
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
