import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';
import { ARENA_SAME_ORIGIN } from './arena-env';

/** Shapes from fm-match2d/docs/TACTIC_ARENA_API.md. */

export interface ArenaFormationSlot {
  positionIndex: number;
  playerId: number;
  role?: string | null;
  duty?: string | null;
  instructions?: string[] | null;
  specialRole?: 'SHOOTER' | null;
  shadow?: boolean;
}

/** The tactic exactly as the tactics page saves it (PersonalizedTacticView). */
export interface ArenaTactic {
  teamId?: number;
  tactic: string;
  mentality: string;
  inPossession: string;
  passingType: string;
  tempo: string;
  timeWasting: string;
  defensiveLine: string;
  pressing: string;
  width: string;
  dribbling: string;
  foulFrequency: string;
  foulHardness: string;
  tempoFragmentation: string;
  widePlay: string;
  transition: string;
  recovery?: string;
  penaltyTakerId?: number | null;
  freeKickTakerId?: number | null;
  cornerTakerLeftId?: number | null;
  cornerTakerRightId?: number | null;
  formationDataList: ArenaFormationSlot[];
}

export interface ArenaSplit {
  pld: number; pts: number; ptsMax: number;
  w: number; d: number; l: number;
  gf: number; ga: number; gd: number;
  xgf: number | null; xga: number | null; xgd: number | null;
}

export interface ArenaResults {
  basedOn: number;
  overall: ArenaSplit;
  home: ArenaSplit;
  away: ArenaSplit;
}

export interface ArenaGitPushStatus {
  enabled: boolean;
  lastAttemptAt: string | null;
  ok: boolean | null;
  message: string | null;
}

export type ArenaStatus = 'QUEUED' | 'PREPARING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';

/** The base world every run starts from (season 1, day 1). */
export interface ArenaBaseline {
  status: 'READY' | 'BUILDING' | 'MISSING' | 'FAILED';
  progress: number;
  uid: string | null;
  createdAt: string | null;
  appVersion: string | null;
  season: number | null;
  startDay: number | null;
  endDay: number | null;
  clubs: number | null;
  buildStartedAt: string | null;
  builtByOtherInstance: boolean;
  message: string | null;
}

export interface ArenaTestSummary {
  id: number;
  uid: string;
  name: string;
  formation: string;
  owner: string;
  teamId: number | null;
  teamName: string | null;
  /** Media prediction: predicted league place / clubs in the league (null when unknown). */
  predictedPosition?: number | null;
  leagueSize?: number | null;
  leagueId: number | null;
  leagueName: string | null;
  season: number;
  startDay: number;
  endDay: number;
  engine: string;
  createdAt: string;
  finishedAt: string | null;
  status: ArenaStatus;
  progress: number;
  results: ArenaResults | null;
  chosen: ArenaResults | null;
}

export interface ArenaLeaderboard {
  testsCount: number;
  matchesPlayed: number;
  gitPush: ArenaGitPushStatus | null;
  baseline?: ArenaBaseline | null;
  /** The fixed reference clubs every test is also run on ("general" part). */
  referenceTeams?: ArenaReferenceTeam[] | null;
  tests: ArenaTestSummary[];
}

export interface ArenaReferenceTeam {
  teamId: number;
  name?: string | null;
  teamName?: string | null;
  reputation?: number | null;
  predictedPosition?: number | null;
  leagueSize?: number | null;
}

export type ArenaImageKind = 'tactic' | 'schedule' | 'competitions';
export type ArenaRunKind = 'CHOSEN' | 'REFERENCE_TOP' | 'REFERENCE_MEDIAN' | 'REFERENCE_BOTTOM' | string;

