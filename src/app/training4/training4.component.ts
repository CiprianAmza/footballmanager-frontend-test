import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TrainingPlanService } from '../training-lab/training-plan.service';
import {
  DevelopmentArea, MAX_SESSIONS_PER_DAY, PlannedDay, PlannedSession,
  SessionCategory, SessionTemplate, SquadPlayer, TRAINING_ROLES, TRAINING_UNITS, TrainingUnit,
  WeekAnalytics
} from '../training-lab/training-plan.model';

/**
 * Skin 4 — "MATCHDAY CARDS". Soft, rounded, app-like: one card per day, a
 * circular dial for load, colour-chipped session rows and a bottom sheet for
 * editing. Same plan underneath as the other three.
 */
@Component({
  selector: 'app-training4',
  templateUrl: './training4.component.html',
  styleUrls: ['./training4.component.css']
})
export class Training4Component implements OnInit, OnDestroy {

  readonly units = TRAINING_UNITS;
  readonly roles = TRAINING_ROLES;
  readonly maxSessions = MAX_SESSIONS_PER_DAY;

  /** Dial geometry — r=26 in a 64x64 box. */
  readonly dialRadius = 26;
  readonly dialCircumference = 2 * Math.PI * 26;

  view: 'week' | 'squad' = 'week';

  sheet: 'drill' | 'tune' | null = null;
  sheetDay = -1;
  sheetSlot = -1;
  sheetQuery = '';
  sheetCategory: SessionCategory | 'All' = 'All';

  expandedPlayerId: number | null = null;

  private sub = new Subscription();
  private pushedHistory = 0;

  constructor(public plan: TrainingPlanService) {}

  ngOnInit(): void {
    this.plan.init();
    this.sub.add(this.plan.changes.subscribe(() => {}));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  // ------------------------------------------------------------- display

  get week(): PlannedDay[] { return this.plan.week; }

  trackDay(_: number, day: PlannedDay): number { return day.dayIndex; }
  trackSlot(_: number, session: PlannedSession): string { return session.slotId; }
  trackDial(_: number, dial: { label: string }): string { return dial.label; }

  /** The four hero rings. Built here rather than inline so trackBy can hold the DOM. */
  heroDials(a: WeekAnalytics): { label: string; value: number; colour: string }[] {
    return [
      { label: 'Load', value: a.weeklyLoad, colour: this.dialColour(a.weeklyLoad) },
      { label: 'Sharpness', value: a.sharpness, colour: '#3ddc84' },
      { label: 'Fatigue', value: a.fatigue, colour: '#ffd23f' },
      { label: 'Injury risk', value: a.injuryRisk, colour: '#ff5c6c' }
    ];
  }

  template(session: PlannedSession): SessionTemplate { return this.plan.templateOf(session); }
  colour(session: PlannedSession): string { return this.plan.sessionColour(session); }

  freeSlots(day: PlannedDay): boolean { return day.sessions.length < MAX_SESSIONS_PER_DAY; }

  /** stroke-dasharray for a 0..100 value on the dial ring. */
  dash(value: number): string {
    const filled = (Math.max(0, Math.min(100, value)) / 100) * this.dialCircumference;
    return `${filled} ${this.dialCircumference - filled}`;
  }

  dialColour(load: number): string {
    const band = this.plan.loadBand(load);
    return band === 'low' ? '#3ddc84'
      : band === 'medium' ? '#ffd23f'
      : band === 'high' ? '#ff9f43'
      : '#ff5c6c';
  }

  // --------------------------------------------------------------- sheet

  openDrillSheet(dayIndex: number, slotIndex: number): void {
    this.sheetDay = dayIndex;
    this.sheetSlot = slotIndex;
    this.sheetQuery = '';
    this.sheetCategory = 'All';
    this.sheet = 'drill';
    this.pushHistory();
  }

  openTuneSheet(dayIndex: number, slotIndex: number): void {
    this.sheetDay = dayIndex;
    this.sheetSlot = slotIndex;
    this.sheet = 'tune';
    this.pushHistory();
  }

  closeSheet(): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.sheetDay = -1;
    this.sheetSlot = -1;
    this.popHistory();
  }

  get sheetSession(): PlannedSession | null {
    return this.plan.week[this.sheetDay]?.sessions[this.sheetSlot] || null;
  }

  get sheetTemplate(): SessionTemplate | null {
    const session = this.sheetSession;
    return session ? this.plan.templateOf(session) : null;
  }

  get sheetCategories(): (SessionCategory | 'All')[] {
    return ['All', ...this.plan.categories()];
  }

  get sheetResults(): SessionTemplate[] {
    const found = this.plan.searchTemplates(this.sheetQuery);
    return this.sheetCategory === 'All' ? found : found.filter(t => t.category === this.sheetCategory);
  }

  choose(template: SessionTemplate): void {
    this.plan.setTemplate(this.sheetDay, this.sheetSlot, template.id);
    this.closeSheet();
  }

  onIntensity(value: string): void {
    this.plan.setIntensity(this.sheetDay, this.sheetSlot, Number(value));
  }

  onUnit(unit: TrainingUnit): void {
    this.plan.setUnit(this.sheetDay, this.sheetSlot, unit);
  }

  removeFromSheet(): void {
    this.plan.removeSession(this.sheetDay, this.sheetSlot);
    this.closeSheet();
  }

  swapFromTune(): void {
    // Keep the single pushed history entry: swap the sheet's mode in place.
    this.sheet = 'drill';
    this.sheetQuery = '';
    this.sheetCategory = 'All';
  }

  // ----------------------------------------------------------- individual

  toggle(player: SquadPlayer): void {
    this.expandedPlayerId = this.expandedPlayerId === player.id ? null : player.id;
  }

  areaOf(playerId: number): DevelopmentArea | null { return this.plan.planFor(playerId).area; }

  /** 0..100 completeness of a player's programme, for the ring on the card. */
  programmeCompleteness(playerId: number): number {
    const plan = this.plan.planFor(playerId);
    let score = 0;
    if (plan.area) score += 40;
    if (plan.attribute) score += 40;
    if (plan.role) score += 20;
    return score;
  }

  // -------------------------------------------------------------- history

  private pushHistory(): void {
    history.pushState({ trainingSheet: true }, '');
    this.pushedHistory++;
  }

  private popHistory(): void {
    if (this.pushedHistory > 0) { this.pushedHistory--; history.back(); }
  }

  /** Back dismisses the sheet rather than leaving the page. */
  @HostListener('window:popstate')
  onBrowserBack(): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.sheetDay = -1;
    this.sheetSlot = -1;
    this.pushedHistory = Math.max(0, this.pushedHistory - 1);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeSheet(); }
}
