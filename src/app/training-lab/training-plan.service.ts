import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import {
  AREA_ATTRIBUTES, CATEGORY_COLOURS, DAY_LONG_NAMES, DAY_NAMES, DEVELOPMENT_AREAS,
  DevelopmentArea, EFFORT_LABELS, IndividualPlan, MAX_SESSIONS_PER_DAY, PlanWarning,
  PlannedDay, PlannedSession, SESSION_TEMPLATES, SessionCategory, SessionTemplate,
  SquadPlayer, TRAINING_PRESETS, TrainingUnit, WeekAnalytics
} from './training-plan.model';

const STORAGE_PREFIX = 'fm_training_plan_v1_';
const UNDO_DEPTH = 25;

interface PersistedPlan {
  week: PlannedDay[];
  generalFocus: string;
  individual: IndividualPlan[];
}

/**
 * The single source of truth behind all four training skins.
 *
 * Nothing here talks to the training endpoints: `/game/training/setFocus` and
 * `/game/training/schedule/{id}` do not exist on the backend, which is why the
 * original page silently 404'd on every interaction. The plan is authored and
 * kept locally so the screen is fully usable, and the squad is the only thing
 * read from the server — with a generated fallback when that read fails too.
 */
@Injectable({ providedIn: 'root' })
export class TrainingPlanService {

  readonly templates = SESSION_TEMPLATES;
  readonly presets = TRAINING_PRESETS;
  readonly areas = DEVELOPMENT_AREAS;
  readonly effortLabels = EFFORT_LABELS;

  week: PlannedDay[] = [];
  generalFocus = 'Balanced';
  readonly focusOptions = ['Attacking', 'Defensive', 'Fitness', 'Tactical', 'Balanced'];

  players: SquadPlayer[] = [];
  playersLoading = false;
  playersAreFallback = false;

  activePresetId: string | null = 'balanced';
  dirty = false;

  /** Emits after every mutation so skins can react without polling. */
  readonly changes = new BehaviorSubject<number>(0);

  private undoStack: PersistedPlan[] = [];
  private analyticsCache: WeekAnalytics | null = null;
  private analyticsRevision = -1;
  private individual = new Map<number, IndividualPlan>();
  private templateById = new Map<string, SessionTemplate>();
  private slotSequence = 0;
  private loadedTeamId: number | null = null;

  constructor(private http: HttpClient, private teamService: TeamService) {
    SESSION_TEMPLATES.forEach(t => this.templateById.set(t.id, t));
    this.applyPreset('balanced', false);
  }

  // ------------------------------------------------------------------ load

  /** Idempotent: repeated visits to any skin reuse the plan already in memory. */
  init(): void {
    const teamId = this.teamService.teamId;
    if (this.loadedTeamId === teamId && this.players.length > 0) return;
    this.loadedTeamId = teamId;
    this.restore(teamId);
    this.loadPlayers(teamId);
  }

  private loadPlayers(teamId: number): void {
    this.playersLoading = true;
    this.http.get<any[]>(urlApp + `/tactic/getPlayers/${teamId}`).subscribe({
      next: players => {
        this.players = (players || []).map(p => ({
          id: p.id,
          name: p.name,
          position: p.position || '—',
          rating: Math.round(p.rating || 0),
          age: p.age || 0,
          // The squad endpoint has no condition field; derive a stable stand-in
          // from the id so the bars are not random on every change detection.
          condition: 72 + ((p.id * 7) % 28)
        }));
        this.playersAreFallback = this.players.length === 0;
        if (this.playersAreFallback) this.players = this.fallbackSquad();
        this.playersLoading = false;
        this.emit();
      },
      error: () => {
        this.players = this.fallbackSquad();
        this.playersAreFallback = true;
        this.playersLoading = false;
        this.emit();
      }
    });
  }

  private fallbackSquad(): SquadPlayer[] {
    const spec: [string, number][] = [
      ['GK', 2], ['DL', 1], ['DC', 3], ['DR', 1],
      ['DM', 1], ['MC', 3], ['ML', 1], ['MR', 1],
      ['AMC', 1], ['ST', 3]
    ];
    const out: SquadPlayer[] = [];
    let id = 1;
    for (const [position, count] of spec) {
      for (let i = 0; i < count; i++) {
        out.push({
          id: id,
          name: `Player ${String(id).padStart(2, '0')}`,
          position,
          rating: 120 + ((id * 37) % 90),
          age: 18 + ((id * 13) % 17),
          condition: 70 + ((id * 11) % 30)
        });
        id++;
      }
    }
    return out;
  }

