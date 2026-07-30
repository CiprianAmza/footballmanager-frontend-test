import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TrainingPlanService } from '../training-lab/training-plan.service';
import {
  DAY_NAMES, DevelopmentArea, MAX_SESSIONS_PER_DAY, PlannedDay, PlannedSession,
  SessionTemplate, SquadPlayer, TRAINING_ROLES, TRAINING_UNITS, TrainingUnit
} from '../training-lab/training-plan.model';

interface LogLine {
  kind: 'in' | 'ok' | 'err' | 'info';
  text: string;
}

/**
 * Skin 3 — "TRAINING TERMINAL". A phosphor console: monospace everything,
 * ASCII meters, and a command bar that drives the same plan the other skins
 * edit with a mouse. Clicking still works — the keyboard is the fast path,
 * not the only path.
 */
@Component({
  selector: 'app-training3',
  templateUrl: './training3.component.html',
  styleUrls: ['./training3.component.css']
})
export class Training3Component implements OnInit, OnDestroy {

  readonly units = TRAINING_UNITS;
  readonly roles = TRAINING_ROLES;
  readonly maxSessions = MAX_SESSIONS_PER_DAY;

  command = '';
  history: string[] = [];
  historyCursor = -1;
  log: LogLine[] = [
    { kind: 'info', text: 'TRAINING TERMINAL v1.0 — type `help` for the command list.' }
  ];

  panel: 'week' | 'squad' = 'week';

  /** Inline drill menu, opened by clicking a cell. */
  menuDay = -1;
  menuSlot = -1;

  selectedPlayerId: number | null = null;

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

  // -------------------------------------------------------------- display

  get week(): PlannedDay[] { return this.plan.week; }

  trackDay(_: number, day: PlannedDay): number { return day.dayIndex; }
  trackSlot(_: number, session: PlannedSession): string { return session.slotId; }
  /** slotsOf() hands back a fresh padded array each pass; key on position. */
  trackIndex(index: number): number { return index; }

  template(session: PlannedSession): SessionTemplate { return this.plan.templateOf(session); }

  slotsOf(day: PlannedDay): (PlannedSession | null)[] {
    const out: (PlannedSession | null)[] = [...day.sessions];
    while (out.length < MAX_SESSIONS_PER_DAY) out.push(null);
    return out;
  }

