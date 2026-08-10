import {
  MatchPhaseData, OfficialPosition, PhaseAction, PitchFrame, PitchPlayerPosition
} from '../models/live-match.model';
import { AmbientSlot } from './ambient-synthesizer';

/**
 * MatchWorld — the persistent continuous match simulation (Etapele 1+2 of the
 * FM-style redesign). ONE world lives for the whole match: 22 players with
 * positions AND velocities, a ball with real physics (parabolic flight,
 * bounce, rolling friction, travel time), officials — nothing ever resets
 * between highlights.
 *
 * The backend's authoritative chains are consumed as SCRIPTS: each PhaseAction
 * becomes a directive (kick the ball there, carry it there, hold for a foul)
 * that the world executes with physical motion — approach the ball, strike
 * it, chase the landing point. Events, scores and stats stay 100% owned by
 * the backend engine; this layer only decides HOW the football looks.
 *
 * Renderers keep consuming the same `PitchFrame` shape via frame().
 */

export interface WorldActionEvent {
  type: string;
  playerId: number;
  targetPlayerId: number;
  teamId: number;
}

interface WorldPlayer {
  id: number;
  teamId: number;
  shirtNumber: number;
  isGoalkeeper: boolean;
  role: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
}

// ---- physics constants (units ≈ metres, seconds) ----
const MAX_SPEED = 8.5;
const PRESS_SPEED = 9.5;
const ACCEL = 14;
const ARRIVE_RADIUS = 2.2;
const BALL_GRAVITY = 22;
const BALL_ROLL_FRICTION = 2.6;
const BALL_BOUNCE = 0.42;
const CONTROL_RADIUS = 1.6;
const CARRY_OFFSET = 0.9;

/** Ball leaves the boot and travels; completion = arrival. */
const KICK_TYPES = new Set([
  'PASS', 'BACK_PASS', 'LATERAL_PASS', 'THROUGH_BALL', 'CROSS', 'RABONA_CROSS',
  'CLEARANCE', 'SHOT', 'GOAL_KICK', 'BALL_OUT', 'HEADER'
]);

/** Carrier runs with the ball to the destination. */
const CARRY_TYPES = new Set([
  'DRIBBLE', 'SPRINT_DRIBBLE', 'SKILL_MOVE', 'STEPOVER', 'CUT_LEFT',
  'CUT_RIGHT', 'ROULETTE'
]);

/** Holds where the actor first takes possession of the ball. */
const TAKE_BALL_TYPES = new Set([
  'KICKOFF', 'GK_HOLD', 'SAVE', 'THROW_IN', 'INTERCEPTION', 'TACKLE',
  'REBOUND', 'CORNER_KICK', 'FREE_KICK', 'PENALTY_KICK', 'TURNOVER'
]);

const SET_PIECE_FOLLOWUPS = new Set([
  'CROSS', 'RABONA_CROSS', 'HEADER', 'SHOT', 'GOAL', 'SAVE', 'MISS',
  'BLOCK', 'GK_HOLD', 'CLEARANCE'
]);

const PRESS_OFFSETS: ReadonlyArray<readonly [number, number]> =
  [[-2.6, 2.2], [3.4, -2.8]];
const SUPPORT_OFFSETS: ReadonlyArray<readonly [number, number]> =
  [[12, -8], [-10, 8]];

export class MatchWorld {

  private players = new Map<number, WorldPlayer>();
  private order: number[] = [];

  readonly ball = {
    x: 50, y: 50, h: 0, vx: 0, vy: 0, vh: 0,
    carrierId: null as number | null
  };

  private queue: PhaseAction[] = [];
  private phase: MatchPhaseData | null = null;
  private current: PhaseAction | null = null;
  private state: 'approach' | 'flight' | 'carry' | 'hold' = 'hold';
  private actionMs = 0;
  private holdMs = 0;
  private flightMs = 0;
  private expectedFlightMs = 0;

  private pressers: number[] = [];
  private supports: number[] = [];
  private setPiece: Map<number, { x: number; y: number }> | null = null;

  private ref = { x: 50, y: 35 };
  private arBottomX = 35;
  private arTopX = 65;
  private zoom = 0;
  private clock = 0;

