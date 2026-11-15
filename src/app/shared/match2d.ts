/**
 * Matches played by the 2D ratings engine (a separate local service). The
 * backend asks the engine for the page that replays a match and answers with
 * its address; that page is shown in an iframe over the screen.
 */
export interface Match2dPreview {
  id: string;
  viewUrl: string;
  home: string;
  away: string;
  score: number[];
  seed: number;
  minutes: number;
  simulatedInMs?: number;
  cached?: boolean;
}

/** Replay of a fixture that was played with the 2D engine. */
export interface Match2dReplay {
  viewUrl: string;
  score?: number[];
  engineVersion?: unknown;
  /** The engine changed since the match was played: the replay may differ slightly. */
  versionMismatch?: boolean;
}

export function match2dPreviewUrl(base: string, teamId1: number, teamId2: number,
                                  seed: number, minutes: number): string {
  return `${base}/match/2d/preview?teamId1=${teamId1}&teamId2=${teamId2}&seed=${seed}&minutes=${minutes}`;
}

export function match2dReplayUrl(base: string, competitionId: number, season: number, round: number,
                                 teamId1: number, teamId2: number): string {
  return `${base}/match/2d/replay/${competitionId}/${season}/${round}/${teamId1}/${teamId2}`;
}

/** Only an http(s) page may be framed; `javascript:`, `data:` and the like are refused. */
export function isFrameableUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The backend explains what went wrong in `error`; fall back to something readable. */
export function match2dErrorMessage(err: any): string {
  const fromServer = err?.error?.error ?? err?.error?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;
  if (err?.status === 0) return 'The game server did not answer.';
  return 'The 2D match could not be played.';
}

/** Error text for a replay: 404 means the fixture was not played with the 2D engine. */
export function match2dReplayErrorMessage(err: any): string {
  const status = Number(err?.status ?? 0);
  if (status === 404) return 'This match was not played with the 2D engine, so there is no 2D replay.';
  if (status === 502 || status === 503) return 'The 2D engine is not answering right now. Try again later.';
  return match2dErrorMessage(err);
}