  /** `[████████░░]` style meter — the only chart type a terminal gets. */
  bar(value: number, width = 12): string {
    const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  pad(text: string | number, width: number): string {
    const s = String(text);
    return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
  }

  padStart(text: string | number, width: number): string {
    const s = String(text);
    return s.length >= width ? s : ' '.repeat(width - s.length) + s;
  }

  // ----------------------------------------------------------- inline menu

  openMenu(dayIndex: number, slotIndex: number): void {
    if (this.menuDay === dayIndex && this.menuSlot === slotIndex) { this.closeMenu(); return; }
    this.menuDay = dayIndex;
    this.menuSlot = slotIndex;
  }

  closeMenu(): void { this.menuDay = -1; this.menuSlot = -1; }

  pick(template: SessionTemplate): void {
    this.plan.setTemplate(this.menuDay, this.menuSlot, template.id);
    this.write('ok', `set ${DAY_NAMES[this.menuDay].toLowerCase()} ${this.menuSlot + 1} → ${template.name}`);
    this.closeMenu();
  }

  clearSlot(): void {
    if (this.plan.week[this.menuDay]?.sessions[this.menuSlot]) {
      this.plan.removeSession(this.menuDay, this.menuSlot);
      this.write('ok', `cleared ${DAY_NAMES[this.menuDay].toLowerCase()} slot ${this.menuSlot + 1}`);
    }
    this.closeMenu();
  }

  onIntensity(dayIndex: number, slotIndex: number, value: string): void {
    this.plan.setIntensity(dayIndex, slotIndex, Number(value));
  }

  onUnit(dayIndex: number, slotIndex: number, unit: TrainingUnit): void {
    this.plan.setUnit(dayIndex, slotIndex, unit);
  }

  // -------------------------------------------------------------- command

  submit(): void {
    const raw = this.command.trim();
    if (!raw) return;
    this.write('in', raw);
    this.history.unshift(raw);
    this.historyCursor = -1;
    this.command = '';
    this.run(raw);
  }

  private run(raw: string): void {
    const parts = raw.split(/\s+/);
    const verb = parts[0].toLowerCase();

    switch (verb) {
      case 'help':
        this.write('info', 'set <day> <slot> <drill>   — place a drill (e.g. `set mon 1 endurance`)');
        this.write('info', 'int <day> <slot> <0-100>   — set intensity');
        this.write('info', 'unit <day> <slot> <unit>   — team | goalkeepers | defence | midfield | attack');
        this.write('info', 'clear <day> | copy <a> <b> | preset <name> | focus <name>');
        this.write('info', 'drills [filter] | presets | week | undo | reset');
        return;

      case 'week':
        this.week.forEach(d => this.write('info',
          `${d.dayName}  ${this.padStart(this.plan.dayLoad(d), 3)}  ` +
          d.sessions.map(s => this.template(s).name).join(', ')));
        return;

      case 'drills': {
        const found = this.plan.searchTemplates(parts.slice(1).join(' '));
        if (!found.length) { this.write('err', 'no drills match that filter'); return; }
        found.forEach(t => this.write('info',
          `${this.pad(t.id, 16)} ${this.pad(t.category, 9)} ${this.padStart(t.defaultIntensity, 3)}  ${t.name}`));
        return;
      }

      case 'presets':
        this.plan.presets.forEach(p => this.write('info', `${this.pad(p.id, 12)} ${p.tagline}`));
        return;

      case 'undo':
        if (!this.plan.canUndo) { this.write('err', 'nothing to undo'); return; }
        this.plan.undo();
        this.write('ok', 'reverted last change');
        return;

      case 'reset':
        this.plan.resetAll();
        this.write('ok', 'plan reset to the shipped default');
        return;

      case 'preset': {
        const preset = this.plan.presets.find(p => p.id === (parts[1] || '').toLowerCase());
        if (!preset) { this.write('err', `unknown preset '${parts[1] || ''}' — try \`presets\``); return; }
        this.plan.applyPreset(preset.id);
        this.write('ok', `applied preset ${preset.name}`);
        return;
      }

      case 'focus': {
        const focus = this.plan.focusOptions.find(f => f.toLowerCase() === (parts[1] || '').toLowerCase());
        if (!focus) { this.write('err', `focus must be one of ${this.plan.focusOptions.join(', ')}`); return; }
        this.plan.setGeneralFocus(focus);
        this.write('ok', `team focus → ${focus}`);
        return;
      }

      case 'clear': {
        const day = this.resolveDay(parts[1]);
        if (day < 0) { this.write('err', `unknown day '${parts[1] || ''}'`); return; }
        this.plan.clearDay(day);
        this.write('ok', `cleared ${DAY_NAMES[day].toLowerCase()}`);
        return;
      }

      case 'copy': {
        const from = this.resolveDay(parts[1]);
        const to = this.resolveDay(parts[2]);
        if (from < 0 || to < 0) { this.write('err', 'usage: copy <fromDay> <toDay>'); return; }
        this.plan.copyDay(from, to);
        this.write('ok', `copied ${DAY_NAMES[from].toLowerCase()} → ${DAY_NAMES[to].toLowerCase()}`);
        return;
      }

      case 'set': {
        const day = this.resolveDay(parts[1]);
        const slot = Number(parts[2]) - 1;
        const drill = this.resolveDrill(parts.slice(3).join(' '));
        if (day < 0) { this.write('err', `unknown day '${parts[1] || ''}'`); return; }
        if (!(slot >= 0 && slot < MAX_SESSIONS_PER_DAY)) { this.write('err', 'slot must be 1..3'); return; }
        if (!drill) { this.write('err', `unknown drill '${parts.slice(3).join(' ')}' — try \`drills\``); return; }
        this.plan.setTemplate(day, slot, drill.id);
        this.write('ok', `${DAY_NAMES[day].toLowerCase()} slot ${slot + 1} → ${drill.name}`);
        return;
      }

      case 'int': {
        const day = this.resolveDay(parts[1]);
        const slot = Number(parts[2]) - 1;
        const value = Number(parts[3]);
        if (day < 0 || !(slot >= 0) || isNaN(value)) { this.write('err', 'usage: int <day> <slot> <0-100>'); return; }
        if (!this.week[day].sessions[slot]) { this.write('err', 'that slot is empty'); return; }
        this.plan.setIntensity(day, slot, value);
        this.write('ok', `intensity ${DAY_NAMES[day].toLowerCase()}/${slot + 1} = ${this.week[day].sessions[slot].intensity}`);
        return;
      }

      case 'unit': {
        const day = this.resolveDay(parts[1]);
        const slot = Number(parts[2]) - 1;
        const unit = TRAINING_UNITS.find(u => u.toLowerCase() === (parts[3] || '').toLowerCase());
        if (day < 0 || !(slot >= 0) || !unit) {
          this.write('err', `usage: unit <day> <slot> <${TRAINING_UNITS.join('|').toLowerCase()}>`); return;
        }
        if (!this.week[day].sessions[slot]) { this.write('err', 'that slot is empty'); return; }
        this.plan.setUnit(day, slot, unit);
        this.write('ok', `${DAY_NAMES[day].toLowerCase()}/${slot + 1} unit = ${unit}`);
        return;
      }

      default:
        this.write('err', `unknown command '${verb}' — type \`help\``);
    }
  }

  private resolveDay(token: string | undefined): number {
    if (!token) return -1;
    const upper = token.toUpperCase();
    const byName = DAY_NAMES.indexOf(upper.slice(0, 3));
    if (byName >= 0) return byName;
    const numeric = Number(token) - 1;
    return numeric >= 0 && numeric < 7 ? numeric : -1;
  }

  private resolveDrill(token: string): SessionTemplate | undefined {
    if (!token) return undefined;
    const needle = token.toLowerCase();
    return this.plan.templates.find(t => t.id === needle)
      || this.plan.templates.find(t => t.name.toLowerCase() === needle)
      || this.plan.templates.find(t => t.name.toLowerCase().startsWith(needle));
  }

  private write(kind: LogLine['kind'], text: string): void {
    this.log.push({ kind, text });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
  }

  // -------------------------------------------------------- shell history

  onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.historyCursor + 1 < this.history.length) this.historyCursor++;
      this.command = this.history[this.historyCursor] || '';
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.historyCursor > 0) this.historyCursor--;
      else { this.historyCursor = -1; this.command = ''; return; }
      this.command = this.history[this.historyCursor] || '';
    }
  }

  // ----------------------------------------------------------- individual

  get selectedPlayer(): SquadPlayer | null {
    return this.plan.players.find(p => p.id === this.selectedPlayerId) || null;
  }

  areaOf(playerId: number): DevelopmentArea | null { return this.plan.planFor(playerId).area; }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeMenu(); }
}
