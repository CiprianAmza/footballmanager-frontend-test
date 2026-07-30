import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { urlApp } from '../app.component';
import {
  LiveMatchCommitResult,
  LiveMatchData,
  SubstitutionRequest
} from '../models/live-match.model';

const KEY_STORAGE = 'fm_liveMatchKey';
const INTERACTIVE_STORAGE = 'fm_liveMatchInteractive';

/**
 * Owns the live-match session: the key, the interactive flag, the localStorage
 * persistence that lets a browser refresh resume the modal, and every HTTP call
 * against `/match/live/{key}`.
 *
 * The HTTP surface is a straight lift of what `AppComponent` used to call
 * inline; the polling guard (`advanceInFlight`) moved with it so only one
 * `/advance` is ever outstanding.
 */
@Injectable({ providedIn: 'root' })
export class LiveMatchService {

  /** Latest engine state — replaced wholesale by every fetch/advance/substitute. */
  readonly state$ = new BehaviorSubject<LiveMatchData | null>(null);

  /** Session key of the match currently being played back. */
  key: string | null = null;

  /** True when the engine has NOT run yet and the FE drives it via /advance. */
  interactive = false;

  /** An /advance request is outstanding — debounces the playback clock. */
  advanceInFlight = false;

  /** Minute the polling loop is currently asking the engine to reach. */
  advanceTargetMinute = 0;

  constructor(private http: HttpClient) {}

  // ---------- session key + localStorage persistence ----------

  /** Persist the in-flight match key so a browser refresh can resume the modal
   *  instead of orphaning the BE session and leaving the matchday without a
   *  result. Cleared on close / skip-to-end. */
  persist(key: string, interactive: boolean): void {
    this.key = key;
    this.interactive = interactive;
    try {
      localStorage.setItem(KEY_STORAGE, key);
      localStorage.setItem(INTERACTIVE_STORAGE, String(interactive));
    } catch { /* storage disabled — silent fallback */ }
  }

  readPersisted(): { key: string; interactive: boolean } | null {
    let savedKey: string | null = null;
    let savedInteractive = false;
    try {
      savedKey = localStorage.getItem(KEY_STORAGE);
      savedInteractive = localStorage.getItem(INTERACTIVE_STORAGE) === 'true';
    } catch { /* storage disabled */ }
    return savedKey ? { key: savedKey, interactive: savedInteractive } : null;
  }

  clearPersisted(): void {
    try {
      localStorage.removeItem(KEY_STORAGE);
      localStorage.removeItem(INTERACTIVE_STORAGE);
    } catch { /* ignored */ }
  }

  /** Drop every trace of the current session (called from closeLiveMatch). */
  reset(): void {
    this.key = null;
    this.advanceInFlight = false;
    this.advanceTargetMinute = 0;
    this.state$.next(null);
    this.clearPersisted();
  }

  // ---------- HTTP ----------

  /** `GET /match/live/{key}` — cached final LiveMatchData. */
  fetch(key: string): Observable<LiveMatchData> {
    return this.http.get<LiveMatchData>(`${urlApp}/match/live/${key}`)
      .pipe(tap(data => this.state$.next(data ?? null)));
  }

  /** `GET /match/live/{key}/state` — session snapshot for bootstrap / resync. */
  session(key: string): Observable<LiveMatchData> {
    return this.http.get<LiveMatchData>(`${urlApp}/match/live/${key}/state`)
      .pipe(tap(data => this.state$.next(data ?? null)));
  }

  /** `POST /match/live/{key}/advance?untilMinute=N` — returns the full
   *  cumulative LiveMatchData each call. */
  advance(untilMinute: number): Observable<LiveMatchData> {
    return this.http
      .post<LiveMatchData>(`${urlApp}/match/live/${this.key}/advance?untilMinute=${untilMinute}`, {})
      .pipe(tap(data => { if (data) this.state$.next(data); }));
  }

  /** `POST /match/live/{key}/substitute`. */
  substitute(body: SubstitutionRequest): Observable<LiveMatchData> {
    return this.http
      .post<LiveMatchData>(`${urlApp}/match/live/${this.key}/substitute`, body)
      .pipe(tap(data => { if (data) this.state$.next(data); }));
  }

  /** `POST /match/live/{key}/commit`. */
  commit(): Observable<LiveMatchCommitResult> {
    return this.http.post<LiveMatchCommitResult>(`${urlApp}/match/live/${this.key}/commit`, {});
  }
}
