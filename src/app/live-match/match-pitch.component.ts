import {
  AfterViewChecked, Component, ElementRef, EventEmitter, Input,
  OnChanges, OnDestroy, Output, SimpleChanges, ViewChild
} from '@angular/core';
import {
  AnimationEvent, GoalAnimationData, KitColors, PitchClip, PitchFrame
} from '../models/live-match.model';

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
    ctx.font = 'bold 16px sans-serif';
    for (const marker of markers) {
      if (marker.alpha <= 0) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, marker.alpha));
      const x = (marker.x / 100) * w;
      const y = (marker.y / 100) * h;
      ctx.beginPath();
      ctx.arc(x, y - 16, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(marker.icon, x, y - 16);
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

    // Pre-pass: figure out which name labels to suppress so the pitch doesn't
    // turn into a wall of overlapping text. World coords are 0-100; two players
    // within 5 X-units AND 3 Y-units are considered colliding. Ball carrier
    // always wins; otherwise the player with the lower index keeps the label.
    const suppress = new Set<number>();
    for (let i = 0; i < players.length; i++) {
      if (suppress.has(i)) continue;
      const a = players[i];
      if (!isFinite(a.x) || !isFinite(a.y)) continue;
      const isCarrierI = a.playerId === carrierId;
      for (let j = i + 1; j < players.length; j++) {
        if (suppress.has(j)) continue;
        const b = players[j];
        if (!isFinite(b.x) || !isFinite(b.y)) continue;
        if (Math.abs(a.x - b.x) < 5 && Math.abs(a.y - b.y) < 3) {
          const isCarrierJ = b.playerId === carrierId;
          if (isCarrierI) suppress.add(j);
          else if (isCarrierJ) suppress.add(i);
          else suppress.add(j);
        }
      }
    }

    players.forEach((player, i) => {
      if (!isFinite(player.x) || !isFinite(player.y)) return;
      const px = (player.x / 100) * w;
      const py = (player.y / 100) * h;
      const isScorer = player.playerId === this.clip?.scorerPlayerId;
      const isBallCarrier = player.playerId === carrierId;

      // Player circle
      const radius = 8;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);

      const teamKit = player.teamId === this.homeTeamId ? this.homeKit : this.awayKit;
      if (player.isGoalkeeper) {
        ctx.fillStyle = kitColor(teamKit?.gkPrimary, FALLBACK_SCORING_KIT.gkPrimary!);
        ctx.strokeStyle = kitColor(teamKit?.gkBorder, FALLBACK_SCORING_KIT.gkBorder!);
      } else {
        ctx.fillStyle = kitColor(teamKit?.outfieldPrimary, FALLBACK_SCORING_KIT.outfieldPrimary!);
        ctx.strokeStyle = kitColor(teamKit?.outfieldBorder, FALLBACK_SCORING_KIT.outfieldBorder!);
      }

      if (isBallCarrier) {
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
      }

      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Keep every outfield marker in one solid team colour. The backend has
      // already resolved kit clashes (including use of the away/secondary kit),
      // so adding a second stripe here makes one side look like several teams.
      // Goalkeepers remain deliberately distinct through their dedicated kit.

      // Shirt number — pick black/white based on fill brightness so the
      // number stays legible on yellow/white kits.
      ctx.fillStyle = this.numberColorFor(ctx.fillStyle as string);
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.shirtNumber || ''), px, py);

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
  }

  private drawBall(ctx: CanvasRenderingContext2D, w: number, h: number, frame: PitchFrame): void {
    const bx = (frame.ball.x / 100) * w;
    const by = (frame.ball.y / 100) * h;

    // Draw trail dots oldest → newest, fading alpha + shrinking size so the
    // newest position blends seamlessly into the actual ball drawn next.
    // Samples are collected once per authored frame in stepFrame().
    for (let i = 0; i < this.ballTrail.length - 1; i++) {
      const t = this.ballTrail[i];
      const ageFactor = (i + 1) / this.ballTrail.length;
      ctx.beginPath();
      ctx.arc((t.x / 100) * w, (t.y / 100) * h, 3 * ageFactor, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + ageFactor * 0.25})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
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
        ctx.beginPath();
        ctx.moveTo((from.x / 100) * w, (from.y / 100) * h);
        ctx.lineTo(this.clip?.shooterAttacksRight ? w - 8 : 8, h / 2);
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (from && to && isFinite(from.x) && isFinite(to.x)) {
        ctx.beginPath();
        ctx.moveTo((from.x / 100) * w, (from.y / 100) * h);
        ctx.lineTo((to.x / 100) * w, (to.y / 100) * h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
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
    // Burst origin: just outside the attacking goal.
    const ox = attacksRight ? w - 12 : 12;
    const oy = h / 2;

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
}
