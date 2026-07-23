import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { urlApp } from '../app.component';
import { AuthService } from './auth.service';

export interface FastForwardStatus {
  jobId: string | null;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  seasonsRequested: number;
  startSeason: number;
  targetSeason: number;
  currentSeason: number;
  currentDay: number;
  currentPhase: string;
  completedSeasons: number;
  processedDays: number;
  percent: number;
  elapsedMs: number;
  message: string;
  cancellable: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TeamService {

  // The user's team ID - loaded from backend setup
  private teamIdSubject = new BehaviorSubject<number>(0);
  teamId$ = this.teamIdSubject.asObservable();

  private currentSeasonSubject = new BehaviorSubject<number>(1);
  currentSeason$ = this.currentSeasonSubject.asObservable();

  private managerFiredSubject = new BehaviorSubject<boolean>(false);
  managerFired$ = this.managerFiredSubject.asObservable();

  private setupCompleteSubject = new BehaviorSubject<boolean>(false);
  setupComplete$ = this.setupCompleteSubject.asObservable();
  setupChecked = false; // true once the initial check has completed

  // Calendar / game advance state
  private currentDaySubject = new BehaviorSubject<number>(1);
  private currentPhaseSubject = new BehaviorSubject<string>('MORNING');
  private dateDisplaySubject = new BehaviorSubject<string>('1 August');
  private dayOfWeekSubject = new BehaviorSubject<string>('Monday');
  private seasonPhaseSubject = new BehaviorSubject<string>('PRE_SEASON');
  private gamePausedSubject = new BehaviorSubject<boolean>(false);
  private transferWindowOpenSubject = new BehaviorSubject<boolean>(false);
  private lastEventsSubject = new BehaviorSubject<any[]>([]);
  private refreshSubject = new Subject<void>();

  /** Emits after every game advance or press conference response to trigger component refreshes */
  refresh$ = this.refreshSubject.asObservable();

  // Auto-continue settings
  autoContinue = false;
  autoContinueMatchReport = false;
  alwaysContinue = false;

  get autoContinueEnabled(): boolean {
    return this.alwaysContinue || this.autoContinue;
  }

  get autoDismissMatchReport(): boolean {
    return this.alwaysContinue || (this.autoContinue && this.autoContinueMatchReport);
  }

  currentDay$ = this.currentDaySubject.asObservable();
  currentPhase$ = this.currentPhaseSubject.asObservable();
  dateDisplay$ = this.dateDisplaySubject.asObservable();
  lastEvents$ = this.lastEventsSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {
  }

  get teamId(): number {
    return this.teamIdSubject.value;
  }

  set teamId(id: number) {
    this.teamIdSubject.next(id);
  }

  get setupComplete(): boolean {
    return this.setupCompleteSubject.value;
  }

  checkSetup(): void {
    this.http.get<any>(urlApp + '/api/career/status').subscribe({
      next: (result) => {
        this.setupChecked = true;
        if (result.careerRole === 'CHAIRMAN') {
          this.teamIdSubject.next(0);
          this.setupCompleteSubject.next(true);
          return;
        }
        if (result.setupComplete && result.freeAgent) {
          // Fresh free agent: setup done, no team yet. Reuse the fired-manager
          // UI so the job-search menu is shown until they accept an offer.
          this.teamIdSubject.next(0);
          this.setupCompleteSubject.next(true);
          this.managerFiredSubject.next(true);
          this.loadCurrentSeason();
          this.loadGameState();
        } else if (result.setupComplete) {
          this.teamIdSubject.next(result.humanTeamId);
          this.setupCompleteSubject.next(true);
          // Now load game data
          this.loadManagerResponsibilities(result.humanTeamId);
          this.loadCurrentSeason();
          this.checkManagerFired();
          this.loadGameState();
        } else if (result.managerFired) {
          // User exists but was fired - show main game with job search
          this.setupCompleteSubject.next(true);
          this.managerFiredSubject.next(true);
          this.loadCurrentSeason();
          this.loadGameState();
        } else {
          this.setupCompleteSubject.next(false);
        }
      },
      error: () => {
        this.setupChecked = true;
        this.setupCompleteSubject.next(false);
      }
    });
  }

  onSetupComplete(teamId: number, freeAgent: boolean = false): void {
    this.teamIdSubject.next(teamId);
    this.setupCompleteSubject.next(true);
    this.loadCurrentSeason();
    if (freeAgent) {
      // Skip checkManagerFired — we already know they're "fired" (free agent)
      // and the backend has just confirmed it. Setting it directly avoids a
      // race where the FE momentarily renders the team-side UI.
      this.managerFiredSubject.next(true);
    } else {
      this.loadManagerResponsibilities(teamId);
      this.checkManagerFired();
    }
    this.loadGameState();
  }

  get currentSeason(): number {
    return this.currentSeasonSubject.value;
  }

  get managerFired(): boolean {
    return this.managerFiredSubject.value;
  }

  get currentDay(): number {
    return this.currentDaySubject.value;
  }

  get currentPhase(): string {
    return this.currentPhaseSubject.value;
  }

  get dateDisplay(): string {
    return this.dateDisplaySubject.value;
  }

  get dayOfWeek(): string {
    return this.dayOfWeekSubject.value;
  }

  get seasonPhase(): string {
    return this.seasonPhaseSubject.value;
  }

  get gamePaused(): boolean {
    return this.gamePausedSubject.value;
  }

  get transferWindowOpen(): boolean {
    return this.transferWindowOpenSubject.value;
  }

  transferWindowOpen$ = this.transferWindowOpenSubject.asObservable();

  get lastEvents(): any[] {
    return this.lastEventsSubject.value;
  }

  // Load initial game state
  loadGameState(): void {
    this.http.get<any>(urlApp + '/game/state').subscribe({
      next: (state) => this.updateFromState(state),
      error: (err) => console.error('Error loading game state:', err)
    });
  }

  // Advance game - called when CONTINUE is clicked
  advanceGame(): Observable<any> {
    return this.http.post<any>(urlApp + '/game/advance', {});
  }

  startFastForward(seasons: number, chunkDays: number): Observable<FastForwardStatus> {
    return this.http.post<FastForwardStatus>(urlApp + '/game/fast-forward', { seasons, chunkDays });
  }

  getFastForwardStatus(): Observable<FastForwardStatus> {
    return this.http.get<FastForwardStatus>(urlApp + '/game/fast-forward');
  }

  cancelFastForward(jobId: string): Observable<FastForwardStatus> {
    return this.http.delete<FastForwardStatus>(urlApp + `/game/fast-forward/${jobId}`);
  }

  // Update state from response
  updateFromState(state: any): void {
    if (state.day) this.currentDaySubject.next(state.day);
    if (state.phase) this.currentPhaseSubject.next(state.phase);
    if (state.dateDisplay) this.dateDisplaySubject.next(state.dateDisplay);
    if (state.dayOfWeek) this.dayOfWeekSubject.next(state.dayOfWeek);
    if (state.seasonPhase) this.seasonPhaseSubject.next(state.seasonPhase);
    if (state.season) this.currentSeasonSubject.next(state.season);
    if (state.paused !== undefined) this.gamePausedSubject.next(state.paused);
    if (state.transferWindowOpen !== undefined) this.transferWindowOpenSubject.next(state.transferWindowOpen);
    if (state.managerFired !== undefined) this.managerFiredSubject.next(state.managerFired);
    if (state.alwaysContinue !== undefined) this.setAlwaysContinue(state.alwaysContinue === true);
    if (state.eventsProcessed) this.lastEventsSubject.next(state.eventsProcessed);
    this.refreshSubject.next();
  }

  /**
   * Manually fan out a refresh to every component subscribed to {@link refresh$}.
   * Used by flows that mutate backend state OUTSIDE of advanceGame /
   * press-conference responses — e.g. after a live match commits its result
   * (standings, scorers, form) the dashboard must re-fetch even though the
   * day hasn't advanced yet.
   */
  notifyRefresh(): void {
    this.refreshSubject.next();
  }

  loadCurrentSeason(): void {
    this.http.get<string>(urlApp + '/competition/getCurrentSeason', { responseType: 'text' as 'json' })
      .subscribe({
        next: (season) => this.currentSeasonSubject.next(Number(season)),
        error: (err) => console.error('Error loading current season:', err)
      });
  }

  checkManagerFired(): void {
    this.http.get<boolean>(urlApp + '/competition/isManagerFired')
      .subscribe({
        next: (fired) => this.managerFiredSubject.next(fired === true),
        error: () => this.managerFiredSubject.next(false)
      });
  }

  setManagerFired(fired: boolean): void {
    this.managerFiredSubject.next(fired);
  }

  setAlwaysContinue(enabled: boolean): void {
    const wasEnabled = this.alwaysContinue;
    this.alwaysContinue = enabled;
    if (enabled) {
      // The persistent mode includes both transient automation preferences.
      this.autoContinue = true;
      this.autoContinueMatchReport = true;
    } else if (wasEnabled) {
      // Do not leave automation running under a stale client-only flag when the
      // backend reports that persistent unattended mode is no longer effective.
      this.autoContinue = false;
      this.autoContinueMatchReport = false;
    }
  }

  private loadManagerResponsibilities(teamId: number): void {
    if (!teamId) return;
    this.http.get<any>(urlApp + `/managers/responsibilities/${teamId}`).subscribe({
      next: (data) => this.setAlwaysContinue(data.alwaysContinue === true),
      error: (err) => console.error('Error loading manager responsibilities:', err)
    });
  }

  getTeamCompetitions(teamId: number): Observable<any[]> {
    return this.http.get<any[]>(urlApp + `/competition/getTeamCompetitions/${teamId}`);
  }

  respondToPressConference(id: number, responseType: string): Observable<any> {
    return this.http.post<any>(urlApp + `/game/pressConference/${id}/respond`, { responseType });
  }
}
