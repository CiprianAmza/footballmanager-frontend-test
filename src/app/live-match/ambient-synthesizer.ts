import {
  LiveMatchMinute, PitchFrame, PitchPlayerPosition, PlayerStaminaInfo
} from '../models/live-match.model';

/**
 * Client-side "ambient" state for the minutes between the engine's animated
 * moments. The backend has no continuous positions (Faza 2 would add them), so
 * we synthesise a plausible 11v11 shape out of what it *does* tell us: the
 * on-pitch squads, the formations, and the latest timeline event.
 *
 * Everything here is a pure function of (server truth + clock). No RNG, no
 * hidden state — the caller owns the `AmbientState` object and advances its
 * clock; two viewers of the same match see the same movement.
 */

/**
 * Formation anchors in the same 0-100 space the backend uses, for a team
 * attacking toward x=100. Source of truth: `FrameCompiler.basePosition()`.
 */
export const FORMATION_ANCHORS: { [position: string]: { x: number; y: number } } = {
  GK:  { x: 4,  y: 50 },
  DL:  { x: 25, y: 14 },
  DC:  { x: 25, y: 50 },
  DR:  { x: 25, y: 86 },
  WBL: { x: 30, y: 10 },
  WBR: { x: 30, y: 90 },
  DM:  { x: 35, y: 50 },
  ML:  { x: 48, y: 14 },
  MC:  { x: 48, y: 50 },
  MR:  { x: 48, y: 86 },
  AML: { x: 62, y: 20 },
  AMC: { x: 62, y: 50 },
  AMR: { x: 62, y: 80 },
  ST:  { x: 72, y: 50 }
};

/** How far the in-possession block pushes forward, and how far the defending
 *  block drops, in pitch units. */
const POSSESSION_PUSH = 6;
const DEFENSIVE_DROP = 4;

/** Idle patrol: everyone breathes around their anchor. Amplitude stays ≤2 so
 *  the shape never reads as a different formation. */
const PATROL_AMPLITUDE = 1.6;

/** Phase transitions lerp over roughly one second of match-clock time. */
export const AMBIENT_TRANSITION_MS = 1000;

/** An offside whistle holds the picture still for a beat. */
const FREEZE_MS = 1200;

export interface AmbientSlot {
  playerId: number;
  teamId: number;
  shirtNumber: number;
  isGoalkeeper: boolean;
  position: string;
  /** Anchor, already mirrored for the direction this team attacks. */
  baseX: number;
  baseY: number;
  attacksRight: boolean;
}

/** What the pitch is doing right now, derived from one timeline event. */
export interface AmbientPhase {
  /** Team in possession, or null for a neutral picture. */
  teamId: number | null;
  eventType: string;
  ball: { x: number; y: number };
  /** Hold the players still for a beat (offside whistle). */
  frozen: boolean;
}

export interface AmbientState {
  slots: AmbientSlot[];
  previous: AmbientPhase;
  current: AmbientPhase;
  /** Time inside the current transition; lerps over AMBIENT_TRANSITION_MS. */
  transitionMs: number;
  /** Monotonic clock driving the idle patrol. */
  elapsedMs: number;
}

export function neutralPhase(): AmbientPhase {
  return { teamId: null, eventType: 'none', ball: { x: 50, y: 50 }, frozen: false };
}

export function emptyAmbientState(): AmbientState {
  return {
    slots: [],
    previous: neutralPhase(),
    current: neutralPhase(),
    transitionMs: AMBIENT_TRANSITION_MS,
    elapsedMs: 0
  };
}

/**
 * Spread players who share a position code evenly on the y axis around their
 * anchor: 2×DC → 38/62, 3×DC → 30/50/70, 2×MC → 40/60, 2×ST → 40/60.
 */
export function spreadOffsets(count: number, position: string): number[] {
  if (count <= 1) return [0];
  if (count === 2) {
    const half = position === 'DC' ? 12 : 10;
    return [-half, half];
  }
  if (count === 3) return [-20, 0, 20];
  const spacing = Math.min(20, 60 / (count - 1));
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}

