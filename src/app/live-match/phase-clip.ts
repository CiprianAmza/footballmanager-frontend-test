import {
  AnimationEvent, MatchPhaseData, OfficialPosition, PhaseAction, PitchClip,
  PitchFrame, PitchPlayerPosition
} from '../models/live-match.model';
import { AmbientSlot } from './ambient-synthesizer';

/**
 * Faza C: adapt a backend possession chain (`MatchPhaseData`) into the
 * renderer-neutral `PitchClip` the persistent pitch already plays, so the
 * chains validate visually in the existing 2D canvas before any 3D work.
 *
 * The backend authors only the ball path + the acting players; the other 20
 * players are synthesised here from the ambient formation slots, eased gently
 * toward the ball so the block leans with play. Everything is deterministic —
 * same phase + same slots → identical frames.
 */

const FPS = 30;
const FRAME_MS = 1000 / FPS;

/** Chain action → the event vocabulary the renderer already understands
 *  (pass/shot guide lines, outcome text). Unmapped actions draw no overlay. */
const CLIP_EVENT_TYPES: { [type: string]: string } = {
  PASS: 'PASS', BACK_PASS: 'PASS', LATERAL_PASS: 'PASS', THROUGH_BALL: 'PASS',
  CROSS: 'PASS', CORNER_KICK: 'PASS', CLEARANCE: 'PASS', GOAL_KICK: 'PASS',
  SHOT: 'SHOT', GOAL: 'GOAL', SAVE: 'SAVE', MISS: 'MISS', BLOCK: 'BLOCKED',
  // Skill moves keep their identity so the renderers can play the matching
  // gesture animation (and flash the flavour text).
  STEPOVER: 'STEPOVER', CUT_LEFT: 'CUT_LEFT', CUT_RIGHT: 'CUT_RIGHT',
  ROULETTE: 'ROULETTE', RABONA_CROSS: 'RABONA', ADVANTAGE: 'ADVANTAGE'
};

/** Actions where the ball travels without a carrier (it is in flight). */
const BALL_IN_FLIGHT = new Set([
  'PASS', 'BACK_PASS', 'LATERAL_PASS', 'THROUGH_BALL', 'CROSS', 'RABONA_CROSS',
  'CLEARANCE', 'BALL_OUT', 'SHOT', 'GOAL_KICK', 'HEADER'
]);

/** Carrier-keeps-the-ball skill moves; each gets its own gesture animation. */
const SKILL_MOVES = new Set([
  'SKILL_MOVE', 'STEPOVER', 'CUT_LEFT', 'CUT_RIGHT', 'ROULETTE'
]);

/** How strongly the uninvolved block leans toward the ball, in pitch units. */
const BLOCK_LEAN = 12;
/** Pressing pair around the carrier: one presses, one covers behind. */
const PRESS_OFFSETS: ReadonlyArray<readonly [number, number]> =
  [[-2.6, 2.2], [3.4, -2.8]];
/** Support-run targets relative to the ball — at REAL passing distance, not
 *  crowding the carrier. */
const SUPPORT_OFFSETS: ReadonlyArray<readonly [number, number]> =
  [[12, -8], [-10, 8]];
/** Per-frame easing toward a player's current target position. */
const EASE = 0.16;

/** Sticky role assignment: keep the players who ALREADY hold the role unless
 *  a candidate is decisively closer — reassigning pressers/supports at every
 *  action boundary made "random" players lurch across the pitch. */
