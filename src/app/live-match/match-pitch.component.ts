import {
  AfterViewChecked, Component, ElementRef, EventEmitter, Input,
  OnChanges, OnDestroy, Output, SimpleChanges, ViewChild
} from '@angular/core';
import {
  AnimationEvent, GoalAnimationData, KitColors, PitchClip, PitchFrame,
  PitchPlayerPosition
} from '../models/live-match.model';
import {
  createProjector, drawStandBand, PitchProjector, PitchStyle
} from './pitch-projection';
import {
  PitchDetail, PlayerSpriteCache, SPRITE_FOOT_X, SPRITE_FOOT_Y, SPRITE_H,
  SPRITE_HEAD_LIFT, SPRITE_NUMBER_LIFT, SPRITE_W, SpriteMotionTracker
} from './player-sprites';

/** A transient icon pinned to a pitch location (corner, foul, offside, card). */
export interface PitchMarker {
  x: number;
  y: number;
  icon: string;
  /** 0-1; the caller fades it out over its lifetime. */
  alpha: number;
}

/** Legacy fallback kits for animations generated before kit support existed. */
const FALLBACK_SCORING_KIT: KitColors = {
  outfieldPrimary: '#3498db', outfieldBorder: '#2980b9',
  gkPrimary: '#fde047', gkBorder: '#ca8a04'
};
const FALLBACK_DEFENDING_KIT: KitColors = {
  outfieldPrimary: '#e74c3c', outfieldBorder: '#c0392b',
  gkPrimary: '#22d3ee', gkBorder: '#0e7490'
};

/** Dataset color-name → hex. Team kits arrive as raw dataset names ("red",
 *  "lila", ...) and the canvas SILENTLY IGNORES invalid CSS colors — an
 *  unknown name keeps the previous fillStyle, smearing stale label/event
 *  colors across the discs so one team looks like several. Same map the
 *  tactics screens use, extended to cover the whole backend dataset. */
const NAMED_KIT_COLORS: { [name: string]: string } = {
  'red': '#e74c3c', 'darkred': '#c0392b', 'crimson': '#dc143c',
  'blue': '#2980b9', 'darkblue': '#1a3d6e', 'navy': '#152c50', 'lightblue': '#5dade2',
  'green': '#27ae60', 'darkgreen': '#196f3d', 'lime': '#7fbf3f',
  'yellow': '#f1c40f', 'gold': '#d4a017', 'orange': '#e67e22', 'darkorange': '#ca6510',
  'black': '#1a1a1a', 'white': '#ecf0f1', 'grey': '#7f8c8d', 'gray': '#7f8c8d', 'silver': '#a7adb3',
  'purple': '#8e44ad', 'lila': '#8e44ad', 'violet': '#8e44ad', 'pink': '#e91e63',
  'brown': '#795548'
};

/** Resolve a kit color to something the canvas is guaranteed to accept:
 *  hex passes through, known dataset names map to hex, anything else falls
 *  back — never hand the canvas a string it might reject. */
export function kitColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = String(value).trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return v;
  return NAMED_KIT_COLORS[v] || fallback;
}

/**
 * Adapt a backend `GoalAnimationData` clip into the renderer-neutral frame
 * model. The renderer never sees a transport DTO — ambient synthesis (Slice C)
 * produces the same `PitchClip` shape.
 */
export function goalAnimationToFrames(data: GoalAnimationData): PitchClip {
  const players = data?.players || [];
  const names: { [playerId: number]: string } = {};
  for (const player of players) {
    names[player.playerId] = (player.name || '').split(' ').pop() || '';
  }

  const frames: PitchFrame[] = (data?.frames || []).map(frame => ({
    ball: {
      x: frame.ballX,
      y: frame.ballY,
      carrierPlayerId: frame.ballCarrierId ? frame.ballCarrierId : null
    },
    players: players.map((player, index) => {
      const position = frame.positions?.[index];
      return {
        playerId: player.playerId,
        teamId: player.teamId,
        shirtNumber: player.shirtNumber,
        x: position ? position[0] : NaN,
        y: position ? position[1] : NaN,
        isGoalkeeper: player.position === 'GK'
      };
    })
  }));

  // Which goal the shooting team attacks — used for the shot line and the
  // confetti burst origin.
  const scorerIsHome = Number(data?.scoringTeamId) === Number(data?.homeTeamId);
  const homeAttacksRight = !!data?.homeAttacksRight;

  return {
    frames,
    events: data?.events || [],
    names,
    totalFrames: data?.totalFrames || 150,
    scorerPlayerId: data?.scorerPlayerId,
    shooterTeamId: data?.scoringTeamId,
    outcome: data?.outcome,
    shooterAttacksRight: (scorerIsHome && homeAttacksRight) || (!scorerIsHome && !homeAttacksRight)
  };
}

/** Resolve a clip's scoring/defending kits onto the home/away axis the
 *  renderer works in. */
