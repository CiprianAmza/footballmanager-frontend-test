import {
  Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy,
  Output, SimpleChanges, ViewChild
} from '@angular/core';
import { TeamService } from '../services/team.service';
import { LiveMatchService } from '../services/live-match.service';
import {
  GoalAnimationData, KitColors, LineupPreviewData, LiveMatchClosed, LiveMatchData,
  LiveMatchMinute, PitchClip, PitchFrame, PlayerStaminaInfo, StaminaSnapshot
} from '../models/live-match.model';
import {
  goalAnimationToFrames, kitColor, kitsFromAnimation, MatchPitchComponent, PitchMarker
} from './match-pitch.component';
import { PitchStyle, readPitchStyle, writePitchStyle } from './pitch-projection';
import { PitchDetail, readPitchDetail, writePitchDetail } from './player-sprites';
import { PlaybackClock } from './playback-clock';
import {
  AMBIENT_TRANSITION_MS, AmbientState, ambientFrame, blendFrames, buildTeamSlots,
  emptyAmbientState, neutralPhase, phaseFor, samePhase
} from './ambient-synthesizer';

export type MatchViewMode = 'TEXT' | 'PITCH_2D';

/** Default kits, used until the backend tells us the real ones. */
const DEFAULT_HOME_KIT: KitColors = {
  outfieldPrimary: '#3498db', outfieldBorder: '#2980b9',
  gkPrimary: '#fde047', gkBorder: '#ca8a04'
};
const DEFAULT_AWAY_KIT: KitColors = {
  outfieldPrimary: '#e74c3c', outfieldBorder: '#c0392b',
  gkPrimary: '#22d3ee', gkBorder: '#0e7490'
};

/** Icons shown briefly on the pitch when one of these events lands. */
const MARKER_ICONS: { [eventType: string]: string } = {
  corner: '🚩',
  foul: '✋',
  offside: '🚫',
  yellow_card: '🟨',
  red_card: '🟥'
};
const MARKER_LIFETIME_MS = 2000;

/** How long the pitch takes to slide from ambient into a clip and back. */
const SPLICE_MS = 500;

/**
 * The live-match viewer: scoreboard, commentary feed, squad/stat panels,
 * substitutions, goal clips, the pre-kickoff lineup preview and the cosmetic
 * extra-time / shootout sequence.
 *
 * Extracted verbatim from `AppComponent` — behaviour is intentionally
 * unchanged. The parent only decides *when* a live match exists; everything
 * inside the match belongs here.
 */
@Component({
  selector: 'app-live-match',
  templateUrl: './live-match.component.html',
  styleUrls: ['./live-match.component.css']
})
export class LiveMatchComponent implements OnChanges, OnDestroy {

  /** Session key of the match to play. */
  @Input() matchKey: string | null = null;
  /** True when the engine has NOT advanced yet and we drive it via /advance. */
  @Input() interactive = false;
  /** True while an app-shell overlay (tutorial) owns the keyboard. */
  @Input() shortcutsSuspended = false;

  /** The backend has no playable session for this key. */
  @Output() unavailable = new EventEmitter<void>();
  /** The user dismissed the finished match. */
  @Output() closed = new EventEmitter<LiveMatchClosed>();

  @ViewChild(MatchPitchComponent) pitch?: MatchPitchComponent;

  private static readonly LINEUP_PREVIEW_MS = 2800;

  showLiveMatch = false;
  liveMatchData: LiveMatchData | null = null;
  liveCurrentIndex = 0;
  liveMatchSpeed = 1;
  /** Visible state for a failed interactive /advance request. */
  liveAdvanceError: string | null = null;
  get liveAdvanceInFlight(): boolean { return this.liveMatch.advanceInFlight; }

  /** The one clock: match minutes AND clip playback come off this RAF loop. */
  private readonly clock = new PlaybackClock();
  /** Scaled time accrued toward the next match minute. */
  private minuteAccumulator = 0;
  /** Scaled ms per match minute. `timeScale` is what makes 2x/4x/8x land on
   *  the historical 300/100/40ms cadence, so this constant never changes. */
  private static readonly MINUTE_PERIOD_MS = 600;

  /** Set once /commit returns so we don't fire it twice. */
  liveMatchCommitted = false;
  /** Knockout outcome line shown at full time (aggregate / extra time / penalties /
   *  "first leg"), from the /commit response. Null = nothing beyond the score. */
  liveKnockoutResultText: string | null = null;
  /** Anti-spoiler: minute of a shot (saved/wide) whose commentary line is held
   *  back briefly so the user can't tell a non-goal shot from a goal by the
   *  fact that no animation modal opened. Goals already gate this via the
   *  modal; this fills the gap for shots that don't trigger one. */
  suspenseShotHideMinute: number | null = null;
  suspenseShotTimer: any = null;

  /** Post-match press conference scheduled by /commit — handed to the parent
   *  when the modal closes. */
  private commitPressConferenceId: number | null = null;
  private commitOutcome: 'WIN' | 'DRAW' | 'LOSS' | null = null;
  private commitPressConferenceQuestion: string | null = null;

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

  // ---- 2D pitch view (Faza 1) ----
  /** TEXT keeps the original commentary-first layout; PITCH_2D swaps the
   *  centre pane for a permanently visible pitch. localStorage only. */
  matchViewMode: MatchViewMode = 'TEXT';
  private static readonly VIEW_MODE_KEY = 'fm_matchViewMode';

  /** How the pitch canvas is drawn: flat 2D (`classic`) or the 2.5D
   *  perspective camera (`broadcast`). Presentation only. */
  pitchStyle: PitchStyle = 'classic';
  /** How the players are drawn: numbered discs or animated sprite figures.
   *  Independent of `pitchStyle`; all four combinations are valid. */
  pitchDetail: PitchDetail = 'discs';

  /** Match kits on the home/away axis — used by the persistent pitch and the
   *  clip renderer alike. */
  matchHomeKit: KitColors = DEFAULT_HOME_KIT;
  matchAwayKit: KitColors = DEFAULT_AWAY_KIT;