/**
 * Lay a side out on the formation anchors. Positions come from the server's
 * on-pitch array, so a red card or a substitution changes the shape as soon as
 * the next `/advance` response lands.
 */
export function buildTeamSlots(
  players: PlayerStaminaInfo[],
  teamId: number,
  attacksRight: boolean,
  shirtNumbers: { [playerId: number]: number } = {}
): AmbientSlot[] {

  const byPosition = new Map<string, PlayerStaminaInfo[]>();
  for (const player of players || []) {
    const code = normalisePosition(player.position);
    const bucket = byPosition.get(code);
    if (bucket) bucket.push(player); else byPosition.set(code, [player]);
  }

  const slots: AmbientSlot[] = [];
  byPosition.forEach((group, code) => {
    const anchor = FORMATION_ANCHORS[code] || FORMATION_ANCHORS['MC'];
    const offsets = spreadOffsets(group.length, code);
    group.forEach((player, index) => {
      const x = attacksRight ? anchor.x : 100 - anchor.x;
      slots.push({
        playerId: player.playerId,
        teamId,
        shirtNumber: shirtNumbers[player.playerId] || 0,
        isGoalkeeper: code === 'GK',
        position: code,
        baseX: clamp(x, 2, 98),
        baseY: clamp(anchor.y + offsets[index], 3, 97),
        attacksRight
      });
    });
  });
  return slots;
}

/** Map a squad position code onto one the anchor table knows. */
function normalisePosition(position: string | undefined): string {
  const code = (position || 'MC').toUpperCase();
  if (FORMATION_ANCHORS[code]) return code;
  if (code === 'DMC' || code === 'DML' || code === 'DMR') return 'DM';
  if (code === 'WBL' || code === 'DWBL') return 'WBL';
  if (code === 'WBR' || code === 'DWBR') return 'WBR';
  if (code === 'SC' || code === 'FC' || code === 'CF') return 'ST';
  if (code.startsWith('AM')) return 'AMC';
  if (code.startsWith('D')) return 'DC';
  if (code.startsWith('M')) return 'MC';
  return 'MC';
}

/**
 * Turn the latest timeline event into a pitch phase: who has the ball and
 * roughly where it is. Unknown or absent events give a neutral midfield.
 */
export function phaseFor(
  event: LiveMatchMinute | null | undefined,
  homeTeamId: number,
  awayTeamId: number,
  homeAttacksRight: boolean
): AmbientPhase {

  if (!event || !event.eventType) return neutralPhase();

  const eventTeamId = Number(event.teamId ?? 0);
  const known = eventTeamId === homeTeamId || eventTeamId === awayTeamId;
  if (!known) return { ...neutralPhase(), eventType: event.eventType };

  const attacksRight = (teamId: number) =>
    teamId === homeTeamId ? homeAttacksRight : !homeAttacksRight;
  const opponentOf = (teamId: number) => teamId === homeTeamId ? awayTeamId : homeTeamId;
  const side = (right: boolean, rightValue: number) => right ? rightValue : 100 - rightValue;
  // Deterministic left/right pick so the same minute always looks the same.
  const flank = (event.minute % 2 === 0) ? 8 : 92;

  switch (event.eventType) {
    case 'corner':
      return {
        teamId: eventTeamId, eventType: event.eventType, frozen: false,
        ball: { x: side(attacksRight(eventTeamId), 95), y: flank }
      };

    case 'foul': {
      // The event carries the fouler's team; the free kick — and therefore the
      // ball — belongs to the other side, on their own half of the pitch.
      const fouled = opponentOf(eventTeamId);
      return {
        teamId: fouled, eventType: event.eventType, frozen: false,
        ball: { x: side(attacksRight(fouled), 42), y: event.minute % 2 === 0 ? 35 : 65 }
      };
    }

    case 'offside':
      return {
        teamId: opponentOf(eventTeamId), eventType: event.eventType, frozen: true,
        ball: { x: side(attacksRight(eventTeamId), 76), y: flank === 8 ? 32 : 68 }
      };

    case 'goal':
    case 'shot_saved':
    case 'shot_wide':
    case 'shot_blocked':
    case 'chance':
    case 'attack':
    case 'buildup':
      return {
        teamId: eventTeamId, eventType: event.eventType, frozen: false,
        ball: { x: side(attacksRight(eventTeamId), 78), y: 50 }
      };

    case 'commentary':
    case 'possession':
      return {
        teamId: eventTeamId, eventType: event.eventType, frozen: false,
        ball: { x: side(attacksRight(eventTeamId), 58), y: 50 }
      };

    default:
      // kickoff, half_time, full_time, cards, substitutions — neutral picture.
      return { ...neutralPhase(), eventType: event.eventType };
  }
}

