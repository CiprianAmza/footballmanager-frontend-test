import { Component, HostListener, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { FastForwardStatus, TeamService } from './services/team.service';
import { AuthService } from './services/auth.service';
import { CareerService, JobOffer } from './services/career.service';
import { MultiplayerRoomService } from './services/multiplayer-room.service';
import { LiveMatchService } from './services/live-match.service';
import { LiveMatchClosed } from './models/live-match.model';

export const urlApp: string = "http://localhost:8086";
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {
  title = 'footballmanagersimulator-frontend';
  roomActive = false;
  setRoomActive(active: boolean): void { this.roomActive = active; }
  resumeMultiplayerLiveMatch(event: { key: string; interactive: boolean }): void {
    if (!event?.key || this.liveMatchKey === event.key && this.showLiveMatch) return;
    this.liveMatchInteractive = event.interactive;
    this.fetchLiveMatch(event.key);
  }
  advancing = false;
  simulationElapsedSeconds = 0;
  simulationStopMessage = '';
  private simulationUxTimer: any = null;
  private autoAdvanceTimer: any = null;
  private autoAdvanceRetryCount = 0;
  private readonly maxAutoAdvanceRetries = 3;
  showFastForward = false;
  fastForwardSeasons = 1;
  fastForwardChunkDays = 30;
  fastForwardJob: FastForwardStatus | null = null;
  fastForwardStarting = false;
  private fastForwardPollTimer: any = null;
  private fastForwardChecked = false;
  readonly simulationStages = [
    'Preparing the matchday',
    'Simulating matches and key events',
    'Calculating ratings and statistics',
    'Updating tables, fitness and news'
  ];

  // First-career guided tour. Completion is stored per login, and the Help
  // link can reopen it at any time without resetting career progress.
  showTutorial = false;
  tutorialStep = 0;
  private tutorialChecked = false;
  lastEvents: any[] = [];

  // Press conference modal state
  showPressConference = false;
  pressConferenceId: number = 0;
  pressConferenceTitle: string = '';
  pressConferenceResponding = false;
  // When the user chose "view full match", the backend schedules a post-match
  // press conference right after the live match. We hold its id here so the
  // PC modal chains automatically when closeLiveMatch fires.
  pendingPostMatchPressConferenceId: number | null = null;
  pendingPostMatchOutcome: 'WIN' | 'DRAW' | 'LOSS' | null = null;

  // Match result modal state
  showMatchResult = false;
  matchResult: any = null;

  // Live match modal state — AppComponent only tracks whether a live match is
  // being shown and which session it is; <app-live-match> owns everything else.
  showLiveMatch = false;
  pendingMatchEvent: any = null;
  pendingAdvanceResult: any = null;
  liveMatchKey: string | null = null;
  /** Faza 3 Sesiunea 4: when true, the engine has NOT advanced yet — the
   *  viewer polls /advance instead of playing back a baked timeline. The
   *  user's manual substitutions actually change the outcome. */
  liveMatchInteractive = false;


  // Save/Load
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  saving = false;
  loadingGame = false;
  loadGameStage: 'idle' | 'reading' | 'uploading' | 'restoring' | 'verifying' | 'success' | 'error' = 'idle';
  loadGameProgress = 0;
  loadGameMessage = '';
  loadedGameSummary: { season?: number; date?: string; team?: string; manager?: string; historyCount?: number } | null = null;
  private loadGameRedirectTimer: any = null;

  // Job-offer state (drives the banner + accept/decline modal)
  pendingOffers: JobOffer[] = [];
  showOfferModal = false;
  offerActionInFlight = false;

  constructor(public teamService: TeamService, public authService: AuthService,
              private http: HttpClient, public careerService: CareerService,
              private router: Router, private multiplayerRoomService: MultiplayerRoomService,
              private liveMatchService: LiveMatchService) {
    this.teamService.lastEvents$.subscribe(events => this.lastEvents = events);
    // Watch pending job offers — banner + modal auto-react
    this.careerService.pendingOffers$.subscribe(offers => {
      this.pendingOffers = offers;
      if (offers.length === 0) this.showOfferModal = false;
    });
    // Pull offers once on app load (in case some are leftover from a prior session)
    if (this.authService.isLoggedIn) this.careerService.refresh();

    this.authService.sessionRestored$.subscribe(user => {
      if (!this.authService.sessionChecked || !user) return;
      this.teamService.checkSetup();
      if (user.careerRole === 'MANAGER') this.careerService.refresh();
      if (user.careerRole === 'CHAIRMAN' && user.chairmanEnabled
          && (this.router.url === '/' || this.router.url === '/home')) {
        this.router.navigate(['/economy']);
      }
    });

    // Resume a live match modal that the user left mid-flight (browser
    // refresh, accidental close). The BE session lives in an in-memory map
    // and survives a page reload, so as long as the FE remembers the key we
    // can pick up where we were. Only fires once setupComplete flips true
    // (otherwise we'd race the login/setup screens).
    this.teamService.setupComplete$.subscribe(complete => {
      if (!complete) return;
      this.maybeResumeLiveMatch();
      this.maybeStartTutorial();
      this.resumeFastForward();
    });
  }

  /** The administration console and the /dev tools own their own shell and must remain
   * reachable before a manager/chairman career has been created. */
  get isAdminRoute(): boolean {
    return this.router.url === '/admin' || this.router.url.startsWith('/admin/')
        || this.router.url.startsWith('/dev/');
  }

  get fastForwardRunning(): boolean {
    return this.fastForwardJob?.status === 'RUNNING';
  }

  get fastForwardElapsed(): string {
    const totalSeconds = Math.floor((this.fastForwardJob?.elapsedMs || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  openFastForward(): void {
    if (!this.fastForwardRunning) this.fastForwardJob = null;
    this.showFastForward = true;
  }

  closeFastForward(): void {
    if (this.fastForwardRunning) return;
    this.showFastForward = false;
  }

  startFastForward(): void {
    if (this.fastForwardStarting || this.fastForwardRunning) return;
    this.clearAutoAdvanceTimer();
    this.simulationStopMessage = '';
    this.fastForwardStarting = true;
    const seasons = Math.max(1, Math.min(100, Number(this.fastForwardSeasons) || 1));
    const chunkDays = Math.max(1, Math.min(30, Number(this.fastForwardChunkDays) || 30));
    this.fastForwardSeasons = seasons;
    this.fastForwardChunkDays = chunkDays;

    this.teamService.startFastForward(seasons, chunkDays).subscribe({
      next: job => {
        this.fastForwardStarting = false;
        this.fastForwardJob = job;
        this.showFastForward = true;
        this.scheduleFastForwardPoll(500);
      },
      error: err => {
        this.fastForwardStarting = false;
        const detail = err?.error?.message || err?.error?.detail || err?.message;
        this.simulationStopMessage = detail
          ? `Fast-forward could not start: ${detail}`
          : 'Fast-forward could not start. Enable Always Continue and try again.';
      }
    });
  }

  cancelFastForward(): void {
    const jobId = this.fastForwardJob?.jobId;
    if (!jobId || !this.fastForwardRunning) return;
    this.teamService.cancelFastForward(jobId).subscribe({
      next: job => this.fastForwardJob = job,
      error: err => console.error('Could not cancel fast-forward:', err)
    });
  }

  private resumeFastForward(): void {
    if (this.fastForwardChecked) return;
    this.fastForwardChecked = true;
    this.teamService.getFastForwardStatus().subscribe({
      next: job => {
        if (job.status !== 'RUNNING') return;
        this.fastForwardJob = job;
        this.showFastForward = true;
        this.clearAutoAdvanceTimer();
        this.scheduleFastForwardPoll(500);
      },
      error: err => console.error('Could not read fast-forward status:', err)
    });
  }

  private scheduleFastForwardPoll(delayMs: number): void {
    this.clearFastForwardPoll();
    this.fastForwardPollTimer = setTimeout(() => {
      this.fastForwardPollTimer = null;
      this.teamService.getFastForwardStatus().subscribe({
        next: job => {
          this.fastForwardJob = job;
          if (job.status === 'RUNNING') {
            this.scheduleFastForwardPoll(750);
            return;
          }
          this.teamService.loadCurrentSeason();
          this.teamService.loadGameState();
          this.careerService.refresh();
          if (job.status === 'FAILED') {
            this.simulationStopMessage = `Fast-forward stopped: ${job.message}`;
          }
        },
        error: () => this.scheduleFastForwardPoll(1500)
      });
    }, delayMs);
  }

  private clearFastForwardPoll(): void {
    if (this.fastForwardPollTimer) {
      clearTimeout(this.fastForwardPollTimer);
      this.fastForwardPollTimer = null;
    }
  }

  get simulationStage(): string {
    if (this.simulationElapsedSeconds < 3) return this.simulationStages[0];
    if (this.simulationElapsedSeconds < 10) return this.simulationStages[1];
    if (this.simulationElapsedSeconds < 17) return this.simulationStages[2];
    return this.simulationStages[3];
  }

  private startSimulationUx(): void {
    this.simulationElapsedSeconds = 0;
    if (this.simulationUxTimer) clearInterval(this.simulationUxTimer);
    this.simulationUxTimer = setInterval(() => this.simulationElapsedSeconds++, 1000);
  }

  private stopSimulationUx(): void {
    if (this.simulationUxTimer) {
      clearInterval(this.simulationUxTimer);
      this.simulationUxTimer = null;
    }
  }

  get tutorialSteps(): { eyebrow: string; title: string; text: string; route: any[] }[] {
    const teamId = this.teamService.teamId;
    return [
      {
        eyebrow: '1 · Your desk',
        title: 'Welcome to your first career',
        text: 'Home shows the next match, objectives, recent form and the decisions that need your attention.',
        route: ['/home']
      },
      {
        eyebrow: '2 · Squad',
        title: 'Check who is available',
        text: 'The squad now explains injuries and suspensions, including the reason and the time still to serve.',
        route: ['/squad']
      },
      {
        eyebrow: '3 · Tactics',
        title: 'Prepare your starting eleven',
        text: 'Choose the formation, roles and players. Unavailable footballers are excluded from match selection.',
        route: ['/tactics', teamId]
      },
      {
        eyebrow: '4 · Schedule',
        title: 'Study form and opponents',
        text: 'Filter match history, open a result for statistics and lineups, or use H2H to compare two teams.',
        route: ['/fixtures', teamId]
      },
      {
        eyebrow: '5 · Matchday',
        title: 'Advance when you are ready',
        text: 'CONTINUE moves the calendar forward. During a busy matchday you will see an honest loading state until every result is committed.',
        route: ['/home']
      }
    ];
  }

  get currentTutorialStep(): { eyebrow: string; title: string; text: string; route: any[] } {
    return this.tutorialSteps[Math.min(this.tutorialStep, this.tutorialSteps.length - 1)];
  }

  private tutorialStorageKey(): string {
    return `fm_tutorial_completed_${this.authService.currentUserId ?? 'guest'}`;
  }

  private maybeStartTutorial(): void {
    if (this.tutorialChecked || this.teamService.teamId <= 0) return;
    this.tutorialChecked = true;
    let completed = false;
    try { completed = localStorage.getItem(this.tutorialStorageKey()) === 'true'; } catch { /* ignored */ }
    if (!completed) {
      this.tutorialStep = 0;
      this.showTutorial = true;
      setTimeout(() => this.router.navigate(this.currentTutorialStep.route));
    }
  }

  restartTutorial(): void {
    if (this.teamService.teamId <= 0) return;
    this.tutorialStep = 0;
    this.showTutorial = true;
    this.router.navigate(this.currentTutorialStep.route);
  }

  nextTutorialStep(): void {
    if (this.tutorialStep >= this.tutorialSteps.length - 1) {
      this.completeTutorial();
      return;
    }
    this.tutorialStep++;
    this.router.navigate(this.currentTutorialStep.route);
  }

  previousTutorialStep(): void {
    if (this.tutorialStep <= 0) return;
    this.tutorialStep--;
    this.router.navigate(this.currentTutorialStep.route);
  }

  completeTutorial(): void {
    try { localStorage.setItem(this.tutorialStorageKey(), 'true'); } catch { /* ignored */ }
    this.showTutorial = false;
  }

  /**
   * Re-open the live match modal from a stored key (browser refresh recovery).
   * Idempotent — skips if a match is already showing, the user isn't logged in,
   * or no key is stored. Validates with the BE via the existing GET endpoint;
   * if the BE has no record of the session anymore (e.g., backend restart),
   * the key is purged so we don't keep retrying.
   */
  private maybeResumeLiveMatch(): void {
    if (this.showLiveMatch || this.liveMatchKey) return;
    const saved = this.liveMatchService.readPersisted();
    if (!saved) return;

    // Validate the BE still has this session before opening the modal. If the
    // session is gone (server restarted, key expired), clear localStorage so
    // we don't keep trying on every setupComplete emission.
    this.liveMatchService.fetch(saved.key).subscribe({
      next: (data) => {
        if (!data || !data.timeline) {
          this.liveMatchService.clearPersisted();
          return;
        }
        this.liveMatchInteractive = saved.interactive;
        this.fetchLiveMatch(saved.key);
      },
      error: () => this.liveMatchService.clearPersisted()
    });
  }

  openOfferModal(): void { if (this.pendingOffers.length > 0) this.showOfferModal = true; }
  closeOfferModal(): void { this.showOfferModal = false; }

  /** Sidebar shortcut: resolve the user's managerId, then navigate to its profile page (where Resign lives). */
  openMyManager(): void {
    this.careerService.me().subscribe({
      next: (me) => {
        if (me && me.managerId) this.router.navigate(['/manager-profile', me.managerId]);
      }
    });
  }

  acceptOffer(offer: JobOffer): void {
    if (this.offerActionInFlight) return;
    this.offerActionInFlight = true;
    this.careerService.accept(offer.id).subscribe({
      next: () => {
        this.offerActionInFlight = false;
        this.careerService.refresh();
        // Reload setup so the sidebar / pages re-bind to the new team
        this.teamService.checkSetup();
        this.showOfferModal = false;
      },
      error: () => { this.offerActionInFlight = false; }
    });
  }

  declineOffer(offer: JobOffer): void {
    if (this.offerActionInFlight) return;
    this.offerActionInFlight = true;
    this.careerService.decline(offer.id).subscribe({
      next: () => {
        this.offerActionInFlight = false;
        this.careerService.refresh();
      },
      error: () => { this.offerActionInFlight = false; }
    });
  }

  onLoggedIn(): void {
    if (this.authService.careerRole === 'CHAIRMAN') {
      this.http.post(urlApp + '/api/career/chairman/setup', {}).subscribe({
        next: () => {
          this.teamService.checkSetup();
          if (this.authService.chairmanEnabled) this.router.navigate(['/economy']);
        },
        error: () => this.teamService.checkSetup()
      });
      return;
    }
    this.teamService.checkSetup();
  }

  onSetupComplete(event: { teamId: number | null; managerName: string; freeAgent?: boolean }): void {
    this.teamService.onSetupComplete(event.teamId ?? 0, !!event.freeAgent);
  }

  logout(): void {
    this.authService.logout().subscribe(() => window.location.reload());
  }

  advanceGame(): void {
    if (this.advancing || this.fastForwardRunning) return;
    if (this.roomActive) {
      this.advancing = true;
      this.multiplayerRoomService.continue().subscribe({ next: state => { this.advancing = false; this.teamService.loadGameState(); }, error: () => this.advancing = false });
      return;
    }
    this.clearAutoAdvanceTimer();
    this.simulationStopMessage = '';
    this.advancing = true;
    this.startSimulationUx();

    this.teamService.advanceGame().subscribe({
      next: (result) => {
        this.autoAdvanceRetryCount = 0;
        this.teamService.updateFromState(result);
        this.advancing = false;
        this.stopSimulationUx();

        // Backend signalled a hard pause for a pending job offer — surface the
        // offer modal and stop auto-continue. User must accept/decline first.
        if (result.paused && result.reason === 'JOB_OFFER_PENDING') {
          this.careerService.refresh();
          this.showOfferModal = true;
          return;
        }

        // Backend signalled an uncommitted live-match session belongs to this
        // user (typically a browser-refresh recovery the FE didn't catch
        // on init). Re-open the live modal where it was — without this, the
        // matchday would be silently skipped with no result for the human team.
        if (result.paused && result.reason === 'LIVE_MATCH_PENDING' && result.liveMatchKey) {
          this.liveMatchInteractive = !!result.liveMatchInteractive;
          this.fetchLiveMatch(result.liveMatchKey);
          return;
        }

        // Always refresh the offer list after an advance (a new one might have
        // been generated by the periodic AI generator).
        this.careerService.refresh();

        if (result.eventsProcessed) {
          // Check for match result
          const matchEvent = result.eventsProcessed.find((e: any) =>
            (e.type?.startsWith('MATCH_') || e.type === 'MATCH_DAY')
            && (e.allMatchResults || e.matchResult || e.hasLiveMatch));
          if (matchEvent) {
            // Pick this user's match result from allMatchResults if available
            const myTeamId = this.teamService.teamId;
            if (matchEvent.allMatchResults && matchEvent.allMatchResults[myTeamId]) {
              this.matchResult = matchEvent.allMatchResults[myTeamId];
            } else {
              this.matchResult = matchEvent.matchResult;
            }

            // Check for live match
            if (matchEvent.hasLiveMatch && matchEvent.liveMatchKey) {
              this.pendingMatchEvent = matchEvent;
              this.pendingAdvanceResult = result;
              // Interactive (Faza 3 Sesiunea 4) → engine not yet ticked, FE
              // polls /advance. Legacy → engine ran to completion already.
              this.liveMatchInteractive = !!matchEvent.liveMatchInteractive;
              // The backend attaches the post-match press conference id here
              // ONLY for the legacy path. For interactive matches, the PC is
              // created by /commit and we read it from that response.
              this.pendingPostMatchPressConferenceId = matchEvent.postMatchPressConferenceId ?? null;
              this.pendingPostMatchOutcome = matchEvent.postMatchPressConferenceOutcome ?? null;
              this.fetchLiveMatch(matchEvent.liveMatchKey);
              return;
            }

            this.showMatchResult = this.matchResult && this.matchResult.score;

            // Auto-close match report if setting is on
            if (this.teamService.autoDismissMatchReport) {
              setTimeout(() => this.closeMatchResult(), 300);
            }
            return; // Show match first, press conference later
          }

          // Check for press conference
          const pcEvent = result.eventsProcessed.find((e: any) => e.type === 'PRESS_CONFERENCE' && e.pressConferenceId);
          if (pcEvent) {
            this.pressConferenceId = pcEvent.pressConferenceId;
            this.pressConferenceTitle = pcEvent.title || 'Pre-match Press Conference';
            this.showPressConference = true;
            return;
          }
        }

        // Auto-continue if enabled, no modal appeared, and game is not paused
        if (result.paused) {
          this.simulationStopMessage = this.describeSimulationPause(result);
          return;
        }
        if (this.teamService.autoContinueEnabled && !this.showMatchResult && !this.showPressConference && !result.paused) {
          this.scheduleAutoAdvance(150);
        }
      },
      error: (err) => {
        console.error('Error advancing game:', err);
        this.advancing = false;
        this.stopSimulationUx();
        this.handleAdvanceError(err);
      }
    });
  }

  dismissSimulationStop(): void {
    this.simulationStopMessage = '';
  }

  private scheduleAutoAdvance(delayMs: number): void {
    this.clearAutoAdvanceTimer();
    this.autoAdvanceTimer = setTimeout(() => {
      this.autoAdvanceTimer = null;
      if (this.fastForwardRunning) return;
      this.advanceGame();
    }, delayMs);
  }

  private clearAutoAdvanceTimer(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private handleAdvanceError(err: any): void {
    const status = Number(err?.status ?? 0);
    const transient = status === 0 || status === 429 || status >= 500;
    if (this.teamService.autoContinueEnabled && transient
        && this.autoAdvanceRetryCount < this.maxAutoAdvanceRetries) {
      this.autoAdvanceRetryCount++;
      const delayMs = 1000 * Math.pow(2, this.autoAdvanceRetryCount - 1);
      this.simulationStopMessage = `Temporary simulation error. Retrying ${this.autoAdvanceRetryCount}/${this.maxAutoAdvanceRetries}...`;
      this.scheduleAutoAdvance(delayMs);
      return;
    }

    this.autoAdvanceRetryCount = 0;
    const detail = err?.error?.message || err?.error?.error || err?.message;
    this.simulationStopMessage = detail
      ? `Simulation stopped: ${detail}`
      : 'Simulation stopped because the server could not complete the advance. Press Continue to try again.';
  }

  private describeSimulationPause(result: any): string {
    if (result.reason === 'MANAGER_FIRED') {
      return 'Simulation stopped because the manager is no longer employed.';
    }
    if (result.reason === 'JOB_OFFER_PENDING') {
      return 'Simulation stopped because a job offer needs a decision.';
    }
    if (result.reason === 'LIVE_MATCH_PENDING') {
      return 'Simulation stopped because a live match must be completed.';
    }

    const eventType = result.blockingEvent
      || result.eventsProcessed?.find((event: any) => event.awaitingInput)?.type;
    const eventLabels: Record<string, string> = {
      TRANSFER_WINDOW_OPEN: 'the transfer window opened',
      SEASON_END: 'the season ended',
      SEASON_TRANSITION: 'a new season is ready to begin',
      PRESS_CONFERENCE: 'a press conference needs a response'
    };
    if (eventType && eventLabels[eventType]) {
      return `Simulation stopped because ${eventLabels[eventType]}. Press Continue when you are ready.`;
    }
    return 'Simulation paused for an event that needs your attention. Press Continue when you are ready.';
  }

  get matchDecisionLabel(): string | null {
    const decision = String(this.matchResult?.decidedBy || '').toUpperCase();
    const text = `${this.matchResult?.knockoutResultText || ''} ${this.matchResult?.score || ''}`.toLowerCase();
    if (decision === 'PENALTIES' || text.includes('pen')) return 'DECIDED ON PENALTIES';
    if (decision === 'EXTRA_TIME' || text.includes('a.e.t') || text.includes('extra time')) {
      return 'DECIDED AFTER EXTRA TIME';
    }
    if (decision === 'AGGREGATE' || text.includes('agg')) return 'DECIDED ON AGGREGATE';
    if (decision === 'FIRST_LEG' || text.includes('1st leg')) return 'FIRST LEG';
    return null;
  }

  closeMatchResult(): void {
    this.showMatchResult = false;
    this.matchResult = null;

    // Resume auto-continue after dismissing match result
    if (this.teamService.autoContinueEnabled) {
      this.scheduleAutoAdvance(150);
    }
  }

  respondToPressConference(responseType: string): void {
    if (this.pressConferenceResponding) return;
    this.pressConferenceResponding = true;

    this.teamService.respondToPressConference(this.pressConferenceId, responseType).subscribe({
      next: (result) => {
        this.showPressConference = false;
        this.pressConferenceResponding = false;
        this.lastEvents = [{
          type: 'PRESS_CONFERENCE',
          title: 'Press Conference',
          details: result.description + ' (Morale: ' + (result.moraleEffect >= 0 ? '+' : '') + result.moraleEffect + ')'
        }];
        // Update game state from response to trigger refresh on all components
        if (result.gameState) {
          this.teamService.updateFromState(result.gameState);
        }

        // Resume auto-continue after press conference
        if (this.teamService.autoContinueEnabled) {
          this.scheduleAutoAdvance(150);
        }
      },
      error: (err) => {
        console.error('Error responding to press conference:', err);
        this.pressConferenceResponding = false;
      }
    });
  }

  saveGame(): void {
    if (this.saving) return;
    this.saving = true;
    this.http.get<any>(urlApp + '/game/export').subscribe({
      next: (data) => {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `fm-save-season${this.teamService.currentSeason}-${date}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.saving = false;
      },
      error: (err) => {
        console.error('Error saving game:', err);
        alert('Failed to save game.');
        this.saving = false;
      }
    });
  }

  triggerLoadGame(): void {
    if (this.loadingGame) return;
    if (this.advancing || this.fastForwardRunning) {
      this.showLoadGameError('Stop the current simulation before loading a saved game.');
      return;
    }
    this.fileInput.nativeElement.click();
  }

  loadGame(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.clearAutoAdvanceTimer();
    this.clearFastForwardPoll();
    this.loadingGame = true;
    this.loadGameStage = 'reading';
    this.loadGameProgress = 2;
    this.loadGameMessage = 'Reading and validating the save file…';
    this.loadedGameSummary = null;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onprogress = progress => {
      if (!progress.lengthComputable) return;
      this.loadGameProgress = Math.max(2, Math.round((progress.loaded / progress.total) * 12));
    };
    reader.onload = () => {
      try {
        const saveData = JSON.parse(reader.result as string);
        const currentUsername = this.authService.currentUsername;
        const savedUsers = Array.isArray(saveData?.users) ? saveData.users : [];
        const savedUser = savedUsers.find((user: any) =>
          String(user?.username || '').toLowerCase() === String(currentUsername || '').toLowerCase());

        if (!Array.isArray(saveData?.rounds) || saveData.rounds.length === 0
            || !Array.isArray(saveData?.gameCalendars) || saveData.gameCalendars.length === 0
            || !Array.isArray(saveData?.teams) || saveData.teams.length === 0
            || !Array.isArray(saveData?.humans) || saveData.humans.length === 0) {
          this.showLoadGameError('This file is incomplete and cannot restore a playable career.');
          return;
        }
        if (!currentUsername || !savedUser) {
          this.showLoadGameError(`This save does not contain the logged-in profile “${currentUsername || 'Unknown'}”.`);
          return;
        }

        this.loadGameStage = 'uploading';
        this.loadGameProgress = 15;
        this.loadGameMessage = `Uploading ${file.name}…`;
        const request = new HttpRequest<any>('POST', urlApp + '/game/import', saveData, {
          reportProgress: true
        });

        this.http.request<any>(request).subscribe({
          next: httpEvent => {
            if (httpEvent.type === HttpEventType.UploadProgress) {
              const total = httpEvent.total || file.size || 1;
              this.loadGameProgress = Math.min(82,
                15 + Math.round((httpEvent.loaded / total) * 67));
              if (httpEvent.loaded >= total) {
                this.loadGameStage = 'restoring';
                this.loadGameMessage = 'Rebuilding teams, competitions, fixtures and career history…';
              }
              return;
            }
            if (httpEvent instanceof HttpResponse) {
              const result = httpEvent.body || {};
              if (!result.success) {
                this.showLoadGameError(result.error || 'The backend could not restore this save.');
                return;
              }
              this.verifyLoadedGame(result, savedUser.username);
            }
          },
          error: err => {
            console.error('Error loading game:', err);
            this.showLoadGameError(err?.error?.error || err?.message || 'Failed to load game.');
          }
        });
      } catch (e) {
        this.showLoadGameError('Invalid save file. The selected file is not valid JSON.');
      }
    };
    reader.onerror = () => this.showLoadGameError('The selected save file could not be read.');
    reader.readAsText(file);
    input.value = '';
  }

  private verifyLoadedGame(result: any, username: string): void {
    this.loadGameStage = 'verifying';
    this.loadGameProgress = 90;
    this.loadGameMessage = 'Restoring your login, club and manager history…';

    this.authService.verifySession().subscribe({
      next: auth => {
        if (!auth.success || auth.userId == null) {
          this.showLoadGameError(auth.error || 'The saved user profile could not be restored.');
          return;
        }

        const setupRequest = this.http.get<any>(urlApp + '/api/career/status');
        const stateRequest = this.http.get<any>(urlApp + '/game/state');
        const managerRequest = auth.managerId != null
          ? this.http.get<any>(urlApp + `/managers/profile/${auth.managerId}`)
          : of(null);

        forkJoin({ setup: setupRequest, state: stateRequest, manager: managerRequest }).subscribe({
          next: verification => {
            if (!verification.setup?.setupComplete) {
              this.showLoadGameError('The save was imported, but its user is not connected to a team.');
              return;
            }
            if (auth.managerId != null && (!verification.manager || verification.manager.error)) {
              this.showLoadGameError('The save was imported, but the manager profile is missing.');
              return;
            }

            const restoredProfile = Array.isArray(result.profiles)
              ? result.profiles.find((profile: any) => profile.userId === auth.userId)
              : null;
            this.loadedGameSummary = {
              season: verification.state?.season ?? result.season,
              date: verification.state?.dateDisplay ?? result.dateDisplay,
              team: verification.manager?.currentTeamName ?? restoredProfile?.teamName,
              manager: verification.manager?.managerName ?? restoredProfile?.managerName ?? username,
              historyCount: Array.isArray(verification.manager?.history)
                ? verification.manager.history.length
                : undefined
            };
            this.loadGameStage = 'success';
            this.loadGameProgress = 100;
            this.loadGameMessage = 'Game loaded and verified. Opening the restored career…';
            this.liveMatchService.clearPersisted();
            this.loadGameRedirectTimer = setTimeout(() => {
              window.location.href = '/home';
            }, 1800);
          },
          error: err => {
            console.error('Could not verify loaded game:', err);
            this.showLoadGameError('The save was imported, but the restored career could not be verified.');
          }
        });
      },
      error: err => {
        console.error('Could not restore login after game load:', err);
        this.showLoadGameError('The save was imported, but login restoration failed.');
      }
    });
  }

  dismissLoadGameStatus(): void {
    if (this.loadingGame) return;
    this.loadGameStage = 'idle';
    this.loadGameMessage = '';
    this.loadGameProgress = 0;
    this.loadedGameSummary = null;
  }

  private showLoadGameError(message: string): void {
    this.loadingGame = false;
    this.loadGameStage = 'error';
    this.loadGameMessage = message;
    this.loadGameProgress = 0;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.showTutorial) {
      if (event.key === 'Escape') this.completeTutorial();
      if (event.key === 'ArrowRight' || event.key === 'Enter') this.nextTutorialStep();
      if (event.key === 'ArrowLeft') this.previousTutorialStep();
      event.preventDefault();
      return;
    }

    // Ignore if typing in an input/textarea
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Press conference responses: 1/2/3/4
    if (this.showPressConference && !this.pressConferenceResponding) {
      const responses: { [key: string]: string } = {
        '1': 'confident',
        '2': 'cautious',
        '3': 'aggressive',
        '4': 'deflect'
      };
      if (responses[event.key]) {
        event.preventDefault();
        this.respondToPressConference(responses[event.key]);
        return;
      }
    }

    // Live match (including its goal clips and lineup preview) owns the
    // keyboard while it is open — <app-live-match> has its own listener.
    if (this.showLiveMatch) return;

    // Space → CONTINUE (only when no modal is showing)
    if (event.key === ' ' && !this.showPressConference && !this.showMatchResult) {
      event.preventDefault();
      this.advanceGame();
    }

    // Space or any key to close match result
    if (event.key === ' ' && this.showMatchResult) {
      event.preventDefault();
      this.closeMatchResult();
    }
  }

  getGoals(teamId: number): any[] {
    if (!this.matchResult?.matchEvents) return [];
    return this.matchResult.matchEvents.filter((e: any) => e.eventType === 'goal' && e.teamId === teamId);
  }

  getEventIcon(type: string): string {
    switch (type) {
      case 'MATCH_LEAGUE':
      case 'MATCH_CUP':
      case 'MATCH_EUROPEAN':
      case 'MATCH_FRIENDLY':
        return '\u26BD';
      case 'TRAINING_SESSION': return '\uD83C\uDFCB\uFE0F';
      case 'PRESS_CONFERENCE': return '\uD83C\uDFA4';
      case 'INJURY_UPDATE': return '\uD83C\uDFE5';
      case 'BOARD_MEETING': return '\uD83D\uDC54';
      case 'YOUTH_ACADEMY_REPORT': return '\uD83C\uDF31';
      case 'SPONSOR_OFFER': return '\uD83D\uDCB0';
      case 'NATIONAL_TEAM_CALL': return '\uD83C\uDFF4';
      case 'AWARDS_CEREMONY': return '\uD83C\uDFC6';
      case 'TRANSFER_WINDOW_OPEN':
      case 'TRANSFER_WINDOW_CLOSE': return '\uD83D\uDCCB';
      case 'ANALYTICS_REPORT': return '\uD83D\uDCCA';
      default: return '\uD83D\uDCCC';
    }
  }

  getEventClass(type: string): string {
    if (type.startsWith('MATCH_')) return 'event-match';
    if (type === 'INJURY_UPDATE') return 'event-injury';
    if (type === 'TRAINING_SESSION') return 'event-training';
    if (type.includes('TRANSFER')) return 'event-transfer';
    return 'event-default';
  }

  // ==========================================
  // LIVE MATCH
  // ==========================================

  /**
   * Open the live-match viewer for a session key. The viewer component owns
   * the fetch + playback; here we only remember the key (so a browser refresh
   * can resume) and flip the modal on.
   */
  fetchLiveMatch(key: string): void {
    this.liveMatchKey = key;
    // Persist the in-flight match key so a browser refresh can resume the
    // modal instead of orphaning the BE session and leaving the matchday
    // without a result. Cleared when the viewer closes.
    this.liveMatchService.persist(key, this.liveMatchInteractive);
    this.showLiveMatch = true;
  }

  /** The backend had no playable session behind the key — fall back to the
   *  standard match-result flow, exactly as the inline fetch used to. */
  onLiveMatchUnavailable(): void {
    this.showLiveMatch = false;
    this.showPendingMatchResult();
  }

  /** The user dismissed the finished match. If a post-match press conference
   *  was scheduled (either announced with the matchday event or created by
   *  /commit), open it now — day-advance stays blocked until the user
   *  responds. Otherwise fall back to the match-result → auto-continue flow. */
  onLiveMatchClosed(event: LiveMatchClosed): void {
    this.showLiveMatch = false;
    this.liveMatchKey = null;
    if (event?.pressConferenceId != null) {
      this.pendingPostMatchPressConferenceId = event.pressConferenceId;
      this.pendingPostMatchOutcome = event.outcome ?? null;
    }

    if (this.pendingPostMatchPressConferenceId != null) {
      this.pressConferenceId = this.pendingPostMatchPressConferenceId;
      this.pressConferenceTitle = this.postMatchTitleFor(this.pendingPostMatchOutcome);
      this.showPressConference = true;
      this.pendingPostMatchPressConferenceId = null;
      this.pendingPostMatchOutcome = null;
      return;
    }
    this.showPendingMatchResult();
  }


  private postMatchTitleFor(outcome: 'WIN' | 'DRAW' | 'LOSS' | null): string {
    switch (outcome) {
      case 'WIN':  return 'Post-Match Press Conference (Win)';
      case 'LOSS': return 'Post-Match Press Conference (Defeat)';
      case 'DRAW': return 'Post-Match Press Conference (Draw)';
      default:     return 'Post-Match Press Conference';
    }
  }

  // Adapt the prompt line to pre- vs post-match by inspecting the title set
  // when the modal was opened.
  pcQuestionLine(): string {
    const t = (this.pressConferenceTitle || '').toLowerCase();
    if (t.startsWith('post')) {
      return "The media want your reaction to the match. How do you respond?";
    }
    return "The media is asking about the upcoming match. How do you respond?";
  }

  private showPendingMatchResult(): void {
    if (this.matchResult && this.matchResult.score) {
      this.showMatchResult = true;
      if (this.teamService.autoDismissMatchReport) {
        setTimeout(() => this.closeMatchResult(), 300);
      }
    } else {
      this.pendingMatchEvent = null;
      this.pendingAdvanceResult = null;
      if (this.teamService.autoContinueEnabled) {
        this.scheduleAutoAdvance(150);
      }
    }
  }


  ngOnDestroy(): void {
    this.clearAutoAdvanceTimer();
    this.clearFastForwardPoll();
    this.stopSimulationUx();
    if (this.loadGameRedirectTimer) clearTimeout(this.loadGameRedirectTimer);
  }
}