  /** Fired when an action begins executing — drives text/sound/markers. */
  onAction: ((event: WorldActionEvent) => void) | null = null;
  /** Fired at the actual moment the boot strikes the ball — drives the kick
   *  gesture, so the pose lands on contact, not at decision time. */
  onStrike: ((event: WorldActionEvent) => void) | null = null;
  /** Fired when the script queue drains — the component pulls the next minute. */
  onIdle: (() => void) | null = null;

  private idleMs = 0;
  private chaserId: number | null = null;
  private rolesAssignedAt = 0;
  private touchMs = 0;

  // ------------------------------------------------------------ roster

  /** (Re)sync from the formation slots. Existing players keep position and
   *  velocity — only their home spots move; new players enter at their spot. */
  syncRoster(slots: AmbientSlot[]): void {
    const seen = new Set<number>();
    for (const slot of slots) {
      seen.add(slot.playerId);
      const existing = this.players.get(slot.playerId);
      if (existing) {
        existing.homeX = slot.baseX;
        existing.homeY = slot.baseY;
        existing.role = slot.position;
      } else {
        this.players.set(slot.playerId, {
          id: slot.playerId, teamId: slot.teamId,
          shirtNumber: slot.shirtNumber, isGoalkeeper: slot.isGoalkeeper,
          role: slot.position,
          x: slot.baseX, y: slot.baseY, vx: 0, vy: 0,
          homeX: slot.baseX, homeY: slot.baseY
        });
        this.order.push(slot.playerId);
      }
    }
    for (const id of [...this.players.keys()]) {
      if (!seen.has(id)) {
        this.players.delete(id);
        this.order = this.order.filter(existing => existing !== id);
        if (this.ball.carrierId === id) this.ball.carrierId = null;
      }
    }
  }

  // ------------------------------------------------------------ script

