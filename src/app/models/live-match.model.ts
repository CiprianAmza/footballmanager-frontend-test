/**
 * Typed mirrors of the backend live-match contract
 * (`com.footballmanagergamesimulator.frontend.LiveMatchData` /
 *  `GoalAnimationData`). Field names match the JSON exactly — the backend is
 * running contract truth, this file only describes it.
 *
 * Everything the frontend reads is optional where the backend marks it
 * `@JsonInclude(NON_NULL)` or where older cached payloads may predate a field.
 */

export interface KitColors {
  outfieldPrimary?: string;
  outfieldSecondary?: string;
  outfieldBorder?: string;
  gkPrimary?: string;
  gkBorder?: string;
}

export interface LiveMatchMinute {
  minute: number;
  homeScore: number;
  awayScore: number;
  eventType: string;
  commentary: string;
  playerName?: string;
  playerId?: number;
  teamId?: number;
  teamName?: string;
}

export interface PlayerStaminaInfo {
  playerId: number;
  name: string;
  position: string;
  /** 0-100 current condition. */
  stamina: number;
  minutesPlayed: number;
  onPitch: boolean;
  /** Minute the player picked up a yellow card; 0 = never. */
  yellowCardMinute: number;
  /** Minute the player was sent off; 0 = never. */
  redCardMinute: number;
  /** Only present on the synthesised lineup-preview roster. */
  teamId?: number;
  shirtNumber?: number;
}

export interface StaminaSnapshot {
  minute: number;
  homePlayers: PlayerStaminaInfo[];
  awayPlayers: PlayerStaminaInfo[];
}

export interface AnimationPlayer {
  playerId: number;
  name: string;
  shirtNumber: number;
  teamId: number;
  /** GK, DC, DL, DR, DM, MC, ML, MR, AMC, AML, AMR, ST. */
  position: string;
}

export interface AnimationFrame {
  /** 0-100, goal line to goal line. */
  ballX: number;
  /** 0-100, sideline to sideline. */
  ballY: number;
  /** playerId holding the ball, 0 while the ball is in flight. */
  ballCarrierId: number;
  /** [x, y] per player, same order as `GoalAnimationData.players`. */
  positions: number[][];
}

export interface AnimationEvent {
  frame: number;
  /** PASS | SHOT | GOAL | SAVE | MISS | BLOCKED. */
  type: string;
  fromPlayerId: number;
  /** 0 for SHOT/GOAL. */
  toPlayerId: number;
}

export interface GoalAnimationData {
  minute: number;
  /** Canonical goal slot this clip belongs to; -1 for legacy/cosmetic clips. */
  slotIndex?: number;
  fixtureKey?: string;
  generatorVersion?: number;
  scoringTeamId: number;
  defendingTeamId: number;
  homeTeamId: number;
  totalFrames: number;
  firstHalfStoppage?: number;
  scoringTeamKit?: KitColors;
  defendingTeamKit?: KitColors;
  /** OPEN_PLAY | PENALTY | FREE_KICK | CORNER. */
  animationType?: string;
  /** GOAL | SAVE | MISS | BLOCKED. */
  outcome?: string;
  /** true = home attacks toward x=100. Switches at half time. */
  homeAttacksRight: boolean;
  scorerPlayerId?: number;
  scorerName?: string;
  scorerNumber?: number;
  assisterPlayerId?: number;
  assisterName?: string;
  players: AnimationPlayer[];
  frames: AnimationFrame[];
  events: AnimationEvent[];
}

export interface LiveMatchData {
  /** Legacy boundary (V3 flag off): clips keyed by minute. */
  goalAnimations?: { [minute: number]: GoalAnimationData };
  /** V3 boundary: every animated shot outcome, ordered by minute + slotIndex. */
  canonicalAnimations?: GoalAnimationData[];

  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  /** Authoritative kickoff formation keys, e.g. "4231". */
  homeFormation?: string;
  awayFormation?: string;
  competitionName?: string;
  competitionId?: number;
  round?: number;

  timeline: LiveMatchMinute[];

  homeScore: number;
  awayScore: number;
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeXg?: number;
  awayXg?: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  homeOffsides: number;
  awayOffsides: number;

  firstHalfStoppage: number;
  secondHalfStoppage: number;

  staminaSnapshots?: StaminaSnapshot[];

  // ---- Interactive session state (/state, /advance, /substitute) ----
  currentMinute: number;
  finished: boolean;
  awaitingCommit: boolean;
  homeSubsRemaining: number;
  awaySubsRemaining: number;
  homePitch?: PlayerStaminaInfo[];
  awayPitch?: PlayerStaminaInfo[];
  homeBench?: PlayerStaminaInfo[];
  awayBench?: PlayerStaminaInfo[];
}

/** Body of `POST /match/live/{key}/substitute`. */
export interface SubstitutionRequest {
  playerOutId: number;
  playerInId: number;
  atMinute: number;
}

/** Response of `POST /match/live/{key}/commit`. */
export interface LiveMatchCommitResult {
  postMatchPressConferenceId?: number;
  postMatchPressConferenceOutcome?: 'WIN' | 'DRAW' | 'LOSS' | null;
  knockoutResultText?: string | null;
  liveMatch?: LiveMatchData;
}

/** Emitted when the user closes the live-match viewer — carries the post-match
 *  press conference the `/commit` response scheduled, if any. */
export interface LiveMatchClosed {
  pressConferenceId: number | null;
  outcome: 'WIN' | 'DRAW' | 'LOSS' | null;
}

/** Roster + kits used by the pre-kickoff lineup preview. */
export interface LineupPreviewData {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeFormation?: string;
  awayFormation?: string;
  players: any[];
  homeKit: KitColors | null;
  awayKit: KitColors | null;
}

// ---------------------------------------------------------------------------
// Renderer-neutral frame model consumed by <app-match-pitch>.
//
// Both the V3 clips and (from Slice C) the client-side ambient synthesis adapt
// into this shape, so the renderer never sees a transport DTO.
// ---------------------------------------------------------------------------

export interface PitchPlayerPosition {
  playerId: number;
  teamId: number;
  shirtNumber: number;
  /** 0-100, goal line to goal line. */
  x: number;
  /** 0-100, sideline to sideline. */
  y: number;
  isGoalkeeper: boolean;
}

export interface PitchFrame {
  ball: { x: number; y: number; carrierPlayerId: number | null };
  players: PitchPlayerPosition[];
}

/** A playable sequence of `PitchFrame`s plus the overlay metadata the renderer
 *  needs (labels, pass/shot lines, scorer highlight, goal side). */
export interface PitchClip {
  frames: PitchFrame[];
  events: AnimationEvent[];
  /** playerId → display surname. */
  names: { [playerId: number]: string };
  totalFrames: number;
  scorerPlayerId?: number;
  /** Team taking the shot — picks the confetti palette. */
  shooterTeamId?: number;
  /** GOAL | SAVE | MISS | BLOCKED. */
  outcome?: string;
  /** True when the team taking the shot attacks toward x=100. */
  shooterAttacksRight: boolean;
}