export function kitsFromAnimation(data: GoalAnimationData): { home: KitColors; away: KitColors } {
  const scoring = data?.scoringTeamKit || FALLBACK_SCORING_KIT;
  const defending = data?.defendingTeamKit || FALLBACK_DEFENDING_KIT;
  const scorerIsHome = Number(data?.scoringTeamId) === Number(data?.homeTeamId);
  return scorerIsHome ? { home: scoring, away: defending } : { home: defending, away: scoring };
}

/**
 * Canvas 2D renderer for the match pitch. In Slice A it plays a single clip
 * (the goal-animation payload adapted to `PitchClip`) on the same 33ms timer
 * the inline implementation used.
 */
@Component({
  selector: 'app-match-pitch',
  template: `
    <div class="mp-canvas-wrapper" [class.mp-fill]="responsive">
      <canvas #pitchCanvas width="640" height="400" class="mp-canvas"></canvas>
    </div>
  `,
  styles: [`
    .mp-canvas-wrapper {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #222;
      margin-bottom: 12px;
    }
    .mp-canvas {
      display: block;
      width: 100%;
      height: auto;
      background: #1a6b2a;
    }
    .mp-fill {
      margin-bottom: 0;
      height: 100%;
    }
    .mp-fill .mp-canvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `]
})
export class MatchPitchComponent implements OnChanges, AfterViewChecked, OnDestroy {

  /** The clip to play. Setting a new clip restarts playback from frame 0. */
  @Input() clip: PitchClip | null = null;
  @Input() homeTeamId = 0;
  @Input() homeKit: KitColors = FALLBACK_SCORING_KIT;
  @Input() awayKit: KitColors = FALLBACK_DEFENDING_KIT;
  /** Persistent-pane mode: track the container size instead of staying at the
   *  clip modal's fixed 640x400 backing store. */
  @Input() responsive = false;
  /** Render style. `classic` is the flat top-down 2D pitch (unchanged);
   *  `broadcast` is the 2.5D perspective camera. Pure presentation — the host
   *  owns the persisted value, switching it never touches playback. */
  @Input() pitchStyle: PitchStyle = 'classic';
  /** How the players themselves are drawn: `discs` is the original numbered
   *  circle, `sprites` are the procedural animated figures. Independent of
   *  `pitchStyle` — all four combinations are supported. */
  @Input() pitchDetail: PitchDetail = 'discs';

  /** Fired once the clip has run past its last frame (or was skipped). */
  @Output() clipFinished = new EventEmitter<void>();

  @ViewChild('pitchCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  /** Integer clip frame the simulation has stepped to (trail, confetti and
   *  clip events are driven off this, once per authored frame). */
  frameIndex = 0;
  eventText = '';

  /** Clip time in ms; frame position is `elapsed * 30 / 1000`. */
  private clipElapsedMs = 0;
  /** Highest frame already simulated — keeps events firing exactly once. */
  private steppedFrame = -1;
  private finishedEmitted = false;
  private eventTextTimer: any = null;
  private canvasReady = false;
  /** Kept so the viewer can blend out of exactly what is on screen. */
  private lastFrame: PitchFrame | null = null;
  /** Names that came with the last painted frame — only so a style switch can
   *  repaint the exact same picture in the new projection. */
  private lastNames: { [playerId: number]: string } = {};
  private lastMarkers: PitchMarker[] = [];
  private lastClipOverlays = false;

  /** Screen mapping for the current paint. Rebuilt per frame from the canvas
   *  size + `pitchStyle`; every draw site goes through it. */
  private projector: PitchProjector = createProjector('classic', 640, 400);

  /** Baked sprite bitmaps for this match. Kits only change per clip, so the
   *  cache fills up in the first frame or two and is pure `drawImage` after
   *  that. Untouched (and never populated) in `discs` mode. */
  private readonly spriteCache = new PlayerSpriteCache();
  /** Facing + run cycle, derived from consecutive painted positions. */
  private readonly motion = new SpriteMotionTracker();

  /** Last few ball positions (world 0-100) for the trail effect — fading dots
   *  behind the ball so a fast pass leaves a visible streak. */
  private ballTrail: { x: number; y: number }[] = [];

