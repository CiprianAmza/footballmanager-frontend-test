/**
 * Pure view-model for the club Schedule page (/fixtures, /fixtures/:teamId).
 *
 * The layout follows the FM24 Schedule screen (month-grouped fixtures list,
 * one-month Monday–Sunday calendar, compact match panel). Every derived value
 * prefers the explicit backend fields and only falls back to the legacy string
 * fields (score, date, decidedBy) when they are absent.
 */

export type Venue = 'H' | 'A';
export type Outcome = 'W' | 'D' | 'L';
export type CompetitionKind = 'league' | 'cup' | 'continental' | 'friendly';
export type ShowFilter = 'all' | 'fixtures' | 'results';
export type SortKey = 'date' | 'opposition' | 'venue' | 'result' | 'competition';

/** Row returned by /match/getScheduleForSeasonNumber/{season}/{teamId}. */
export interface ScheduleView {
  opponentTeam: string;
  homeOrAway: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  competitionName: string;
  score: string;
  date: string;
  day?: number | null;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  teamId1: number;
  teamId2: number;
  winnerTeamId?: number | null;
  decidedBy?: string | null;
  opponentTeamId?: number | null;
  status?: string | null;
  resultOutcome?: string | null;
  teamGoals?: number | null;
  opponentGoals?: number | null;
  legNumber?: number | null;
  tieId?: number | string | null;
  aggregateTeam1Score?: number | null;
  aggregateTeam2Score?: number | null;
  penaltyTeam1Score?: number | null;
  penaltyTeam2Score?: number | null;
  roundLabel?: string | null;
  competitionType?: string | null;
  reportAvailable?: boolean | null;
  venueName?: string | null;
  unknownFields?: string[] | null;
  // Requested after the FM24 comparison (optional until they ship).
  dayOfWeek?: string | null;
  kickoffTime?: string | null;
  opponentLeaguePosition?: number | null;
}

/** Row returned by /match/calendar/{teamId}/{season} (competitive matches only). */
export interface CalendarEntry {
  roundNumber: number;
  competitionName: string;
  competitionId: number;
  competitionType: string;
  opponentTeamName: string;
  opponentTeamId: number;
  homeOrAway: string;
  dateDisplay: string;
  score: string;
  resultOutcome: string | null;
  status: string;
  teamId1: number;
  teamId2: number;
  seasonNumber: number;
}

/** A day of the season whose weekday is known, used to align every other day. */
export interface WeekdayAnchor {
  season: number;
  day: number;
  dayOfWeek: string;
}

export interface ScheduleRow {
  key: string;
  source: ScheduleView;
  /** Position in the backend list (already chronological: day, round, competition, leg). */
  order: number;
  /** Calendar day, comparable across clubs; null when the save has no calendar day. */
  day: number | null;
  dateKnown: boolean;
  /** 0 = Monday … 6 = Sunday; null when it cannot be derived. */
  weekday: number | null;
  dateLabel: string;
  longDateLabel: string;
  monthLabel: string;
  monthIndex: number | null;
  dayOfMonth: number | null;
  kickoffTime: string | null;
  competitionId: number;
  competitionName: string;
  /** FM-style competition cell: league name only, cups with their stage, "Friendly". */
  competitionLabel: string;
  competitionShort: string;
  competitionKind: CompetitionKind;
  competitionLink: number | null;
  stageLabel: string;
  venue: Venue;
  opponentId: number | null;
  opponentName: string;
  opponentPosition: number | null;
  played: boolean;
  outcome: Outcome | null;
  teamGoals: number | null;
  opponentGoals: number | null;
  /** Decided after extra time: FM prefixes the score with "e". */
  extraTime: boolean;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  resultNote: string | null;
  reportLink: (string | number)[] | null;
  venueName: string | null;
}

export interface ScheduleFilters {
  show: ShowFilter;
  /** Competition keys from competitionOptions(); empty = every competition. */
  competitions: string[];
  /** Empty = home and away. */
  venues: Venue[];
  result: 'all' | Outcome;
  search: string;
}

export interface MonthGroup {
  label: string;
  rows: ScheduleRow[];
}

export interface CompetitionOption {
  key: string;
  label: string;
  kind: CompetitionKind;
  count: number;
}

export interface ScheduleSummary {
  played: number;
  upcoming: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: Outcome[];
}

export interface CalendarCell {
  /** Day of month, or null for padding cells outside the month. */
  day: number | null;
  rows: ScheduleRow[];
}

