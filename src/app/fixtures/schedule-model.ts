/**
 * Pure view-model for the club Schedule page (/fixtures, /fixtures/:teamId).
 *
 * The backend contract is being extended additively (opponentTeamId, status,
 * resultOutcome, goals, legs, aggregate/penalties, roundLabel, competitionType).
 * Every derived value here prefers those explicit fields and only falls back to
 * the legacy string fields (score, date, decidedBy) when they are absent, so the
 * page works against both the current and the extended contract.
 */

export type Venue = 'H' | 'A';
export type Outcome = 'W' | 'D' | 'L';
export type CompetitionKind = 'league' | 'cup' | 'continental' | 'friendly';
export type ShowFilter = 'all' | 'fixtures' | 'results';

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
  // Additive fields requested from the backend (optional until they ship).
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

export interface ScheduleRow {
  key: string;
  source: ScheduleView;
  /** Position in the backend list (already chronological: day, round, competition, leg). */
  order: number;
  /** Calendar day, comparable across clubs; null when the save has no calendar day. */
  day: number | null;
  dateKnown: boolean;
  dateLabel: string;
  monthLabel: string;
  dayOfMonth: number | null;
  competitionId: number;
  competitionName: string;
  competitionShort: string;
  competitionKind: CompetitionKind;
  competitionLink: number | null;
  stageLabel: string;
  venue: Venue;
  opponentId: number | null;
  opponentName: string;
  played: boolean;
  outcome: Outcome | null;
  teamGoals: number | null;
  opponentGoals: number | null;
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
  competition: string; // 'all' or a competition key from competitionOptions()
  venue: 'all' | Venue;
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

export const DEFAULT_FILTERS: ScheduleFilters = {
  show: 'all', competition: 'all', venue: 'all', result: 'all', search: ''
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

export function fixtureKey(m: { competitionId: number; seasonNumber?: number; roundNumber: number; teamId1: number; teamId2: number }): string {
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
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** "agg 3-2", "4-3 pens", "a.e.t.", "1st leg" — always from the viewed club's side. */
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
  if (suffix) return suffix[1].trim();
  if (decision === 'EXTRA_TIME') return 'a.e.t.';
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

function shortCompetition(name: string, kind: CompetitionKind): string {
  if (kind === 'friendly') return 'FRI';
  const words = (name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map(word => word[0]).join('').toUpperCase();
  return (name || '???').slice(0, 3).toUpperCase();
}

function parseDate(date: string | null | undefined): { month: string; day: number | null } {
  const match = (date || '').trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
  if (match && MONTHS.includes(match[2].toLowerCase())) {
    const month = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
    return { month, day: Number(match[1]) };
  }
  return { month: 'Date not recorded', day: null };
}

export function buildRow(view: ScheduleView, teamId: number, calendar?: CalendarEntry | null, index = 0): ScheduleRow {
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
  const date = dateKnown ? parseDate(view.date || calendar?.dateDisplay) : { month: 'Date not recorded', day: null };
  const reportable = played && view.reportAvailable !== false && view.teamId1 > 0 && view.teamId2 > 0;

  return {
    key: fixtureKey(view),
    source: view,
    order: index,
    day: dateKnown && finite(view.day) && view.day > 0 ? view.day : null,
    dateKnown,
    dateLabel: dateKnown ? (view.date || calendar?.dateDisplay || '—') : '—',
    monthLabel: date.month,
    dayOfMonth: date.day,
    competitionId: view.competitionId,
    competitionName: view.competitionName || calendar?.competitionName || 'Competition',
    competitionShort: shortCompetition(view.competitionName, kind),
    competitionKind: kind,
    competitionLink: view.competitionId > 0 ? view.competitionId : null,
    stageLabel: stageLabel(view, kind),
    venue,
    opponentId,
    opponentName: view.opponentTeam || calendar?.opponentTeamName || 'TBD',
    played,
    outcome: played ? outcome : null,
    teamGoals: played ? teamGoals : null,
    opponentGoals: played ? opponentGoals : null,
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
export function buildRows(schedule: ScheduleView[], teamId: number, calendar: CalendarEntry[] = []): ScheduleRow[] {
  const byKey = new Map(calendar.map(entry => [fixtureKey(entry), entry]));
  return (schedule || []).map((view, index) => buildRow(view, teamId, byKey.get(fixtureKey(view)), index));
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
      label: row.competitionKind === 'friendly' ? 'Friendlies' : row.competitionName,
      kind: row.competitionKind,
      count: 1
    });
  });
  return Array.from(options.values())
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label));
}

export function filterRows(rows: ScheduleRow[], filters: ScheduleFilters): ScheduleRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter(row => {
    if (filters.show === 'fixtures' && row.played) return false;
    if (filters.show === 'results' && !row.played) return false;
    if (filters.competition !== 'all' && competitionKey(row) !== filters.competition) return false;
    if (filters.venue !== 'all' && row.venue !== filters.venue) return false;
    if (filters.result !== 'all' && row.outcome !== filters.result) return false;
    if (query && !`${row.opponentName} ${row.competitionName} ${row.stageLabel} ${row.dateLabel}`
      .toLowerCase().includes(query)) return false;
    return true;
  });
}

export function hasActiveFilters(filters: ScheduleFilters): boolean {
  return filters.show !== 'all' || filters.competition !== 'all' || filters.venue !== 'all'
    || filters.result !== 'all' || !!filters.search.trim();
}

export function groupByMonth(rows: ScheduleRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  rows.forEach(row => {
    const last = groups[groups.length - 1];
    if (last && last.label === row.monthLabel) last.rows.push(row);
    else groups.push({ label: row.monthLabel, rows: [row] });
  });
  return groups;
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

/** Next unplayed match, or the most recent result when the season is complete. */
export function defaultSelection(rows: ScheduleRow[]): ScheduleRow | null {
  return rows.find(row => !row.played) ?? rows[rows.length - 1] ?? null;
}
