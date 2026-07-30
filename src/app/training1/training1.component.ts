import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TrainingPlanService } from '../training-lab/training-plan.service';
import {
  DevelopmentArea, MAX_SESSIONS_PER_DAY, PlannedDay, PlannedSession,
  SessionCategory, SessionTemplate, SquadPlayer, TRAINING_ROLES, TRAINING_UNITS, TrainingUnit
} from '../training-lab/training-plan.model';

/**
 * Skin 1 — "COACH'S LAB". The tactics4 language applied to training: dark
 * slate, thin accent rules, tabular numerals, a dense seven-column week and a
 * permanent analytics rail on the right.
 */
@Component({
  selector: 'app-training1',
  templateUrl: './training1.component.html',
  styleUrls: ['./training1.component.css']
})
export class Training1Component implements OnInit, OnDestroy {

  readonly units = TRAINING_UNITS;
  readonly roles = TRAINING_ROLES;
  readonly maxSessions = MAX_SESSIONS_PER_DAY;

  activeTab: 'week' | 'individual' | 'analysis' = 'week';

  pickerDay = -1;
  pickerSlot = -1;
  pickerQuery = '';
  previewTemplate: SessionTemplate | null = null;

  detailDay = -1;
  detailSlot = -1;

  selectedPlayerId: number | null = null;

  private sub = new Subscription();
  private pushedHistory = 0;

  constructor(public plan: TrainingPlanService) {}

  ngOnInit(): void {
    this.plan.init();
    this.sub.add(this.plan.changes.subscribe(() => {
      if (this.selectedPlayerId === null && this.plan.players.length) {
        this.selectedPlayerId = this.plan.players[0].id;
      }
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  // ------------------------------------------------------------ week grid

  get week(): PlannedDay[] { return this.plan.week; }

  colour(session: PlannedSession): string { return this.plan.sessionColour(session); }

  name(session: PlannedSession): string { return this.plan.templateOf(session).name; }

  icon(session: PlannedSession): string { return this.plan.templateOf(session).icon; }

  trackSlot(_: number, session: PlannedSession): string { return session.slotId; }

  trackDay(_: number, day: PlannedDay): number { return day.dayIndex; }

  emptySlots(day: PlannedDay): number[] {
    return Array(Math.max(0, MAX_SESSIONS_PER_DAY - day.sessions.length)).fill(0).map((_, i) => i);
  }

  // --------------------------------------------------------------- picker

  openPicker(dayIndex: number, slotIndex: number): void {
    this.pickerDay = dayIndex;
    this.pickerSlot = slotIndex;
    this.pickerQuery = '';
    this.previewTemplate = null;
    this.pushHistory();
  }

  closePicker(): void {
    if (this.pickerDay === -1) return;
    this.pickerDay = -1;
    this.pickerSlot = -1;
    this.popHistory();
  }

  choose(template: SessionTemplate): void {
    if (this.pickerDay === -1) return;
    this.plan.setTemplate(this.pickerDay, this.pickerSlot, template.id);
    this.closePicker();
  }

  results(category: SessionCategory): SessionTemplate[] {
    return this.plan.searchTemplates(this.pickerQuery).filter(t => t.category === category);
  }

  hasResults(category: SessionCategory): boolean {
    return this.results(category).length > 0;
  }

  // ---------------------------------------------------------- slot detail

  openDetail(dayIndex: number, slotIndex: number, event: MouseEvent): void {
    event.stopPropagation();
    if (this.detailDay === dayIndex && this.detailSlot === slotIndex) {
      this.closeDetail();
      return;
    }
    this.detailDay = dayIndex;
    this.detailSlot = slotIndex;
  }

  closeDetail(): void {
    this.detailDay = -1;
    this.detailSlot = -1;
  }

  get detailSession(): PlannedSession | null {
    return this.plan.week[this.detailDay]?.sessions[this.detailSlot] || null;
  }

  get detailTemplate(): SessionTemplate | null {
    const session = this.detailSession;
    return session ? this.plan.templateOf(session) : null;
  }

  onIntensity(value: string): void {
    this.plan.setIntensity(this.detailDay, this.detailSlot, Number(value));
  }

  onUnit(unit: TrainingUnit): void {
    this.plan.setUnit(this.detailDay, this.detailSlot, unit);
  }

  removeDetail(): void {
    this.plan.removeSession(this.detailDay, this.detailSlot);
    this.closeDetail();
  }

  // ----------------------------------------------------------- individual

  get selectedPlayer(): SquadPlayer | null {
    return this.plan.players.find(p => p.id === this.selectedPlayerId) || null;
  }

  select(player: SquadPlayer): void { this.selectedPlayerId = player.id; }

  areaOf(playerId: number): DevelopmentArea | null { return this.plan.planFor(playerId).area; }

  // ------------------------------------------------------------- history

  /** Back closes the picker instead of unmounting the page, as on the tactics screens. */
  private pushHistory(): void {
    history.pushState({ trainingPicker: true }, '');
    this.pushedHistory++;
  }

  private popHistory(): void {
    if (this.pushedHistory > 0) { this.pushedHistory--; history.back(); }
  }

  @HostListener('window:popstate')
  onBrowserBack(): void {
    if (this.pickerDay === -1) return;
    this.pickerDay = -1;
    this.pickerSlot = -1;
    this.pushedHistory = Math.max(0, this.pushedHistory - 1);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pickerDay !== -1) this.closePicker();
    else this.closeDetail();
  }
}