export interface CalendarMonthGrid {
  label: string;
  /** False when no weekday could be derived: the grid then starts on day 1 without weekday headers. */
  aligned: boolean;
  weeks: CalendarCell[][];
}

export const DEFAULT_FILTERS: ScheduleFilters = {
  show: 'all', competitions: [], venues: [], result: 'all', search: ''
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
/** The simulator calendar has no leap years (1 August + 359 days = 26 July). */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const UNDATED_MONTH = 'Date not recorded';

export function fixtureKey(m: { competitionId: number; roundNumber: number; teamId1: number; teamId2: number }): string {
  return `${m.competitionId}-${m.roundNumber}-${m.teamId1}-${m.teamId2}`;
}

export function competitionKind(type: string | null | undefined, competitionId: number, name = ''): CompetitionKind {
  if (competitionId < 0) return 'friendly';
  const value = (type || '').toLowerCase();
  if (value.includes('friend')) return 'friendly';
  if (value.includes('europ') || value.includes('contin') || value.includes('champions') || value.includes('intern')) return 'continental';
  if (value.includes('cup') || value.includes('knock')) return 'cup';
  if (value.includes('league')) return 'league';
  const lower = name.toLowerCase();
  if (lower.includes('friendly')) return 'friendly';
  if (lower.includes('cup') || lower.includes('cupa')) return 'cup';
  if (lower.includes('champions') || lower.includes('europa') || lower.includes('conference')) return 'continental';
  return 'league';
}

/** First "X - Y" pair, i.e. the visible scoreline without knockout suffixes. */
export function parseScore(score: string | null | undefined): [number, number] | null {
  const match = (score || '').match(/(\d+)\s*-\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function ordinalPosition(position: number | null | undefined): string {
  return finite(position) && position > 0 ? ordinal(position) : '';
}

function mod7(value: number): number {
  return ((value % 7) + 7) % 7;
}

export function weekdayIndex(name: string | null | undefined): number | null {
  const index = WEEKDAYS.findIndex(day => day.toLowerCase() === (name || '').trim().toLowerCase());
  return index >= 0 ? index : null;
}

function isExtraTime(view: ScheduleView): boolean {
  const decision = (view.decidedBy || '').toUpperCase();
  return decision === 'EXTRA_TIME' || /a\.?e\.?t/i.test(view.score || '');
}

/**
 * Small note under the score, always from the viewed club's side: "agg 3-2",
 * "4-3 pens", "1st leg". Extra time is shown as the FM "e" prefix instead.
 */
export function resultNote(view: ScheduleView, venue: Venue): string | null {
  const parts: string[] = [];
  const mine = (team1: number | null | undefined, team2: number | null | undefined): [number, number] | null =>
    finite(team1) && finite(team2) ? (venue === 'H' ? [team1, team2] : [team2, team1]) : null;

  const aggregate = mine(view.aggregateTeam1Score, view.aggregateTeam2Score);
  const penalties = mine(view.penaltyTeam1Score, view.penaltyTeam2Score);
  if (aggregate) parts.push(`agg ${aggregate[0]}-${aggregate[1]}`);
  if (penalties) parts.push(`${penalties[0]}-${penalties[1]} pens`);
  if (parts.length) return parts.join(', ');

  const decision = (view.decidedBy || '').toUpperCase();
  const suffix = (view.score || '').match(/\(([^)]+)\)/);
  if (suffix) {
    const text = suffix[1].replace(/,?\s*a\.?e\.?t\.?/i, '').trim();
    return text || null;
  }
  if (decision === 'PENALTIES') return 'pens';
  if (decision === 'FIRST_LEG' || view.legNumber === 1) return '1st leg';
  if (finite(view.legNumber) && view.legNumber > 1) return `${ordinal(view.legNumber)} leg`;
  return null;
}

function normaliseOutcome(value: string | null | undefined): Outcome | null {
  const upper = (value || '').toUpperCase();
  return upper === 'W' || upper === 'D' || upper === 'L' ? upper : null;
}

function stageLabel(view: ScheduleView, kind: CompetitionKind): string {
  if (view.roundLabel) return view.roundLabel;
  if (kind === 'friendly') {
    const stage = view.competitionName?.split('·')[1]?.trim();
    const words = stage?.replace(/_/g, ' ').toLowerCase();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Friendly';
  }
  return kind === 'league' ? `Matchday ${view.roundNumber}` : `Round ${view.roundNumber}`;
}

function competitionLabel(name: string, stage: string, kind: CompetitionKind): string {
  if (kind === 'league') return name;
  if (kind === 'friendly') return 'Friendly';
  return stage ? `${name} ${stage}` : name;
}

function shortCompetition(name: string, kind: CompetitionKind): string {
  if (kind === 'friendly') return 'FRI';
  const words = (name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map(word => word[0]).join('').toUpperCase();
  return (name || '???').slice(0, 3).toUpperCase();
}

function parseDate(date: string | null | undefined): { monthIndex: number; day: number } | null {
  const match = (date || '').trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
  if (!match) return null;
  const monthIndex = MONTHS.findIndex(month => month.toLowerCase() === match[2].toLowerCase());
  return monthIndex >= 0 ? { monthIndex, day: Number(match[1]) } : null;
}

export function buildRow(
  view: ScheduleView, teamId: number, calendar?: CalendarEntry | null, index = 0, anchor?: WeekdayAnchor | null
): ScheduleRow {
  const venue: Venue = (view.homeOrAway || calendar?.homeOrAway) === 'A' ? 'A' : 'H';
  const opponentFromTeams = venue === 'H' ? view.teamId2 : view.teamId1;
  const opponentId = [view.opponentTeamId, calendar?.opponentTeamId, opponentFromTeams]
    .find(id => finite(id) && id > 0) ?? null;

  const kind = competitionKind(view.competitionType || calendar?.competitionType, view.competitionId, view.competitionName);
  const parsed = parseScore(view.score);
  const explicitGoals = finite(view.teamGoals) && finite(view.opponentGoals);
  const teamGoals = explicitGoals ? view.teamGoals as number : parsed?.[0] ?? null;
  const opponentGoals = explicitGoals ? view.opponentGoals as number : parsed?.[1] ?? null;

  const status = (view.status || calendar?.status || '').toLowerCase();
  const played = status ? status === 'played' : teamGoals !== null;

  let outcome = normaliseOutcome(view.resultOutcome) ?? normaliseOutcome(calendar?.resultOutcome);
  if (!outcome && played && finite(view.winnerTeamId) && view.winnerTeamId > 0) {
    outcome = view.winnerTeamId === teamId ? 'W' : 'L';
  }
  if (!outcome && played && teamGoals !== null && opponentGoals !== null) {
    outcome = teamGoals > opponentGoals ? 'W' : teamGoals < opponentGoals ? 'L' : 'D';
  }

  const unknown = new Set(view.unknownFields || []);
  const dateKnown = !unknown.has('date') && !unknown.has('day');
  const date = dateKnown ? parseDate(view.date || calendar?.dateDisplay) : null;
  const day = dateKnown && finite(view.day) && view.day > 0 ? view.day : null;

  let weekday = unknown.has('dayOfWeek') ? null : weekdayIndex(view.dayOfWeek);
  if (weekday === null && day !== null && anchor && anchor.season === view.seasonNumber) {
    const anchorWeekday = weekdayIndex(anchor.dayOfWeek);
    if (anchorWeekday !== null) weekday = mod7(anchorWeekday + day - anchor.day);
  }

  const stage = stageLabel(view, kind);
  const monthName = date ? MONTHS[date.monthIndex] : null;
  const reportable = played && view.reportAvailable !== false && view.teamId1 > 0 && view.teamId2 > 0;

  return {
    key: fixtureKey(view),
    source: view,
    order: index,
    day,
    dateKnown: !!date,
    weekday: date ? weekday : null,
    dateLabel: date
      ? `${weekday !== null ? WEEKDAYS[weekday].slice(0, 3) + ' ' : ''}${date.day} ${monthName!.slice(0, 3)}`
      : '—',
    longDateLabel: date
      ? `${weekday !== null ? WEEKDAYS[weekday] + ' ' : ''}${date.day} ${monthName}`
      : 'Date not recorded',
    monthLabel: monthName ?? UNDATED_MONTH,
    monthIndex: date ? date.monthIndex : null,
    dayOfMonth: date ? date.day : null,
    kickoffTime: view.kickoffTime || null,
    competitionId: view.competitionId,
    competitionName: view.competitionName || calendar?.competitionName || 'Competition',
    competitionLabel: competitionLabel(view.competitionName || calendar?.competitionName || 'Competition', stage, kind),
    competitionShort: shortCompetition(view.competitionName, kind),
    competitionKind: kind,
    competitionLink: view.competitionId > 0 ? view.competitionId : null,
    stageLabel: stage,
    venue,
    opponentId,
    opponentName: view.opponentTeam || calendar?.opponentTeamName || 'TBD',
    opponentPosition: finite(view.opponentLeaguePosition) && view.opponentLeaguePosition > 0 ? view.opponentLeaguePosition : null,
    played,
    outcome: played ? outcome : null,
    teamGoals: played ? teamGoals : null,
    opponentGoals: played ? opponentGoals : null,
    extraTime: played && isExtraTime(view),
    homeTeamId: view.teamId1,
    awayTeamId: view.teamId2,
    homeGoals: played ? (venue === 'H' ? teamGoals : opponentGoals) : null,
    awayGoals: played ? (venue === 'H' ? opponentGoals : teamGoals) : null,
    resultNote: played ? resultNote(view, venue) : null,
    reportLink: reportable
      ? ['/match-report2', view.competitionId, view.seasonNumber, view.roundNumber, view.teamId1, view.teamId2]
      : null,
    venueName: !unknown.has('venueName') && view.venueName ? view.venueName : null
  };
}

/**
 * Merges the schedule with the calendar feed (type/status/outcome). The backend order is kept:
 * it is chronological even for old seasons whose matches have no calendar day (day = 0).
 */
export function buildRows(
  schedule: ScheduleView[], teamId: number, calendar: CalendarEntry[] = [], anchor?: WeekdayAnchor | null
): ScheduleRow[] {
  const byKey = new Map(calendar.map(entry => [fixtureKey(entry), entry]));
  return (schedule || []).map((view, index) => buildRow(view, teamId, byKey.get(fixtureKey(view)), index, anchor));
}

export function competitionKey(row: ScheduleRow): string {
  return row.competitionKind === 'friendly' ? 'friendly' : `c${row.competitionId}`;
}

export function competitionOptions(rows: ScheduleRow[]): CompetitionOption[] {
  const order: CompetitionKind[] = ['league', 'cup', 'continental', 'friendly'];
  const options = new Map<string, CompetitionOption>();
  rows.forEach(row => {
    const key = competitionKey(row);
    const existing = options.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    options.set(key, {
      key,
      label: row.competitionKind === 'friendly' ? 'No competition (friendlies)' : row.competitionName,
      kind: row.competitionKind,
      count: 1
    });
  });
  return Array.from(options.values())
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label));
}

export function filterRows(rows: ScheduleRow[], filters: ScheduleFilters): ScheduleRow[] {
  const query = filters.search.trim().toLowerCase();
  const competitions = new Set(filters.competitions);
  const venues = new Set(filters.venues);
  return rows.filter(row => {
    if (filters.show === 'fixtures' && row.played) return false;
    if (filters.show === 'results' && !row.played) return false;
    if (competitions.size && !competitions.has(competitionKey(row))) return false;
    if (venues.size && !venues.has(row.venue)) return false;
    if (filters.result !== 'all' && row.outcome !== filters.result) return false;
    if (query && !`${row.opponentName} ${row.competitionName} ${row.stageLabel} ${row.dateLabel}`
      .toLowerCase().includes(query)) return false;
    return true;
  });
}

/** True when the FM-style Filter panel (competitions / venue / result) narrows the list. */
export function hasPanelFilters(filters: ScheduleFilters): boolean {
  return filters.competitions.length > 0 || filters.venues.length > 0 || filters.result !== 'all';
}

export function hasActiveFilters(filters: ScheduleFilters): boolean {
  return filters.show !== 'all' || hasPanelFilters(filters) || !!filters.search.trim();
}

/**
 * Groups rows by month in season order. With `fillEmpty`, months without matches
 * between the first and last dated month are shown too, as FM does.
 */
export function groupByMonth(rows: ScheduleRow[], fillEmpty = false): MonthGroup[] {
  const groups: MonthGroup[] = [];
  rows.forEach(row => {
    const last = groups[groups.length - 1];
    if (last && last.label === row.monthLabel) {
      last.rows.push(row);
      return;
    }
    if (fillEmpty && last && row.monthIndex !== null) {
      const lastIndex = MONTHS.indexOf(last.label);
      if (lastIndex >= 0) {
        for (let m = (lastIndex + 1) % 12; m !== row.monthIndex && m !== lastIndex; m = (m + 1) % 12) {
          groups.push({ label: MONTHS[m], rows: [] });
        }
      }
    }
    groups.push({ label: row.monthLabel, rows: [row] });
  });
  return groups;
}

function compareResult(row: ScheduleRow): number {
  if (!row.played) return -1000;
  const weight = row.outcome === 'W' ? 2000 : row.outcome === 'D' ? 1000 : 0;
  return weight + (row.teamGoals ?? 0) - (row.opponentGoals ?? 0);
}

/** Column sorting. Date keeps the backend order; any other key produces a flat list. */
export function sortRows(rows: ScheduleRow[], key: SortKey, descending = false): ScheduleRow[] {
  const sorted = [...rows];
  const value = (row: ScheduleRow): string | number => {
    switch (key) {
      case 'opposition': return row.opponentName.toLowerCase();
      case 'venue': return row.venue;
      case 'result': return compareResult(row);
      case 'competition': return row.competitionLabel.toLowerCase();
      default: return row.order;
    }
  };
  sorted.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : a.order - b.order;
    return descending ? -cmp : cmp;
  });
  return sorted;
}

