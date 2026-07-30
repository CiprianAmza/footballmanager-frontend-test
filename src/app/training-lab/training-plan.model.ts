/**
 * Shared domain for the four training planner skins.
 *
 * The four pages differ only in presentation: every rule about what a week may
 * contain, what a drill develops and how load accumulates lives here, so the
 * skins can be compared on looks alone.
 */

export type SessionCategory = 'Physical' | 'General' | 'Tactical' | 'Match' | 'Extra' | 'Rest';

export type TrainingUnit = 'Team' | 'Goalkeepers' | 'Defence' | 'Midfield' | 'Attack';

/** The development areas a drill can feed. Drives the coverage read-outs. */
export type DevelopmentArea =
  | 'Fitness' | 'Strength' | 'Technical' | 'Attacking'
  | 'Defending' | 'Tactical' | 'Mental' | 'Set Pieces' | 'Cohesion';

export const DEVELOPMENT_AREAS: DevelopmentArea[] = [
  'Fitness', 'Strength', 'Technical', 'Attacking',
  'Defending', 'Tactical', 'Mental', 'Set Pieces', 'Cohesion'
];

export const TRAINING_UNITS: TrainingUnit[] = ['Team', 'Goalkeepers', 'Defence', 'Midfield', 'Attack'];

export interface SessionTemplate {
  id: string;
  name: string;
  category: SessionCategory;
  icon: string;
  /** Suggested load; the planner may override it per slot. */
  defaultIntensity: number;
  /** Fraction of the session's effort that lands on each area. Sums to ~1. */
  gains: Partial<Record<DevelopmentArea, number>>;
  blurb: string;
}

export interface PlannedSession {
  /** Stable across edits so *ngFor trackBy does not re-create DOM on retune. */
  slotId: string;
  templateId: string;
  unit: TrainingUnit;
  intensity: number;
}

export interface PlannedDay {
  dayIndex: number;
  dayName: string;
  longName: string;
  matchDay: boolean;
  sessions: PlannedSession[];
}

export interface IndividualPlan {
  playerId: number;
  area: DevelopmentArea | null;
  attribute: string | null;
  role: string | null;
  /** 0 = light, 1 = normal, 2 = intensive. */
  effort: number;
}

export interface SquadPlayer {
  id: number;
  name: string;
  position: string;
  rating: number;
  age: number;
  condition: number;
}

export interface PlanWarning {
  level: 'info' | 'warn' | 'danger';
  text: string;
}

export interface WeekAnalytics {
  weeklyLoad: number;
  peakDayLoad: number;
  restDays: number;
  /** 0..100 — how match-ready the squad ends the week. */
  sharpness: number;
  /** 0..100 — accumulated fatigue. */
  fatigue: number;
  /** 0..100 — chance-weighted injury exposure. */
  injuryRisk: number;
  /** 0..100 — squad togetherness from Extra/Match work. */
  cohesion: number;
  coverage: Record<DevelopmentArea, number>;
  warnings: PlanWarning[];
}

export const MAX_SESSIONS_PER_DAY = 3;

export const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const DAY_LONG_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

export const CATEGORY_COLOURS: Record<SessionCategory, string> = {
  Physical: '#e67e22',
  General: '#3498db',
  Tactical: '#2ecc71',
  Match: '#9b59b6',
  Extra: '#16a085',
  Rest: '#7f8c8d'
};

export const AREA_COLOURS: Record<DevelopmentArea, string> = {
  'Fitness': '#e67e22',
  'Strength': '#d35400',
  'Technical': '#3498db',
  'Attacking': '#e74c3c',
  'Defending': '#2980b9',
  'Tactical': '#2ecc71',
  'Mental': '#9b59b6',
  'Set Pieces': '#f1c40f',
  'Cohesion': '#16a085'
};

