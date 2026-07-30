import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TrainingPlanService } from '../training-lab/training-plan.service';
import {
  DevelopmentArea, MAX_SESSIONS_PER_DAY, PlannedDay, PlannedSession,
  SessionCategory, SessionTemplate, SquadPlayer, TRAINING_ROLES, TRAINING_UNITS, TrainingUnit
} from '../training-lab/training-plan.model';

interface DragPayload {
  kind: 'palette' | 'slot';
  templateId?: string;
  dayIndex?: number;
  slotIndex?: number;
}

/**
 * Skin 2 — "PERIODISATION BOARD". A drag-and-drop planning board: the drill
 * palette lives permanently on the left, days are drop columns, and the load
 * curve across the top redraws as blocks land. Warm amber, poster type.
 */
@Component({
  selector: 'app-training2',
  templateUrl: './training2.component.html',
  styleUrls: ['./training2.component.css']
})
export class Training2Component implements OnInit, OnDestroy {

  readonly units = TRAINING_UNITS;
  readonly roles = TRAINING_ROLES;
  readonly maxSessions = MAX_SESSIONS_PER_DAY;

  paletteQuery = '';
  paletteCategory: SessionCategory | 'All' = 'All';
  showIndividual = false;
  selectedPlayerId: number | null = null;

  drag: DragPayload | null = null;
  dropTargetDay = -1;
  expandedSlot: string | null = null;

  private sub = new Subscription();

  constructor(public plan: TrainingPlanService) {}

  ngOnInit(): void {
    this.plan.init();
    this.sub.add(this.plan.changes.subscribe(() => {
      if (this.selectedPlayerId === null && this.plan.players.length) {
        this.selectedPlayerId = this.plan.players[0].id;
      }
    }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  // ------------------------------------------------------------- palette

  get paletteCategories(): (SessionCategory | 'All')[] {
    return ['All', ...this.plan.categories()];
  }

  get paletteItems(): SessionTemplate[] {
    const found = this.plan.searchTemplates(this.paletteQuery);
    return this.paletteCategory === 'All'
      ? found
      : found.filter(t => t.category === this.paletteCategory);
  }

  // ---------------------------------------------------------------- board

  get week(): PlannedDay[] { return this.plan.week; }

  trackDay(_: number, day: PlannedDay): number { return day.dayIndex; }
  trackSlot(_: number, session: PlannedSession): string { return session.slotId; }

  template(session: PlannedSession): SessionTemplate { return this.plan.templateOf(session); }
  colour(session: PlannedSession): string { return this.plan.sessionColour(session); }

  isFull(day: PlannedDay): boolean { return day.sessions.length >= MAX_SESSIONS_PER_DAY; }

  /** Column height for the curve chart, as a percentage of the plot area. */
  barHeight(day: PlannedDay): number {
    return Math.max(2, this.plan.dayLoad(day));
  }

  toggleSlot(session: PlannedSession): void {
    this.expandedSlot = this.expandedSlot === session.slotId ? null : session.slotId;
  }

  // ----------------------------------------------------------- drag/drop

  startPaletteDrag(event: DragEvent, template: SessionTemplate): void {
    this.drag = { kind: 'palette', templateId: template.id };
    event.dataTransfer?.setData('text/plain', template.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  startSlotDrag(event: DragEvent, dayIndex: number, slotIndex: number): void {
    this.drag = { kind: 'slot', dayIndex, slotIndex };
    event.dataTransfer?.setData('text/plain', `${dayIndex}:${slotIndex}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  allowDrop(event: DragEvent, dayIndex: number): void {
    if (!this.drag) return;
    const day = this.week[dayIndex];
    // A palette drop needs a free slot; moving within the same day never does.
    if (this.drag.kind === 'palette' && this.isFull(day)) return;
    if (this.drag.kind === 'slot' && this.drag.dayIndex !== dayIndex && this.isFull(day)) return;
    event.preventDefault();
    this.dropTargetDay = dayIndex;
  }

  leaveDrop(dayIndex: number): void {
    if (this.dropTargetDay === dayIndex) this.dropTargetDay = -1;
  }

  drop(event: DragEvent, dayIndex: number, slotIndex: number | null = null): void {
    event.preventDefault();
    event.stopPropagation();
    const payload = this.drag;
    this.endDrag();
    if (!payload) return;

    if (payload.kind === 'palette' && payload.templateId) {
      const day = this.week[dayIndex];
      const target = slotIndex === null ? day.sessions.length : slotIndex;
      this.plan.setTemplate(dayIndex, target, payload.templateId);
      return;
    }
    if (payload.kind === 'slot' && payload.dayIndex !== undefined && payload.slotIndex !== undefined) {
      this.plan.moveSession(payload.dayIndex, payload.slotIndex, dayIndex, slotIndex);
    }
  }

  endDrag(): void {
    this.drag = null;
    this.dropTargetDay = -1;
  }

  /** Keyboard/click fallback so the board is usable without a mouse drag. */
  quickAdd(template: SessionTemplate): void {
    const target = this.week.find(d => d.sessions.length < MAX_SESSIONS_PER_DAY);
    if (target) this.plan.setTemplate(target.dayIndex, target.sessions.length, template.id);
  }

  // ----------------------------------------------------------- individual

  get selectedPlayer(): SquadPlayer | null {
    return this.plan.players.find(p => p.id === this.selectedPlayerId) || null;
  }

  areaOf(playerId: number): DevelopmentArea | null { return this.plan.planFor(playerId).area; }

  onIntensity(dayIndex: number, slotIndex: number, value: string): void {
    this.plan.setIntensity(dayIndex, slotIndex, Number(value));
  }

  onUnit(dayIndex: number, slotIndex: number, unit: TrainingUnit): void {
    this.plan.setUnit(dayIndex, slotIndex, unit);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.expandedSlot = null;
    this.endDrag();
  }
}