function stickyNearest(
  previous: number[],
  slots: AmbientSlot[],
  positions: Map<number, { x: number; y: number }>,
  filter: (slot: AmbientSlot) => boolean,
  x: number, y: number, count: number,
  exclude: Set<number>
): number[] {
  const eligible = slots
    .filter(slot => filter(slot) && !exclude.has(slot.playerId))
    .map(slot => {
      const live = positions.get(slot.playerId)!;
      return { id: slot.playerId, d: Math.hypot(live.x - x, live.y - y) };
    })
    .sort((a, b) => a.d - b.d);
  if (eligible.length === 0) return [];

  const chosen: number[] = [];
  const nearestDist = eligible[0].d;
  // Incumbents keep the role while still within ~1.7× of the best candidate.
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

/** Physical speed cap, units per authored frame (~10 m/s at 30fps): a changed
 *  target turns into a RUN, never a lurch. */
const MAX_STEP = 0.34;

/** Actions whose actor identity is authoritative (the real scorer/keeper) and
 *  must never be handed to a nearer teammate. Set-piece takers are cosmetic —
 *  the nearest man takes the corner rather than everyone waiting for the
 *  scripted taker to cross the pitch. */
const NO_ACTOR_SWAP = new Set([
  'SHOT', 'PENALTY_KICK', 'GOAL', 'SAVE', 'GK_HOLD'
]);

/** Out-of-play restarts: the only actions allowed to CUT the ball to a new
 *  spot (corner arc, touchline, goal area, centre spot) instead of playing
 *  on from where it was. Free kicks are NOT here — they are taken exactly
 *  where the foul just happened. */
const RESTART_TYPES = new Set([
  'KICKOFF', 'CORNER_KICK', 'THROW_IN', 'GOAL_KICK', 'PENALTY_KICK'
]);

/**
 * Football's real rule: WHOEVER IS CLOSEST plays the ball. If the scripted
 * actor is hopelessly far from the action origin (a stale roster pick), hand
 * the touch to the nearest same-team player instead of freezing play while a
 * defender jogs 60 metres. Identity-critical actions (shots, saves, set-piece
 * takers) are never swapped.
 */
function reassignActor(
  action: PhaseAction,
  positions: Map<number, { x: number; y: number }>,
  slots: AmbientSlot[],
  names: { [playerId: number]: string }
): PhaseAction {
  if (NO_ACTOR_SWAP.has(action.type)) return action;
  const current = positions.get(action.playerId);
  const currentDist = current
    ? Math.hypot(current.x - action.x, current.y - action.y) : Infinity;
  if (currentDist <= 5) return action;
  let best: AmbientSlot | null = null;
  let bestDist = currentDist - 1; // any real improvement wins
  for (const slot of slots) {
    if (slot.teamId !== action.teamId) continue;
    if (slot.playerId === action.targetPlayerId || slot.isGoalkeeper) continue;
    const pos = positions.get(slot.playerId);
    if (!pos) continue;
    const d = Math.hypot(pos.x - action.x, pos.y - action.y);
    if (d < bestDist) { bestDist = d; best = slot; }
  }
  if (!best) return action;
  return {
    ...action,
    playerId: best.playerId,
    playerName: names[best.playerId] || action.playerName
  };
}

export function phaseToClip(
  phase: MatchPhaseData,
  slots: AmbientSlot[],
  names: { [playerId: number]: string },
  startPositions?: { [playerId: number]: { x: number; y: number } }
): PitchClip {

  const frames: PitchFrame[] = [];
  const events: AnimationEvent[] = [];
  if (!phase?.actions?.length || !slots?.length) {
    return {
      frames, events, names: names || {}, totalFrames: 0,
      shooterTeamId: phase?.teamId, shooterAttacksRight: !!phase?.attackingRight
    };
  }
  const authored = phase.strategy === 'AUTHORED';

  // Live position of every slot — seeded from where the player ACTUALLY was
  // on the last rendered frame (clip-to-clip continuity: no teleporting back
  // to the formation anchor at every minute boundary), anchors as fallback.
  const positions = new Map<number, { x: number; y: number }>();
  for (const slot of slots) {
    const carried = startPositions?.[slot.playerId];
    positions.set(slot.playerId,
      carried ? { x: carried.x, y: carried.y } : { x: slot.baseX, y: slot.baseY });
  }

  // Pre-positioning: everyone due to play or receive the ball STARTS the
  // phase within plausible reach of his first involvement point, so passes
  // arrive at a player who is already there (or arriving), never at empty
  // grass with a sprinter 25 units away.
  const firstInvolvement = new Map<number, { x: number; y: number; eta: number }>();
  let frameCursor = 0;
  for (const a of phase.actions) {
    const fc = Math.max(2, Math.round((a.durationMs || 600) / FRAME_MS));
    if (a.playerId && !firstInvolvement.has(a.playerId)) {
      firstInvolvement.set(a.playerId, { x: a.x, y: a.y, eta: frameCursor });
    }
    if (a.targetPlayerId && !firstInvolvement.has(a.targetPlayerId)) {
      firstInvolvement.set(a.targetPlayerId, { x: a.endX, y: a.endY, eta: frameCursor + fc });
    }
    frameCursor += fc;
  }
  for (const [playerId, spot] of firstInvolvement) {
    const pos = positions.get(playerId);
    if (!pos) continue;
    const reachable = 2 + spot.eta * MAX_STEP * 0.6;
    const distance = Math.hypot(pos.x - spot.x, pos.y - spot.y);
    if (distance > reachable) {
      // Start him just inside range of his moment, back along the line to
      // where he stood — close enough to make it, far enough to look like
      // a run, not a teleport into position.
      const standOff = Math.max(4, Math.min(reachable, 10));
      pos.x = clamp(spot.x + ((pos.x - spot.x) / distance) * standOff, 1, 99);
      pos.y = clamp(spot.y + ((pos.y - spot.y) / distance) * standOff, 2, 98);
    }
  }

  // Faza B: officials ease toward the per-action targets the backend authored.
  // Assistants run their sideline, so only their x is animated.
  const ref = { x: 50, y: 35 };
  const arBottom = { x: 35 };
  const arTop = { x: 65 };

  // Set-piece formation, held from the corner/free kick through its delivery.
  let setPiece: Map<number, { x: number; y: number }> | null = null;
  // Sticky press/support role holders, carried across actions.
  let pressers: number[] = [];
  let supports: number[] = [];
  const SET_PIECE_FOLLOWUPS = new Set([
    'CROSS', 'RABONA_CROSS', 'HEADER', 'SHOT', 'GOAL', 'SAVE', 'MISS',
    'BLOCK', 'GK_HOLD', 'CLEARANCE'
  ]);

  /** Where the previous action left the ball — every in-play action is forced
   *  to START there, so the ball only ever moves along authored kicks. */
  let prevEnd: { x: number; y: number } | null = null;

  for (let actionIndex = 0; actionIndex < phase.actions.length; actionIndex++) {
    let raw = phase.actions[actionIndex];
    // Continuity: the engine sometimes force-advances its cursor before a
    // terminal (corner clearances, shot spots...). A scene CUT is legitimate
    // only for out-of-play restarts; everything else plays from where the
    // ball actually is — the kick just gets longer.
    if (prevEnd) {
      const gap = Math.hypot(raw.x - prevEnd.x, raw.y - prevEnd.y);
      if (gap > 1.5 && !RESTART_TYPES.has(raw.type)) {
        const stationary = Math.hypot(raw.endX - raw.x, raw.endY - raw.y) < 0.8;
        if (stationary) {
          raw = { ...raw, x: prevEnd.x, y: prevEnd.y, endX: prevEnd.x, endY: prevEnd.y };
        } else {
          // The kick got longer — retime it for the new distance, or the
          // ball crosses half a pitch in three frames.
          const newDist = Math.hypot(raw.endX - prevEnd.x, raw.endY - prevEnd.y);
          raw = {
            ...raw, x: prevEnd.x, y: prevEnd.y,
            durationMs: Math.max(raw.durationMs || 0,
              Math.min(1400, Math.round(380 + 26 * newDist)))
          };
        }
      }
    }
    // The decisive inversion: a pass is aimed WHERE THE RECEIVER ACTUALLY IS
    // (with a short lead so he runs onto it), never at a scripted landing
    // spot he'd have to sprint half a pitch for. The chain stays coherent
    // because the next action is forced to start from this new endpoint.
    const travels = Math.hypot(raw.endX - raw.x, raw.endY - raw.y) > 0.8;
    if (!authored && travels && raw.targetPlayerId) {
      const receiver = positions.get(raw.targetPlayerId);
      if (receiver) {
        const dx = raw.endX - receiver.x;
        const dy = raw.endY - receiver.y;
        const offBy = Math.hypot(dx, dy);
        if (offBy > 4) {
          const lead = Math.min(3, offBy * 0.25);
          const newEndX = clamp(receiver.x + (dx / offBy) * lead, 1, 99);
          const newEndY = clamp(receiver.y + (dy / offBy) * lead, 2, 98);
          const newDist = Math.hypot(newEndX - raw.x, newEndY - raw.y);
          raw = {
            ...raw, endX: newEndX, endY: newEndY,
            durationMs: Math.min(1400, Math.round(380 + 26 * newDist))
          };
        }
      }
    }
    let action = authored ? raw : reassignActor(raw, positions, slots, names);
    prevEnd = { x: action.endX, y: action.endY };

    // Broadcast grammar: an out-of-play restart is a scene CUT — the ball is
    // placed on the spot and the TAKER is staged there with it (nobody jogs
    // 50 metres to a corner arc on TV). In-play actions never do this.
    if (RESTART_TYPES.has(action.type)) {
      const takerPos = positions.get(action.playerId);
      if (takerPos
          && Math.hypot(takerPos.x - action.x, takerPos.y - action.y) > 6) {
        takerPos.x = clamp(action.x + (action.x > 50 ? -1.2 : 1.2), 1, 99);
        takerPos.y = clamp(action.y + (action.y > 50 ? -1.2 : 1.2), 2, 98);
      }
    }
    /** The following action — its actor pre-runs toward his spot NOW, so the
     *  ball always arrives where a player is already waiting. */
    const next = phase.actions[actionIndex + 1];
    if (action.type === 'CORNER_KICK' || action.type === 'FREE_KICK') {
      setPiece = buildSetPieceTargets(phase, slots, action);
    } else if (setPiece && !SET_PIECE_FOLLOWUPS.has(action.type)) {
      setPiece = null;
    }
    // Stationary beats (interceptions, fouls, holds) are trimmed hard — long
    // frozen-ball stretches are what reads as "everyone stopped playing".
    // Restart markers are trimmed even harder: their drama is the walk-over
    // (the hold), not the standing still.
    const travelDist = Math.hypot(action.endX - action.x, action.endY - action.y);
    const stationaryAction = travelDist < 0.8;
    // Speed limits: no authored kick may cross the pitch faster than a real
    // driven ball — and a DRIBBLE can never outrun its own carrier (the ball
    // stays at his feet, so it moves at player sprint speed, not ball speed).
    const isCarry = action.type === 'DRIBBLE' || action.type === 'SPRINT_DRIBBLE'
      || SKILL_MOVES.has(action.type);
    const carryMsPerUnit = action.type === 'DRIBBLE' ? 145 : 105;
    const minDurationMs = stationaryAction ? 0
      : isCarry ? Math.round(travelDist * carryMsPerUnit)
      : Math.round(300 + 18 * travelDist);
    let frameCount = Math.max(2,
      Math.round(Math.max(action.durationMs || 600, minDurationMs) / FRAME_MS));
    if (stationaryAction) {
      frameCount = Math.min(frameCount, RESTART_TYPES.has(action.type) ? 8 : 15);
    }

    const inFlight = BALL_IN_FLIGHT.has(action.type);
    const actorMoves = action.type === 'DRIBBLE'
      || action.type === 'SPRINT_DRIBBLE' || SKILL_MOVES.has(action.type);

    // Camera hint for this action: tight on individual moments, wide on long
    // balls, neutral otherwise.
    const actionLength = Math.hypot(action.endX - action.x, action.endY - action.y);
    const zoom = actorMoves || action.type === 'SHOT' || action.type === 'PENALTY_KICK'
        || action.type === 'GOAL' || action.type === 'SAVE'
        || action.type === 'RABONA_CROSS'
      ? 1
      : (action.type === 'GOAL_KICK' || actionLength > 32 ? -1 : 0);

    // Dynamic off-ball roles, recomputed per action: the two opponents nearest
    // the ball CLOSE IT DOWN (pressing), the two nearest teammates make runs
    // to offer passing options, the rest of the block shifts with play.
    const excluded = new Set([action.playerId, action.targetPlayerId || 0]);
    // Two pressers (one presses, one covers) and two DISTANT support options —
    // more than that and the picture collapses into a swarm around the ball.
    // STICKY across actions: roles follow the same players while play stays
    // near them, so nobody lurches when possession moves one pass over.
    pressers = stickyNearest(pressers, slots, positions,
        slot => slot.teamId !== action.teamId && !slot.isGoalkeeper,
        action.endX, action.endY, 2, excluded);
    supports = stickyNearest(supports, slots, positions,
        slot => slot.teamId === action.teamId && !slot.isGoalkeeper,
        action.endX, action.endY, 2, excluded);

    const emitFrame = (t: number, holding: boolean): void => {
      const ballX = lerp(action.x, action.endX, t);
      const ballY = lerp(action.y, action.endY, t);
      const globalFrame = frames.length;

      const players: PitchPlayerPosition[] = slots.map(slot => {
        const live = positions.get(slot.playerId)!;
        let targetX: number;
        let targetY: number;
        let ease = EASE;

        const pressIndex = pressers.indexOf(slot.playerId);
        const supportIndex = supports.indexOf(slot.playerId);
        const setPieceSpot = setPiece?.get(slot.playerId);

        if (setPieceSpot && slot.playerId !== action.playerId
            && slot.playerId !== action.targetPlayerId) {
          // Corner / free-kick formation: attackers on their box spots,
          // defenders marking, keeper on his line — held through the delivery.
          targetX = setPieceSpot.x;
          targetY = setPieceSpot.y;
          const spDx = (targetX - live.x) * 0.14;
          const spDy = (targetY - live.y) * 0.14;
          const spStep = Math.hypot(spDx, spDy);
          const spScale = spStep > MAX_STEP ? MAX_STEP / spStep : 1;
          live.x = clamp(live.x + spDx * spScale, 1, 99);
          live.y = clamp(live.y + spDy * spScale, 2, 98);
          return {
            playerId: slot.playerId,
            teamId: slot.teamId,
            shirtNumber: slot.shirtNumber,
            x: live.x,
            y: live.y,
            isGoalkeeper: slot.isGoalkeeper
          };
        }

        if (slot.playerId === action.playerId) {
          // The actor stands at the action origin (and travels with the ball
          // while dribbling). While the ball WAITS for him he sprints.
          targetX = actorMoves ? ballX : action.x;
          targetY = actorMoves ? ballY : action.y;
          if (holding) ease = 0.32;
        } else if (action.targetPlayerId && slot.playerId === action.targetPlayerId) {
          // The receiver heads for the delivery point AHEAD of the ball, so
          // the pass lands at a player, not in grass.
          targetX = action.endX;
          targetY = action.endY;
          ease = 0.26;
        } else if (next && slot.playerId === next.playerId) {
          // Anticipation: the man who plays the NEXT action is already on
          // his way to its origin before the ball gets there.
          targetX = next.x;
          targetY = next.y;
          ease = 0.24;
        } else if (pressIndex >= 0) {
          const ring = PRESS_OFFSETS[pressIndex];
          if (actorMoves) {
            // A dribble is a duel: the pressers BITE — they chase the carrier
            // himself and the gap closes as the action progresses.
            const bite = lerp(3.4, 1.0, t);
            targetX = ballX + ring[0] * bite * 0.45;
            targetY = ballY + ring[1] * bite * 0.45;
            ease = 0.3;
          } else {
            // Pressing: arrive just off the carrier's shoulder, quickly.
            targetX = ballX + ring[0];
            targetY = ballY + ring[1];
            ease = 0.26;
          }
        } else if (supportIndex >= 0) {
          // Support runs: passing options ahead, behind and square.
          const run = SUPPORT_OFFSETS[supportIndex];
          targetX = ballX + run[0];
          targetY = ballY + run[1];
          ease = 0.2;
        } else {
          // The block shifts WITH play but HOLDS ITS SHAPE — players keep
          // their formation zones and only lean toward the ball. Chasing it
          // reads as "escorting the ball", which no real team does.
          const attackingSide = slot.teamId === action.teamId;
          const pushFactor = attackingSide ? 0.22 : 0.18;
          const pushCap = attackingSide ? 9 : 8;
          const probe = attackingSide
            ? Math.sin(globalFrame * 0.045 + slot.playerId * 1.3) * 1.2
            : 0;
          targetX = slot.baseX
            + clampAbs((ballX - slot.baseX) * pushFactor, pushCap) + probe;
          targetY = slot.baseY + clampAbs((ballY - slot.baseY) * 0.15, 7);
          // Nobody uninvolved inside ~6 units of the ball: keep a realistic
          // clear zone around the play instead of a crowd.
          const awayX = targetX - ballX;
          const awayY = targetY - ballY;
          const distToBall = Math.hypot(awayX, awayY);
          if (distToBall < 6) {
            const push = 6 / Math.max(0.1, distToBall);
            targetX = ballX + awayX * push;
            targetY = ballY + awayY * push;
          }
        }

        // Nobody stands statue-still: a small deterministic sway keeps every
        // figure alive between role assignments.
        const swayX = Math.sin(globalFrame * 0.22 + slot.playerId * 2.4) * 0.06;
        const swayY = Math.cos(globalFrame * 0.19 + slot.playerId * 1.7) * 0.05;
        // Momentum: however the target moved, a player covers at most a
        // sprint's worth of grass per frame.
        const stepX = (targetX - live.x) * ease + swayX;
        const stepY = (targetY - live.y) * ease + swayY;
        const stepLen = Math.hypot(stepX, stepY);
        const stepScale = stepLen > MAX_STEP ? MAX_STEP / stepLen : 1;
        live.x = clamp(live.x + stepX * stepScale, 1, 99);
        live.y = clamp(live.y + stepY * stepScale, 2, 98);

        return {
          playerId: slot.playerId,
          teamId: slot.teamId,
          shirtNumber: slot.shirtNumber,
          x: live.x,
          y: live.y,
          isGoalkeeper: slot.isGoalkeeper
        };
      });

      // While the ball is in flight nobody carries it; otherwise the actor
      // does (the receiver takes over from the first frame of the next action).
      const carrier = inFlight && t < 1
        ? null
        : (inFlight ? (action.targetPlayerId || null) : (action.playerId || null));

      // Officials chase their authored per-action targets. The referee eases a
      // bit faster than the block so cards read as "the ref arrives".
      ref.x = clamp(ref.x + ((action.refX ?? ballX - 8) - ref.x) * EASE * 1.4, 2, 98);
      ref.y = clamp(ref.y + ((action.refY ?? 50) - ref.y) * EASE * 1.4, 4, 96);
      arBottom.x = clamp(arBottom.x + ((action.assistantBottomX ?? 35) - arBottom.x) * EASE, 2, 50);
      arTop.x = clamp(arTop.x + ((action.assistantTopX ?? 65) - arTop.x) * EASE, 50, 98);
      const officials: OfficialPosition[] = [
        { x: ref.x, y: ref.y, role: 'REF' },
        { x: arBottom.x, y: 1.5, role: 'AR' },
        { x: arTop.x, y: 98.5, role: 'AR' }
      ];

      // Parabolic flight arc for lofted balls (shots, crosses, goal kicks).
      const flightH = (action.peakHeight || 0) * 4 * t * (1 - t);
      frames.push({
        ball: { x: ballX, y: ballY, carrierPlayerId: holding ? null : carrier, h: flightH },
        players, officials, zoom
      });
    };

    // The ball NEVER travels untouched: before it moves, hold it at the
    // action origin until the actor has physically arrived — the pass, shot
    // or dribble then visibly starts from a boot.
    const runHold = (cap: number): void => {
      for (let hold = 0; hold < cap; hold++) {
        const actor = positions.get(action.playerId);
        if (!actor || Math.hypot(actor.x - action.x, actor.y - action.y) <= 2.0) break;
        emitFrame(0, true);
      }
    };
    // Restarts (and the delivery right after one, e.g. the corner cross) get
    // a ceremonial walk; open play gets a beat.
    const prevType = actionIndex > 0 ? phase.actions[actionIndex - 1].type : '';
    // The shot is the money moment and its actor is identity-locked (the real
    // scorer) — wait for him as long as it takes a sprint to get there.
    const holdCap = action.type === 'SHOT' ? 70
      : RESTART_TYPES.has(action.type) || RESTART_TYPES.has(prevType) ? 45
      : NO_ACTOR_SWAP.has(action.type) ? 40 : 30;
    runHold(holdCap);
    // Second chance: if the designated man STILL isn't there, football's law
    // applies — whoever is closest plays it, and we wait the last stride.
    if (!authored && !NO_ACTOR_SWAP.has(action.type)) {
      const pos = positions.get(action.playerId);
      const distNow = pos
        ? Math.hypot(pos.x - action.x, pos.y - action.y) : Infinity;
      if (distNow > 2.5) {
        let bestSlot: AmbientSlot | null = null;
        let bestDist = distNow - 0.5;
        for (const slot of slots) {
          if (slot.teamId !== action.teamId) continue;
          if (slot.playerId === action.targetPlayerId) continue;
          const p = positions.get(slot.playerId);
          if (!p) continue;
          const d = Math.hypot(p.x - action.x, p.y - action.y);
          if (d < bestDist) { bestDist = d; bestSlot = slot; }
        }
        if (bestSlot) {
          action = {
            ...action,
            playerId: bestSlot.playerId,
            playerName: names[bestSlot.playerId] || action.playerName
          };
          runHold(26);
        }
      }
    }

    // The action's event (text, gesture, sound) fires at the moment of the
    // touch — after the approach — not while the actor is still arriving.
    const mapped = CLIP_EVENT_TYPES[action.type];
    if (mapped) {
      events.push({
        frame: frames.length,
        type: mapped,
        fromPlayerId: action.playerId,
        toPlayerId: action.targetPlayerId || 0
      });
    }

    for (let i = 0; i < frameCount; i++) {
      emitFrame(frameCount === 1 ? 1 : i / (frameCount - 1), false);
    }
  }

  // Goal chains own the full presentation: outcome + scorer drive the
  // renderer's confetti, cheer and scorer highlight, exactly like a V3 clip.
  const goalAction = phase.actions.find(a => a.type === 'GOAL');
  const scoringRight = goalAction && goalAction.teamId !== phase.teamId
    ? !phase.attackingRight : !!phase.attackingRight;

  return {
    frames,
    events,
    names: names || {},
    totalFrames: frames.length,
    outcome: goalAction ? 'GOAL' : undefined,
    scorerPlayerId: goalAction?.playerId,
    shooterTeamId: goalAction ? goalAction.teamId : phase.teamId,
    shooterAttacksRight: scoringRight
  };
}

/** Tactical set-piece map: attacking players take box spots (near post, far
 *  post, penalty spot, back-post run), defenders mark them goal-side, the
 *  keeper holds his line, spare attackers stay home for cover. Deterministic
 *  (sorted by playerId), so the same corner always sets up the same way. */
function buildSetPieceTargets(
  phase: MatchPhaseData,
  slots: AmbientSlot[],
  action: PhaseAction
): Map<number, { x: number; y: number }> {
  const attackingRight = action.teamId === phase.teamId
    ? phase.attackingRight : !phase.attackingRight;
  const goalX = attackingRight ? 100 : 0;
  const inward = attackingRight ? -1 : 1; // from the goal line into the pitch
  const spot = (depth: number, y: number) => ({ x: goalX + inward * depth, y });

  const targets = new Map<number, { x: number; y: number }>();
  const attackers = slots
    .filter(s => s.teamId === action.teamId && !s.isGoalkeeper
      && s.playerId !== action.playerId)
    .sort((a, b) => a.playerId - b.playerId);
  const defenders = slots
    .filter(s => s.teamId !== action.teamId)
    .sort((a, b) => a.playerId - b.playerId);

  const boxSpots = [spot(8, 44), spot(8, 56), spot(11, 50), spot(6, 50),
    spot(13, 41), spot(13, 59)];
  const coverSpots = [spot(42, 30), spot(42, 70), spot(55, 50), spot(45, 50)];
  attackers.forEach((slot, index) => {
    targets.set(slot.playerId, index < boxSpots.length
      ? boxSpots[index]
      : coverSpots[(index - boxSpots.length) % coverSpots.length]);
  });

  const spareSpots = [spot(2, 46), spot(2, 54), spot(17, 50), spot(20, 38), spot(20, 62)];
  let marked = 0;
  let spare = 0;
  for (const defender of defenders) {
    if (defender.isGoalkeeper) {
      targets.set(defender.playerId, spot(1.5, 50));
    } else if (marked < boxSpots.length) {
      const mark = boxSpots[marked++];
      // Goal-side of the attacker being marked.
      targets.set(defender.playerId, { x: mark.x - inward * 1.8, y: mark.y + 1.2 });
    } else {
      targets.set(defender.playerId, spareSpots[spare++ % spareSpots.length]);
    }
  }
  return targets;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clampAbs(value: number, max: number): number {
  return value > max ? max : value < -max ? -max : value;
}