  // --------------------------------------------------------------- lookups

  template(id: string): SessionTemplate | undefined {
    return this.templateById.get(id);
  }

  templateOf(session: PlannedSession): SessionTemplate {
    return this.templateById.get(session.templateId) || SESSION_TEMPLATES[SESSION_TEMPLATES.length - 1];
  }

  categories(): SessionCategory[] {
    return ['Physical', 'General', 'Tactical', 'Match', 'Extra', 'Rest'];
  }

  templatesIn(category: SessionCategory): SessionTemplate[] {
    return SESSION_TEMPLATES.filter(t => t.category === category);
  }

  categoryColour(category: SessionCategory): string {
    return CATEGORY_COLOURS[category];
  }

  sessionColour(session: PlannedSession): string {
    return CATEGORY_COLOURS[this.templateOf(session).category];
  }

  /** Free-text filter used by the palette / command bar skins. */
  searchTemplates(query: string): SessionTemplate[] {
    const q = (query || '').trim().toLowerCase();
    if (!q) return SESSION_TEMPLATES;
    return SESSION_TEMPLATES.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      Object.keys(t.gains).some(area => area.toLowerCase().includes(q)));
  }

  // ------------------------------------------------------------- mutations

  setTemplate(dayIndex: number, slotIndex: number, templateId: string): void {
    const template = this.templateById.get(templateId);
    const day = this.week[dayIndex];
    if (!template || !day) return;
    this.snapshot();
    const existing = day.sessions[slotIndex];
    const session: PlannedSession = {
      slotId: existing ? existing.slotId : this.nextSlotId(),
      templateId: template.id,
      unit: existing ? existing.unit : 'Team',
      intensity: template.defaultIntensity
    };
    if (existing) day.sessions[slotIndex] = session;
    else if (day.sessions.length < MAX_SESSIONS_PER_DAY) day.sessions.push(session);
    day.matchDay = day.sessions.some(s => s.templateId === 'match-day');
    this.commit();
  }

  setUnit(dayIndex: number, slotIndex: number, unit: TrainingUnit): void {
    const session = this.week[dayIndex]?.sessions[slotIndex];
    if (!session) return;
    this.snapshot();
    session.unit = unit;
    this.commit();
  }

  /**
   * No undo snapshot here on purpose: a slider drag fires this on every pixel
   * and would bury every other change under a hundred intensity steps.
   */
  setIntensity(dayIndex: number, slotIndex: number, intensity: number): void {
    const session = this.week[dayIndex]?.sessions[slotIndex];
    if (!session) return;
    session.intensity = Math.max(0, Math.min(100, Math.round(intensity)));
    this.commit();
  }

  nudgeIntensity(dayIndex: number, slotIndex: number, delta: number): void {
    const session = this.week[dayIndex]?.sessions[slotIndex];
    if (!session) return;
    this.snapshot();
    session.intensity = Math.max(0, Math.min(100, session.intensity + delta));
    this.commit();
  }

  addSession(dayIndex: number, templateId = 'rest'): void {
    const day = this.week[dayIndex];
    if (!day || day.sessions.length >= MAX_SESSIONS_PER_DAY) return;
    const template = this.templateById.get(templateId) || SESSION_TEMPLATES[0];
    this.snapshot();
    day.sessions.push({
      slotId: this.nextSlotId(),
      templateId: template.id,
      unit: 'Team',
      intensity: template.defaultIntensity
    });
    this.commit();
  }

  removeSession(dayIndex: number, slotIndex: number): void {
    const day = this.week[dayIndex];
    if (!day || !day.sessions[slotIndex]) return;
    this.snapshot();
    day.sessions.splice(slotIndex, 1);
    day.matchDay = day.sessions.some(s => s.templateId === 'match-day');
    this.commit();
  }

  clearDay(dayIndex: number): void {
    const day = this.week[dayIndex];
    if (!day) return;
    this.snapshot();
    day.sessions = [this.makeSession('rest')];
    day.matchDay = false;
    this.commit();
  }

  copyDay(from: number, to: number): void {
    const source = this.week[from];
    const target = this.week[to];
    if (!source || !target || from === to) return;
    this.snapshot();
    target.sessions = source.sessions.map(s => ({ ...s, slotId: this.nextSlotId() }));
    target.matchDay = source.matchDay;
    this.commit();
  }

  /** Drag-and-drop: move a session between days, or reorder inside one. */
  moveSession(fromDay: number, fromSlot: number, toDay: number, toSlot: number | null = null): void {
    const source = this.week[fromDay];
    const target = this.week[toDay];
    if (!source || !target) return;
    const session = source.sessions[fromSlot];
    if (!session) return;
    // A cross-day move must respect the day cap wherever it lands; only a
    // reorder inside the same day leaves the count unchanged.
    if (fromDay !== toDay && target.sessions.length >= MAX_SESSIONS_PER_DAY) return;
    this.snapshot();
    source.sessions.splice(fromSlot, 1);
    if (toSlot === null || toSlot >= target.sessions.length) target.sessions.push(session);
    else target.sessions.splice(toSlot, 0, session);
    source.matchDay = source.sessions.some(s => s.templateId === 'match-day');
    target.matchDay = target.sessions.some(s => s.templateId === 'match-day');
    this.commit();
  }

  setGeneralFocus(focus: string): void {
    if (this.generalFocus === focus) return;
    this.snapshot();
    this.generalFocus = focus;
    this.commit();
  }

  applyPreset(presetId: string, recordUndo = true): void {
    const preset = TRAINING_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    if (recordUndo) this.snapshot();
    this.week = preset.week.map((slots, dayIndex) => {
      const sessions = slots
        .filter((id): id is string => !!id)
        .map(id => this.makeSession(id));
      return {
        dayIndex,
        dayName: DAY_NAMES[dayIndex],
        longName: DAY_LONG_NAMES[dayIndex],
        matchDay: sessions.some(s => s.templateId === 'match-day'),
        sessions
      };
    });
    this.activePresetId = preset.id;
    if (recordUndo) this.commit();
    else this.changes.next(this.changes.value + 1);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.week = previous.week;
    this.generalFocus = previous.generalFocus;
    this.individual = new Map(previous.individual.map(p => [p.playerId, p]));
    this.persist();
    this.changes.next(this.changes.value + 1);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }

  // ---------------------------------------------------------- individual

  planFor(playerId: number): IndividualPlan {
    let plan = this.individual.get(playerId);
    if (!plan) {
      plan = { playerId, area: null, attribute: null, role: null, effort: 1 };
      this.individual.set(playerId, plan);
    }
    return plan;
  }

  hasIndividualPlan(playerId: number): boolean {
    const plan = this.individual.get(playerId);
    return !!plan && !!(plan.area || plan.attribute || plan.role);
  }

  get individualCount(): number {
    return this.players.filter(p => this.hasIndividualPlan(p.id)).length;
  }

  setIndividualArea(playerId: number, area: DevelopmentArea | null): void {
    this.snapshot();
    const plan = this.planFor(playerId);
    plan.area = area;
    // The attribute list is scoped to the area, so a stale pick would be a lie.
    if (area && plan.attribute && !AREA_ATTRIBUTES[area].includes(plan.attribute)) plan.attribute = null;
    if (!area) plan.attribute = null;
    this.commit();
  }

  setIndividualAttribute(playerId: number, attribute: string | null): void {
    this.snapshot();
    this.planFor(playerId).attribute = attribute;
    this.commit();
  }

  setIndividualRole(playerId: number, role: string | null): void {
    this.snapshot();
    this.planFor(playerId).role = role;
    this.commit();
  }

  setIndividualEffort(playerId: number, effort: number): void {
    this.snapshot();
    this.planFor(playerId).effort = Math.max(0, Math.min(2, effort));
    this.commit();
  }

  clearIndividual(playerId: number): void {
    this.snapshot();
    this.individual.set(playerId, { playerId, area: null, attribute: null, role: null, effort: 1 });
    this.commit();
  }

  attributesFor(area: DevelopmentArea | null): string[] {
    return area ? AREA_ATTRIBUTES[area] : [];
  }

  individualSummary(playerId: number): string {
    const plan = this.individual.get(playerId);
    if (!plan) return 'Team focus';
    if (plan.attribute) return plan.attribute;
    if (plan.area) return plan.area;
    if (plan.role) return plan.role;
    return 'Team focus';
  }

  /**
   * Rough projected monthly gain, in rating points, for the player's own plan.
   * Younger players gain more, effort scales it, and a heavy team week eats
   * into whatever is left for individual work.
   */
  projectedGain(player: SquadPlayer): number {
    const plan = this.individual.get(player.id);
    if (!plan || !(plan.area || plan.attribute || plan.role)) return 0;
    const youth = Math.max(0.35, 1.6 - Math.max(0, player.age - 17) * 0.075);
    const effort = [0.6, 1, 1.45][plan.effort];
    const precision = plan.attribute ? 1.25 : plan.area ? 1 : 0.8;
    const headroom = Math.max(0.3, 1 - this.analytics().weeklyLoad / 160);
    return Math.round(youth * effort * precision * headroom * 100) / 100;
  }

  // ---------------------------------------------------------- analytics

  dayLoad(day: PlannedDay): number {
    const raw = day.sessions.reduce((sum, s) => sum + s.intensity, 0);
    return Math.min(100, Math.round(raw * 0.45));
  }

  dayHasRecovery(day: PlannedDay): boolean {
    return day.sessions.some(s => s.templateId === 'recovery' || s.templateId === 'rest');
  }

  /**
   * Templates call this from several bindings per change-detection pass, so the
   * result is cached against the mutation counter — it only recomputes when the
   * plan actually changed.
   */
  analytics(): WeekAnalytics {
    if (this.analyticsCache && this.analyticsRevision === this.changes.value) {
      return this.analyticsCache;
    }
    this.analyticsCache = this.computeAnalytics();
    this.analyticsRevision = this.changes.value;
    return this.analyticsCache;
  }

  private computeAnalytics(): WeekAnalytics {
    const loads = this.week.map(d => this.dayLoad(d));
    const weeklyLoad = Math.round(loads.reduce((a, b) => a + b, 0) / 7);
    const peakDayLoad = loads.length ? Math.max(...loads) : 0;
    const restDays = loads.filter(l => l < 20).length;

    const coverage = {} as Record<DevelopmentArea, number>;
    DEVELOPMENT_AREAS.forEach(area => coverage[area] = 0);
    for (const day of this.week) {
      for (const session of day.sessions) {
        const template = this.templateOf(session);
        // A unit session reaches roughly a third of the squad, so it counts less
        // toward squad-wide coverage than the same drill run with everyone.
        const reach = session.unit === 'Team' ? 1 : 0.45;
        for (const [area, weight] of Object.entries(template.gains)) {
          coverage[area as DevelopmentArea] += session.intensity * (weight as number) * reach;
        }
      }
    }
    // Focus tilts the squad's attention without changing what was scheduled.
    const tilt: Record<string, DevelopmentArea[]> = {
      'Attacking': ['Attacking', 'Technical'],
      'Defensive': ['Defending', 'Tactical'],
      'Fitness': ['Fitness', 'Strength'],
      'Tactical': ['Tactical', 'Mental'],
      'Balanced': []
    };
    (tilt[this.generalFocus] || []).forEach(area => coverage[area] *= 1.18);
    DEVELOPMENT_AREAS.forEach(area => {
      coverage[area] = Math.min(100, Math.round(coverage[area] / 1.6));
    });

    let fatigue = 0;
    let consecutiveHard = 0;
    let worstStreak = 0;
    for (const load of loads) {
      fatigue += load * 0.16;
      if (load < 25) fatigue -= 9;
      fatigue = Math.max(0, fatigue);
      if (load > 72) { consecutiveHard++; worstStreak = Math.max(worstStreak, consecutiveHard); }
      else consecutiveHard = 0;
    }
    fatigue = Math.min(100, Math.round(fatigue));

    // Sharpness peaks at a moderate, regular load; both idleness and grinding
    // pull it down, and accumulated fatigue takes a further bite.
    const idealLoad = 58;
    let sharpness = 100 - Math.abs(weeklyLoad - idealLoad) * 1.5 - fatigue * 0.28;
    sharpness += (coverage['Tactical'] + coverage['Set Pieces']) * 0.06;
    sharpness = Math.max(0, Math.min(100, Math.round(sharpness)));

    const physicalLoad = this.week.reduce((sum, day) => sum + day.sessions.reduce((s, session) =>
      s + (this.templateOf(session).category === 'Physical' ? session.intensity : 0), 0), 0);
    const injuryRisk = Math.max(0, Math.min(100, Math.round(
      fatigue * 0.5 + worstStreak * 9 + physicalLoad * 0.05 - restDays * 5)));

    const cohesion = Math.min(100, Math.round(coverage['Cohesion'] * 1.35 + 22));

    return {
      weeklyLoad, peakDayLoad, restDays, sharpness, fatigue, injuryRisk, cohesion,
      coverage,
      warnings: this.buildWarnings(loads, worstStreak, coverage, restDays)
    };
  }

  private buildWarnings(loads: number[], worstStreak: number,
                        coverage: Record<DevelopmentArea, number>,
                        restDays: number): PlanWarning[] {
    const warnings: PlanWarning[] = [];

    if (worstStreak >= 3) {
      warnings.push({ level: 'danger',
        text: `${worstStreak} hard days back to back — injury risk climbs sharply past three.` });
    }
    const matchDayIndex = this.week.findIndex(d => d.matchDay);
    if (matchDayIndex === -1) {
      warnings.push({ level: 'info', text: 'No fixture in this week — a good time for a physical block.' });
    } else {
      const dayBefore = this.week[(matchDayIndex + 6) % 7];
      if (this.dayLoad(dayBefore) > 55) {
        warnings.push({ level: 'warn',
          text: `${dayBefore.longName} is heavy the day before the fixture. Taper it.` });
      }
      const dayAfter = this.week[(matchDayIndex + 1) % 7];
      if (!this.dayHasRecovery(dayAfter)) {
        warnings.push({ level: 'warn',
          text: `No recovery scheduled on ${dayAfter.longName}, straight after the match.` });
      }
    }
    if (restDays === 0) {
      warnings.push({ level: 'warn', text: 'Not a single light day. Legs never get the chance to come back.' });
    }
    if (restDays >= 4) {
      warnings.push({ level: 'warn', text: 'Four or more light days — the squad will go stale.' });
    }
    const untouched = DEVELOPMENT_AREAS.filter(area => coverage[area] < 6);
    if (untouched.length) {
      warnings.push({ level: 'info', text: `Untrained this week: ${untouched.join(', ')}.` });
    }
    if (loads.every(l => l < 30)) {
      warnings.push({ level: 'danger', text: 'This week barely trains at all. Sharpness will fall off a cliff.' });
    }
    if (!warnings.length) {
      warnings.push({ level: 'info', text: 'Balanced week. Nothing here needs changing.' });
    }
    return warnings;
  }

  loadBand(load: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (load < 30) return 'low';
    if (load < 60) return 'medium';
    if (load < 82) return 'high';
    return 'extreme';
  }

  /** Sparkline points for the seven-day load curve, in a 100x40 viewBox. */
  loadCurvePoints(): string {
    return this.week
      .map((day, i) => `${(i * 100) / 6},${40 - (this.dayLoad(day) / 100) * 36 - 2}`)
      .join(' ');
  }

  // ------------------------------------------------------------- plumbing

  private makeSession(templateId: string): PlannedSession {
    const template = this.templateById.get(templateId) || SESSION_TEMPLATES[SESSION_TEMPLATES.length - 1];
    return {
      slotId: this.nextSlotId(),
      templateId: template.id,
      unit: 'Team',
      intensity: template.defaultIntensity
    };
  }

  private nextSlotId(): string {
    return `s${++this.slotSequence}`;
  }

  private snapshot(): void {
    this.undoStack.push(this.serialise());
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
  }

  private commit(): void {
    this.dirty = true;
    this.activePresetId = null;
    this.persist();
    this.changes.next(this.changes.value + 1);
  }

  private emit(): void {
    this.changes.next(this.changes.value + 1);
  }

  private serialise(): PersistedPlan {
    return JSON.parse(JSON.stringify({
      week: this.week,
      generalFocus: this.generalFocus,
      individual: Array.from(this.individual.values())
    }));
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + (this.loadedTeamId ?? 0),
        JSON.stringify(this.serialise()));
    } catch {
      // Private-browsing quota failures must never break the editor.
    }
  }

  private restore(teamId: number): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_PREFIX + teamId);
    } catch {
      raw = null;
    }
    if (!raw) return;
    // Restore is the one mutation that does not bump the change counter, so the
    // cached analytics must be dropped by hand.
    this.analyticsCache = null;
    try {
      const parsed = JSON.parse(raw) as PersistedPlan;
      if (!Array.isArray(parsed.week) || parsed.week.length !== 7) return;
      this.week = parsed.week;
      this.generalFocus = parsed.generalFocus || 'Balanced';
      this.individual = new Map((parsed.individual || []).map(p => [p.playerId, p]));
      // Restored slot ids must not collide with ids minted later this session.
      this.slotSequence = this.week
        .flatMap(d => d.sessions)
        .reduce((max, s) => Math.max(max, Number(String(s.slotId).slice(1)) || 0), 0);
      this.activePresetId = null;
    } catch {
      this.applyPreset('balanced', false);
    }
  }

  /** Wipes the local plan and returns to the shipped default. */
  resetAll(): void {
    this.snapshot();
    this.individual.clear();
    this.generalFocus = 'Balanced';
    this.applyPreset('balanced', false);
    this.dirty = false;
    this.activePresetId = 'balanced';
    this.persist();
    this.emit();
  }
}