export const SESSION_TEMPLATES: SessionTemplate[] = [
  // ---- Physical ----
  { id: 'endurance', name: 'Endurance', category: 'Physical', icon: '💪', defaultIntensity: 80,
    gains: { Fitness: 0.75, Strength: 0.25 },
    blurb: 'Long running blocks. Builds the aerobic base that carries a squad through April.' },
  { id: 'resistance', name: 'Resistance', category: 'Physical', icon: '🏋️', defaultIntensity: 85,
    gains: { Strength: 0.8, Fitness: 0.2 },
    blurb: 'Weights and contact work. Heavy on the legs — never the day before a match.' },
  { id: 'quickness', name: 'Quickness', category: 'Physical', icon: '👟', defaultIntensity: 70,
    gains: { Fitness: 0.5, Strength: 0.2, Technical: 0.3 },
    blurb: 'Sprints and change of direction. Sharpens the first two yards.' },
  { id: 'recovery', name: 'Recovery', category: 'Physical', icon: '🩹', defaultIntensity: 15,
    gains: { Fitness: 0.4, Mental: 0.6 },
    blurb: 'Pool, stretching, massage. Sheds fatigue without costing sharpness.' },

  // ---- General ----
  { id: 'overall', name: 'Overall', category: 'General', icon: '⚽', defaultIntensity: 60,
    gains: { Technical: 0.3, Attacking: 0.2, Defending: 0.2, Tactical: 0.2, Fitness: 0.1 },
    blurb: 'A bit of everything. Safe default when the calendar is unclear.' },
  { id: 'attacking', name: 'Attacking', category: 'General', icon: '⚔️', defaultIntensity: 65,
    gains: { Attacking: 0.6, Technical: 0.25, Tactical: 0.15 },
    blurb: 'Finishing, combinations, movement in the final third.' },
  { id: 'defending', name: 'Defending', category: 'General', icon: '🛑', defaultIntensity: 65,
    gains: { Defending: 0.6, Tactical: 0.25, Strength: 0.15 },
    blurb: 'Pressing triggers, covering, duels. The shape work behind clean sheets.' },
  { id: 'possession', name: 'Possession', category: 'General', icon: '🔄', defaultIntensity: 55,
    gains: { Technical: 0.5, Tactical: 0.3, Mental: 0.2 },
    blurb: 'Rondos and positional games. Raises first touch and composure under pressure.' },
  { id: 'technique', name: 'Technique', category: 'General', icon: '🎯', defaultIntensity: 50,
    gains: { Technical: 0.8, Attacking: 0.2 },
    blurb: 'Isolated ball work. Slow, unglamorous, and the only thing that fixes a bad touch.' },

  // ---- Tactical ----
  { id: 'shape', name: 'Team Shape', category: 'Tactical', icon: '🧩', defaultIntensity: 45,
    gains: { Tactical: 0.7, Cohesion: 0.3 },
    blurb: 'Walk-through of the block. Cheap on the legs, expensive to skip.' },
  { id: 'def-shadow', name: 'Defensive Shadow', category: 'Tactical', icon: '🛡️', defaultIntensity: 50,
    gains: { Defending: 0.45, Tactical: 0.45, Cohesion: 0.1 },
    blurb: 'Unopposed defensive movement. Drills the shifts until they are automatic.' },
  { id: 'att-movement', name: 'Attacking Movement', category: 'Tactical', icon: '⚡', defaultIntensity: 50,
    gains: { Attacking: 0.45, Tactical: 0.4, Cohesion: 0.15 },
    blurb: 'Third-man runs and rotations. Turns individual quality into chances.' },
  { id: 'transitions', name: 'Transitions', category: 'Tactical', icon: '🔁', defaultIntensity: 70,
    gains: { Tactical: 0.4, Fitness: 0.3, Attacking: 0.15, Defending: 0.15 },
    blurb: 'Counter and counter-press. High load — it is a running session wearing a tactical hat.' },

  // ---- Match ----
  { id: 'match-practice', name: 'Match Practice', category: 'Match', icon: '🏟️', defaultIntensity: 90,
    gains: { Tactical: 0.25, Fitness: 0.25, Attacking: 0.2, Defending: 0.2, Cohesion: 0.1 },
    blurb: 'Eleven against eleven. Closest thing to a match without the points.' },
  { id: 'match-tactics', name: 'Match Tactics', category: 'Match', icon: '📋', defaultIntensity: 40,
    gains: { Tactical: 0.6, Mental: 0.2, Cohesion: 0.2 },
    blurb: 'The opposition briefing. Low load, direct payoff on Saturday.' },
  { id: 'teamwork', name: 'Teamwork', category: 'Match', icon: '🤝', defaultIntensity: 50,
    gains: { Cohesion: 0.6, Tactical: 0.25, Mental: 0.15 },
    blurb: 'Partnership work down the flanks and through the middle.' },
  { id: 'set-pieces', name: 'Set Pieces', category: 'Match', icon: '⛳', defaultIntensity: 30,
    gains: { 'Set Pieces': 0.7, Attacking: 0.15, Defending: 0.15 },
    blurb: 'Corners, free kicks, the far-post routine nobody practises until they concede one.' },
  { id: 'match-preview', name: 'Match Preview', category: 'Match', icon: '📺', defaultIntensity: 10,
    gains: { Tactical: 0.5, Mental: 0.5 },
    blurb: 'Video and walkthrough the day before. Effectively free.' },
  { id: 'match-day', name: 'MATCH DAY', category: 'Match', icon: '🔥', defaultIntensity: 100,
    gains: { Fitness: 0.2, Tactical: 0.2, Attacking: 0.2, Defending: 0.2, Mental: 0.2 },
    blurb: 'The fixture itself. Locked — the calendar owns this slot.' },

  // ---- Extra ----
  { id: 'bonding', name: 'Team Bonding', category: 'Extra', icon: '🍻', defaultIntensity: 10,
    gains: { Cohesion: 0.8, Mental: 0.2 },
    blurb: 'A meal, a paintball day, anything that is not a football pitch.' },
  { id: 'community', name: 'Community Work', category: 'Extra', icon: '❤️', defaultIntensity: 10,
    gains: { Mental: 0.5, Cohesion: 0.5 },
    blurb: 'Hospital and school visits. Keeps the board and the town happy.' },
  { id: 'media', name: 'Media Training', category: 'Extra', icon: '📢', defaultIntensity: 10,
    gains: { Mental: 0.9, Cohesion: 0.1 },
    blurb: 'Press handling. Fewer own goals at the microphone.' },

  // ---- Rest ----
  { id: 'rest', name: 'Rest', category: 'Rest', icon: '🛌', defaultIntensity: 0,
    gains: {},
    blurb: 'Nothing at all. The most underrated session in the catalogue.' }
];