/**
 * One FM-style month: Monday–Sunday weeks. The weekday of the 1st comes from any
 * match in that month with a known weekday, or is carried over from a known month.
 */
export function buildCalendarMonth(month: MonthGroup, firstWeekday: number | null): CalendarMonthGrid {
  const monthIndex = MONTHS.indexOf(month.label);
  if (monthIndex < 0) return { label: month.label, aligned: false, weeks: [] };
  const length = MONTH_LENGTHS[monthIndex];
  const byDay = new Map<number, ScheduleRow[]>();
  month.rows.forEach(row => {
    if (row.dayOfMonth) byDay.set(row.dayOfMonth, [...(byDay.get(row.dayOfMonth) || []), row]);
  });
  const lead = firstWeekday ?? 0;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ day: null, rows: [] });
  for (let d = 1; d <= length; d++) cells.push({ day: d, rows: byDay.get(d) || [] });
  while (cells.length % 7) cells.push({ day: null, rows: [] });
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { label: month.label, aligned: firstWeekday !== null, weeks };
}

/** Weekday (0 = Monday) of the 1st of every month in `months`, propagated across known months. */
export function firstWeekdays(months: MonthGroup[]): (number | null)[] {
  const result: (number | null)[] = months.map(month => {
    const row = month.rows.find(r => r.weekday !== null && r.dayOfMonth);
    return row ? mod7((row.weekday as number) - ((row.dayOfMonth as number) - 1)) : null;
  });
  const lengthOf = (label: string) => MONTH_LENGTHS[MONTHS.indexOf(label)] ?? 0;
  for (let i = 1; i < months.length; i++) {
    if (result[i] === null && result[i - 1] !== null && lengthOf(months[i - 1].label)) {
      result[i] = mod7((result[i - 1] as number) + lengthOf(months[i - 1].label));
    }
  }
  for (let i = months.length - 2; i >= 0; i--) {
    if (result[i] === null && result[i + 1] !== null && lengthOf(months[i].label)) {
      result[i] = mod7((result[i + 1] as number) - lengthOf(months[i].label));
    }
  }
  return result;
}