  /** Client-side synthesis of what happens between the engine's moments. */
  private ambient: AmbientState = emptyAmbientState();
  /** Signature of the on-pitch squads + direction the layout was built from. */
  private ambientLayoutKey = '';
  private ambientNames: { [playerId: number]: string } = {};
  private shirtNumbers: { [playerId: number]: number } = {};
  /** Timeline index whose marker we already spawned. */
  private lastMarkerIndex = -1;
  private markers: { x: number; y: number; icon: string; bornAt: number }[] = [];

  /** Inline clip splice on the persistent pitch: ambient → clip → ambient. */
  private spliceState: 'none' | 'in' | 'clip' | 'out' = 'none';
  private spliceMs = 0;
  private spliceFrom: PitchFrame | null = null;

  // Moment playback state. There is exactly one <app-match-pitch> instance;
  // `pitchPresentation` decides whether it sits inline, fills the screen for a
  // moment/replay, or is parked out of sight.
  /** The live moment currently being shown (null while replaying on demand). */
  goalAnimationData: GoalAnimationData | null = null;
  /** A moment the user asked to see again — never touches the scoreboard. */
  replayAnimation: GoalAnimationData | null = null;
  goalAnimationFinished = false;
  /** Renderer-neutral view of `goalAnimationData`, fed to <app-match-pitch>. */
  goalClip: PitchClip | null = null;
  // Canonical MatchPlan animations are an ordered list, not the legacy
  // minute-keyed map. Keep the complete payload in the queue so goals from
  // both teams (and multiple goals in one minute) are never overwritten.
  goalAnimationPendingQueue: GoalAnimationData[] = [];
  private handledGoalAnimationKeys = new Set<string>();
  private goalAnimationScoreBefore: { home: number; away: number } | null = null;

  // Lineup preview state — flashed once at the start of each live match so the
  // user sees both formations and team kits before the kickoff.
  showLineupPreview = false;
  lineupPreviewTimer: any = null;
  lineupPreviewData: LineupPreviewData | null = null;