  /** Confetti particles emitted at the moment of a GOAL; updated once per clip
   *  frame (gravity + drag) until the clip ends. */
  private confetti: { x: number; y: number; vx: number; vy: number; color: string; size: number }[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['clip']) {
      this.resetPlayback();
      // In modal mode the canvas is recreated with the clip, so playback has to
      // wait for it. The persistent pane keeps the same canvas across clips.
      if (!this.responsive) this.canvasReady = false;
    }
    // New kits mean the baked shirts are stale. The cache key contains the
    // colours so a stale entry could never be drawn, but dropping them keeps
    // the map small over a long match.
    if (changes['homeKit'] || changes['awayKit']) this.spriteCache.clear();
    // Turning sprites on mid-clip must not read the gap since the last painted
    // position as a stride.
    if (changes['pitchDetail']) this.motion.reset();
    // A style/detail switch is presentation only: repaint whatever is already
    // on screen in the new look. No playback state is touched, so it is safe
    // mid-clip and mid-ambient alike.
    if ((changes['pitchStyle'] && !changes['pitchStyle'].firstChange)
        || (changes['pitchDetail'] && !changes['pitchDetail'].firstChange)) {
      if (this.canvasReady && this.lastFrame) {
        this.paint(this.lastFrame, this.lastNames,
                   { clipOverlays: this.lastClipOverlays, markers: this.lastMarkers });
      }
    }
  }

  ngAfterViewChecked(): void {
    if (!this.canvasRef || this.canvasReady) return;
    if (!this.clip && !this.responsive) return;
    this.canvasReady = true;
    // The persistent pane is driven frame-by-frame by the viewer; only the
    // modal needs this first paint.
    if (!this.responsive && this.clip) this.draw(0);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ---------- playback (driven by the viewer's single RAF clock) ----------

  /**
   * Advance the clip by `dtMs` of real time and redraw. Called once per
   * animation frame by `<app-live-match>`; there is no timer in here.
   * Positions are interpolated between authored frames so a 60Hz display
   * shows smooth motion out of a 30fps clip.
   */
  advance(dtMs: number): void {
    if (!this.clip || !this.canvasReady || this.finishedEmitted) return;

    this.clipElapsedMs += dtMs;
    const totalFrames = this.clip.totalFrames || 150;
    const exact = (this.clipElapsedMs * 30) / 1000;

    // Step the per-frame simulation for every authored frame we crossed.
    const target = Math.min(Math.floor(exact), totalFrames);
    while (this.steppedFrame < target) {
      this.steppedFrame++;
      this.stepFrame(this.steppedFrame);
    }
    this.frameIndex = Math.max(0, this.steppedFrame);

    if (exact > totalFrames) {
      this.finishedEmitted = true;
      this.draw(totalFrames);
      this.clipFinished.emit();
      return;
    }

    this.draw(Math.min(exact, totalFrames));
  }

  /** Jump to the final frame and render the outcome caption. */
  skip(): void {
    if (!this.clip) return;
    const totalFrames = this.clip.totalFrames || 150;
    this.clearEventTextTimer();
    this.frameIndex = totalFrames;
    this.steppedFrame = totalFrames;
    this.clipElapsedMs = (totalFrames * 1000) / 30;
    this.finishedEmitted = true;
    const outcome = this.clip.outcome;
    this.eventText = outcome === 'SAVE' ? 'SAVED!'
      : outcome === 'MISS' ? 'MISSED!'
      : outcome === 'BLOCKED' ? 'BLOCKED!'
      : 'GOAL!';
    this.draw(totalFrames);
    this.clipFinished.emit();
  }

  /** Frame 0 of the loaded clip — the target the persistent pane blends into
   *  when a moment is spliced in. */
  firstClipFrame(): PitchFrame | null {
    return this.clip?.frames?.[0] ?? null;
  }

  /** The last frame this canvas drew — the source the pane blends out of. */
  lastRenderedFrame(): PitchFrame | null {
    return this.lastFrame;
  }

  /** Restart the current clip from frame 0 with a clean trail/confetti. */
  replay(): void {
    if (!this.clip) return;
    this.resetPlayback();
    this.draw(0);
  }

  stop(): void {
    this.clearEventTextTimer();
    this.finishedEmitted = true;
  }

  private resetPlayback(): void {
    this.clearEventTextTimer();
    this.clipElapsedMs = 0;
    this.frameIndex = 0;
    this.steppedFrame = -1;
    this.finishedEmitted = false;
    this.eventText = '';
    this.ballTrail = [];
    this.confetti = [];
    // Frame 0 of a new clip has nothing to do with the last frame of the old
    // one — start every player from a clean standing pose.
    this.motion.reset();
  }

  private clearEventTextTimer(): void {
    if (this.eventTextTimer) {
      clearTimeout(this.eventTextTimer);
      this.eventTextTimer = null;
    }
  }

  /** Per-authored-frame simulation: clip events, ball trail sample, confetti
   *  physics. Runs exactly once per frame index regardless of display refresh
   *  rate, so the trail length and confetti fall speed are unchanged. */
  private stepFrame(index: number): void {
    if (!this.clip) return;

    const frame = this.clip.frames?.[Math.min(index, this.clip.frames.length - 1)];
    if (frame) {
      // Push current ball into trail buffer (max 6 entries; oldest drops off).
      this.ballTrail.push({ x: frame.ball.x, y: frame.ball.y });
      if (this.ballTrail.length > 6) this.ballTrail.shift();
    }

    this.tickConfetti();

    const event = (this.clip.events || []).find(e => e.frame === index);
    if (event) {
      this.showEventText(event.type);
      // Only a clip whose actual outcome is GOAL gets confetti (SAVE/MISS
      // clips can carry the same event type list in places).
      if (event.type === 'GOAL' && this.clip.outcome === 'GOAL') {
        this.spawnConfetti();
      }
    }
  }

  private showEventText(type: string): void {
    const labels: { [key: string]: string } = {
      'PASS': 'PASS',
      'SHOT': 'SHOT!',
      'GOAL': 'GOAL!',
      'SAVE': 'SAVED!',
      'MISS': 'MISSED!',
      'BLOCKED': 'BLOCKED!'
    };
    this.eventText = labels[type] || type;

    if (this.eventTextTimer) clearTimeout(this.eventTextTimer);
    const duration = (type === 'GOAL' || type === 'SAVE' || type === 'MISS' || type === 'BLOCKED')
      ? 2000 : 600;
    this.eventTextTimer = setTimeout(() => this.eventText = '', duration);
  }

  // ---------- rendering ----------

  /** Draw the clip at a fractional frame position, lerping every player and
   *  the ball between the two authored frames around it. */
  private draw(exactFrame: number): void {
    if (!this.clip) return;
    const frame = this.frameAt(exactFrame);
    if (!frame) return;
    this.paint(frame, this.clip.names, { clipOverlays: true });
  }

  /**
   * Draw an arbitrary frame — the persistent-pane entry point used for ambient
   * synthesis and the ambient↔clip blends. Never touches playback state.
   */
  renderFrame(frame: PitchFrame,
              names: { [playerId: number]: string } = {},
              markers: PitchMarker[] = []): void {
    this.paint(frame, names, { clipOverlays: false, markers });
  }

  private paint(frame: PitchFrame,
                names: { [playerId: number]: string },
                options: { clipOverlays: boolean; markers?: PitchMarker[] }): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    if (this.responsive) this.syncCanvasSize(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    this.lastFrame = frame;
    this.lastNames = names;
    this.lastMarkers = options.markers || [];
    this.lastClipOverlays = options.clipOverlays;

    // One projector per paint — it closes over the current canvas size.
    this.projector = createProjector(this.pitchStyle, w, h);

    this.drawPitch(ctx, w, h);
    this.drawPlayers(ctx, w, h, frame, names);
    this.drawBall(ctx, w, h, frame);
    if (options.clipOverlays) {
      this.drawEventLines(ctx, w, h, frame);
      this.drawEventText(ctx, w, h);
    }
    if (options.markers?.length) this.drawMarkers(ctx, w, h, options.markers);
    // Confetti is the topmost layer so it sits in front of the player circles
    // and the event text — pure cosmetic burst on GOAL outcomes.
    this.drawConfetti(ctx);
  }

  /** Keep the backing store in step with the CSS box so the persistent pane
   *  stays sharp when the modal is resized. Aspect is fixed at 1.6:1. */
  private syncCanvasSize(canvas: HTMLCanvasElement): void {
    const cssWidth = Math.round(canvas.clientWidth);
    if (cssWidth <= 0) return;
    const width = Math.min(1280, cssWidth);
    const height = Math.round(width / 1.6);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  /** Transient event icons (corner, foul, offside, card) pinned to the pitch. */
  private drawMarkers(ctx: CanvasRenderingContext2D, w: number, h: number,
                      markers: PitchMarker[]): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Flat styles share one font for every badge; only a depth-scaled style
    // needs to re-set it per marker.
    ctx.font = `bold ${MatchPitchComponent.fontPx(16, 1)}px sans-serif`;
    for (const marker of markers) {
      if (marker.alpha <= 0) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, marker.alpha));
      // Pin to the projected ground point, then float the badge above it in
      // screen space so it keeps its shape under perspective.
      const point = this.projector.project((marker.x / 100) * w, (marker.y / 100) * h);
      const scale = point.scale;
      const x = point.x;
      const y = point.y - 16 * scale;
      if (this.projector.perspective) {
        ctx.font = `bold ${MatchPitchComponent.fontPx(16, scale)}px sans-serif`;
      }
      ctx.beginPath();
      ctx.arc(x, y, 11 * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1 * scale;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(marker.icon, x, y);
    }
    ctx.restore();
  }

  /** Linear interpolation between the authored frames bracketing `exact`. */
  private frameAt(exact: number): PitchFrame | null {
    const frames = this.clip?.frames;
    if (!frames || frames.length === 0) return null;
    const clamped = Math.max(0, Math.min(exact, frames.length - 1));
    const low = Math.floor(clamped);
    const high = Math.min(low + 1, frames.length - 1);
    const t = clamped - low;
    const a = frames[low];
    if (t <= 0 || low === high) return a;
    const b = frames[high];

    const lerp = (from: number, to: number) =>
      isFinite(from) && isFinite(to) ? from + (to - from) * t : from;

    return {
      ball: {
        x: lerp(a.ball.x, b.ball.x),
        y: lerp(a.ball.y, b.ball.y),
        // Carrier is a discrete fact — never blend it, take the frame we're on.
        carrierPlayerId: a.ball.carrierPlayerId
      },
      players: a.players.map((player, index) => {
        const next = b.players[index];
        if (!next || next.playerId !== player.playerId) return player;
        return { ...player, x: lerp(player.x, next.x), y: lerp(player.y, next.y) };
      })
    };
  }

  private drawPlayers(ctx: CanvasRenderingContext2D, w: number, h: number,
                      frame: PitchFrame, names: { [playerId: number]: string }): void {
    const players = frame.players || [];
    const carrierId = frame.ball.carrierPlayerId;
    const projector = this.projector;

    // Project every player once: classic-space anchor → screen point + depth
    // scale. Everything below works off these.
    const points = players.map(player => {
      if (!isFinite(player.x) || !isFinite(player.y)) return null;
      return projector.project((player.x / 100) * w, (player.y / 100) * h);
    });

    // Pre-pass: figure out which name labels to suppress so the pitch doesn't
    // turn into a wall of overlapping text. Two players closer than 5 world
    // X-units AND 3 world Y-units are considered colliding — expressed here in
    // PROJECTED space (5% of the width / 3% of the height, times the depth
    // scale), so under perspective the far end tightens up exactly the way the
    // labels there shrink. For `classic` the scale is 1 and this is the same
    // test as before. Ball carrier always wins; otherwise the player with the
    // lower index keeps the label.
    const suppress = new Set<number>();
    for (let i = 0; i < players.length; i++) {
      if (suppress.has(i)) continue;
      const a = points[i];
      if (!a) continue;
      const isCarrierI = players[i].playerId === carrierId;
      for (let j = i + 1; j < players.length; j++) {
        if (suppress.has(j)) continue;
        const b = points[j];
        if (!b) continue;
        const near = Math.max(a.scale, b.scale);
        if (Math.abs(a.x - b.x) < 0.05 * w * near && Math.abs(a.y - b.y) < 0.03 * h * near) {
          const isCarrierJ = players[j].playerId === carrierId;
          if (isCarrierI) suppress.add(j);
          else if (isCarrierJ) suppress.add(i);
          else suppress.add(j);
        }
      }
    }

    // Painter's algorithm: under perspective the far players (low world y)
    // must be laid down first so nearer ones overlap them. Flat styles keep
    // the authored order untouched.
    let order = players.map((_, i) => i);
    if (projector.perspective) {
      order = order.slice().sort((i, j) => (players[i].y || 0) - (players[j].y || 0));
    }

    order.forEach(i => {
      const player = players[i];
      const point = points[i];
      if (!point) return;
      const px = point.x;
      const py = point.y;
      const scale = point.scale;
      const isScorer = player.playerId === this.clip?.scorerPlayerId;
      const isBallCarrier = player.playerId === carrierId;

      // Player circle
      const radius = 8 * scale;
      const sprites = this.pitchDetail === 'sprites';

      // Ground shadow — sells the player as standing ON the grass rather than
      // floating over it. Perspective styles only.
      if (projector.perspective) {
        ctx.save();
        ctx.beginPath();
        if (sprites) {
          // A sprite is pinned by its FEET, so the shadow sits exactly on the
          // anchor rather than below it.
          ctx.ellipse(px, py, 4.6 * scale, 1.9 * scale, 0, 0, Math.PI * 2);
        } else {
          // Sits at the player's feet: pushed a full radius below the disc and
          // wider than it, so it is actually visible instead of hiding behind
          // the kit colour.
          ctx.ellipse(px, py + radius * 0.95, radius * 1.25, radius * 0.5, 0, 0, Math.PI * 2);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fill();
        ctx.restore();
      }

      const teamKit = player.teamId === this.homeTeamId ? this.homeKit : this.awayKit;

      if (sprites) {
        this.drawPlayerSprite(ctx, player, px, py, scale, teamKit, isBallCarrier);
      } else {
        this.drawPlayerDisc(ctx, player, px, py, scale, radius, teamKit, isBallCarrier);
      }

      // Name label — drawn for every player unless suppressed by the collision
      // pre-pass. Style depends on role this frame:
      //   - scorer in the result-reveal window (frame >= 130): big bold yellow with glow
      //   - ball carrier: yellow + light glow, drops back to normal once they pass
      //   - everyone else: small semi-transparent white
      if (!suppress.has(i)) {
        const surname = names[player.playerId];
        if (surname) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const isScorerLate = isScorer && this.frameIndex >= 130;
          if (isScorerLate) {
            ctx.font = `bold ${MatchPitchComponent.fontPx(10, scale)}px sans-serif`;
            ctx.fillStyle = '#f1c40f';
            ctx.shadowColor = '#f1c40f';
            ctx.shadowBlur = 5 * scale;
          } else if (isBallCarrier) {
            ctx.font = `bold ${MatchPitchComponent.fontPx(9, scale)}px sans-serif`;
            ctx.fillStyle = '#fde047';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 3 * scale;
          } else {
            ctx.font = `${MatchPitchComponent.fontPx(7, scale)}px sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          }
          // Label sits above the head in SCREEN space — the anchor is already
          // projected, so only the offset needs the depth scale. A sprite is
          // pinned by its feet and stands ~19px tall, so it needs more room
          // than the disc's centre anchor.
          const labelLift = sprites ? SPRITE_HEAD_LIFT + 4 : 13;
          ctx.fillText(surname, px, py - labelLift * scale);
          ctx.restore();
        }
      }
    });
  }

  /** The original numbered disc — unchanged, and the only thing `discs` mode
   *  ever draws. */
  private drawPlayerDisc(ctx: CanvasRenderingContext2D, player: PitchPlayerPosition,
                         px: number, py: number, scale: number, radius: number,
                         teamKit: KitColors, isBallCarrier: boolean): void {
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);

    if (player.isGoalkeeper) {
      ctx.fillStyle = kitColor(teamKit?.gkPrimary, FALLBACK_SCORING_KIT.gkPrimary!);
      ctx.strokeStyle = kitColor(teamKit?.gkBorder, FALLBACK_SCORING_KIT.gkBorder!);
    } else {
      ctx.fillStyle = kitColor(teamKit?.outfieldPrimary, FALLBACK_SCORING_KIT.outfieldPrimary!);
      ctx.strokeStyle = kitColor(teamKit?.outfieldBorder, FALLBACK_SCORING_KIT.outfieldBorder!);
    }

    if (isBallCarrier) {
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8 * scale;
    }

    ctx.fill();
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Keep every outfield marker in one solid team colour. The backend has
    // already resolved kit clashes (including use of the away/secondary kit),
    // so adding a second stripe here makes one side look like several teams.
    // Goalkeepers remain deliberately distinct through their dedicated kit.

    // Shirt number — pick black/white based on fill brightness so the
    // number stays legible on yellow/white kits.
    ctx.fillStyle = this.numberColorFor(ctx.fillStyle as string);
    ctx.font = `bold ${MatchPitchComponent.fontPx(8, scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(player.shirtNumber || ''), px, py);
  }

  /**
   * The procedural figure. One `drawImage` of a pre-baked (kit x facing x
   * phase) bitmap, plus the shirt number — which is NOT baked, because it
   * varies per player and would multiply the cache by 22.
   *
   * Facing and the run cycle come from `SpriteMotionTracker`, i.e. from where
   * this player was the last time this canvas painted. Nothing in the backend
   * payload changes.
   */
  private drawPlayerSprite(ctx: CanvasRenderingContext2D, player: PitchPlayerPosition,
                           px: number, py: number, scale: number,
                           teamKit: KitColors, isBallCarrier: boolean): void {
    const primary = player.isGoalkeeper
      ? kitColor(teamKit?.gkPrimary, FALLBACK_SCORING_KIT.gkPrimary!)
      : kitColor(teamKit?.outfieldPrimary, FALLBACK_SCORING_KIT.outfieldPrimary!);
    const accent = player.isGoalkeeper
      ? kitColor(teamKit?.gkBorder, FALLBACK_SCORING_KIT.gkBorder!)
      : kitColor(teamKit?.outfieldBorder, FALLBACK_SCORING_KIT.outfieldBorder!);

    // World coordinates, never screen ones: the cycle must look the same in
    // every pitch style and at every canvas size.
    const pose = this.motion.pose(player.playerId, player.x, player.y);
    const bitmap = this.spriteCache.get(primary, accent, pose.dir, pose.phase);
    if (!bitmap) return;

    const width = SPRITE_W * scale;
    const height = SPRITE_H * scale;
    const left = px - SPRITE_FOOT_X * scale;
    const top = py - SPRITE_FOOT_Y * scale;

    if (isBallCarrier) {
      // Same accent the disc uses for the carrier, applied to the silhouette.
      ctx.save();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8 * scale;
      ctx.drawImage(bitmap, left, top, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(bitmap, left, top, width, height);
    }

    // Shirt number on the torso, same contrast rule as the disc.
    ctx.fillStyle = this.numberColorFor(primary);
    ctx.font = `bold ${MatchPitchComponent.fontPx(6, scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(player.shirtNumber || ''), px, py - SPRITE_NUMBER_LIFT * scale);
  }

  private drawBall(ctx: CanvasRenderingContext2D, w: number, h: number, frame: PitchFrame): void {
    const projector = this.projector;
    const ball = projector.project((frame.ball.x / 100) * w, (frame.ball.y / 100) * h);

    // Draw trail dots oldest → newest, fading alpha + shrinking size so the
    // newest position blends seamlessly into the actual ball drawn next.
    // Samples are collected once per authored frame in stepFrame().
    for (let i = 0; i < this.ballTrail.length - 1; i++) {
      const t = this.ballTrail[i];
      const ageFactor = (i + 1) / this.ballTrail.length;
      const point = projector.project((t.x / 100) * w, (t.y / 100) * h);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3 * ageFactor * point.scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + ageFactor * 0.25})`;
      ctx.fill();
    }

    const radius = 4 * ball.scale;
    // There is no ball height in the frame model, so the ball is always ON the
    // grass: a squashed shadow at the projected ground point and the ball
    // itself nudged a couple of pixels up so it reads as resting on it.
    const lift = projector.perspective ? radius * 0.7 : 0;
    if (projector.perspective) {
      ctx.beginPath();
      ctx.ellipse(ball.x, ball.y + radius * 0.35, radius * 1.25, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(ball.x, ball.y - lift, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1 * ball.scale;
    ctx.stroke();
  }

  /** Pass/shot guide lines for events fired in the last 8 frames. */
  private drawEventLines(ctx: CanvasRenderingContext2D, w: number, h: number, frame: PitchFrame): void {
    const recentEvents = (this.clip?.events || []).filter(
      (e: AnimationEvent) => e.frame >= this.frameIndex - 8 && e.frame <= this.frameIndex
    );
    const players = frame.players || [];
    for (const evt of recentEvents) {
      if (evt.type !== 'PASS' && evt.type !== 'SHOT') continue;
      const from = players.find(p => p.playerId === evt.fromPlayerId);
      const to = players.find(p => p.playerId === evt.toPlayerId);

      if (evt.type === 'SHOT') {
        if (!from || !isFinite(from.x)) continue;
        const fromPy = (from.y / 100) * h;
        this.pathLineProjected(ctx, (from.x / 100) * w, fromPy,
                               this.clip?.shooterAttacksRight ? w - 8 : 8, h / 2);
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.6)';
        ctx.lineWidth = 2 * this.projector.scaleAt(fromPy);
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (from && to && isFinite(from.x) && isFinite(to.x)) {
        const fromPy = (from.y / 100) * h;
        this.pathLineProjected(ctx, (from.x / 100) * w, fromPy,
                               (to.x / 100) * w, (to.y / 100) * h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1 * this.projector.scaleAt(fromPy);
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawEventText(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.eventText) return;
    ctx.save();
    const evtText = this.eventText;
    const isBigEvent = evtText === 'GOAL!' || evtText === 'SAVED!'
      || evtText === 'MISSED!' || evtText === 'BLOCKED!';
    ctx.font = isBigEvent ? 'bold 36px sans-serif' : 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (evtText === 'GOAL!') {
      ctx.fillStyle = '#f1c40f';
      ctx.shadowColor = '#f1c40f';
      ctx.shadowBlur = 20;
    } else if (evtText === 'SAVED!') {
      // A save is a successful goalkeeper action, not an error/goal state.
      // Keep it visually distinct from GOAL (yellow), MISS (grey) and
      // BLOCKED (orange), while remaining readable over the green pitch.
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#0ea5e9';
      ctx.shadowBlur = 16;
    } else if (evtText === 'MISSED!') {
      ctx.fillStyle = '#95a5a6';
      ctx.shadowColor = '#95a5a6';
      ctx.shadowBlur = 12;
    } else if (evtText === 'BLOCKED!') {
      ctx.fillStyle = '#e67e22';
      ctx.shadowColor = '#e67e22';
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
    }
    ctx.fillText(evtText, w / 2, h / 2 - 20);
    ctx.restore();
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
   * Emit ~60 confetti particles fanning out from the goal mouth on the scoring
   * team's kit colours. Velocities are seeded so each gets a small horizontal
   * drift and an upward burst; gravity pulls them down each frame.
   */
  private spawnConfetti(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const attacksRight = !!this.clip?.shooterAttacksRight;
    const scoringKit: KitColors = this.clip?.shooterTeamId === this.homeTeamId
      ? this.homeKit
      : this.awayKit;
    const palette: string[] = [
      kitColor(scoringKit.outfieldPrimary, '#f0c040'),
      kitColor(scoringKit.outfieldSecondary, '#fff'),
      kitColor(scoringKit.outfieldBorder, '#000'),
      '#f1c40f', '#fff', '#fef3c7'
    ];
    // Burst origin: just outside the attacking goal, projected so the burst
    // starts at the goal mouth wherever the current style puts it. Particles
    // then fly in screen space (they are in the air, not on the grass).
    const origin = createProjector(this.pitchStyle, w, h)
      .project(attacksRight ? w - 12 : 12, h / 2);
    const ox = origin.x;
    const oy = origin.y;

    this.confetti = [];
    for (let i = 0; i < 60; i++) {
      const angle = (Math.random() - 0.5) * Math.PI;   // -90..+90 from horizontal
      const speed = 3 + Math.random() * 4;
      this.confetti.push({
        x: ox + (Math.random() - 0.5) * 10,
        y: oy + (Math.random() - 0.5) * 30,
        vx: (attacksRight ? -1 : 1) * Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,                 // bias upward
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 2 + Math.random() * 3
      });
    }
  }

  /** Confetti physics — one step per authored clip frame, so the burst falls
   *  at the same speed it did on the old 30fps interval. */
  private tickConfetti(): void {
    if (this.confetti.length === 0) return;
    const h = this.canvasRef?.nativeElement?.height ?? 400;
    for (const c of this.confetti) {
      // Gravity + drag.
      c.vy += 0.18;
      c.vx *= 0.985;
      c.x += c.vx;
      c.y += c.vy;
    }
    // Cull anything that's fallen off-screen to keep the array bounded.
    this.confetti = this.confetti.filter(c => c.y < h + 20);
  }

  private drawConfetti(ctx: CanvasRenderingContext2D): void {
    for (const c of this.confetti) {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.size, c.size);
    }
  }

  // ---------- projected primitives ----------
  //
  // Every pitch marking is still expressed in the ORIGINAL classic pixel
  // geometry; these helpers put it on screen. In `classic` each one falls
  // through to the exact canvas call the renderer always made (same arguments,
  // same primitive — `arc` stays a real arc, `strokeRect` stays a strokeRect),
  // so the flat pitch is untouched by the abstraction. In a perspective style
  // the geometry is projected: straight lines keep their endpoints, rectangles
  // become quads, circles become polylines.

  /** Number of segments a circle/arc is approximated with under perspective. */
  private static readonly ARC_SEGMENTS = 32;

  private fillRectProjected(ctx: CanvasRenderingContext2D,
                            x: number, y: number, w: number, h: number): void {
    if (!this.projector.perspective) {
      ctx.fillRect(x, y, w, h);
      return;
    }
    const p = this.projector;
    const a = p.project(x, y);
    const b = p.project(x + w, y);
    const c = p.project(x + w, y + h);
    const d = p.project(x, y + h);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  private strokeRectProjected(ctx: CanvasRenderingContext2D,
                              x: number, y: number, w: number, h: number): void {
    if (!this.projector.perspective) {
      ctx.strokeRect(x, y, w, h);
      return;
    }
    const p = this.projector;
    const a = p.project(x, y);
    const b = p.project(x + w, y);
    const c = p.project(x + w, y + h);
    const d = p.project(x, y + h);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.stroke();
  }

  /** Build (but do not stroke) a straight line — a straight world line stays
   *  straight on screen, so only the endpoints need projecting. */
  private pathLineProjected(ctx: CanvasRenderingContext2D,
                            x1: number, y1: number, x2: number, y2: number): void {
    const a = this.projector.project(x1, y1);
    const b = this.projector.project(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  private strokeLineProjected(ctx: CanvasRenderingContext2D,
                              x1: number, y1: number, x2: number, y2: number): void {
    this.pathLineProjected(ctx, x1, y1, x2, y2);
    ctx.stroke();
  }

  /** Centre circle / penalty arcs. Flat styles use a true arc; perspective
   *  styles walk a polyline through the projection so the circle becomes the
   *  ellipse-like curve a camera would see. */
  private strokeArcProjected(ctx: CanvasRenderingContext2D, cx: number, cy: number,
                             r: number, from = 0, to = Math.PI * 2): void {
    if (!this.projector.perspective) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, from, to);
      ctx.stroke();
      return;
    }
    const segments = MatchPitchComponent.ARC_SEGMENTS;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = from + ((to - from) * i) / segments;
      const point = this.projector.project(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  /** Font size rounded to 0.1px. Exact for classic (scale 1 → the original
   *  integer size), smooth enough for depth-scaled text. */
  private static fontPx(base: number, scale: number): number {
    return Math.round(base * scale * 10) / 10;
  }

  private drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const p = this.projector;

    if (p.perspective) {
      // Everything the grass no longer covers: the stand band above the far
      // sideline plus a dark surround behind the tapered pitch.
      ctx.fillStyle = '#0a0f14';
      ctx.fillRect(0, 0, w, h);
      drawStandBand(ctx, w, p.project(0, 0).y);
    }

    // Background
    ctx.fillStyle = '#1a6b2a';
    this.fillRectProjected(ctx, 0, 0, w, h);

    // Pitch stripes (trapezoid bands once projected)
    const stripeCount = 10;
    const stripeW = w / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        this.fillRectProjected(ctx, i * stripeW, 0, stripeW, h);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;

    // Outer boundary
    const pad = 8;
    this.strokeRectProjected(ctx, pad, pad, w - pad * 2, h - pad * 2);

    // Center line
    this.strokeLineProjected(ctx, w / 2, pad, w / 2, h - pad);

    // Center circle
    this.strokeArcProjected(ctx, w / 2, h / 2, 30);

    // Left penalty area
    const penW = w * 0.15;
    const penH = h * 0.45;
    this.strokeRectProjected(ctx, pad, (h - penH) / 2, penW, penH);

    // Right penalty area
    this.strokeRectProjected(ctx, w - pad - penW, (h - penH) / 2, penW, penH);

    // Left 6-yard box
    const sixW = w * 0.06;
    const sixH = h * 0.2;
    this.strokeRectProjected(ctx, pad, (h - sixH) / 2, sixW, sixH);

    // Right 6-yard box
    this.strokeRectProjected(ctx, w - pad - sixW, (h - sixH) / 2, sixW, sixH);

    // Goals
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const goalH = h * 0.12;
    this.fillRectProjected(ctx, 0, (h - goalH) / 2, pad, goalH);
    this.fillRectProjected(ctx, w - pad, (h - goalH) / 2, pad, goalH);
  }
}