export interface ArenaMatch {
  day: number;
  date: string;
  dayOfWeek?: string;
  competitionId: number;
  competitionName: string;
  competitionType: string;
  roundNumber: number;
  roundLabel?: string;
  homeOrAway: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  opponentTeam: string;
  opponentTeamId: number;
  score: string;
  teamGoals?: number | null;
  opponentGoals?: number | null;
  resultOutcome?: string | null;
  decidedBy?: string | null;
  winnerTeamId?: number | null;
  penaltyTeam1Score?: number | null;
  penaltyTeam2Score?: number | null;
  aggregateTeam1Score?: number | null;
  aggregateTeam2Score?: number | null;
  legNumber?: number;
  teamId1: number;
  teamId2: number;
  xgFor: number | null;
  xgAgainst: number | null;
  inRun: boolean;
}

export interface ArenaCompetition {
  competitionId?: number;
  name: string;
  typeId?: number;
  kind?: string;
  tier?: number;
  stageReached?: string;
  currentStage?: string;
  entryStage?: string;
  status?: string;
  statusLabel?: string;
  games?: number;
  wins?: number;
  draws?: number;
  loses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  totalTeams?: number;
  position: number | null;
  points: number | null;
  trophy: boolean;
  [key: string]: unknown;
}

export interface ArenaTableRow {
  teamId?: number;
  name?: string;
  teamName?: string;
  position?: number;
  games?: number;
  wins?: number;
  draws?: number;
  loses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  points?: number;
  [key: string]: unknown;
}

export interface ArenaRunResult {
  teamId: number;
  teamName: string;
  color1?: string | null;
  color2?: string | null;
  leagueId: number;
  leagueName: string;
  season: number;
  startDay: number;
  endDay: number;
  engine: string;
  tactic: ArenaTactic;
  squad: any[];
  matches: ArenaMatch[];
  competitions: ArenaCompetition[];
  leagueTable: ArenaTableRow[];
}

export interface ArenaRun {
  id: number;
  index: number;
  kind: ArenaRunKind;
  teamId: number;
  teamName: string;
  teamReputation: number;
  /** Role label from the backend (e.g. "Reference"); falls back to the kind. */
  label?: string | null;
  /** Media prediction: predicted league place / clubs in the league (null when unknown). */
  predictedPosition?: number | null;
  leagueSize?: number | null;
  status: ArenaStatus;
  progress: number;
  currentDay: number;
  simulatedDays: number;
  totalDays: number;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  images: ArenaImageKind[];
  stats: ArenaResults | null;
  result: ArenaRunResult | null;
}

export interface ArenaTestDetail extends ArenaTestSummary {
  message: string | null;
  tactic: ArenaTactic;
  leagueMatchesTotal: number;
  leagueMatchesRemaining: number;
  gitPush: ArenaGitPushStatus | null;
  runs: ArenaRun[];
}

export interface ArenaClub {
  teamId: number;
  name: string;
  reputation: number;
  /** Media prediction: predicted league place / clubs in the league (null when unknown). */
  predictedPosition?: number | null;
  leagueSize?: number | null;
  color1?: string;
  color2?: string;
}

export interface ArenaLeague {
  competitionId: number;
  name: string;
  nationId: number;
  nationName: string;
  tier: number;
  teams: ArenaClub[];
}

export interface ArenaSetup {
  team: {
    teamId: number;
    name: string;
    competitionId: number;
    competitionName: string;
    reputation: number;
    predictedPosition?: number | null;
    leagueSize?: number | null;
    color1?: string;
    color2?: string;
  };
  players: any[];
  formationCatalog: { tacticName: string; totalRating: number }[];
  savedTactic: ArenaTactic | null;
  teamView: any;
}

export const RUN_KIND_LABELS: Record<string, string> = {
  CHOSEN: 'Chosen club',
  REFERENCE_TOP: 'Reference · highest reputation',
  REFERENCE_MEDIAN: 'Reference · median reputation',
  REFERENCE_BOTTOM: 'Reference · lowest reputation'
};

/** The run's role: the backend `label` when present, else the label of its kind. */
export function runRoleLabel(run: { kind: string; label?: string | null }): string {
  if (run.label) return run.label;
  return RUN_KIND_LABELS[run.kind] || (run.kind?.startsWith('REFERENCE') ? 'Reference' : run.kind);
}