  constructor(public teamService: TeamService, private liveMatch: LiveMatchService,
              private zone: NgZone) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Fires for the initial binding too, so this covers both "modal opened"
    // and the rarer "another session took over while it was open"
    // (multiplayer resume with a different key).
    const change = changes['matchKey'];
    if (change && this.matchKey && change.currentValue !== change.previousValue) {
      this.matchViewMode = this.readViewMode();
      this.pitchStyle = readPitchStyle();
      this.pitchDetail = readPitchDetail();
      this.load(this.matchKey);
    }
  }

  // ==========================================
  // VIEW MODE (TEXT / PITCH_2D)
  // ==========================================

  private readViewMode(): MatchViewMode {
    try {
      return localStorage.getItem(LiveMatchComponent.VIEW_MODE_KEY) === 'PITCH_2D'
        ? 'PITCH_2D' : 'TEXT';
    } catch { return 'TEXT'; }
  }

  /** Presentation only — never touches playback state, never calls the API. */
  toggleMatchViewMode(): void {
    this.matchViewMode = this.matchViewMode === 'PITCH_2D' ? 'TEXT' : 'PITCH_2D';
    try {
      localStorage.setItem(LiveMatchComponent.VIEW_MODE_KEY, this.matchViewMode);
    } catch { /* storage disabled */ }

    // A moment already on screen keeps playing on the very same canvas — the
    // switch only changes how that canvas is presented. The splice state has to
    // follow, or the inline path would sit in ambient with a clip that never
    // finishes and a match clock that never resumes.
    if (this.goalAnimationData) {
      this.spliceState = this.matchViewMode === 'PITCH_2D' ? 'clip' : 'none';
      this.spliceFrom = null;
    }
  }

  /**
   * Flip the render style of the pitch canvas. Strictly cosmetic: the clip,
   * the ambient synthesis and the match clock all keep running on the same
   * canvas — no /advance, no /commit, no playback state is touched, so this is
   * safe mid-match and mid-clip.
   */
  togglePitchStyle(): void {
    this.pitchStyle = this.pitchStyle === 'broadcast' ? 'classic' : 'broadcast';
    writePitchStyle(this.pitchStyle);
  }

  /**
   * Flip between numbered discs and animated player figures. Exactly as
   * cosmetic as the style toggle: the renderer repaints the frame it is
   * already showing, playback is untouched.
   */
  togglePitchDetail(): void {
    this.pitchDetail = this.pitchDetail === 'sprites' ? 'discs' : 'sprites';
    writePitchDetail(this.pitchDetail);
  }

  /**
   * Where the single pitch instance is presented right now:
   *  - `zoom`   a moment or a replay fills the screen
   *  - `inline` the persistent PITCH_2D pane
   *  - `hidden` TEXT view with nothing to show (still mounted, never a
   *             second canvas)
   */
  get pitchPresentation(): 'inline' | 'zoom' | 'hidden' {
    if (this.replayAnimation) return 'zoom';
    if (this.goalClip && this.matchViewMode === 'TEXT') return 'zoom';
    return this.matchViewMode === 'PITCH_2D' ? 'inline' : 'hidden';
  }

  /** True while a *live* moment is on screen. The scoreboard hold and the
   *  commentary anti-spoiler key off this; an on-demand replay must not
   *  rewind either of them. */
  get clipInFlight(): boolean {
    return !!this.goalAnimationData || this.spliceState !== 'none';
  }

  ngOnDestroy(): void {
    this.clock.stop();
    this.stopGoalAnimation();
    if (this.suspenseShotTimer) clearTimeout(this.suspenseShotTimer);
    if (this.lineupPreviewTimer) clearTimeout(this.lineupPreviewTimer);
  }

  // ==========================================
  // PLAYBACK CLOCK
  // ==========================================

  /**
   * One animation frame. Clip playback reads the *real* delta so highlights
   * always run at their authored 30fps (and keep running while the match clock
   * is paused for them); the match minute reads the *scaled* delta.
   *
   * The loop runs OUTSIDE Angular: drawing a clip frame touches only the
   * canvas, so it must not drag the whole application through change detection
   * 60 times a second. Anything that moves template state re-enters the zone.
   */
  private onFrame(scaledDt: number, realDt: number): void {
    this.drivePitch(realDt);
    if (this.clock.paused) return;

    this.minuteAccumulator += scaledDt;
    while (this.minuteAccumulator >= LiveMatchComponent.MINUTE_PERIOD_MS) {
      this.minuteAccumulator -= LiveMatchComponent.MINUTE_PERIOD_MS;
      this.zone.run(() => this.onMinuteTick());
      // A tick can pause the clock (goal clip, shot suspense, full time).
      // Drop the remainder so playback resumes on a clean beat, exactly like
      // the old setInterval restart did.
      if (this.clock.paused) {
        this.minuteAccumulator = 0;
        return;
      }
    }
  }

  // ==========================================
  // PERSISTENT 2D PITCH (Faza 1)
  // ==========================================

  /**
   * Everything the canvas does in one animation frame. In TEXT mode only the
   * goal-clip modal has a canvas, so this is the old behaviour. In PITCH_2D the
   * pane is always live: ambient synthesis, then the ambient→clip→ambient
   * splice when the engine produces a moment.
   */
  private drivePitch(realDt: number): void {
    if (!this.pitch) return;
    // While a moment is zoomed (a live clip in TEXT view, or a replay) the clip
    // owns every frame.
    if (this.pitchPresentation === 'zoom') {
      this.pitch.advance(realDt);
      return;
    }
    if (this.matchViewMode !== 'PITCH_2D' || !this.liveMatchData) return;

    this.ambient.elapsedMs += realDt;
    this.ambient.transitionMs = Math.min(this.ambient.transitionMs + realDt, AMBIENT_TRANSITION_MS);

    switch (this.spliceState) {
      case 'in': {
        this.spliceMs += realDt;
        const target = this.pitch.firstClipFrame();
        if (!target || this.spliceMs >= SPLICE_MS) {
          this.spliceState = 'clip';
          return;
        }
        const from = this.spliceFrom ?? ambientFrame(this.ambient);
        this.pitch.renderFrame(blendFrames(from, target, this.spliceMs / SPLICE_MS),
                               this.clipNames());
        return;
      }
      case 'clip':
        this.pitch.advance(realDt);
        return;
      case 'out': {
        this.spliceMs += realDt;
        const to = ambientFrame(this.ambient);
        if (this.spliceMs >= SPLICE_MS) {
          this.finishInlineClip();
          return;
        }
        const from = this.spliceFrom ?? to;
        this.pitch.renderFrame(blendFrames(from, to, this.spliceMs / SPLICE_MS), this.ambientNames);
        return;
      }
      default:
        this.pitch.renderFrame(ambientFrame(this.ambient), this.ambientNames, this.activeMarkers());
    }
  }

  private clipNames(): { [playerId: number]: string } {
    return this.goalClip?.names ?? this.ambientNames;
  }

  /** Marker icons still inside their 2s fade window. */
  private activeMarkers(): PitchMarker[] {
    if (this.markers.length === 0) return [];
    const now = this.ambient.elapsedMs;
    this.markers = this.markers.filter(m => now - m.bornAt < MARKER_LIFETIME_MS);
    return this.markers.map(m => ({
      x: m.x, y: m.y, icon: m.icon,
      alpha: 1 - (now - m.bornAt) / MARKER_LIFETIME_MS
    }));
  }

  /**
   * Re-derive the ambient picture from server truth. Called after every state
   * change (load, /advance, /substitute, /commit) — a red card or a
   * substitution therefore shows up on the pitch within a minute.
   */
  private refreshAmbient(): void {
    const data = this.liveMatchData;
    if (!data) return;

    this.refreshAmbientRoster(data);

    // First half: home attacks right. The engine flips ends at half time.
    const flipped = (data.timeline || [])
      .slice(0, this.liveCurrentIndex + 1)
      .some(event => event.eventType === 'half_time');
    const homeAttacksRight = !flipped;

    const homePlayers = (data.homePitch || []).filter(p => p.onPitch !== false);
    const awayPlayers = (data.awayPitch || []).filter(p => p.onPitch !== false);
    const layoutKey = [
      homeAttacksRight,
      homePlayers.map(p => `${p.playerId}:${p.position}`).join(','),
      awayPlayers.map(p => `${p.playerId}:${p.position}`).join(',')
    ].join('|');

    if (layoutKey !== this.ambientLayoutKey) {
      this.ambientLayoutKey = layoutKey;
      this.ambient.slots = [
        ...buildTeamSlots(homePlayers, data.homeTeamId, homeAttacksRight, this.shirtNumbers),
        ...buildTeamSlots(awayPlayers, data.awayTeamId, !homeAttacksRight, this.shirtNumbers)
      ];
    }

    // Possession bias comes from the latest event the viewer has reached.
    const latest = this.latestAmbientEvent();
    const phase = phaseFor(latest, data.homeTeamId, data.awayTeamId, homeAttacksRight);
    if (!samePhase(phase, this.ambient.current)) {
      this.ambient.previous = this.ambient.current;
      this.ambient.current = phase;
      this.ambient.transitionMs = 0;
    }

    this.spawnMarkerFor(latest, phase);
  }

  /** Latest timeline entry at or before the playback position. */
  private latestAmbientEvent(): LiveMatchMinute | null {
    const timeline = this.liveMatchData?.timeline;
    if (!timeline || timeline.length === 0) return null;
    for (let i = Math.min(this.liveCurrentIndex, timeline.length - 1); i >= 0; i--) {
      const event = timeline[i];
      if (event?.eventType && event.eventType !== 'none') return event;
    }
    return null;
  }

  private spawnMarkerFor(event: LiveMatchMinute | null, phase: { ball: { x: number; y: number } }): void {
    if (!event) return;
    const index = (this.liveMatchData?.timeline || []).lastIndexOf(event);
    if (index <= this.lastMarkerIndex) return;
    this.lastMarkerIndex = index;
    const icon = MARKER_ICONS[event.eventType];
    if (!icon) return;
    this.markers.push({ x: phase.ball.x, y: phase.ball.y, icon, bornAt: this.ambient.elapsedMs });
  }

  /** Names (for labels) and shirt numbers (from any clip roster we have). */
  private refreshAmbientRoster(data: LiveMatchData): void {
    const names: { [playerId: number]: string } = {};
    for (const player of [...(data.homePitch || []), ...(data.awayPitch || [])]) {
      names[player.playerId] = this.surnameOf(player);
    }
    this.ambientNames = names;

    const rosters: GoalAnimationData[] = [
      ...(data.canonicalAnimations || []),
      ...Object.values(data.goalAnimations || {})
    ];
    for (const clip of rosters) {
      for (const player of clip?.players || []) {
        if (player.shirtNumber) this.shirtNumbers[player.playerId] = player.shirtNumber;
      }
    }
    // Kits are match-level; the first clip we ever see resolves them.
    const first = rosters[0];
    if (first && (first.scoringTeamKit || first.defendingTeamKit)) {
      const kits = kitsFromAnimation(first);
      this.matchHomeKit = kits.home;
      this.matchAwayKit = kits.away;
    }
  }

  /** The inline clip has blended back out — clean up and carry on. */
  private finishInlineClip(): void {
    this.spliceState = 'none';
    this.spliceFrom = null;
    this.spliceMs = 0;
    this.goalClip = null;
    this.goalAnimationData = null;
    this.goalAnimationScoreBefore = null;
    this.goalAnimationFinished = false;
    this.zone.run(() => this.advanceGoalAnimationQueue());
  }

  /** Play the next queued moment, or resume the match clock. */
  private advanceGoalAnimationQueue(): void {
    if (this.goalAnimationPendingQueue.length > 0) {
      const next = this.goalAnimationPendingQueue.shift()!;
      setTimeout(() => this.playGoalAnimationData(next), 300);
    } else {
      this.startLiveMatchTimer();
    }
  }

  /** What a match-clock beat means depends on the phase we're in. */
  private onMinuteTick(): void {
    if (this.syntheticPhase !== 'none') {
      this.tickSynthetic();
      return;
    }
    // The engine state itself is the authoritative signal — if the match
    // isn't finished yet, drive it via /advance polling. This avoids the
    // tickPlayback path silently stalling because the baked timeline only
    // has a single kickoff entry (Session 4 interactive sessions start with
    // currentMinute=0 and finished=false).
    if (this.liveMatchData && this.liveMatchData.finished === false) {
      this.tickInteractive();
    } else {
      this.tickPlayback();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // The app shell suspends match shortcuts while an overlay it owns (the
    // tutorial) has the keyboard — on master the single handler's tutorial
    // branch returned before the live-match branch ever ran.
    if (this.shortcutsSuspended) return;
    // Ignore if typing in an input/textarea
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // A zoomed moment owns the keyboard: Space skips, then continues.
    if (this.pitchPresentation === 'zoom') {
      if (event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        if (this.replayAnimation) {
          this.closeReplay();
        } else if (this.goalAnimationFinished) {
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
  }

  // ==========================================
  // LIVE MATCH
  // ==========================================

  private load(key: string): void {
    this.stopLiveMatchTimer();
    this.liveAdvanceError = null;
    this.goalAnimationPendingQueue = [];
    this.handledGoalAnimationKeys.clear();
    this.goalAnimationScoreBefore = null;
    this.liveKnockoutResultText = null;
    // Reset the commit-idempotence guard for THIS match. The component instance
    // survives a multiplayer takeover to a different key (ngOnChanges → load),
    // so a stale `true` from a previous committed match would silently skip
    // /commit for the new one.
    this.liveMatchCommitted = false;
    this.commitPressConferenceId = null;
    this.commitOutcome = null;
    this.commitPressConferenceQuestion = null;
    this.resetSyntheticState();
    this.liveMatch.fetch(key).subscribe({
      next: (data) => {
        if (data && data.timeline && data.timeline.length > 0) {
          this.liveMatchData = data;
          this.liveCurrentIndex = 0;
          this.liveMatchSpeed = 1;
          this.showLiveMatch = true;
          this.refreshAmbient();
          this.ensureClockRunning();

          // Show the formations once at match start (replaces the previous
          // pre-animation flash). The timer doesn't tick until the user closes
          // the preview, so the kickoff event isn't skipped while it's up.
          const lineup = this.buildLineupFromMatch(data);
          if (lineup) {
            this.lineupPreviewData = lineup;
            this.showLineupPreview = true;
            if (this.lineupPreviewTimer) clearTimeout(this.lineupPreviewTimer);
            this.lineupPreviewTimer = setTimeout(() => this.dismissLineupPreview(),
              LiveMatchComponent.LINEUP_PREVIEW_MS);
          } else {
            this.startLiveMatchTimer();
          }
        } else {
          this.unavailable.emit();
        }
      },
      error: () => this.unavailable.emit()
    });
  }

  /** Arm the RAF loop (still paused). Clip playback needs it alive even while
   *  match-minute advancement is held. */
  private ensureClockRunning(): void {
    if (this.clock.running) return;
    this.zone.runOutsideAngular(() =>
      this.clock.start((scaledDt, realDt) => this.onFrame(scaledDt, realDt)));
  }

  /** Resume (or start) match-minute advancement on the shared clock. */
  startLiveMatchTimer(): void {
    this.minuteAccumulator = 0;
    this.clock.timeScale = LiveMatchComponent.MINUTE_PERIOD_MS / this.getSpeedInterval();
    this.clock.paused = false;
    this.ensureClockRunning();
  }

  /** Legacy playback — engine ran sync, just advance the local index through
   *  the baked timeline (with goal animations as before). */
  private tickPlayback(): void {
    if (!this.liveMatchData) return;
    if (this.liveCurrentIndex < this.liveMatchData.timeline.length - 1) {
      this.liveCurrentIndex++;
      this.refreshAmbient();
      const current = this.liveMatchData.timeline[this.liveCurrentIndex];
      if (current) {
        const minute = current.minute;
        const anim = this.animationsAtMinute(this.liveMatchData, minute)[0];
        // Play every V3 shot outcome selected by the local highlight filter.
        const isShotEvent = current.eventType === 'goal'
                         || current.eventType === 'shot_saved'
                         || current.eventType === 'shot_wide'
                         || current.eventType === 'shot_blocked';
        if (anim && isShotEvent && this.playAnimationsAtMinute(this.liveMatchData, minute)) {
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
   *  that won't actually play because of the viewer's highlight setting.
   *  Without this, instant-reveal of these lines would telegraph
   *  "no goal here" before the user has any reason to expect one. */
  private isSuspenseShot(event: LiveMatchMinute | undefined, anim: GoalAnimationData | undefined): boolean {
    if (!event) return false;
    const t = event.eventType;
    // Animation exists but skipped → save/miss case
    if (anim && (t === 'shot_saved' || t === 'shot_wide' || t === 'shot_blocked' || t === 'goal')
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
          && !this.clipInFlight
          && !(this.liveMatchData.finished && this.liveMatchCommitted)) {
        this.startLiveMatchTimer();
      }
    }, delay);
  }

  /** Interactive mode (Faza 3 Sesiunea 4) — drive the engine by polling
   *  /advance one in-game minute at a time. Each response carries the new
   *  events, current pitch + bench state, score, and finished flag. */
  private tickInteractive(): void {
    if (this.liveMatch.advanceInFlight) return; // wait for previous /advance to land
    if (!this.matchKey || !this.liveMatchData) return;

    const currentEngineMinute = this.liveMatchData.currentMinute ?? 0;
    const totalMinutes = 90 + (this.liveMatchData.firstHalfStoppage || 0) + (this.liveMatchData.secondHalfStoppage || 0);

    // Match finished — stop ticking and commit (idempotent server-side).
    if (this.liveMatchData.finished) {
      this.stopLiveMatchTimer();
      if (!this.liveMatchCommitted) this.commitInteractiveLiveMatch();
      return;
    }

    const target = Math.min(currentEngineMinute + 1, totalMinutes);
    this.liveMatch.advanceInFlight = true;
    this.liveMatch.advanceTargetMinute = target;

    this.liveMatch.advance(target).subscribe({
      next: (state) => {
        this.liveMatch.advanceInFlight = false;
        if (!state) {
          this.liveAdvanceError = 'The match could not advance. Please try again.';
          this.stopLiveMatchTimer();
          return;
        }
        this.liveAdvanceError = null;
        // Merge the new state — replace timeline (it's the source of truth in
        // interactive mode) and refresh pitch/bench/score/finished/etc.
        this.liveMatchData = state;
        this.liveCurrentIndex = (state.timeline?.length ?? 1) - 1;
        this.refreshAmbient();

        // Goal animation + suspense paths — mirror tickPlayback so interactive
        // mode (Faza 3 Sesiunea 4) behaves identically.
        //
        // Important: the engine can produce TWO events in a single tick — e.g.
        // a goal at minute 94 followed immediately by the full_time marker at
        // minute 94. `state.timeline[liveCurrentIndex]` is the LAST one, which
        // would be the full_time event in that case. canonicalAnimations is
        // the authoritative MatchPlan boundary; goalAnimations remains the
        // legacy/cosmetic boundary. Read both, not only the legacy map, or
        // every canonical goal is silently dropped from the visual playback.
        const anim = this.animationsAtMinute(state, target)[0];
        if (anim && this.playAnimationsAtMinute(state, target)) {
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
      error: (err) => {
        this.liveMatch.advanceInFlight = false;
        this.liveAdvanceError = this.liveAdvanceErrorMessage(err);
        // Keep the current engine minute and wait for an explicit retry.
        this.stopLiveMatchTimer();
      }
    });
  }

  /** Retry the same interactive minute after a transient /advance failure. */
  retryLiveAdvance(): void {
    if (this.liveMatch.advanceInFlight || !this.interactive
        || !this.matchKey || !this.liveMatchData || this.liveMatchData.finished) return;
    this.liveAdvanceError = null;
    this.startLiveMatchTimer();
    this.tickInteractive();
  }

  private liveAdvanceErrorMessage(error: any): string {
    if (error?.status === 404) {
      return 'The live match session is no longer available. Please close this match and continue.';
    }
    return 'The match could not advance. Check your connection and try again.';
  }

  /** POST /commit after the engine finishes. Picks up the post-match press
   *  conference id from the response and hands it to the parent when the
   *  modal closes. */
  private commitInteractiveLiveMatch(): void {
    if (!this.matchKey || this.liveMatchCommitted) return;
    this.liveMatchCommitted = true;
    this.liveMatch.commit().subscribe({
      next: (result) => {
        if (result?.postMatchPressConferenceId) {
          this.commitPressConferenceId = result.postMatchPressConferenceId;
          this.commitOutcome = result.postMatchPressConferenceOutcome ?? null;
          this.commitPressConferenceQuestion = result.postMatchPressConferenceQuestion ?? null;
        }
        // Knockout outcome (aggregate / extra time / penalties / first leg).
        this.liveKnockoutResultText = result?.knockoutResultText ?? null;
        // Refresh the live data with the final state from commit.
        if (result?.liveMatch) {
          this.liveMatchData = result.liveMatch;
          this.liveCurrentIndex = (result.liveMatch.timeline?.length ?? 1) - 1;
          this.refreshAmbient();
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

    this.syntheticRng = this.makeSeededRng(this.matchKey || (homeName + awayName));
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

  /** The synthetic sequence beats at the same cadence as a match minute, so it
   *  just un-pauses the shared clock; `onMinuteTick` routes to tickSynthetic
   *  while `syntheticPhase` is set. */
  private startSyntheticTimer(): void {
    this.startLiveMatchTimer();
  }

  stopSyntheticTimer(): void {
    this.stopLiveMatchTimer();
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
    const names = pitch.map(p => this.surnameOf(p)).filter(n => !!n);
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

  /** Pause match-minute advancement. The RAF loop keeps running so any clip
   *  that is the reason for the pause still plays. */
  stopLiveMatchTimer(): void {
    this.clock.paused = true;
    this.minuteAccumulator = 0;
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
    // One knob now — the synthetic ET/penalty sequence rides the same clock,
    // so it stays in step automatically.
    this.clock.timeScale = LiveMatchComponent.MINUTE_PERIOD_MS / this.getSpeedInterval();
    this.minuteAccumulator = 0;
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
    this.spliceState = 'none';
    this.spliceFrom = null;
    this.replayAnimation = null;
    this.goalAnimationData = null;
    this.goalClip = null;
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
    if (this.interactive && this.liveMatchData && !this.liveMatchData.finished && this.matchKey) {
      const totalMinutes = 90
        + (this.liveMatchData.firstHalfStoppage || 0)
        + (this.liveMatchData.secondHalfStoppage || 0);
      this.liveMatch.advanceInFlight = true;
      this.liveMatch.advance(totalMinutes).subscribe({
        next: (state) => {
          this.liveMatch.advanceInFlight = false;
          if (state) {
            this.liveMatchData = state;
            this.liveCurrentIndex = (state.timeline?.length ?? 1) - 1;
            this.refreshAmbient();
          }
          // Commit only fires once the engine reports finished=true. With
          // untilMinute set to totalMinutes the BE always flips finished.
          if (this.liveMatchData?.finished && !this.liveMatchCommitted) {
            this.commitInteractiveLiveMatch();
          }
        },
        error: (err) => {
          this.liveMatch.advanceInFlight = false;
          this.liveAdvanceError = this.liveAdvanceErrorMessage(err);
          console.error('Skip-to-end advance failed:', err);
          // Fallback: at least reveal what we already have.
          this.liveCurrentIndex = (this.liveMatchData?.timeline?.length ?? 1) - 1;
          this.refreshAmbient();
        }
      });
      return;
    }

    // Already finished but never committed (e.g., resumed-after-refresh case
    // where engine reached full time and the user hit Skip before the timer
    // had a chance to fire the commit). Fire it now so we don't get stuck.
    if (this.interactive
        && this.liveMatchData?.finished
        && !this.liveMatchCommitted
        && this.matchKey) {
      this.commitInteractiveLiveMatch();
    }

    // Legacy (engine already ran sync) — timeline is complete, just jump.
    if (this.liveMatchData) {
      this.liveCurrentIndex = this.liveMatchData.timeline.length - 1;
      this.refreshAmbient();
    }
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
  get userPitch(): PlayerStaminaInfo[] {
    if (!this.liveMatchData) return [];
    return (this.userIsHome ? this.liveMatchData.homePitch : this.liveMatchData.awayPitch) || [];
  }

  /** Players currently on the bench for the user's team. */
  get userBench(): PlayerStaminaInfo[] {
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
  benchIsRecommended(playerIn: PlayerStaminaInfo): boolean {
    if (this.subPlayerOutId == null) return false;
    const out = this.userPitch.find(p => p.playerId === this.subPlayerOutId);
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
    if (!this.matchKey || this.subPlayerOutId == null || this.subPlayerInId == null) {
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
    this.liveMatch.substitute(body).subscribe({
      next: (state) => {
        this.subSubmitting = false;
        // Full replace — keep liveMatchData in sync with the engine including
        // currentMinute, finished, score, timeline, pitch/bench, subs counter,
        // stamina snapshots. The new sub event is inserted into the timeline
        // chronologically by the backend; we move liveCurrentIndex to the end
        // so the next /advance tick targets the correct minute and the
        // commentary feed shows the sub.
        if (state) {
          this.liveMatchData = { ...(this.liveMatchData as LiveMatchData), ...state };
          this.liveCurrentIndex = (state.timeline?.length ?? 1) - 1;
          this.refreshAmbient();
        }
        this.liveMatch.advanceInFlight = false;
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
    this.stopGoalAnimation();
    this.replayAnimation = null;
    this.goalAnimationData = null;
    this.goalClip = null;
    this.spliceState = 'none';
    this.resetSyntheticState();
    if (this.suspenseShotTimer) {
      clearTimeout(this.suspenseShotTimer);
      this.suspenseShotTimer = null;
    }
    this.suspenseShotHideMinute = null;
    this.showLiveMatch = false;
    this.liveMatchData = null;
    this.liveAdvanceError = null;
    this.liveKnockoutResultText = null;
    this.liveMatch.reset();

    this.closed.emit({
      pressConferenceId: this.commitPressConferenceId,
      outcome: this.commitOutcome,
      question: this.commitPressConferenceQuestion
    });
    this.commitPressConferenceId = null;
    this.commitOutcome = null;
    this.commitPressConferenceQuestion = null;
  }

  get liveCurrentMinute(): LiveMatchMinute | null {
    if (!this.liveMatchData?.timeline) return null;
    return this.liveMatchData.timeline[this.liveCurrentIndex];
  }

  get liveVisibleEvents(): LiveMatchMinute[] {
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
    const animMinute = this.clipInFlight ? this.goalAnimationData?.minute : null;
    const animOutcome = this.clipInFlight ? this.goalAnimationData?.outcome : null;
    // Anti-spoiler for non-animated shots: while applyShotSuspense is running,
    // hide the shot line so the user doesn't see it appear instantly (which
    // would imply "no goal coming" before any animation could fire).
    const hideShotAtMinute = this.suspenseShotHideMinute;
    return this.liveMatchData.timeline
      .slice(0, this.liveCurrentIndex + 1)
      .filter((m) => {
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
    if (!this.clipInFlight) return cur;
    if (this.goalAnimationData?.outcome !== 'GOAL') return cur;
    const prev = this.goalAnimationScoreBefore || this.scoreBeforeCurrentGoal();
    return prev ? prev.home : cur;
  }
  get displayedAwayScore(): number {
    const cur = this.liveCurrentMinute?.awayScore ?? 0;
    if (!this.clipInFlight) return cur;
    if (this.goalAnimationData?.outcome !== 'GOAL') return cur;
    const prev = this.goalAnimationScoreBefore || this.scoreBeforeCurrentGoal();
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
  get keyMatchEvents(): LiveMatchMinute[] {
    const timeline = this.liveMatchData?.timeline;
    if (!timeline) return [];
    const animations = this.liveMatchData?.goalAnimations || {};
    const out: LiveMatchMinute[] = [];
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
  get currentStaminaSnapshot(): StaminaSnapshot | null {
    const snaps = this.liveMatchData?.staminaSnapshots;
    if (!snaps || snaps.length === 0) return null;
    const minute = this.liveCurrentMinute?.minute ?? 0;
    let chosen: StaminaSnapshot = snaps[0];
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
      case 'goal': return '⚽';
      case 'yellow_card': return '🟨';
      case 'red_card': return '🔴';
      case 'substitution': return '🔄';
      case 'chance': return '🎯';
      case 'save': return '🧤';
      case 'half_time': return '⏸️';
      case 'full_time': return '🏁';
      case 'kickoff': return '📢';
      default: return '•';
    }
  }

  // ==========================================
  // GOAL ANIMATION
  // ==========================================

  private animationsAtMinute(data: LiveMatchData | null, minute: number): GoalAnimationData[] {
    const canonical = Array.isArray(data?.canonicalAnimations)
      ? data!.canonicalAnimations!
          .filter(animation => Number(animation?.minute) === Number(minute))
          .sort((left, right) => Number(left?.slotIndex ?? 0) - Number(right?.slotIndex ?? 0))
      : [];
    const legacy = data?.goalAnimations?.[minute];
    // Never make the two transport boundaries mutually exclusive. During a rolling
    // upgrade or a flag-off replay a legacy moment can legitimately share a minute with
    // one or more V3 moments; all of them must play sequentially.
    return legacy ? [...canonical, legacy] : canonical;
  }

  private animationKey(animation: GoalAnimationData): string {
    if (animation?.fixtureKey != null && animation?.slotIndex != null) {
      return `canonical:${animation.fixtureKey}:${animation.slotIndex}`;
    }
    return `legacy:${animation?.minute}:${animation?.outcome}:${animation?.scorerPlayerId ?? animation?.scorerName ?? ''}`;
  }

  private playAnimationsAtMinute(data: LiveMatchData | null, minute: number): boolean {
    const pending = this.animationsAtMinute(data, minute)
      .filter(animation => this.shouldPlayAnimation(animation?.outcome))
      .filter(animation => !this.handledGoalAnimationKeys.has(this.animationKey(animation)));
    if (pending.length === 0) return false;

    pending.forEach(animation => this.handledGoalAnimationKeys.add(this.animationKey(animation)));
    const [first, ...rest] = pending;
    this.goalAnimationPendingQueue.push(...rest);
    this.playGoalAnimationData(first);
    return true;
  }

  private playGoalAnimationData(animation: GoalAnimationData): void {
    if (!animation) return;

    this.stopLiveMatchTimer();
    this.goalAnimationData = animation;
    this.goalAnimationScoreBefore = this.scoreImmediatelyBeforeAnimation(animation);
    this.goalAnimationFinished = false;
    const kits = kitsFromAnimation(animation);
    this.matchHomeKit = kits.home;
    this.matchAwayKit = kits.away;
    this.goalClip = goalAnimationToFrames(animation);

    if (this.matchViewMode === 'PITCH_2D') {
      // Splice the moment into the persistent pitch: slide out of the ambient
      // shape, play the clip, slide back.
      this.spliceFrom = ambientFrame(this.ambient);
      this.spliceMs = 0;
      this.spliceState = 'in';
    }
    // In TEXT view `pitchPresentation` lifts the same canvas to full screen.
  }

  private scoreImmediatelyBeforeAnimation(animation: GoalAnimationData): { home: number; away: number } | null {
    if (animation?.outcome !== 'GOAL') return null;
    const goals = (this.liveMatchData?.timeline || []).filter(event =>
      event?.eventType === 'goal'
      && Number(event?.minute) === Number(animation?.minute)
      && Number(event?.teamId) === Number(animation?.scoringTeamId));
    if (goals.length === 0) return null;

    const sameSideCanonical = (this.liveMatchData?.canonicalAnimations || [])
      .filter(candidate => Number(candidate?.minute) === Number(animation?.minute)
        && Number(candidate?.scoringTeamId) === Number(animation?.scoringTeamId))
      .sort((left, right) => Number(left?.slotIndex ?? 0) - Number(right?.slotIndex ?? 0));
    const ordinal = Math.max(0, sameSideCanonical.findIndex(candidate =>
      this.animationKey(candidate) === this.animationKey(animation)));
    const goal = goals[Math.min(ordinal, goals.length - 1)];
    const homeGoal = Number(animation?.scoringTeamId) === Number(this.liveMatchData?.homeTeamId);
    return {
      home: Math.max(0, Number(goal?.homeScore ?? 0) - (homeGoal ? 1 : 0)),
      away: Math.max(0, Number(goal?.awayScore ?? 0) - (homeGoal ? 0 : 1))
    };
  }

  /** The pitch renderer ran past the clip's last frame (or was skipped).
   *  Re-enters the zone because it flips the Skip/Continue buttons — the RAF
   *  loop that produced it runs outside Angular. */
  onGoalClipFinished(): void {
    if (this.spliceState === 'clip') {
      // Inline: blend straight back into ambient, no Continue button.
      this.spliceFrom = this.pitch?.lastRenderedFrame() ?? null;
      this.spliceMs = 0;
      this.spliceState = 'out';
      return;
    }
    // Zoomed: hold the final frame until the user continues / closes.
    this.zone.run(() => this.goalAnimationFinished = true);
  }

  closeGoalAnimation(): void {
    this.stopGoalAnimation();
    this.goalAnimationData = null;
    this.goalClip = null;
    this.goalAnimationScoreBefore = null;
    this.goalAnimationFinished = false;
    this.advanceGoalAnimationQueue();
  }

  skipGoalAnimation(): void {
    this.pitch?.skip();
    this.goalAnimationFinished = true;
  }

  replayGoalAnimation(): void {
    if (!this.goalClip) return;
    this.goalAnimationFinished = false;
    this.pitch?.replay();
  }

  skipEntireMatchFromAnimation(): void {
    this.stopGoalAnimation();
    this.goalAnimationPendingQueue = [];
    this.spliceState = 'none';
    this.goalAnimationData = null;
    this.goalClip = null;
    this.goalAnimationScoreBefore = null;
    this.goalAnimationFinished = false;
    this.skipToEnd();
  }

  private stopGoalAnimation(): void {
    this.pitch?.stop();
  }

  // ==========================================
  // REPLAY (on demand, same pitch, same clock)
  // ==========================================

  /**
   * The stored clip behind a timeline entry, if the engine produced one.
   * Drives the little replay button next to goals, saves and misses.
   */
  momentFor(event: LiveMatchMinute): GoalAnimationData | null {
    if (!event) return null;
    const candidates = this.animationsAtMinute(this.liveMatchData, event.minute);
    if (candidates.length === 0) return null;
    const sameTeam = candidates.find(clip =>
      Number(clip?.scoringTeamId) === Number(event.teamId ?? 0));
    return sameTeam || candidates[0];
  }

  hasReplay(event: LiveMatchMinute): boolean {
    return this.momentFor(event) !== null;
  }

  /**
   * Show a stored moment again on the same `<app-match-pitch>`, enlarged.
   * Purely local: no `/advance`, no `/commit`, no change to the scoreline —
   * the match clock simply waits, exactly as it does for a live moment.
   */
  replayMoment(event: LiveMatchMinute): void {
    const animation = this.momentFor(event);
    if (!animation) return;
    this.stopLiveMatchTimer();
    this.spliceState = 'none';
    this.spliceFrom = null;
    this.goalAnimationFinished = false;
    const kits = kitsFromAnimation(animation);
    this.matchHomeKit = kits.home;
    this.matchAwayKit = kits.away;
    this.replayAnimation = animation;
    this.goalClip = goalAnimationToFrames(animation);
  }

  /** Play the replay again from frame 0. */
  restartReplay(): void {
    if (!this.replayAnimation) return;
    this.goalAnimationFinished = false;
    this.pitch?.replay();
  }

  /** Back to live: ambient in PITCH_2D, hidden in TEXT, clock resumes. */
  closeReplay(): void {
    if (!this.replayAnimation) return;
    this.stopGoalAnimation();
    this.replayAnimation = null;
    this.goalClip = null;
    this.goalAnimationFinished = false;
    // A replay never interrupts a live moment (the button only shows when the
    // pitch is idle), so resuming is enough — unless the match is over.
    if (!this.liveMatchFinished) this.startLiveMatchTimer();
  }

  /** Caption above the zoomed pitch. */
  get zoomTitle(): string {
    const clip = this.replayAnimation || this.goalAnimationData;
    if (!clip) return '';
    const type = clip.animationType && clip.animationType !== 'OPEN_PLAY'
      ? (clip.animationType === 'FREE_KICK' ? 'FREE KICK' : clip.animationType) + ' · '
      : '';
    return `${type}${clip.scorerName || ''}`;
  }

  get zoomMinute(): string {
    const clip = this.replayAnimation || this.goalAnimationData;
    if (!clip) return '';
    return this.formatMatchMinute(clip.minute, clip.firstHalfStoppage);
  }

  /**
   * Read the cached match-highlights setting and decide if the given outcome
   * should produce a 2D animation. The default is the most comprehensive option:
   * backend data is shared by all multiplayer viewers and must never be narrowed by
   * whichever user's preference happened to be read first.
   */
  private shouldPlayAnimation(outcome: string | undefined): boolean {
    const level = (localStorage.getItem('fm_matchHighlightsLevel') as
        'NONE' | 'GOALS_ONLY' | 'KEY_MOMENTS' | null) || 'KEY_MOMENTS';
    if (level === 'NONE') return false;
    if (level === 'GOALS_ONLY') return outcome === 'GOAL';
    return outcome === 'GOAL' || outcome === 'SAVE' || outcome === 'MISS' || outcome === 'BLOCKED';
  }

  // ==========================================
  // LINEUP PREVIEW
  // ==========================================

  /** Tear down the preview. Either fired by user input or by the auto-dismiss
   *  timer; starting the live match timer is handled here. */
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

  /** Formation label from the authoritative backend kickoff contract. The row-count
   *  fallback exists only for older cached payloads that predate that contract. */
  formationOf(teamId: number): string {
    const authoritative = teamId === this.lineupPreviewData?.homeTeamId
      ? this.lineupPreviewData?.homeFormation
      : teamId === this.lineupPreviewData?.awayTeamId
        ? this.lineupPreviewData?.awayFormation
        : null;
    if (authoritative) {
      const labels: { [key: string]: string } = {
        '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1', '352': '3-5-2',
        '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1', '4321': '4-3-2-1',
        '4222': '4-2-2-2', '3421': '3-4-2-1', '532': '5-3-2', '5212': '5-2-1-2',
        '541': '5-4-1', '3511': '3-5-1-1'
      };
      return labels[authoritative] || authoritative;
    }
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

  /** Template-safe kit color: dataset names ("lila", "red") normalized to hex
   *  so CSS bindings never receive an invalid color. */
  safeColor(value: string | null | undefined, fallback: string): string {
    return kitColor(value, fallback);
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
  private buildLineupFromMatch(data: LiveMatchData): LineupPreviewData | null {
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
          homeFormation: data.homeFormation,
          awayFormation: data.awayFormation,
          players: first.players,
          homeKit: homeKit ?? null,
          awayKit: awayKit ?? null
        };
      }
    }

    // Path B: interactive mode (Faza 3 Sesiunea 4) — engine hasn't ticked
    // yet, so no animations exist. Use the initial pitch state (the starting
    // XI flagged by the engine) and let the template fall back to default
    // kit colours.
    const home = (data.homePitch || []).map(p => ({ ...p, teamId: data.homeTeamId }));
    const away = (data.awayPitch || []).map(p => ({ ...p, teamId: data.awayTeamId }));
    if (home.length === 0 && away.length === 0) return null;
    return {
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      homeTeamName: data.homeTeamName,
      awayTeamName: data.awayTeamName,
      homeFormation: data.homeFormation,
      awayFormation: data.awayFormation,
      players: [...home, ...away],
      homeKit: null,
      awayKit: null
    };
  }
}