export function summarise(rows: ScheduleRow[]): ScheduleSummary {
  const played = rows.filter(row => row.played);
  const count = (outcome: Outcome) => played.filter(row => row.outcome === outcome).length;
  return {
    played: played.length,
    upcoming: rows.length - played.length,
    wins: count('W'),
    draws: count('D'),
    losses: count('L'),
    goalsFor: played.reduce((sum, row) => sum + (row.teamGoals ?? 0), 0),
    goalsAgainst: played.reduce((sum, row) => sum + (row.opponentGoals ?? 0), 0),
    form: played.slice(-5).map(row => row.outcome).filter((o): o is Outcome => !!o)
  };
}

/**
 * Competitive form going into a fixture: the last results played before its calendar day.
 * Works on any club's rows because calendar days are shared; without a day it uses every result.
 */
export function formBefore(rows: ScheduleRow[], day: number | null, limit = 5): Outcome[] {
  return rows
    .filter(row => row.played && row.outcome && row.competitionKind !== 'friendly')
    .filter(row => day === null || (row.day !== null && row.day < day))
    .slice(-limit)
    .map(row => row.outcome as Outcome);
}

/** FM header moment: "today", "in 6 days", "80 days ago"; null when either day is unknown. */
export function relativeDay(matchDay: number | null, currentDay: number | null): string | null {
  if (matchDay === null || currentDay === null || currentDay <= 0) return null;
  const diff = matchDay - currentDay;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `${diff} days` : `${-diff} days ago`;
}

/** Next unplayed match, or the most recent result when the season is complete. */
export function defaultSelection(rows: ScheduleRow[]): ScheduleRow | null {
  return rows.find(row => !row.played) ?? rows[rows.length - 1] ?? null;
}