/** "Inazuma Japan, Zeus and Desert Lion" from the leaderboard's reference clubs, or null. */
export function referenceNames(teams: ArenaReferenceTeam[] | null | undefined): string | null {
  const names = (teams || []).map(team => team.name || team.teamName).filter((name): name is string => !!name);
  if (!names.length) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const IMAGE_KIND_LABELS: Record<ArenaImageKind, string> = {
  tactic: 'Tactic',
  schedule: 'Schedule',
  competitions: 'Competition overview'
};

/** Root of the Arena routes: the game backend, or the page's own origin in the simulator build. */
export const ARENA_API: string = (ARENA_SAME_ORIGIN ? window.location.origin : urlApp) + '/tactic-arena';

@Injectable({ providedIn: 'root' })
export class TacticArenaService {
  private readonly base = ARENA_API;

  constructor(private http: HttpClient) {}

  baseline(): Observable<ArenaBaseline> {
    return this.http.get<ArenaBaseline>(`${this.base}/baseline`);
  }

  rebuildBaseline(): Observable<ArenaBaseline> {
    return this.http.post<ArenaBaseline>(`${this.base}/baseline/rebuild`, {});
  }

  /** 409 with `{error, baseline}` while the base world is not READY. */
  clubs(): Observable<{ leagues: ArenaLeague[] }> {
    return this.http.get<{ leagues: ArenaLeague[] }>(`${this.base}/clubs`);
  }

  setup(teamId: number): Observable<ArenaSetup> {
    return this.http.get<ArenaSetup>(`${this.base}/clubs/${teamId}/setup`);
  }

  /** `owner` is sent only for anonymous users (signed-in users are the owner on the server). */
  start(name: string, teamId: number, tactic: ArenaTactic, owner?: string): Observable<{ id: number }> {
    const body: Record<string, unknown> = { name, teamId, tactic };
    if (owner) body['owner'] = owner;
    return this.http.post<{ id: number }>(`${this.base}/tests`, body);
  }

  leaderboard(): Observable<ArenaLeaderboard> {
    return this.http.get<ArenaLeaderboard>(`${this.base}/tests`);
  }

  test(id: number): Observable<ArenaTestDetail> {
    return this.http.get<ArenaTestDetail>(`${this.base}/tests/${id}`);
  }

  cancel(id: number): Observable<ArenaTestSummary> {
    return this.http.post<ArenaTestSummary>(`${this.base}/tests/${id}/cancel`, {});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/tests/${id}`);
  }

  image(testId: number, runId: number, kind: ArenaImageKind): Observable<Blob> {
    return this.http.get(`${this.base}/tests/${testId}/runs/${runId}/images/${kind}`, { responseType: 'blob' });
  }

  uploadImage(testId: number, runId: number, kind: ArenaImageKind, image: Blob): Observable<unknown> {
    return this.http.put(`${this.base}/tests/${testId}/runs/${runId}/images/${kind}`, image, {
      headers: { 'Content-Type': image.type || 'image/png' }
    });
  }
}

export function isActive(status: ArenaStatus | undefined | null): boolean {
  return status === 'QUEUED' || status === 'PREPARING' || status === 'RUNNING';
}

export function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value > 0 ? `+${value}` : `${value}`;
}

/** "6 / 12" from a media prediction, "—" when unknown. */
export function predictionLabel(position: number | null | undefined, size: number | null | undefined): string {
  if (position == null) return '—';
  return size ? `${position} / ${size}` : `${position}`;
}

export function formationLabel(key: string | null | undefined): string {
  if (!key) return '—';
  const pretty: Record<string, string> = {
    '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1', '352': '3-5-2',
    '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1', '4321': '4-3-2-1',
    '4222': '4-2-2-2', '3421': '3-4-2-1', '532': '5-3-2', '5212': '5-2-1-2',
    '541': '5-4-1', '3511': '3-5-1-1', '31411': '3-1-4-1-1'
  };
  return pretty[key] || key;
}