/** Two phases describe the same picture (no need to restart a transition). */
export function samePhase(a: AmbientPhase, b: AmbientPhase): boolean {
  return a.teamId === b.teamId
    && a.eventType === b.eventType
    && a.ball.x === b.ball.x
    && a.ball.y === b.ball.y;
}

/** Forward push (or defensive drop) this slot gets in the given phase. */
function possessionShift(slot: AmbientSlot, phase: AmbientPhase): number {
  if (slot.isGoalkeeper || phase.teamId == null) return 0;
  const direction = slot.attacksRight ? 1 : -1;
  return slot.teamId === phase.teamId
    ? POSSESSION_PUSH * direction
    : -DEFENSIVE_DROP * direction;
}

/** Deterministic idle drift, seeded from the player id — no RNG state. */
function patrol(playerId: number, elapsedMs: number): { dx: number; dy: number } {
  const t = elapsedMs / 1000;
  const phase = playerId * 2.399;
  return {
    dx: Math.sin(t * 0.9 + phase) * PATROL_AMPLITUDE,
    dy: Math.cos(t * 0.7 + phase * 1.7) * PATROL_AMPLITUDE
  };
}

/**
 * Render the current ambient state into a `PitchFrame`: anchors + possession
 * bias lerped from the previous phase, plus the idle patrol on top.
 */
export function ambientFrame(state: AmbientState): PitchFrame {
  const t = clamp(state.transitionMs / AMBIENT_TRANSITION_MS, 0, 1);
  const frozen = state.current.frozen && state.transitionMs < FREEZE_MS;

  const players: PitchPlayerPosition[] = state.slots.map(slot => {
    const from = slot.baseX + possessionShift(slot, state.previous);
    const to = slot.baseX + possessionShift(slot, state.current);
    const drift = frozen ? { dx: 0, dy: 0 } : patrol(slot.playerId, state.elapsedMs);
    return {
      playerId: slot.playerId,
      teamId: slot.teamId,
      shirtNumber: slot.shirtNumber,
      x: clamp(from + (to - from) * t + drift.dx, 2, 98),
      y: clamp(slot.baseY + drift.dy, 3, 97),
      isGoalkeeper: slot.isGoalkeeper
    };
  });

  return {
    ball: {
      x: lerp(state.previous.ball.x, state.current.ball.x, t),
      y: lerp(state.previous.ball.y, state.current.ball.y, t),
      carrierPlayerId: null
    },
    players
  };
}

/** Blend two frames — used to splice ambient into a clip and back out. */
export function blendFrames(from: PitchFrame, to: PitchFrame, t: number): PitchFrame {
  const amount = clamp(t, 0, 1);
  const byId = new Map(from.players.map(p => [p.playerId, p]));
  return {
    ball: {
      x: lerp(from.ball.x, to.ball.x, amount),
      y: lerp(from.ball.y, to.ball.y, amount),
      carrierPlayerId: to.ball.carrierPlayerId
    },
    players: to.players.map(player => {
      const start = byId.get(player.playerId);
      if (!start) return player;
      return {
        ...player,
        x: lerp(start.x, player.x, amount),
        y: lerp(start.y, player.y, amount)
      };
    })
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
