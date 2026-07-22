import { Component, HostListener, ViewChild, ElementRef, OnDestroy, AfterViewChecked } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { FastForwardStatus, TeamService } from './services/team.service';
import { AuthService } from './services/auth.service';
import { CareerService, JobOffer } from './services/career.service';

export const urlApp: string = "http://localhost:8086";
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy, AfterViewChecked {
  title = 'footballmanagersimulator-frontend';
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

  // Live match modal state
  showLiveMatch = false;
  liveMatchData: any = null;
  liveCurrentIndex = 0;
  liveMatchSpeed = 1;
  liveMatchTimer: any = null;
  pendingMatchEvent: any = null;
  pendingAdvanceResult: any = null;
  liveMatchKey: string | null = null;
  /** Faza 3 Sesiunea 4: when true, the engine has NOT advanced yet — we poll
   *  /advance every tick instead of playing back a baked timeline. The user's
   *  manual substitutions actually change the outcome. */
  liveMatchInteractive = false;
  /** Set once /commit returns so we don't fire it twice. */
  liveMatchCommitted = false;
  /** Knockout outcome line shown at full time (aggregate / extra time / penalties /
   *  "first leg"), from the /commit response. Null = nothing beyond the score. */
  liveKnockoutResultText: string | null = null;
  /** Polling advance request in flight — debounces the timer. */
  liveAdvanceInFlight = false;
  /** Minute the polling loop is currently asking the engine to reach. */
  liveAdvanceTargetMinute = 0;
  /** Anti-spoiler: minute of a shot (saved/wide) whose commentary line is held
   *  back briefly so the user can't tell a non-goal shot from a goal by the
   *  fact that no animation modal opened. Goals already gate this via the
   *  modal; this fills the gap for shots that don't trigger one. */
  suspenseShotHideMinute: number | null = null;
  suspenseShotTimer: any = null;

  // ---- Synthetic extra-time / penalty playback (FRONTEND-ONLY, COSMETIC) ----
  // The backend does NOT simulate minutes 91-120 or the shootout kick-by-kick:
  // KnockoutTieResolver coin-flips a winner and /commit returns only a result
  // string + one synthetic goal. When a tie is decided in ET/penalties we
  // fabricate a visual sequence here so the "video" doesn't jump 90' -> result.
  // This is explicitly NOT engine-accurate. The RNG is seeded from the match
  // key so a browser-refresh resume replays the same fabricated sequence.
  syntheticPhase: 'none' | 'extra-time' | 'penalties' = 'none';
  /** True from the moment a synthetic sequence starts — keeps the scoreboard on
   *  the fabricated score and the main feed at the 90' state even after it ends. */
  syntheticUsed = false;
  syntheticTimer: any = null;
  syntheticMinute = 90;                 // ticks 91..120 during extra time
  syntheticHomeScore = 0;               // ET scoreboard (starts at the level 90' score)
  syntheticAwayScore = 0;
  syntheticWinnerIsHome = false;
  syntheticEtBanner = '';
  syntheticEtFeed: { minute: number; text: string }[] = [];
  private syntheticEtGoalMinute: number | null = null;
  syntheticDecidedByPenalties = false;
  // Penalty shootout grid — kicks revealed one at a time.
  penaltyKicks: { team: 'home' | 'away'; taker: string; scored: boolean; revealed: boolean }[] = [];
  penaltyHomeScore = 0;
  penaltyAwayScore = 0;
  private penaltyRevealIndex = 0;
  private syntheticRng: () => number = Math.random;

  // Substitution modal (Faza 3)
  showSubModal = false;
  subPlayerOutId: number | null = null;
  subPlayerInId: number | null = null;
  subError: string | null = null;
  subSubmitting = false;

  // Toggle between Squad Fitness (default) and Match Facts (live stats) inside
  // the live match modal. Both update in real-time from /advance responses.
  liveMatchPanelView: 'squad' | 'facts' = 'squad';
  setLivePanelView(view: 'squad' | 'facts'): void { this.liveMatchPanelView = view; }

  // Goal animation state
  showGoalAnimation = false;
  goalAnimationData: any = null;
  goalAnimationFrameIndex = 0;
  goalAnimationTimer: any = null;
  goalAnimationEventText = '';
  goalAnimationEventTimer: any = null;
  goalAnimationFinished = false;
  goalAnimationPendingQueue: number[] = [];  // minutes to play
  goalAnimationCanvasReady = false;
  // Last few ball positions for the trail effect. Rendered as fading dots
  // behind the ball so a fast pass leaves a visible streak.
  goalAnimationBallTrail: { x: number; y: number }[] = [];
  // Static array of confetti particles emitted at the moment of GOAL. Each is
  // updated per frame (gravity + drag) until the animation ends.
  goalConfetti: { x: number; y: number; vx: number; vy: number; color: string; size: number }[] = [];
  @ViewChild('goalCanvas') goalCanvas!: ElementRef<HTMLCanvasElement>;

  // Lineup preview state — flashed once at the start of each live match so the
  // user sees both formations and team kits before the kickoff. The data is
  // built from the first animation in the match's goalAnimations map (any
  // animation works since the squad is the same up to subs).
  showLineupPreview = false;
  lineupPreviewTimer: any = null;
  lineupPreviewData: any = null;
  private static readonly LINEUP_PREVIEW_MS = 2800;

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
              private router: Router) {
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
    let savedKey: string | null = null;
    let savedInteractive = false;
    try {
      savedKey = localStorage.getItem('fm_liveMatchKey');
      savedInteractive = localStorage.getItem('fm_liveMatchInteractive') === 'true';
    } catch { /* storage disabled */ }
    if (!savedKey) return;

    // Validate the BE still has this session before opening the modal. If the
    // session is gone (server restarted, key expired), clear localStorage so
    // we don't keep trying on every setupComplete emission.
    this.http.get<any>(urlApp + `/match/live/${savedKey}`).subscribe({
      next: (data) => {
        if (!data || !data.timeline) {
          try {
            localStorage.removeItem('fm_liveMatchKey');
            localStorage.removeItem('fm_liveMatchInteractive');
          } catch { /* ignored */ }
          return;
        }
        this.liveMatchInteractive = savedInteractive;
        this.liveMatchCommitted = false;
        this.fetchLiveMatch(savedKey!);
      },
      error: () => {
        try {
          localStorage.removeItem('fm_liveMatchKey');
          localStorage.removeItem('fm_liveMatchInteractive');
        } catch { /* ignored */ }
      }
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
        next: () => this.teamService.checkSetup(),
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
          this.liveMatchCommitted = false;
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
              this.liveMatchCommitted = false;
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
            try {
              localStorage.removeItem('fm_liveMatchKey');
              localStorage.removeItem('fm_liveMatchInteractive');
            } catch { /* ignored */ }
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

    // Goal animation: Space to skip/continue
    if (this.showGoalAnimation) {
      if (event.key === ' ') {
        event.preventDefault();
        if (this.goalAnimationFinished) {
          this.closeGoalAnimation();
        } else {
          this.skipGoalAnimation();
        }
      }
      return;
    }

    // Lineup preview: any key dismisses it early
    if (this.showLineupPreview) {
      if (event.key === ' ' || event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        this.dismissLineupPreview();
      }
      return;
    }

    // Live match: Space to close when finished
    if (this.showLiveMatch) {
      if (event.key === ' ') {
        event.preventDefault();
        if (this.liveMatchFinished) {
          this.closeLiveMatch();
        } else {
          this.skipToEnd();
        }
      }
      return;
    }

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

  fetchLiveMatch(key: string): void {
    this.liveMatchKey = key;
    this.liveKnockoutResultText = null;
    this.resetSyntheticState();
    // Persist the in-flight match key so a browser refresh can resume the
    // modal instead of orphaning the BE session and leaving the matchday
    // without a result. Cleared on closeLiveMatch / skipToEnd.
    try {
      localStorage.setItem('fm_liveMatchKey', key);
      localStorage.setItem('fm_liveMatchInteractive', String(this.liveMatchInteractive));
    } catch { /* storage disabled — silent fallback */ }
    this.http.get<any>(urlApp + `/match/live/${key}`).subscribe({
      next: (data) => {
        if (data && data.timeline && data.timeline.length > 0) {
          this.liveMatchData = data;
          this.liveCurrentIndex = 0;
          this.liveMatchSpeed = 1;
          this.showLiveMatch = true;

          // Show the formations once at match start (replaces the previous
          // pre-animation flash). The timer doesn't tick until the user closes
          // the preview, so the kickoff event isn't skipped while it's up.
          const lineup = this.buildLineupFromMatch(data);
          if (lineup) {
            this.lineupPreviewData = lineup;
            this.showLineupPreview = true;
            if (this.lineupPreviewTimer) clearTimeout(this.lineupPreviewTimer);
            this.lineupPreviewTimer = setTimeout(() => this.dismissLineupPreview(), AppComponent.LINEUP_PREVIEW_MS);
          } else {
            this.startLiveMatchTimer();
          }
        } else {
          this.showPendingMatchResult();
        }
      },
      error: () => {
        this.showPendingMatchResult();
      }
    });
  }

  startLiveMatchTimer(): void {
    this.stopLiveMatchTimer();
    const interval = this.getSpeedInterval();
    this.liveMatchTimer = setInterval(() => {
      // The engine state itself is the authoritative signal — if the match
      // isn't finished yet, drive it via /advance polling. This avoids the
      // tickPlayback path silently stopping the timer because the baked
      // timeline only has a single kickoff entry (Session 4 interactive
      // sessions start with currentMinute=0 and finished=false).
      if (this.liveMatchData && this.liveMatchData.finished === false) {
        this.tickInteractive();
      } else {
        this.tickPlayback();
      }
    }, interval);
  }

  /** Legacy playback — engine ran sync, just advance the local index through
   *  the baked timeline (with goal animations as before). */
  private tickPlayback(): void {
    if (this.liveCurrentIndex < this.liveMatchData.timeline.length - 1) {
      this.liveCurrentIndex++;
      const current = this.liveMatchData.timeline[this.liveCurrentIndex];
      if (current) {
        const minute = current.minute;
        const anim = this.liveMatchData.goalAnimations?.[minute];
        // Animation that the user opted into (GOAL always; SAVE/MISS only in
        // KEY_MOMENTS) → play the modal. Covers goal / shot_saved / shot_wide
        // events — we previously gated this to eventType==='goal', which
        // silently broke save+miss animations in KEY_MOMENTS mode.
        const isShotEvent = current.eventType === 'goal'
                         || current.eventType === 'shot_saved'
                         || current.eventType === 'shot_wide';
        if (anim && isShotEvent && this.shouldPlayAnimation(anim.outcome)) {
          this.playGoalAnimation(minute);
          return;
        }
        // Anti-spoiler: events that would otherwise reveal instantly (no
        // animation modal to gate them) get a brief uniform pause.
        if (this.isSuspenseShot(current, anim)) {
          this.applyShotSuspense(minute);
          return;
        }
      }
    } else {
      this.stopLiveMatchTimer();
    }
  }

  /** Returns true for any "shot attempt" commentary line that should be
   *  briefly held back from the feed. Covers events with a stored animation
   *  that won't actually play (GOALS_ONLY default + SAVE/MISS outcome) AND
   *  shot_blocked events that the backend doesn't even register an animation
   *  for. Without this, instant-reveal of these lines would telegraph
   *  "no goal here" before the user has any reason to expect one. */
  private isSuspenseShot(event: any, anim: any): boolean {
    if (!event) return false;
    const t = event.eventType;
    // Animation exists but skipped → save/miss case
    if (anim && (t === 'shot_saved' || t === 'shot_wide' || t === 'goal')
        && !this.shouldPlayAnimation(anim.outcome)) {
      return true;
    }
    // No animation entry at all — blocked shots, etc. Still a shot phase.
    if (!anim && (t === 'shot_saved' || t === 'shot_wide' || t === 'shot_blocked')) {
      return true;
    }
    return false;
  }

  /** Briefly hide a non-goal shot event from the feed and pause the timer so
   *  the cadence matches what the user feels during a goal animation. Delay
   *  scales with playback speed (1500ms at 1x, ~100ms at 8x). */
  private applyShotSuspense(minute: number): void {
    this.suspenseShotHideMinute = minute;
    this.stopLiveMatchTimer();
    if (this.suspenseShotTimer) {
      clearTimeout(this.suspenseShotTimer);
    }
    const delay = Math.max(80, this.getSpeedInterval() * 2.5);
    this.suspenseShotTimer = setTimeout(() => {
      this.suspenseShotTimer = null;
      this.suspenseShotHideMinute = null;
      // Resume ticking only if the match is still showing and not paused
      // by some other modal (goal animation, sub modal, etc.).
      if (this.showLiveMatch
          && this.liveMatchData
          && !this.showGoalAnimation
          && !(this.liveMatchData.finished && this.liveMatchCommitted)) {
        this.startLiveMatchTimer();
      }
    }, delay);
  }

  /** Interactive mode (Faza 3 Sesiunea 4) — drive the engine by polling
   *  /advance one in-game minute at a time. Each response carries the new
   *  events, current pitch + bench state, score, and finished flag. */
  private tickInteractive(): void {
    if (this.liveAdvanceInFlight) return; // wait for previous /advance to land
    if (!this.liveMatchKey || !this.liveMatchData) return;

    const currentEngineMinute = this.liveMatchData.currentMinute ?? 0;
    const totalMinutes = 90 + (this.liveMatchData.firstHalfStoppage || 0) + (this.liveMatchData.secondHalfStoppage || 0);

    // Match finished — stop ticking and commit (idempotent server-side).
    if (this.liveMatchData.finished) {
      this.stopLiveMatchTimer();
      if (!this.liveMatchCommitted) this.commitInteractiveLiveMatch();
      return;
    }

    const target = Math.min(currentEngineMinute + 1, totalMinutes);
    this.liveAdvanceInFlight = true;
    this.liveAdvanceTargetMinute = target;

    this.http.post<any>(urlApp + `/match/live/${this.liveMatchKey}/advance?untilMinute=${target}`, {}).subscribe({
      next: (state) => {
        this.liveAdvanceInFlight = false;
        if (!state) return;
        // Merge the new state — replace timeline (it's the source of truth in
        // interactive mode) and refresh pitch/bench/score/finished/etc.
        this.liveMatchData = state;
        this.liveCurrentIndex = (state.timeline?.length ?? 1) - 1;

        // Goal animation + suspense paths — mirror tickPlayback so interactive
        // mode (Faza 3 Sesiunea 4) behaves identically.
        //
        // Important: the engine can produce TWO events in a single tick — e.g.
        // a goal at minute 94 followed immediately by the full_time marker at
        // minute 94. `state.timeline[liveCurrentIndex]` is the LAST one, which
        // would be the full_time event in that case. We use the presence + the
        // outcome of `state.goalAnimations[target]` to decide whether to play
        // the animation, NOT the last event's type — otherwise the goal
        // animation would be silently dropped whenever it shares its minute
        // with another timeline entry (full_time, kickoff carry-over, etc.).
        const anim = state.goalAnimations?.[target];
        if (anim && this.shouldPlayAnimation(anim.outcome)) {
          this.playGoalAnimation(target);
          return;
        }
        const last = state.timeline[this.liveCurrentIndex];
        if (last && this.isSuspenseShot(last, anim)) {
          this.applyShotSuspense(target);
          return;
        }

        // Reached full time on the engine — kick off /commit.
        if (state.finished && !this.liveMatchCommitted) {
          this.stopLiveMatchTimer();
          this.commitInteractiveLiveMatch();
        }
      },
      error: () => {
        this.liveAdvanceInFlight = false;
        // Stop polling on persistent failure — user can use Skip-to-End or close.
        this.stopLiveMatchTimer();
      }
    });
  }

  /** POST /commit after the engine finishes. Picks up the post-match press
   *  conference id from the response and chains it into closeLiveMatch's
   *  existing PC flow. */
  private commitInteractiveLiveMatch(): void {
    if (!this.liveMatchKey || this.liveMatchCommitted) return;
    this.liveMatchCommitted = true;
    this.http.post<any>(urlApp + `/match/live/${this.liveMatchKey}/commit`, {}).subscribe({
      next: (result) => {
        if (result?.postMatchPressConferenceId) {
          this.pendingPostMatchPressConferenceId = result.postMatchPressConferenceId;
          this.pendingPostMatchOutcome = result.postMatchPressConferenceOutcome ?? null;
        }
        // Knockout outcome (aggregate / extra time / penalties / first leg).
        this.liveKnockoutResultText = result?.knockoutResultText ?? null;
        // Refresh the live data with the final state from commit.
        if (result?.liveMatch) {
          this.liveMatchData = result.liveMatch;
          this.liveCurrentIndex = (result.liveMatch.timeline?.length ?? 1) - 1;
        }
        // If the tie was decided in extra time / penalties, play the cosmetic
        // 91'-120' + shootout sequence before revealing the result + Continue.
        this.maybeStartSyntheticKnockout();
        // The commit just changed standings / scorers / form in the DB without
        // advancing the day, so the normal updateFromState refresh hasn't fired.
        // Fan out a refresh so the dashboard and other live pages re-sync.
        this.teamService.notifyRefresh();
      },
      error: (err) => {
        console.error('Live match commit failed:', err);
        // Allow the user to close the modal anyway; standings just won't update.
      }
    });
  }

  // ==========================================
  // SYNTHETIC EXTRA TIME / PENALTIES (cosmetic)
  // ==========================================

  /** Inspect the knockout result string and, if the tie was decided in extra
   *  time or on penalties, kick off the fabricated 91'-120' (+ shootout)
   *  sequence. No-op for first-leg / aggregate / regulation-time outcomes. */
  private maybeStartSyntheticKnockout(): void {
    const text = this.liveKnockoutResultText || '';
    const low = text.toLowerCase();
    const isPens = low.includes('penalt') || low.includes('on pens');
    const isEt = low.includes('extra time') || low.includes('a.e.t');
    if (!isPens && !isEt) return; // first leg / decided in 90' / on aggregate

    const homeName = this.liveMatchData?.homeTeamName || '';
    const awayName = this.liveMatchData?.awayTeamName || '';
    this.syntheticWinnerIsHome = this.knockoutWinnerIsHome(text, homeName, awayName);

    // A tie only reaches ET/pens when level at 90', so seed the ET scoreboard
    // from the end-of-regulation score.
    const lvl = this.scoreAtEndOfNormalTime();
    this.syntheticHomeScore = lvl.home;
    this.syntheticAwayScore = lvl.away;

    this.syntheticRng = this.makeSeededRng(this.liveMatchKey || (homeName + awayName));
    this.syntheticDecidedByPenalties = isPens && !isEt;
    this.syntheticEtGoalMinute = this.syntheticDecidedByPenalties
      ? null
      : 91 + Math.floor(this.syntheticRng() * 28); // 91..118

    this.syntheticUsed = true;
    this.syntheticPhase = 'extra-time';
    this.syntheticMinute = 90;
    this.syntheticEtBanner = 'EXTRA TIME';
    this.syntheticEtFeed = [{ minute: 90, text: 'Extra time gets underway — 30 more minutes.' }];
    this.startSyntheticTimer();
  }

  /** The result text leads with the winning team's name. Decide which side won
   *  by which name appears first (handles one name being a substring of the
   *  other by comparing positions). Defaults to home if neither is found. */
  private knockoutWinnerIsHome(text: string, homeName: string, awayName: string): boolean {
    const t = text.toLowerCase();
    const h = homeName ? t.indexOf(homeName.toLowerCase()) : -1;
    const a = awayName ? t.indexOf(awayName.toLowerCase()) : -1;
    if (h === -1 && a === -1) return true;
    if (a === -1) return true;
    if (h === -1) return false;
    return h <= a;
  }

  /** Latest score from the timeline at or before the end of regulation. The
   *  backend appends its synthetic winner goal at minute 120, so we read the
   *  score from events at minute <= 95 to recover the level 90' scoreline. */
  private scoreAtEndOfNormalTime(): { home: number; away: number } {
    const tl = this.liveMatchData?.timeline || [];
    let home = 0, away = 0;
    for (const e of tl) {
      if ((e.minute ?? 0) <= 95) {
        if (typeof e.homeScore === 'number') home = e.homeScore;
        if (typeof e.awayScore === 'number') away = e.awayScore;
      }
    }
    return { home, away };
  }

  private startSyntheticTimer(): void {
    this.stopSyntheticTimer();
    this.syntheticTimer = setInterval(() => this.tickSynthetic(), this.getSpeedInterval());
  }

  stopSyntheticTimer(): void {
    if (this.syntheticTimer) {
      clearInterval(this.syntheticTimer);
      this.syntheticTimer = null;
    }
  }

  private tickSynthetic(): void {
    if (this.syntheticPhase === 'extra-time') {
      this.syntheticMinute++;
      if (this.syntheticMinute === 106) {
        this.syntheticEtBanner = 'EXTRA TIME · SECOND HALF';
        this.syntheticEtFeed.unshift({ minute: 105, text: 'Half time in extra time.' });
      }
      if (this.syntheticEtGoalMinute != null && this.syntheticMinute === this.syntheticEtGoalMinute) {
        if (this.syntheticWinnerIsHome) this.syntheticHomeScore++; else this.syntheticAwayScore++;
        const scorers = this.penaltyTakerNames(this.syntheticWinnerIsHome);
        const scorer = scorers[Math.floor(this.syntheticRng() * scorers.length)] || 'the substitute';
        const team = this.syntheticWinnerIsHome ? this.liveMatchData?.homeTeamName : this.liveMatchData?.awayTeamName;
        this.syntheticEtFeed.unshift({ minute: this.syntheticMinute, text: `GOAL! ${scorer} wins it for ${team}!` });
      }
      if (this.syntheticMinute >= 120) {
        if (this.syntheticDecidedByPenalties) this.beginSyntheticShootout();
        else this.finishSynthetic();
      }
      return;
    }
    if (this.syntheticPhase === 'penalties') {
      this.revealNextPenalty();
      return;
    }
  }

  private beginSyntheticShootout(): void {
    this.syntheticPhase = 'penalties';
    this.syntheticEtBanner = 'PENALTY SHOOTOUT';
    this.syntheticEtFeed.unshift({ minute: 120, text: 'Still level after extra time — it goes to penalties.' });
    this.penaltyKicks = this.buildShootout();
    this.penaltyHomeScore = 0;
    this.penaltyAwayScore = 0;
    this.penaltyRevealIndex = 0;
  }

  /** Build a plausible shootout that ends on the known winner: the winner
   *  converts all five, the loser misses one or two at random indices (final
   *  5-4 or 5-3). Cosmetic only — real shootout order/early-stop isn't modelled. */
  private buildShootout(): { team: 'home' | 'away'; taker: string; scored: boolean; revealed: boolean }[] {
    const homeTakers = this.penaltyTakerNames(true);
    const awayTakers = this.penaltyTakerNames(false);
    const winnerIsHome = this.syntheticWinnerIsHome;
    const loserMakes = this.syntheticRng() < 0.5 ? 3 : 4; // loser scores 3 or 4 of 5
    const loserMisses = new Set<number>();
    while (loserMisses.size < 5 - loserMakes) {
      loserMisses.add(Math.floor(this.syntheticRng() * 5));
    }
    const kicks: { team: 'home' | 'away'; taker: string; scored: boolean; revealed: boolean }[] = [];
    for (let i = 0; i < 5; i++) {
      const homeScored = winnerIsHome ? true : !loserMisses.has(i);
      const awayScored = winnerIsHome ? !loserMisses.has(i) : true;
      kicks.push({ team: 'home', taker: homeTakers[i % homeTakers.length], scored: homeScored, revealed: false });
      kicks.push({ team: 'away', taker: awayTakers[i % awayTakers.length], scored: awayScored, revealed: false });
    }
    return kicks;
  }

  private revealNextPenalty(): void {
    if (this.penaltyRevealIndex >= this.penaltyKicks.length) {
      this.finishSynthetic();
      return;
    }
    const k = this.penaltyKicks[this.penaltyRevealIndex];
    k.revealed = true;
    if (k.scored) {
      if (k.team === 'home') this.penaltyHomeScore++; else this.penaltyAwayScore++;
    }
    this.penaltyRevealIndex++;
    if (this.penaltyRevealIndex >= this.penaltyKicks.length) {
      // Brief beat on the last kick before revealing the result + Continue.
      setTimeout(() => { if (this.syntheticPhase === 'penalties') this.finishSynthetic(); }, 900);
    }
  }

  /** End the synthetic sequence — reveals the existing knockout result text and
   *  the Continue button (both gated on syntheticPhase === 'none'). */
  private finishSynthetic(): void {
    this.stopSyntheticTimer();
    this.syntheticPhase = 'none';
  }

  /** Reset all synthetic state (called on close / new match). */
  private resetSyntheticState(): void {
    this.stopSyntheticTimer();
    this.syntheticPhase = 'none';
    this.syntheticUsed = false;
    this.syntheticMinute = 90;
    this.syntheticHomeScore = 0;
    this.syntheticAwayScore = 0;
    this.syntheticWinnerIsHome = false;
    this.syntheticEtBanner = '';
    this.syntheticEtFeed = [];
    this.syntheticEtGoalMinute = null;
    this.syntheticDecidedByPenalties = false;
    this.penaltyKicks = [];
    this.penaltyHomeScore = 0;
    this.penaltyAwayScore = 0;
    this.penaltyRevealIndex = 0;
  }

  /** Surname list of the user-facing pitch players for a side, for fabricating
   *  scorer / penalty-taker names. Falls back to generic labels. */
  private penaltyTakerNames(home: boolean): string[] {
    const pitch = (home ? this.liveMatchData?.homePitch : this.liveMatchData?.awayPitch) || [];
    const names = pitch.map((p: any) => this.surnameOf(p)).filter((n: string) => !!n);
    return names.length ? names : ['Penalty 1', 'Penalty 2', 'Penalty 3', 'Penalty 4', 'Penalty 5'];
  }

  /** Deterministic mulberry32 PRNG seeded from a string. */
  private makeSeededRng(seed: string): () => number {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  stopLiveMatchTimer(): void {
    if (this.liveMatchTimer) {
      clearInterval(this.liveMatchTimer);
      this.liveMatchTimer = null;
    }
  }

  getSpeedInterval(): number {
    switch (this.liveMatchSpeed) {
      case 2: return 300;
      case 4: return 100;
      case 8: return 40;
      default: return 600;
    }
  }

  setLiveMatchSpeed(speed: number): void {
    this.liveMatchSpeed = speed;
    if (this.liveMatchTimer) {
      this.startLiveMatchTimer();
    }
    // Keep the synthetic ET/penalty sequence in step with the chosen speed.
    if (this.syntheticTimer) {
      this.startSyntheticTimer();
    }
  }

  skipToEnd(): void {
    // If the synthetic ET/penalty sequence is mid-flight, jump it straight to
    // the end: reveal the final scoreline + all kicks, then show the result.
    if (this.syntheticPhase !== 'none') {
      this.stopSyntheticTimer();
      if (this.syntheticDecidedByPenalties) {
        if (this.syntheticPhase === 'extra-time') this.beginSyntheticShootout();
        this.penaltyKicks.forEach(k => {
          if (!k.revealed) {
            k.revealed = true;
            if (k.scored) { if (k.team === 'home') this.penaltyHomeScore++; else this.penaltyAwayScore++; }
          }
        });
      } else if (this.syntheticEtGoalMinute != null && this.syntheticMinute < this.syntheticEtGoalMinute) {
        // ET winner hadn't been shown yet — apply it now.
        if (this.syntheticWinnerIsHome) this.syntheticHomeScore++; else this.syntheticAwayScore++;
      }
      this.syntheticMinute = 120;
      this.finishSynthetic();
      return;
    }

    this.stopLiveMatchTimer();
    this.stopGoalAnimation();
    this.showGoalAnimation = false;
    this.goalAnimationData = null;
    this.goalAnimationPendingQueue = [];
    // Clear any in-flight shot-suspense so skipped events become visible.
    if (this.suspenseShotTimer) {
      clearTimeout(this.suspenseShotTimer);
      this.suspenseShotTimer = null;
    }
    this.suspenseShotHideMinute = null;

    // Interactive mode: engine is paused mid-match. Just jumping the FE index
    // would leave the BE session uncommitted; combined with the day-advance
    // safety net, the user would get stuck in a reopen loop. Force the engine
    // to full time, then commit, then reveal the full timeline.
    if (this.liveMatchInteractive && this.liveMatchData && !this.liveMatchData.finished && this.liveMatchKey) {
      const totalMinutes = 90
        + (this.liveMatchData.firstHalfStoppage || 0)
        + (this.liveMatchData.secondHalfStoppage || 0);
      this.liveAdvanceInFlight = true;
      this.http.post<any>(urlApp + `/match/live/${this.liveMatchKey}/advance?untilMinute=${totalMinutes}`, {})
        .subscribe({
          next: (state) => {
            this.liveAdvanceInFlight = false;
            if (state) {
              this.liveMatchData = state;
              this.liveCurrentIndex = (state.timeline?.length ?? 1) - 1;
            }
            // Commit only fires once the engine reports finished=true. With
            // untilMinute set to totalMinutes the BE always flips finished.
            if (this.liveMatchData?.finished && !this.liveMatchCommitted) {
              this.commitInteractiveLiveMatch();
            }
          },
          error: (err) => {
            this.liveAdvanceInFlight = false;
            console.error('Skip-to-end advance failed:', err);
            // Fallback: at least reveal what we already have.
            this.liveCurrentIndex = (this.liveMatchData?.timeline?.length ?? 1) - 1;
          }
        });
      return;
    }

    // Already finished but never committed (e.g., resumed-after-refresh case
    // where engine reached full time and the user hit Skip before the timer
    // had a chance to fire the commit). Fire it now so we don't get stuck.
    if (this.liveMatchInteractive
        && this.liveMatchData?.finished
        && !this.liveMatchCommitted
        && this.liveMatchKey) {
      this.commitInteractiveLiveMatch();
    }

    // Legacy (engine already ran sync) — timeline is complete, just jump.
    this.liveCurrentIndex = this.liveMatchData.timeline.length - 1;
  }

  // ---------- Substitution modal (Faza 3) ----------

  /** True when the user can open the substitution modal — match must be in
   *  progress (or still showing the modal) and they must have at least one
   *  sub left for their team. */
  get canMakeSubstitution(): boolean {
    if (!this.showLiveMatch || !this.liveMatchData) return false;
    if (this.liveMatchFinished) return false;
    return this.userSubsRemaining > 0;
  }

  /** Subs remaining for the user's team (home/away derived from `teamId`). */
  get userSubsRemaining(): number {
    if (!this.liveMatchData) return 0;
    return this.userIsHome
        ? (this.liveMatchData.homeSubsRemaining ?? 3)
        : (this.liveMatchData.awaySubsRemaining ?? 3);
  }

  /** True when the user manages the home team in this match. */
  get userIsHome(): boolean {
    return this.liveMatchData?.homeTeamId === this.teamService.teamId;
  }

  /** Players currently on the pitch for the user's team. */
  get userPitch(): any[] {
    if (!this.liveMatchData) return [];
    return (this.userIsHome ? this.liveMatchData.homePitch : this.liveMatchData.awayPitch) || [];
  }

  /** Players currently on the bench for the user's team. */
  get userBench(): any[] {
    if (!this.liveMatchData) return [];
    return (this.userIsHome ? this.liveMatchData.homeBench : this.liveMatchData.awayBench) || [];
  }

  openSubModal(): void {
    if (!this.canMakeSubstitution) return;
    this.subPlayerOutId = null;
    this.subPlayerInId = null;
    this.subError = null;
    this.showSubModal = true;
    this.stopLiveMatchTimer();
  }

  closeSubModal(): void {
    this.showSubModal = false;
    this.subPlayerOutId = null;
    this.subPlayerInId = null;
    this.subError = null;
    // Resume playback (only if match isn't finished — if it is, leave the
    // Continue button visible).
    if (this.showLiveMatch && !this.liveMatchFinished) {
      this.startLiveMatchTimer();
    }
  }

  selectSubOut(playerId: number): void {
    this.subPlayerOutId = playerId;
    this.subError = null;
  }

  selectSubIn(playerId: number): void {
    this.subPlayerInId = playerId;
    this.subError = null;
  }

  /** Position-aware highlight: bench players matching the same group as the
   *  selected outgoing player are recommended (defenders for defenders, etc.). */
  benchIsRecommended(playerIn: any): boolean {
    if (this.subPlayerOutId == null) return false;
    const out = this.userPitch.find((p: any) => p.playerId === this.subPlayerOutId);
    if (!out) return false;
    return this.positionGroupOf(out.position) === this.positionGroupOf(playerIn.position);
  }

  private positionGroupOf(pos: string): string {
    if (!pos) return '?';
    if (pos === 'GK') return 'GK';
    if (pos.startsWith('D')) return 'D';
    if (pos.startsWith('AM') || pos.startsWith('M')) return 'M';
    return 'A';
  }

  applySubstitution(): void {
    if (this.subSubmitting) return;
    if (!this.liveMatchKey || this.subPlayerOutId == null || this.subPlayerInId == null) {
      this.subError = 'Choose a player to come off and one to come on.';
      return;
    }
    this.subSubmitting = true;
    this.subError = null;
    const body = {
      playerOutId: this.subPlayerOutId,
      playerInId: this.subPlayerInId,
      atMinute: this.liveCurrentMinute?.minute ?? 0
    };
    this.http.post<any>(urlApp + `/match/live/${this.liveMatchKey}/substitute`, body).subscribe({
      next: (state) => {
        this.subSubmitting = false;
        // Full replace — keep liveMatchData in sync with the engine including
        // currentMinute, finished, score, timeline, pitch/bench, subs counter,
        // stamina snapshots. The new sub event is inserted into the timeline
        // chronologically by the backend; we move liveCurrentIndex to the end
        // so the next /advance tick targets the correct minute and the
        // commentary feed shows the sub.
        if (state) {
          this.liveMatchData = { ...this.liveMatchData, ...state };
          this.liveCurrentIndex = (state.timeline?.length ?? 1) - 1;
        }
        this.liveAdvanceInFlight = false;
        this.closeSubModal();
      },
      error: (err) => {
        this.subSubmitting = false;
        this.subError = err?.error?.error || 'Substitution failed.';
      }
    });
  }

  // ---------- /Substitution modal ----------

  closeLiveMatch(): void {
    this.stopLiveMatchTimer();
    this.resetSyntheticState();
    if (this.suspenseShotTimer) {
      clearTimeout(this.suspenseShotTimer);
      this.suspenseShotTimer = null;
    }
    this.suspenseShotHideMinute = null;
    this.showLiveMatch = false;
    this.liveMatchData = null;
    this.liveMatchKey = null;
    this.liveKnockoutResultText = null;
    try {
      localStorage.removeItem('fm_liveMatchKey');
      localStorage.removeItem('fm_liveMatchInteractive');
    } catch { /* ignored */ }

    // If the backend scheduled a post-match press conference, open it now —
    // day-advance stays blocked until the user responds. Otherwise fall back
    // to the standard match-result → auto-continue flow.
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

  get liveCurrentMinute(): any {
    if (!this.liveMatchData?.timeline) return null;
    return this.liveMatchData.timeline[this.liveCurrentIndex];
  }

  get liveVisibleEvents(): any[] {
    if (!this.liveMatchData?.timeline) return [];
    // While ANY shot animation is in flight (GOAL / SAVE / MISS), hide the
    // matching commentary entry from the feed. Same anti-spoiler reasoning
    // as holding the scoreboard at the pre-goal score: revealing the text
    // mid-animation telegraphs the outcome. As soon as the animation closes
    // (user clicks Continue), the entry reappears.
    //
    // Previously this only hid `goal` events — save/miss animations in
    // KEY_MOMENTS mode would still leak their text into the feed while the
    // modal was playing. We now hide the matching shot type for whichever
    // outcome the animation is showing.
    const animMinute = this.showGoalAnimation ? this.goalAnimationData?.minute : null;
    const animOutcome = this.showGoalAnimation ? this.goalAnimationData?.outcome : null;
    // Anti-spoiler for non-animated shots: while applyShotSuspense is running,
    // hide the shot line so the user doesn't see it appear instantly (which
    // would imply "no goal coming" before any animation could fire).
    const hideShotAtMinute = this.suspenseShotHideMinute;
    return this.liveMatchData.timeline
      .slice(0, this.liveCurrentIndex + 1)
      .filter((m: any) => {
        if (!m.eventType || m.eventType === 'none') return false;
        // Hide the commentary line whose event type matches the in-flight
        // animation outcome at the same minute.
        if (animMinute != null && m.minute === animMinute) {
          if (animOutcome === 'GOAL' && m.eventType === 'goal') return false;
          if (animOutcome === 'SAVE' && m.eventType === 'shot_saved') return false;
          if (animOutcome === 'MISS' && m.eventType === 'shot_wide') return false;
        }
        if (hideShotAtMinute != null
            && m.minute === hideShotAtMinute
            && (m.eventType === 'shot_saved' || m.eventType === 'shot_wide' || m.eventType === 'shot_blocked')) {
          return false;
        }
        // When we're showing the synthetic ET/penalty sequence, the backend's
        // appended minute-120 winner goal is represented by our own overlay
        // instead — keep the main feed at the 90' state.
        if (this.syntheticUsed && (m.minute ?? 0) > 95) return false;
        return true;
      })
      .reverse();
  }

  get liveMatchFinished(): boolean {
    if (!this.liveMatchData) return false;
    // When the engine carries a `finished` flag (Session 4 interactive + new
    // legacy sessions), trust it. Falls back to the index-based check for
    // any cached data that predates the field.
    if (typeof this.liveMatchData.finished === 'boolean') {
      return !!this.liveMatchData.finished;
    }
    if (!this.liveMatchData.timeline) return false;
    return this.liveCurrentIndex >= this.liveMatchData.timeline.length - 1;
  }

  // Scoreboard display — while a GOAL animation is playing, hold the
  // scoreboard at the PRE-goal score so the player sees the score change at
  // the dramatic moment (instead of seeing "1-0" already while the animation
  // is mid-flight). For non-goal animations (save/miss) or no animation,
  // the latest timeline entry's score is used.
  get displayedHomeScore(): number {
    const cur = this.liveCurrentMinute?.homeScore ?? 0;
    if (!this.showGoalAnimation) return cur;
    if (this.goalAnimationData?.outcome !== 'GOAL') return cur;
    const prev = this.scoreBeforeCurrentGoal();
    return prev ? prev.home : cur;
  }
  get displayedAwayScore(): number {
    const cur = this.liveCurrentMinute?.awayScore ?? 0;
    if (!this.showGoalAnimation) return cur;
    if (this.goalAnimationData?.outcome !== 'GOAL') return cur;
    const prev = this.scoreBeforeCurrentGoal();
    return prev ? prev.away : cur;
  }

  // Scoreboard bindings — once a synthetic ET/penalty sequence has started, the
  // board reflects the fabricated scoreline (the backend's bumped minute-120
  // goal is intentionally not shown for penalty wins, which stay level).
  get scoreboardHomeScore(): number {
    return this.syntheticUsed ? this.syntheticHomeScore : this.displayedHomeScore;
  }
  get scoreboardAwayScore(): number {
    return this.syntheticUsed ? this.syntheticAwayScore : this.displayedAwayScore;
  }
  get scoreboardMinuteLabel(): string {
    if (this.syntheticPhase === 'penalties') return 'PENS';
    if (this.syntheticPhase === 'extra-time') return `${this.syntheticMinute}'`;
    return this.formatMatchMinute(this.liveCurrentMinute?.minute ?? 0, this.liveMatchData?.firstHalfStoppage);
  }

  /** True once a synthetic ET/penalty sequence has begun (drives the overlay). */
  get showSyntheticOverlay(): boolean {
    return this.syntheticUsed;
  }

  /** The result text + Continue button only appear after any synthetic sequence
   *  has finished playing. */
  get showKnockoutReveal(): boolean {
    return this.liveMatchFinished && this.syntheticPhase === 'none';
  }

  /** Find the score state right before the currently-animated goal event by
   *  walking back from the latest timeline entry until we hit something with
   *  a smaller score (or run out of entries). */
  private scoreBeforeCurrentGoal(): { home: number; away: number } | null {
    const timeline = this.liveMatchData?.timeline;
    if (!timeline || timeline.length === 0) return null;
    const targetHome = this.liveCurrentMinute?.homeScore ?? 0;
    const targetAway = this.liveCurrentMinute?.awayScore ?? 0;
    for (let i = this.liveCurrentIndex - 1; i >= 0; i--) {
      const e = timeline[i];
      if (e.homeScore < targetHome || e.awayScore < targetAway) {
        return { home: e.homeScore, away: e.awayScore };
      }
    }
    return { home: 0, away: 0 };
  }

  // Key events extracted from the timeline for the end-of-match "Match
  // Events" panel — goals, cards, subs. Penalty/free-kick non-goals are
  // included ONLY if the engine generated an animation for them (i.e. the
  // user actually saw the visual), so the panel never advertises a phase
  // that wasn't broadcast.
  get keyMatchEvents(): any[] {
    const timeline = this.liveMatchData?.timeline;
    if (!timeline) return [];
    const animations = this.liveMatchData?.goalAnimations || {};
    const out: any[] = [];
    for (const e of timeline) {
      // The backend's appended minute-120 winner goal is shown via the synthetic
      // ET/penalty overlay instead — exclude it from this regulation-time panel.
      if (this.syntheticUsed && (e.minute ?? 0) > 95) continue;
      const t = e.eventType;
      if (t === 'goal' || t === 'yellow_card' || t === 'red_card' || t === 'substitution') {
        out.push(e);
      } else if (t === 'shot_wide' || t === 'shot_saved') {
        const c = (e.commentary || '').toUpperCase();
        const isPenOrFk = c.startsWith('PENALTY ') || c.startsWith('FREE KICK ');
        if (isPenOrFk && animations[e.minute]) out.push(e);
      }
    }
    return out;
  }

  keyEventIcon(eventType: string, commentary: string): string {
    const c = (commentary || '').toUpperCase();
    if (eventType === 'goal') return c.startsWith('PENALTY') ? '⚽' : c.startsWith('FREE KICK') ? '⚽' : '⚽';
    if (eventType === 'yellow_card') return '🟨';
    if (eventType === 'red_card') return '🟥';
    if (eventType === 'substitution') return '🔄';
    if (eventType === 'shot_wide' || eventType === 'shot_saved') return '❌';
    return '•';
  }

  // Returns the most recent stamina snapshot whose minute is <= the current
  // playback minute. Snapshots are emitted every 5 minutes by the backend.
  get currentStaminaSnapshot(): any {
    const snaps = this.liveMatchData?.staminaSnapshots;
    if (!snaps || snaps.length === 0) return null;
    const minute = this.liveCurrentMinute?.minute ?? 0;
    let chosen: any = snaps[0];
    for (const s of snaps) {
      if (s.minute <= minute) chosen = s;
      else break;
    }
    return chosen;
  }

  // CSS class for the stamina-bar fill based on the 0-100 value.
  staminaTier(stamina: number): string {
    if (stamina == null) return 'low';
    if (stamina >= 70) return 'high';
    if (stamina >= 40) return 'mid';
    return 'low';
  }

  getLiveEventIcon(eventType: string): string {
    switch (eventType) {
      case 'goal': return '\u26BD';
      case 'yellow_card': return '\uD83D\uDFE8';
      case 'red_card': return '\uD83D\uDD34';
      case 'substitution': return '\uD83D\uDD04';
      case 'chance': return '\uD83C\uDFAF';
      case 'save': return '\uD83E\uDDE4';
      case 'half_time': return '\u23F8\uFE0F';
      case 'full_time': return '\uD83C\uDFC1';
      case 'kickoff': return '\uD83D\uDCE2';
      default: return '\u2022';
    }
  }

  ngAfterViewChecked(): void {
    if (this.showGoalAnimation && this.goalCanvas && !this.goalAnimationCanvasReady) {
      this.goalAnimationCanvasReady = true;
      this.startGoalAnimationPlayback();
    }
  }

  // ==========================================
  // GOAL ANIMATION
  // ==========================================

  checkGoalAnimation(minute: number): boolean {
    if (!this.liveMatchData?.goalAnimations) return false;
    return !!this.liveMatchData.goalAnimations[minute];
  }

  playGoalAnimation(minute: number): void {
    const animation = this.liveMatchData?.goalAnimations?.[minute];
    if (!animation) return;
    if (!this.shouldPlayAnimation(animation.outcome)) return;

    this.stopLiveMatchTimer();
    this.goalAnimationData = animation;
    this.goalAnimationFrameIndex = 0;
    this.goalAnimationFinished = false;
    this.goalAnimationEventText = '';
    this.goalAnimationCanvasReady = false;
    this.goalAnimationBallTrail = [];
    this.goalConfetti = [];
    this.showGoalAnimation = true;
  }

  /** Tear down the preview. Either fired by user input or by the auto-dismiss
   *  timer; starting the live match timer is handled inside fetchLiveMatch. */
  dismissLineupPreview(): void {
    if (this.lineupPreviewTimer) { clearTimeout(this.lineupPreviewTimer); this.lineupPreviewTimer = null; }
    if (!this.showLineupPreview) return;
    this.showLineupPreview = false;
    // If we were holding back the live match timer until the preview was over,
    // resume it now. Idempotent — startLiveMatchTimer first stops any existing.
    if (this.liveMatchData && this.showLiveMatch) {
      this.startLiveMatchTimer();
    }
  }

  /**
   * Layout the 11 players of a side onto a 4-row formation grid (GK / DEF / MID
   * / ATK). Reads from the dedicated lineupPreviewData (built at match start
   * from the first available animation's roster) so the preview is independent
   * of any per-phase animation state.
   */
  lineupRows(teamId: number): { row: string; players: any[] }[] {
    const players = (this.lineupPreviewData?.players || []).filter((p: any) => p.teamId === teamId);
    const gk: any[] = [], def: any[] = [], mid: any[] = [], atk: any[] = [];
    for (const p of players) {
      const pos = (p.position || 'MC').toUpperCase();
      if (pos === 'GK') gk.push(p);
      else if (pos === 'DL' || pos === 'DC' || pos === 'DR') def.push(p);
      else if (pos === 'AML' || pos === 'AMC' || pos === 'AMR' || pos === 'ST') atk.push(p);
      else mid.push(p);
    }
    // Order from GK to ATK. For the home half (default `column`) this renders
    // GK at the top (back of the pitch) and ATK at the bottom (touching the
    // centre line). The away half uses `column-reverse` so its ATK is at the
    // top — both teams' attackers meet at the centre as on a real pitch.
    return [
      { row: 'GK',  players: gk },
      { row: 'DEF', players: def },
      { row: 'MID', players: mid },
      { row: 'ATK', players: atk }
    ];
  }

  /** "4-4-2" style formation label, derived from how the 11 players bin. */
  formationOf(teamId: number): string {
    const rows = this.lineupRows(teamId);
    const def = rows.find(r => r.row === 'DEF')?.players.length ?? 0;
    const mid = rows.find(r => r.row === 'MID')?.players.length ?? 0;
    const atk = rows.find(r => r.row === 'ATK')?.players.length ?? 0;
    if (def + mid + atk === 0) return '';
    return `${def}-${mid}-${atk}`;
  }

  /** Hide the "0" placeholder when no shirt number has been assigned yet. */
  shirtLabel(p: any): string {
    const n = p?.shirtNumber;
    return n && n > 0 ? String(n) : '';
  }

  /**
   * Map a player onto a 5-column row position based on their role within the
   * row. Returns the CSS `grid-column` value (1-5). Spreads symmetrically:
   *   1 player  → col 3 (centre)
   *   2 players → cols 2, 4
   *   3 players → cols 2, 3, 4
   *   4 players → cols 1, 2, 4, 5 (gap in centre, like a flat back four)
   *   5 players → cols 1, 2, 3, 4, 5
   */
  lineupColumn(rowCount: number, indexInRow: number): number {
    if (rowCount <= 0) return 3;
    if (rowCount === 1) return 3;
    if (rowCount === 2) return indexInRow === 0 ? 2 : 4;
    if (rowCount === 3) return 2 + indexInRow;
    if (rowCount === 4) return [1, 2, 4, 5][indexInRow] || 3;
    return Math.min(5, indexInRow + 1);
  }

  /** Surname-only display, matching the in-match labelling. */
  surnameOf(player: any): string {
    return (player?.name || '').split(' ').pop() || '';
  }

  /**
   * Format the live-match minute, taking first-half stoppage into account.
   * The raw minute is the loop counter from the backend (e.g. 47 for a goal
   * scored two minutes into first-half stoppage). With firstHalfStoppage=3:
   *   1-45  → "X'"            (regular first half)
   *   46-48 → "45+1'"…"45+3'" (first-half stoppage)
   *   49-93 → "X'"            (second half, X = min - 3)
   *   94+   → "90+X'"         (second-half stoppage)
   */
  formatMatchMinute(rawMinute: number, firstHalfStoppage: number | undefined | null): string {
    const m = rawMinute || 0;
    const fhs = Math.max(0, firstHalfStoppage || 0);
    if (m <= 45) return `${m}'`;
    if (m <= 45 + fhs) return `45+${m - 45}'`;
    const secondHalfMin = m - fhs;
    if (secondHalfMin <= 90) return `${secondHalfMin}'`;
    return `90+${secondHalfMin - 90}'`;
  }

  /**
   * Locate any animation in the match (preferring earliest minute) and use its
   * roster + kits to seed the lineup preview. All animations of a match share
   * the same starting eleven, so the choice doesn't matter for the lineup view.
   */
  private buildLineupFromMatch(data: any): any {
    if (!data) return null;

    // Path A: legacy mode — engine has already produced animations with kit
    // colours embedded. Use the first animation's roster.
    const animations = data.goalAnimations || {};
    const animMinutes = Object.keys(animations).map(k => Number(k)).sort((a, b) => a - b);
    if (animMinutes.length > 0) {
      const first = animations[animMinutes[0]];
      if (first?.players?.length) {
        const scorerIsHome = first.scoringTeamId === data.homeTeamId;
        const homeKit = scorerIsHome ? first.scoringTeamKit : first.defendingTeamKit;
        const awayKit = scorerIsHome ? first.defendingTeamKit : first.scoringTeamKit;
        return {
          homeTeamId: data.homeTeamId,
          awayTeamId: data.awayTeamId,
          homeTeamName: data.homeTeamName,
          awayTeamName: data.awayTeamName,
          players: first.players,
          homeKit,
          awayKit
        };
      }
    }

    // Path B: interactive mode (Faza 3 Sesiunea 4) — engine hasn't ticked
    // yet, so no animations exist. Use the initial pitch state (the starting
    // XI flagged by the engine) and let the template fall back to default
    // kit colours.
    const home = (data.homePitch || []).map((p: any) => ({ ...p, teamId: data.homeTeamId }));
    const away = (data.awayPitch || []).map((p: any) => ({ ...p, teamId: data.awayTeamId }));
    if (home.length === 0 && away.length === 0) return null;
    return {
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      homeTeamName: data.homeTeamName,
      awayTeamName: data.awayTeamName,
      players: [...home, ...away],
      homeKit: null,
      awayKit: null
    };
  }

  /**
   * Read the cached match-highlights setting and decide if the given outcome
   * should produce a 2D animation. Falls back to GOALS_ONLY for users who
   * haven't visited the Staff page yet (so the setting hasn't been pulled).
   */
  private shouldPlayAnimation(outcome: string | undefined): boolean {
    const level = (localStorage.getItem('fm_matchHighlightsLevel') as
        'NONE' | 'GOALS_ONLY' | 'KEY_MOMENTS' | null) || 'GOALS_ONLY';
    if (level === 'NONE') return false;
    if (level === 'GOALS_ONLY') return outcome === 'GOAL';
    return outcome === 'GOAL' || outcome === 'SAVE' || outcome === 'MISS';
  }

  private startGoalAnimationPlayback(): void {
    if (this.goalAnimationTimer) clearInterval(this.goalAnimationTimer);

    this.goalAnimationTimer = setInterval(() => {
      if (!this.goalAnimationData) { this.stopGoalAnimation(); return; }

      const totalFrames = this.goalAnimationData.totalFrames || 150;
      if (this.goalAnimationFrameIndex > totalFrames) {
        this.goalAnimationFinished = true;
        clearInterval(this.goalAnimationTimer);
        this.goalAnimationTimer = null;
        return;
      }

      this.renderGoalFrame();

      // Check for events at this frame
      const evt = (this.goalAnimationData.events || []).find((e: any) => e.frame === this.goalAnimationFrameIndex);
      if (evt) {
        this.showGoalEventText(evt.type);
        // Emit confetti at the moment of the GOAL event — only when the
        // animation's actual outcome is GOAL (not SAVE/MISS, even though
        // those use the same event type list in places).
        if (evt.type === 'GOAL' && this.goalAnimationData?.outcome === 'GOAL') {
          this.spawnGoalConfetti();
        }
      }

      this.goalAnimationFrameIndex++;
    }, 33); // ~30fps
  }

  private renderGoalFrame(): void {
    const canvas = this.goalCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const frame = this.goalAnimationData.frames?.[this.goalAnimationFrameIndex];
    if (!frame) return;

    // Clear and draw pitch
    this.drawPitch(ctx, w, h);

    // Draw players
    const players = this.goalAnimationData.players || [];
    // Kits arrive on the data; fall back to the legacy blue/red split if missing
    // (older save files / animations generated before kit support was added).
    const scoringKit = this.goalAnimationData.scoringTeamKit || {
      outfieldPrimary: '#3498db', outfieldBorder: '#2980b9',
      gkPrimary: '#fde047', gkBorder: '#ca8a04'
    };
    const defendingKit = this.goalAnimationData.defendingTeamKit || {
      outfieldPrimary: '#e74c3c', outfieldBorder: '#c0392b',
      gkPrimary: '#22d3ee', gkBorder: '#0e7490'
    };
    const scoringTeamId = this.goalAnimationData.scoringTeamId;

    // Pre-pass: figure out which name labels to suppress so the pitch doesn't
    // turn into a wall of overlapping text. World coords are 0-100; two players
    // within 5 X-units AND 3 Y-units are considered colliding. Ball carrier
    // always wins; otherwise the player with the lower index keeps the label.
    const suppress = new Set<number>();
    for (let i = 0; i < players.length; i++) {
      if (suppress.has(i)) continue;
      const posI = frame.positions?.[i];
      if (!posI) continue;
      const isCarrierI = players[i].playerId === frame.ballCarrierId;
      for (let j = i + 1; j < players.length; j++) {
        if (suppress.has(j)) continue;
        const posJ = frame.positions?.[j];
        if (!posJ) continue;
        if (Math.abs(posI[0] - posJ[0]) < 5 && Math.abs(posI[1] - posJ[1]) < 3) {
          const isCarrierJ = players[j].playerId === frame.ballCarrierId;
          if (isCarrierI) suppress.add(j);
          else if (isCarrierJ) suppress.add(i);
          else suppress.add(j);
        }
      }
    }

    players.forEach((player: any, i: number) => {
      const pos = frame.positions?.[i];
      if (!pos) return;
      const px = (pos[0] / 100) * w;
      const py = (pos[1] / 100) * h;
      const isScorer = player.playerId === this.goalAnimationData.scorerPlayerId;
      const isBallCarrier = player.playerId === frame.ballCarrierId;
      const isGK = player.position === 'GK';
      const isScoringTeam = player.teamId === scoringTeamId;

      // Player circle
      const radius = 8;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);

      const teamKit = isScoringTeam ? scoringKit : defendingKit;
      if (isGK) {
        ctx.fillStyle = teamKit.gkPrimary;
        ctx.strokeStyle = teamKit.gkBorder;
      } else {
        ctx.fillStyle = teamKit.outfieldPrimary;
        ctx.strokeStyle = teamKit.outfieldBorder;
      }

      if (isBallCarrier) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
      }

      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Vertical stripe in the team's secondary colour — gives the circles a
      // shirt-like feel and helps tell two same-family teams apart when the
      // primary colours happen to be close (e.g. light vs darker blue).
      // Skipped for GKs and ball carrier (their highlight already stands out).
      const secondary = isGK
        ? null
        : (teamKit.outfieldSecondary || teamKit.outfieldBorder);
      if (secondary && !isBallCarrier) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = secondary;
        ctx.fillRect(px - 2, py - radius, 4, radius * 2);
        ctx.restore();
      }

      // Shirt number — pick black/white based on fill brightness so the
      // number stays legible on yellow/white kits.
      ctx.fillStyle = this.numberColorFor(ctx.fillStyle as string);
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.shirtNumber || ''), px, py);

      // Name label — drawn for every player unless suppressed by the collision
      // pre-pass. Style depends on role this frame:
      //   - scorer in the result-reveal window (frame ≥ 130): big bold yellow with glow
      //   - ball carrier: yellow + light glow, drops back to normal once they pass
      //   - everyone else: small semi-transparent white
      // The label is placed just above the circle.
      if (!suppress.has(i)) {
        const surname = (player.name || '').split(' ').pop();
        if (surname) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const isScorerLate = isScorer && this.goalAnimationFrameIndex >= 130;
          if (isScorerLate) {
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#f1c40f';
            ctx.shadowColor = '#f1c40f';
            ctx.shadowBlur = 5;
          } else if (isBallCarrier) {
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#fde047';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 3;
          } else {
            ctx.font = '7px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          }
          ctx.fillText(surname, px, py - 13);
          ctx.restore();
        }
      }
    });

    // Ball position + trail
    const bx = (frame.ballX / 100) * w;
    const by = (frame.ballY / 100) * h;
    // Push current ball into trail buffer (max 6 entries; oldest drops off).
    this.goalAnimationBallTrail.push({ x: bx, y: by });
    if (this.goalAnimationBallTrail.length > 6) this.goalAnimationBallTrail.shift();
    // Draw trail dots oldest → newest, fading alpha + shrinking size so the
    // newest position blends seamlessly into the actual ball drawn next.
    for (let i = 0; i < this.goalAnimationBallTrail.length - 1; i++) {
      const t = this.goalAnimationBallTrail[i];
      const ageFactor = (i + 1) / this.goalAnimationBallTrail.length;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3 * ageFactor, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + ageFactor * 0.25})`;
      ctx.fill();
    }

    // Draw ball
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw pass/shot lines for recent events
    const recentEvents = (this.goalAnimationData.events || []).filter(
      (e: any) => e.frame >= this.goalAnimationFrameIndex - 8 && e.frame <= this.goalAnimationFrameIndex
    );
    for (const evt of recentEvents) {
      if (evt.type === 'PASS' || evt.type === 'SHOT') {
        const fromPlayer = players.findIndex((p: any) => p.playerId === evt.fromPlayerId);
        const toPlayer = players.findIndex((p: any) => p.playerId === evt.toPlayerId);

        if (evt.type === 'SHOT') {
          // Line from shooter to goal
          const fromPos = fromPlayer >= 0 ? frame.positions[fromPlayer] : null;
          if (fromPos) {
            const fx = (fromPos[0] / 100) * w;
            const fy = (fromPos[1] / 100) * h;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            // Determine which goal the scoring team attacks
            const har = this.goalAnimationData.homeAttacksRight;
            const scorerIsHome = this.goalAnimationData.scoringTeamId === this.goalAnimationData.homeTeamId;
            const attacksRight = (scorerIsHome && har) || (!scorerIsHome && !har);
            ctx.lineTo(attacksRight ? w - 8 : 8, h / 2);
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (fromPlayer >= 0 && toPlayer >= 0) {
          const fp = frame.positions[fromPlayer];
          const tp = frame.positions[toPlayer];
          if (fp && tp) {
            ctx.beginPath();
            ctx.moveTo((fp[0] / 100) * w, (fp[1] / 100) * h);
            ctx.lineTo((tp[0] / 100) * w, (tp[1] / 100) * h);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }

    // Draw event text overlay
    if (this.goalAnimationEventText) {
      ctx.save();
      const evtText = this.goalAnimationEventText;
      const isBigEvent = evtText === 'GOAL!' || evtText === 'SAVED!' || evtText === 'MISSED!';
      ctx.font = isBigEvent ? 'bold 36px sans-serif' : 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (evtText === 'GOAL!') {
        ctx.fillStyle = '#f1c40f';
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 20;
      } else if (evtText === 'SAVED!') {
        ctx.fillStyle = '#e74c3c';
        ctx.shadowColor = '#e74c3c';
        ctx.shadowBlur = 16;
      } else if (evtText === 'MISSED!') {
        ctx.fillStyle = '#95a5a6';
        ctx.shadowColor = '#95a5a6';
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
      }
      ctx.fillText(evtText, w / 2, h / 2 - 20);
      ctx.restore();
    }

    // Confetti is the topmost layer so it sits in front of player circles
    // and the event text — pure cosmetic burst on GOAL outcomes.
    this.renderGoalConfetti(ctx, h);
  }

  /**
   * Decide whether the shirt number should render in black or white on top of
   * the given fill color. Uses a CSS color name lookup for the common cases
   * (which is what the team data uses), then falls back to hex luminance.
   * Light backgrounds (white/yellow) get black numbers; dark ones get white.
   */
  private numberColorFor(fill: string): string {
    if (!fill) return '#fff';
    const f = fill.toLowerCase().trim();
    // Known named colors that are light enough to need black text.
    const lightNames = new Set([
      'white', 'yellow', 'gold', 'lightyellow', 'beige', 'ivory',
      'lightblue', 'lightgreen', 'lightgrey', 'lightgray',
      'silver', 'pink', 'lila', 'cyan', 'aqua', 'lavender'
    ]);
    if (lightNames.has(f)) return '#000';
    // Hex form: compute relative luminance.
    if (f.startsWith('#') && (f.length === 7 || f.length === 4)) {
      const hex = f.length === 4
        ? '#' + f[1] + f[1] + f[2] + f[2] + f[3] + f[3]
        : f;
      const r = parseInt(hex.substring(1, 3), 16);
      const g = parseInt(hex.substring(3, 5), 16);
      const b = parseInt(hex.substring(5, 7), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return lum > 0.6 ? '#000' : '#fff';
    }
    return '#fff';
  }

  /**
   * Emit ~60 confetti particles fanning out from the goal mouth on the team's
   * kit colours. Velocities are seeded so each gets a small horizontal drift
   * and an upward burst; gravity pulls them down each frame in renderGoalFrame.
   * Called once when the GOAL event fires; the array is reset on next animation.
   */
  /**
   * Restart the current animation from frame 0 without closing the modal.
   * Clears trail/confetti so the replay looks clean and re-starts the playback
   * timer (which was already stopped when the animation hit the final frame).
   */
  replayGoalAnimation(): void {
    if (!this.goalAnimationData) return;
    this.goalAnimationFrameIndex = 0;
    this.goalAnimationFinished = false;
    this.goalAnimationEventText = '';
    this.goalAnimationBallTrail = [];
    this.goalConfetti = [];
    this.startGoalAnimationPlayback();
  }

  spawnGoalConfetti(): void {
    if (!this.goalCanvas?.nativeElement) return;
    const w = this.goalCanvas.nativeElement.width;
    const h = this.goalCanvas.nativeElement.height;
    const kit = this.goalAnimationData?.scoringTeamKit || {};
    const palette: string[] = [
      kit.outfieldPrimary || '#f0c040',
      kit.outfieldSecondary || '#fff',
      kit.outfieldBorder || '#000',
      '#f1c40f', '#fff', '#fef3c7'
    ];
    // Burst origin: just outside the attacking goal (right side after mirror
    // resolution — easier to just centre at right edge / mid height).
    const har = this.goalAnimationData?.homeAttacksRight;
    const scorerIsHome = this.goalAnimationData?.scoringTeamId === this.goalAnimationData?.homeTeamId;
    const attacksRight = (scorerIsHome && har) || (!scorerIsHome && !har);
    const ox = attacksRight ? w - 12 : 12;
    const oy = h / 2;

    this.goalConfetti = [];
    for (let i = 0; i < 60; i++) {
      const angle = (Math.random() - 0.5) * Math.PI;   // -90..+90 from horizontal
      const speed = 3 + Math.random() * 4;
      this.goalConfetti.push({
        x: ox + (Math.random() - 0.5) * 10,
        y: oy + (Math.random() - 0.5) * 30,
        vx: (attacksRight ? -1 : 1) * Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,                 // bias upward
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 2 + Math.random() * 3
      });
    }
  }

  /** Tick + render the confetti. Called from renderGoalFrame once each frame. */
  private renderGoalConfetti(ctx: CanvasRenderingContext2D, h: number): void {
    if (this.goalConfetti.length === 0) return;
    for (const c of this.goalConfetti) {
      // Gravity + drag.
      c.vy += 0.18;
      c.vx *= 0.985;
      c.x += c.vx;
      c.y += c.vy;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.size, c.size);
    }
    // Cull anything that's fallen off-screen to keep the array bounded.
    this.goalConfetti = this.goalConfetti.filter(c => c.y < h + 20);
  }

  private drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Background
    ctx.fillStyle = '#1a6b2a';
    ctx.fillRect(0, 0, w, h);

    // Pitch stripes
    const stripeCount = 10;
    const stripeW = w / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(i * stripeW, 0, stripeW, h);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;

    // Outer boundary
    const pad = 8;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    // Center line
    ctx.beginPath();
    ctx.moveTo(w / 2, pad);
    ctx.lineTo(w / 2, h - pad);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 30, 0, Math.PI * 2);
    ctx.stroke();

    // Left penalty area
    const penW = w * 0.15;
    const penH = h * 0.45;
    ctx.strokeRect(pad, (h - penH) / 2, penW, penH);

    // Right penalty area
    ctx.strokeRect(w - pad - penW, (h - penH) / 2, penW, penH);

    // Left 6-yard box
    const sixW = w * 0.06;
    const sixH = h * 0.2;
    ctx.strokeRect(pad, (h - sixH) / 2, sixW, sixH);

    // Right 6-yard box
    ctx.strokeRect(w - pad - sixW, (h - sixH) / 2, sixW, sixH);

    // Goals
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const goalH = h * 0.12;
    ctx.fillRect(0, (h - goalH) / 2, pad, goalH);
    ctx.fillRect(w - pad, (h - goalH) / 2, pad, goalH);
  }

  private showGoalEventText(type: string): void {
    const labels: { [key: string]: string } = {
      'PASS': 'PASS',
      'SHOT': 'SHOT!',
      'GOAL': 'GOAL!',
      'SAVE': 'SAVED!',
      'MISS': 'MISSED!'
    };
    this.goalAnimationEventText = labels[type] || type;

    if (this.goalAnimationEventTimer) clearTimeout(this.goalAnimationEventTimer);
    const duration = (type === 'GOAL' || type === 'SAVE' || type === 'MISS') ? 2000 : 600;
    this.goalAnimationEventTimer = setTimeout(() => {
      this.goalAnimationEventText = '';
    }, duration);
  }

  closeGoalAnimation(): void {
    this.stopGoalAnimation();
    this.showGoalAnimation = false;
    this.goalAnimationData = null;
    this.goalAnimationFinished = false;
    this.goalAnimationEventText = '';
    this.goalAnimationCanvasReady = false;

    // Check if there are more queued goal animations
    if (this.goalAnimationPendingQueue.length > 0) {
      const nextMinute = this.goalAnimationPendingQueue.shift()!;
      setTimeout(() => this.playGoalAnimation(nextMinute), 300);
    } else {
      // Resume live match timer
      this.startLiveMatchTimer();
    }
  }

  skipGoalAnimation(): void {
    this.stopGoalAnimation();
    this.goalAnimationFinished = true;
    // Render the last frame
    if (this.goalAnimationData) {
      this.goalAnimationFrameIndex = this.goalAnimationData.totalFrames || 150;
      const outcome = this.goalAnimationData.outcome;
      this.goalAnimationEventText = outcome === 'SAVE' ? 'SAVED!' : outcome === 'MISS' ? 'MISSED!' : 'GOAL!';
      this.renderGoalFrame();
    }
  }

  skipEntireMatchFromAnimation(): void {
    this.stopGoalAnimation();
    this.goalAnimationPendingQueue = [];
    this.showGoalAnimation = false;
    this.goalAnimationData = null;
    this.goalAnimationFinished = false;
    this.goalAnimationEventText = '';
    this.goalAnimationCanvasReady = false;
    this.skipToEnd();
  }

  private stopGoalAnimation(): void {
    if (this.goalAnimationTimer) {
      clearInterval(this.goalAnimationTimer);
      this.goalAnimationTimer = null;
    }
    if (this.goalAnimationEventTimer) {
      clearTimeout(this.goalAnimationEventTimer);
      this.goalAnimationEventTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearAutoAdvanceTimer();
    this.clearFastForwardPoll();
    this.stopSimulationUx();
    this.stopLiveMatchTimer();
    this.stopGoalAnimation();
    if (this.lineupPreviewTimer) clearTimeout(this.lineupPreviewTimer);
    if (this.loadGameRedirectTimer) clearTimeout(this.loadGameRedirectTimer);
  }
}