export interface TrainingPreset {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  /** 7 days x up to 3 template ids; `null` leaves the slot empty. */
  week: (string | null)[][];
}

const R = 'rest';

export const TRAINING_PRESETS: TrainingPreset[] = [
  {
    id: 'balanced', name: 'Balanced', icon: '⚖️',
    tagline: 'The default in-season rhythm — one hard block, taper into the fixture.',
    week: [
      ['endurance', 'possession', 'bonding'],
      ['def-shadow', 'att-movement', R],
      ['quickness', 'defending', 'community'],
      ['match-tactics', 'set-pieces', R],
      ['recovery', 'match-preview', R],
      ['match-day', null, null],
      ['recovery', R, R]
    ]
  },
  {
    id: 'preseason', name: 'Pre-season', icon: '🏕️',
    tagline: 'Front-load the physical base while there is nothing to lose.',
    week: [
      ['endurance', 'resistance', 'overall'],
      ['endurance', 'technique', 'bonding'],
      ['resistance', 'possession', R],
      ['quickness', 'shape', 'teamwork'],
      ['endurance', 'attacking', R],
      ['match-practice', 'recovery', R],
      ['recovery', R, R]
    ]
  },
  {
    id: 'congested', name: 'Congested', icon: '📆',
    tagline: 'Two fixtures a week. Everything between them is recovery and video.',
    week: [
      ['recovery', 'match-preview', R],
      ['match-day', null, null],
      ['recovery', R, R],
      ['match-tactics', 'set-pieces', R],
      ['recovery', 'match-preview', R],
      ['match-day', null, null],
      ['recovery', R, R]
    ]
  },
  {
    id: 'attacking', name: 'Attack Camp', icon: '⚔️',
    tagline: 'Everything points at the final third. Concede more, score more.',
    week: [
      ['attacking', 'technique', 'bonding'],
      ['att-movement', 'possession', R],
      ['attacking', 'set-pieces', R],
      ['transitions', 'match-tactics', R],
      ['recovery', 'match-preview', R],
      ['match-day', null, null],
      ['recovery', R, R]
    ]
  },
  {
    id: 'defensive', name: 'Back to Basics', icon: '🛡️',
    tagline: 'Shape, duels and clean sheets. For when the goals against column hurts.',
    week: [
      ['defending', 'resistance', R],
      ['def-shadow', 'shape', 'teamwork'],
      ['defending', 'possession', R],
      ['shape', 'set-pieces', R],
      ['recovery', 'match-preview', R],
      ['match-day', null, null],
      ['recovery', R, R]
    ]
  },
  {
    id: 'recovery', name: 'Deload', icon: '🩹',
    tagline: 'A week off the gas. Use it after a fixture pile-up or an injury spike.',
    week: [
      ['recovery', R, R],
      ['possession', 'bonding', R],
      ['recovery', 'match-preview', R],
      ['shape', 'set-pieces', R],
      ['recovery', R, R],
      ['match-day', null, null],
      ['recovery', R, R]
    ]
  }
];

/** Individual attribute menu, keyed by the broad area a coach picks first. */
export const AREA_ATTRIBUTES: Record<DevelopmentArea, string[]> = {
  'Fitness': ['Stamina', 'Pace', 'Acceleration', 'Natural Fitness', 'Agility'],
  'Strength': ['Strength', 'Balance', 'Jumping Reach', 'Aggression', 'Bravery'],
  'Technical': ['First Touch', 'Technique', 'Dribbling', 'Passing', 'Crossing'],
  'Attacking': ['Finishing', 'Long Shots', 'Off The Ball', 'Flair', 'Composure'],
  'Defending': ['Marking', 'Tackling', 'Positioning', 'Anticipation', 'Concentration'],
  'Tactical': ['Decisions', 'Vision', 'Teamwork', 'Work Rate', 'Positioning'],
  'Mental': ['Determination', 'Leadership', 'Composure', 'Concentration', 'Anticipation'],
  'Set Pieces': ['Corners', 'Free Kick', 'Penalty Taking', 'Long Throws', 'Heading'],
  'Cohesion': ['Teamwork', 'Work Rate', 'Leadership', 'Determination']
};

export const TRAINING_ROLES: string[] = [
  'Goalkeeper', 'Sweeper Keeper', 'Full Back', 'Wing Back', 'Central Defender',
  'Ball Playing Defender', 'Defensive Midfielder', 'Deep Lying Playmaker',
  'Box to Box Midfielder', 'Attacking Midfielder', 'Winger', 'Inside Forward',
  'Target Man', 'Poacher', 'False Nine', 'Complete Forward'
];

export const EFFORT_LABELS = ['Light', 'Normal', 'Intensive'];