  enqueuePhase(phase: MatchPhaseData): void {
    this.phase = phase;
    this.queue.push(...(phase.actions || []));
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /** Emergency reset used by the component's watchdog. */
  abort(): void {
    this.queue = [];
    this.current = null;
    this.state = 'hold';
    this.setPiece = null;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0; this.ball.h = 0;
  }

  private startNext(): void {
    const wasScript = this.current && !(this.current as any).__filler;
    this.current = this.queue.shift() || null;
    if (!this.current) {
      this.setPiece = null;
      this.zoom = 0;
      this.idleMs = 0;
      if (wasScript) this.onIdle?.();
      return;
    }
    const action = this.current;
    this.actionMs = 0;
    this.rolesAssignedAt = this.clock;

    // Roles for this action (sticky — see stickyNearest).
    const excluded = new Set([action.playerId, action.targetPlayerId || 0]);
    this.pressers = this.stickyNearest(this.pressers,
      p => p.teamId !== action.teamId && !p.isGoalkeeper,
      action.endX, action.endY, 2, excluded);
    this.supports = this.stickyNearest(this.supports,
      p => p.teamId === action.teamId && !p.isGoalkeeper,
      action.endX, action.endY, 2, excluded);

    if (action.type === 'CORNER_KICK' || action.type === 'FREE_KICK') {
      this.setPiece = this.buildSetPieceTargets(action);
    } else if (this.setPiece && !SET_PIECE_FOLLOWUPS.has(action.type)) {
      this.setPiece = null;
    }

    this.zoom = this.zoomFor(action);
    if (!(action as any).__filler) {
      this.onAction?.({
        type: action.type,
        playerId: action.playerId,
        targetPlayerId: action.targetPlayerId || 0,
        teamId: action.teamId
      });
    }

    if (KICK_TYPES.has(action.type)) {
      this.state = 'approach';
    } else if (CARRY_TYPES.has(action.type)) {
      this.state = 'carry';
      this.claimBall(action.playerId);
    } else {
      this.state = 'hold';
      this.holdMs = action.durationMs || 600;
      if (TAKE_BALL_TYPES.has(action.type)) this.claimBall(action.playerId);
    }
  }

  /** The actor takes the ball if it is plausibly takeable; otherwise he will
   *  simply be steered toward it and pick it up on contact. */
  private claimBall(playerId: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const distance = Math.hypot(this.ball.x - player.x, this.ball.y - player.y);
    if (distance < 3.5) {
      this.ball.carrierId = playerId;
      this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0;
    }
  }

  private zoomFor(action: PhaseAction): number {
    if (CARRY_TYPES.has(action.type) || action.type === 'SHOT'
        || action.type === 'PENALTY_KICK' || action.type === 'GOAL'
        || action.type === 'SAVE' || action.type === 'RABONA_CROSS') return 1;
    const length = Math.hypot(action.endX - action.x, action.endY - action.y);
    return (action.type === 'GOAL_KICK' || length > 32) ? -1 : 0;
  }

  // ------------------------------------------------------------ tick

  tick(dtMs: number): void {
    const dt = Math.min(0.05, Math.max(0.001, dtMs / 1000));
    this.clock += dtMs;
    if (!this.current && this.queue.length > 0) this.startNext();
    if (!this.current) this.idleTick(dtMs);
    this.advanceAction(dtMs);
    this.tickBall(dt);
    this.tickPlayers(dt);
    this.tickOfficials(dt);
  }

  /**
   * Etapa 5 — filler football between authoritative minutes: a loose ball gets
   * chased and collected; a held ball gets recycled with safe short passes, so
   * the world keeps PLAYING while it waits for the next checkpoint.
   */
  private idleTick(dtMs: number): void {
    this.idleMs += dtMs;
    if (this.ball.carrierId == null) {
      const speed = Math.hypot(this.ball.vx, this.ball.vy);
      if (speed < 4 && this.ball.h < 0.6) {
        // Nearest player chases and collects.
        let nearest: WorldPlayer | null = null;
        let nearestDist = Infinity;
        for (const id of this.order) {
          const player = this.players.get(id)!;
          const d = Math.hypot(player.x - this.ball.x, player.y - this.ball.y);
          if (d < nearestDist) { nearestDist = d; nearest = player; }
        }
        this.chaserId = nearest?.id ?? null;
        if (nearest && nearestDist < CONTROL_RADIUS + 0.3) {
          this.ball.carrierId = nearest.id;
          this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0; this.ball.h = 0;
          this.chaserId = null;
        }
      }
      return;
    }
    this.chaserId = null;
    if (this.idleMs > 1500) {
      this.idleMs = 0;
      this.fillerPass();
    }
  }

  /** One safe recycling pass by the current carrier — same physics pipeline,
   *  silent (no commentary text), deterministic pick. */
  private fillerPass(): void {
    const carrier = this.ball.carrierId != null
      ? this.players.get(this.ball.carrierId) : undefined;
    if (!carrier) return;
    let best: WorldPlayer | null = null;
    let bestScore = Infinity;
    for (const id of this.order) {
      const mate = this.players.get(id)!;
      if (mate.teamId !== carrier.teamId || mate.id === carrier.id) continue;
      const d = Math.hypot(mate.x - carrier.x, mate.y - carrier.y);
      if (d < 6 || d > 22) continue;
      // Prefer safe (lateral/backward-ish relative to nothing in idle): just
      // the closest comfortable option, with a stable deterministic tiebreak.
      const score = d + (mate.id % 7) * 0.01;
      if (score < bestScore) { bestScore = score; best = mate; }
    }
    if (!best) return;
    const distance = Math.hypot(best.x - carrier.x, best.y - carrier.y);
    const filler = {
      type: 'PASS', playerId: carrier.id, targetPlayerId: best.id,
      teamId: carrier.teamId,
      x: this.ball.x, y: this.ball.y, endX: best.x, endY: best.y,
      durationMs: 320 + distance * 26, peakHeight: 0
    } as PhaseAction;
    (filler as any).__filler = true;
    this.queue.unshift(filler);
  }

  private advanceAction(dtMs: number): void {
    const action = this.current;
    if (!action) return;
    this.actionMs += dtMs;

    switch (this.state) {
      case 'approach': {
        const actor = this.players.get(action.playerId);
        if (!actor) { this.startNext(); return; }
        // Golden rule: the ball only ever leaves a boot. The actor must first
        // HAVE the ball (a visible control touch), then strike it — never a
        // kick fired from thin air because a timer ran out.
        if (this.ball.carrierId === actor.id) {
          this.touchMs += dtMs;
          if (this.touchMs >= 140) this.kick(action);
          return;
        }
        const distance = Math.hypot(this.ball.x - actor.x, this.ball.y - actor.y);
        if (distance <= CONTROL_RADIUS + 0.4) {
          this.ball.carrierId = actor.id;
          this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0;
          this.touchMs = 0;
        } else if (this.actionMs > 6000) {
          // Watchdog only — at MAX_SPEED any on-pitch ball is reachable in <6s.
          this.startNext();
        }
        return;
      }
      case 'flight': {
        this.flightMs += dtMs;
        // The receiver TRAPS the ball the moment it reaches his feet — real
        // passes end at a boot, they don't roll to a stop.
        const receiver = action.targetPlayerId
          ? this.players.get(action.targetPlayerId) : undefined;
        if (receiver && this.flightMs > 120 && this.ball.h < 1.4
            && Math.hypot(this.ball.x - receiver.x, this.ball.y - receiver.y)
               < CONTROL_RADIUS + 0.5) {
          this.deliver(action);
          this.startNext();
          return;
        }
        // Targetless kicks (shots, clearances, balls out) complete on arrival.
        const distToEnd = Math.hypot(action.endX - this.ball.x, action.endY - this.ball.y);
        const speed = Math.hypot(this.ball.vx, this.ball.vy);
        const landed = this.ball.h <= 0.03 && speed < 2.2;
        if ((!receiver && distToEnd < 1.3 && this.ball.h < 2.2)
            || landed || this.flightMs > this.expectedFlightMs * 2.5 + 800) {
          this.deliver(action);
          this.startNext();
        }
        return;
      }
      case 'carry': {
        const actor = this.players.get(action.playerId);
        if (!actor) { this.startNext(); return; }
        // A dribble needs the ball first: fetch it, THEN run with it.
        if (this.ball.carrierId !== actor.id) {
          const d = Math.hypot(this.ball.x - actor.x, this.ball.y - actor.y);
          if (d <= CONTROL_RADIUS + 0.4) {
            this.ball.carrierId = actor.id;
            this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0;
          } else if (this.actionMs > 6000) {
            this.startNext();
          }
          return;
        }
        const arrived =
          Math.hypot(action.endX - actor.x, action.endY - actor.y) < 1.4;
        if (arrived || this.actionMs > (action.durationMs || 800) * 2.2 + 600) {
          this.startNext();
        }
        return;
      }
      case 'hold': {
        // Take-ball holds (interception, throw-in, GK hold…) only make sense
        // WITH the ball: the actor runs to collect it first, and the hold
        // timer effectively starts once he has it.
        const actor = this.players.get(action.playerId);
        if (actor && TAKE_BALL_TYPES.has(action.type)
            && this.ball.carrierId !== actor.id) {
          const d = Math.hypot(this.ball.x - actor.x, this.ball.y - actor.y);
          if (d <= CONTROL_RADIUS + 0.4) {
            this.ball.carrierId = actor.id;
            this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0;
          } else if (this.actionMs > 6000) {
            this.startNext();
            return;
          } else {
            this.holdMs = Math.max(this.holdMs,
              this.actionMs + (action.durationMs || 600));
            return;
          }
        }
        if (this.actionMs >= this.holdMs) this.startNext();
        return;
      }
    }
  }

  /** Strike the ball toward the action's destination with real travel time —
   *  duration comes from the backend pacing, the arc from peakHeight. */
  private kick(action: PhaseAction): void {
    const distance = Math.max(0.5,
      Math.hypot(action.endX - this.ball.x, action.endY - this.ball.y));
    let flightSec = Math.max(0.25, (action.durationMs || 600) / 1000);
    const peak = action.peakHeight || 0;
    if (peak > 0) {
      // The arc dictates hang time: T = sqrt(8·peak/g).
      flightSec = Math.max(flightSec, Math.sqrt((8 * peak) / BALL_GRAVITY));
      this.ball.vh = (BALL_GRAVITY * flightSec) / 2;
    } else {
      this.ball.vh = 0;
    }
    this.ball.vx = (action.endX - this.ball.x) / flightSec;
    this.ball.vy = (action.endY - this.ball.y) / flightSec;
    if (peak === 0) {
      // Ground ball: give it the extra pace friction will eat en route.
      const boost = (BALL_ROLL_FRICTION * flightSec) / 2;
      const norm = Math.hypot(this.ball.vx, this.ball.vy) || 1;
      this.ball.vx += (this.ball.vx / norm) * boost;
      this.ball.vy += (this.ball.vy / norm) * boost;
    }
    this.ball.carrierId = null;
    this.state = 'flight';
    this.flightMs = 0;
    this.expectedFlightMs = flightSec * 1000;
    this.onStrike?.({
      type: action.type,
      playerId: action.playerId,
      targetPlayerId: action.targetPlayerId || 0,
      teamId: action.teamId
    });
  }

  private deliver(action: PhaseAction): void {
    // Possession changes hands only where the ball ACTUALLY is — a receiver
    // far from the physical ball must run to it (the next action's fetch
    // logic handles that), never have it teleported to his feet.
    const receiver = action.targetPlayerId
      ? this.players.get(action.targetPlayerId) : undefined;
    if (receiver
        && Math.hypot(this.ball.x - receiver.x, this.ball.y - receiver.y) < 3) {
      this.ball.carrierId = receiver.id;
      this.ball.vx = 0; this.ball.vy = 0; this.ball.vh = 0;
    } else {
      // Missed connection: the ball keeps rolling naturally — freezing it
      // mid-motion in empty space is exactly what reads as "teleport".
      this.ball.carrierId = null;
    }
  }

  // ------------------------------------------------------------ physics

  private tickBall(dt: number): void {
    const carrier = this.ball.carrierId != null
      ? this.players.get(this.ball.carrierId) : undefined;
    if (carrier) {
      // Eased toward a point just ahead of the carrier's feet — never snapped,
      // so taking possession reads as a touch, not a teleport.
      const speed = Math.hypot(carrier.vx, carrier.vy);
      const dirX = speed > 0.3 ? carrier.vx / speed : 0;
      const dirY = speed > 0.3 ? carrier.vy / speed : 0.4;
      const footX = carrier.x + dirX * CARRY_OFFSET;
      const footY = carrier.y + dirY * CARRY_OFFSET;
      const settle = Math.min(1, 12 * dt);
      this.ball.x += (footX - this.ball.x) * settle;
      this.ball.y += (footY - this.ball.y) * settle;
      this.ball.h += (0 - this.ball.h) * settle;
      return;
    }
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    if (this.ball.h > 0 || this.ball.vh !== 0) {
      this.ball.h += this.ball.vh * dt;
      this.ball.vh -= BALL_GRAVITY * dt;
      if (this.ball.h <= 0) {
        this.ball.h = 0;
        // Bounce until the energy is gone, then roll.
        this.ball.vh = this.ball.vh < -3 ? -this.ball.vh * BALL_BOUNCE : 0;
      }
    } else {
      // Rolling friction.
      const speed = Math.hypot(this.ball.vx, this.ball.vy);
      if (speed > 0) {
        const drop = BALL_ROLL_FRICTION * dt;
        const factor = Math.max(0, speed - drop) / speed;
        this.ball.vx *= factor;
        this.ball.vy *= factor;
      }
    }
    this.ball.x = clamp(this.ball.x, -3, 103);
    this.ball.y = clamp(this.ball.y, -2, 102);
  }

  private tickPlayers(dt: number): void {
    for (const id of this.order) {
      const player = this.players.get(id)!;
      const target = this.targetFor(player);
      // Steering "arrive": desired velocity toward the target, slowing inside
      // the arrive radius, acceleration-limited — positions are NEVER set.
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const distance = Math.hypot(dx, dy);
      const speedCap = target.speed;
      const desired = distance > 0.05
        ? Math.min(speedCap, (distance / ARRIVE_RADIUS) * speedCap)
        : 0;
      const desiredVx = distance > 0.05 ? (dx / distance) * desired : 0;
      const desiredVy = distance > 0.05 ? (dy / distance) * desired : 0;
      const maxDelta = ACCEL * dt;
      const dvx = clampAbs(desiredVx - player.vx, maxDelta);
      const dvy = clampAbs(desiredVy - player.vy, maxDelta);
      player.vx += dvx;
      player.vy += dvy;
      player.x = clamp(player.x + player.vx * dt, 0.5, 99.5);
      player.y = clamp(player.y + player.vy * dt, 1, 99);
    }
  }

  /** Where this player wants to be RIGHT NOW, and how fast he may go. */
  private targetFor(player: WorldPlayer): { x: number; y: number; speed: number } {
    const action = this.current;

    if (action) {
      const spot = this.setPiece?.get(player.id);
      if (spot && player.id !== action.playerId
          && player.id !== action.targetPlayerId) {
        return { x: spot.x, y: spot.y, speed: MAX_SPEED };
      }

      if (player.id === action.playerId) {
        if (this.state === 'approach') {
          return { x: this.ball.x, y: this.ball.y, speed: MAX_SPEED };
        }
        if (this.state === 'carry') {
          return this.ball.carrierId === player.id
            ? { x: action.endX, y: action.endY, speed: MAX_SPEED }
            : { x: this.ball.x, y: this.ball.y, speed: MAX_SPEED };
        }
        if (TAKE_BALL_TYPES.has(action.type)
            && this.ball.carrierId !== player.id) {
          return { x: this.ball.x, y: this.ball.y, speed: MAX_SPEED };
        }
        return { x: action.x, y: action.y, speed: MAX_SPEED };
      }

      if (player.id === action.targetPlayerId && this.state === 'flight') {
        // Meet the ACTUAL ball, slightly ahead of it (intercept its path) —
        // if the pass is into space he runs onto it, if it comes to him he
        // barely moves; either way he tracks the physical ball, not a
        // scripted landing spot the physics may never quite reach.
        const lead = Math.min(0.6,
          Math.max(0.15, (this.expectedFlightMs - this.flightMs) / 1000));
        return {
          x: this.ball.x + this.ball.vx * lead,
          y: this.ball.y + this.ball.vy * lead,
          speed: MAX_SPEED
        };
      }

      // Etapa 6 — staggered reaction delay: role players "notice" the new
      // situation 150-390ms after it happens, each on his own clock, instead
      // of all 22 reacting in the same frame.
      const reacted = this.clock >= this.rolesAssignedAt + 150 + (player.id % 5) * 60;
      const pressIndex = this.pressers.indexOf(player.id);
      if (pressIndex >= 0 && reacted) {
        const ring = PRESS_OFFSETS[pressIndex];
        return {
          x: this.ball.x + ring[0], y: this.ball.y + ring[1],
          speed: PRESS_SPEED
        };
      }
      const supportIndex = this.supports.indexOf(player.id);
      if (supportIndex >= 0 && reacted) {
        const run = SUPPORT_OFFSETS[supportIndex];
        return {
          x: this.ball.x + run[0], y: this.ball.y + run[1],
          speed: MAX_SPEED
        };
      }
    }

    // Loose-ball chase during idle play.
    if (!action && this.ball.carrierId == null && player.id === this.chaserId) {
      return { x: this.ball.x, y: this.ball.y, speed: MAX_SPEED };
    }

    // Everyone else: hold the formation shape, leaning with play, breathing,
    // and keeping out of the immediate duel zone.
    const probe = Math.sin(this.clock * 0.0011 + player.id * 1.3) * 1.2;
    let tx = player.homeX
      + clampAbs((this.ball.x - player.homeX) * 0.2, 9) + probe;
    let ty = player.homeY + clampAbs((this.ball.y - player.homeY) * 0.15, 7);
    const awayX = tx - this.ball.x;
    const awayY = ty - this.ball.y;
    const distToBall = Math.hypot(awayX, awayY);
    // Keep out of the duel zone only while the ball is owned or in transit —
    // dodging a LOOSE ball looks absurd (players sidestepping the ball).
    const ballLoose = this.ball.carrierId == null && this.ball.h < 0.5
      && Math.hypot(this.ball.vx, this.ball.vy) < 3;
    if (!ballLoose && distToBall < 6) {
      const push = 6 / Math.max(0.1, distToBall);
      tx = this.ball.x + awayX * push;
      ty = this.ball.y + awayY * push;
    }
    return { x: tx, y: ty, speed: MAX_SPEED * 0.75 };
  }

  private tickOfficials(dt: number): void {
    const action = this.current;
    const refTargetX = action?.refX ?? this.ball.x - 8;
    const refTargetY = action?.refY ?? clamp(this.ball.y + (50 - this.ball.y) * 0.5, 10, 90);
    const ease = Math.min(1, 3.2 * dt);
    this.ref.x += (clamp(refTargetX, 2, 98) - this.ref.x) * ease;
    this.ref.y += (clamp(refTargetY, 4, 96) - this.ref.y) * ease;
    const bottomTarget = action?.assistantBottomX ?? Math.min(this.ball.x, 48);
    const topTarget = action?.assistantTopX ?? Math.max(this.ball.x, 52);
    this.arBottomX += (clamp(bottomTarget, 2, 50) - this.arBottomX) * ease;
    this.arTopX += (clamp(topTarget, 50, 98) - this.arTopX) * ease;
  }

  // ------------------------------------------------------------ output

  frame(): PitchFrame {
    const players: PitchPlayerPosition[] = this.order.map(id => {
      const player = this.players.get(id)!;
      return {
        playerId: player.id,
        teamId: player.teamId,
        shirtNumber: player.shirtNumber,
        x: player.x,
        y: player.y,
        isGoalkeeper: player.isGoalkeeper
      };
    });
    const officials: OfficialPosition[] = [
      { x: this.ref.x, y: this.ref.y, role: 'REF' },
      { x: this.arBottomX, y: 1.5, role: 'AR' },
      { x: this.arTopX, y: 98.5, role: 'AR' }
    ];
    return {
      ball: {
        x: this.ball.x, y: this.ball.y, h: this.ball.h,
        carrierPlayerId: this.ball.carrierId
      },
      players,
      officials,
      zoom: this.zoom
    };
  }

  // ------------------------------------------------------------ helpers

  private stickyNearest(previous: number[],
                        filter: (p: WorldPlayer) => boolean,
                        x: number, y: number, count: number,
                        exclude: Set<number>): number[] {
    const eligible = this.order
      .map(id => this.players.get(id)!)
      .filter(p => filter(p) && !exclude.has(p.id))
      .map(p => ({ id: p.id, d: Math.hypot(p.x - x, p.y - y) }))
      .sort((a, b) => a.d - b.d);
    if (eligible.length === 0) return [];
    const chosen: number[] = [];
    const nearestDist = eligible[0].d;
    for (const id of previous) {
      const entry = eligible.find(e => e.id === id);
      if (entry && entry.d <= nearestDist * 1.7 + 5 && chosen.length < count) {
        chosen.push(id);
      }
    }
    for (const entry of eligible) {
      if (chosen.length >= count) break;
      if (!chosen.includes(entry.id)) chosen.push(entry.id);
    }
    return chosen;
  }

  /** Corner / attacking free kick: attackers on box spots, defenders marking
   *  goal-side, keeper on his line, spares covering. Deterministic. */
  private buildSetPieceTargets(action: PhaseAction): Map<number, { x: number; y: number }> {
    const phase = this.phase;
    const attackingRight = phase && action.teamId === phase.teamId
      ? phase.attackingRight : !(phase?.attackingRight ?? true);
    const goalX = attackingRight ? 100 : 0;
    const inward = attackingRight ? -1 : 1;
    const spot = (depth: number, y: number) => ({ x: goalX + inward * depth, y });

    const targets = new Map<number, { x: number; y: number }>();
    const attackers = this.order.map(id => this.players.get(id)!)
      .filter(p => p.teamId === action.teamId && !p.isGoalkeeper
        && p.id !== action.playerId)
      .sort((a, b) => a.id - b.id);
    const defenders = this.order.map(id => this.players.get(id)!)
      .filter(p => p.teamId !== action.teamId)
      .sort((a, b) => a.id - b.id);

    const boxSpots = [spot(8, 44), spot(8, 56), spot(11, 50), spot(6, 50),
      spot(13, 41), spot(13, 59)];
    const coverSpots = [spot(42, 30), spot(42, 70), spot(55, 50), spot(45, 50)];
    attackers.forEach((p, i) => {
      targets.set(p.id, i < boxSpots.length
        ? boxSpots[i] : coverSpots[(i - boxSpots.length) % coverSpots.length]);
    });
    const spareSpots = [spot(2, 46), spot(2, 54), spot(17, 50), spot(20, 38), spot(20, 62)];
    let marked = 0;
    let spare = 0;
    for (const defender of defenders) {
      if (defender.isGoalkeeper) {
        targets.set(defender.id, spot(1.5, 50));
      } else if (marked < boxSpots.length) {
        const mark = boxSpots[marked++];
        targets.set(defender.id, { x: mark.x - inward * 1.8, y: mark.y + 1.2 });
      } else {
        targets.set(defender.id, spareSpots[spare++ % spareSpots.length]);
      }
    }
    return targets;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clampAbs(value: number, max: number): number {
  return value > max ? max : value < -max ? -max : value;
}
