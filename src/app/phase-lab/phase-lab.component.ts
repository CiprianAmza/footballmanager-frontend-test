import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { KitColors, MatchPhaseData, PitchClip } from '../models/live-match.model';
import { buildTeamSlots, FORMATION_ANCHORS, spreadOffsets } from '../live-match/ambient-synthesizer';
import { MatchPitchComponent } from '../live-match/match-pitch.component';
import { phaseToClip } from '../live-match/phase-clip';
import {
  PhaseCatalog, PhaseLabService, PhaseMove, PhasePoint, PhasePreview, PhaseTemplate,
  PhaseTemplateDraft, ScenarioStat
} from '../services/phase-lab.service';

const EDITOR_ROLES = ['GK', 'DL', 'DC', 'DC', 'DR', 'ML', 'MC', 'MC', 'MR', 'ST', 'ST'];
const EDITOR_PLAYERS = EDITOR_ROLES.map((role, slot) => {
  const peers = EDITOR_ROLES.filter(candidate => candidate === role);
  const ordinal = EDITOR_ROLES.slice(0, slot).filter(candidate => candidate === role).length;
  const anchor = FORMATION_ANCHORS[role];
  return { slot, role, label: `${role} ${ordinal + 1}`, x: anchor.x,
    y: anchor.y + spreadOffsets(peers.length, role)[ordinal] };
});

const HOME_KIT: KitColors = {
  outfieldPrimary: '#3498db', outfieldBorder: '#2980b9',
  gkPrimary: '#fde047', gkBorder: '#ca8a04'
};
const AWAY_KIT: KitColors = {
  outfieldPrimary: '#e74c3c', outfieldBorder: '#c0392b',
  gkPrimary: '#22d3ee', gkBorder: '#0e7490'
};

/**
 * Phase Lab: browse the backend's scenario library (strategy → scenarios),
 * generate phases, watch them on the pitch and rate them 1-5. The ratings
 * train the backend taste agent (UCB bandit + online linear model), which
 * decides which scenarios stay in live matches (KEPT) and which are retired
 * (DROPPED).
 */
@Component({
  selector: 'app-phase-lab',
  templateUrl: './phase-lab.component.html',
  styleUrls: ['./phase-lab.component.css']
})
export class PhaseLabComponent implements OnInit, OnDestroy {

  @ViewChild(MatchPitchComponent) pitch?: MatchPitchComponent;
  @ViewChild('editorPitch') editorPitch?: ElementRef<SVGSVGElement>;

  catalog: PhaseCatalog | null = null;
  preview: PhasePreview | null = null;
  clip: PitchClip | null = null;
  loading = false;
  error: string | null = null;
  /** Last submitted rating's refreshed scenario stats. */
  lastVerdict: ScenarioStat | null = null;

  homeKit = HOME_KIT;
  awayKit = AWAY_KIT;
  mode: 'library' | 'editor' = 'library';
  readonly editorPlayers = EDITOR_PLAYERS;
  templates: PhaseTemplate[] = [];
  editorName = '';
  editorSlots: number[] = [];
  editorPoints: PhasePoint[] = [];
  editorMoves: PhaseMove[] = [];
  editorNextSlot = 6;
  editorNextMove: PhaseMove = 'PASS';
  editorOutcome = 'goal';
  editorSeed = 1;
  editorBusy = false;
  editorMessage = '';
  private draggingPoint = -1;
  private dragStartedAt: { x: number; y: number } | null = null;
  private dragMoved = false;

  // Manual generation controls.
  manualStrategy = 'HIGH_PRESS';
  manualScenario = 'PRESS_TRAP';
  manualOutcome = 'goal';
  manualSeed = 1;

  private rafId = 0;
  private lastTs = 0;
  private replayTimer: any = null;

  constructor(private lab: PhaseLabService, private zone: NgZone) {}

  ngOnInit(): void {
    this.refreshCatalog();
    this.refreshTemplates();
    this.agentNext();
    this.zone.runOutsideAngular(() => {
      const loop = (ts: number) => {
        const dt = this.lastTs ? Math.min(100, ts - this.lastTs) : 16;
        this.lastTs = ts;
        this.pitch?.advance(dt);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    });
  }

  setMode(mode: 'library' | 'editor'): void {
    this.mode = mode;
    if (mode === 'library' && this.preview?.strategy === 'AUTHORED') this.agentNext();
  }

  refreshTemplates(): void {
    this.lab.templates().subscribe({
      next: templates => this.templates = templates,
      error: () => this.editorMessage = 'Nu pot încărca fazele salvate.'
    });
  }

  selectEditorPlayer(slot: number): void {
    if (this.editorSlots.length >= 20) {
      this.editorMessage = 'O fază poate avea cel mult 20 de atingeri.';
      return;
    }
    if (this.editorSlots.length) {
      const samePlayer = this.editorSlots[this.editorSlots.length - 1] === slot;
      if (this.editorNextMove === 'PASS' && samePlayer) {
        this.editorMessage = 'Pentru o pasă alege alt jucător. Pentru a continua cu mingea, alege Dribble sau Run with ball.';
        return;
      }
      if (this.editorNextMove !== 'PASS' && !samePlayer) {
        this.editorMessage = 'La dribling sau alergare mingea rămâne la același jucător. Alege Pass pentru a schimba jucătorul.';
        return;
      }
    }
    const player = this.editorPlayers[slot];
    const previous = this.editorSlots.lastIndexOf(slot);
    const last = this.editorPoints[this.editorPoints.length - 1];
    const point = this.editorNextMove !== 'PASS' && last ? {
      x: last.x <= 84 ? last.x + (this.editorNextMove === 'DRIBBLE' ? 6 : 10) : last.x - 6,
      y: last.y
    } : previous < 0 ? { x: player.x, y: player.y } : {
      x: Math.min(94, this.editorPoints[previous].x + 4),
      y: Math.min(95, this.editorPoints[previous].y + 3)
    };
    if (this.editorSlots.length) this.editorMoves = [...this.editorMoves, this.editorNextMove];
    this.editorSlots = [...this.editorSlots, slot];
    this.editorPoints = [...this.editorPoints, point];
    this.editorMessage = '';
  }

  addEditorTouch(): void {
    const slot = this.editorNextMove === 'PASS' || !this.editorSlots.length
      ? Number(this.editorNextSlot) : this.editorSlots[this.editorSlots.length - 1];
    this.selectEditorPlayer(slot);
  }

  undoEditorStep(): void {
    this.editorSlots = this.editorSlots.slice(0, -1);
    this.editorPoints = this.editorPoints.slice(0, -1);
    this.editorMoves = this.editorMoves.slice(0, -1);
    this.preview = null;
    this.clip = null;
  }

  clearEditor(): void {
    this.editorSlots = [];
    this.editorPoints = [];
    this.editorMoves = [];
    this.editorNextMove = 'PASS';
    this.editorName = '';
    this.preview = null;
    this.clip = null;
    this.editorMessage = '';
  }

  editorStep(slot: number): number {
    return this.editorSlots.indexOf(slot) + 1;
  }

  editorReturnSlots(): number[] {
    return this.editorNextMove === 'PASS'
      ? [...new Set(this.editorSlots)].filter(slot => slot !== this.editorSlots[this.editorSlots.length - 1])
      : [];
  }

  editorMoveLabel(move: PhaseMove): string {
    return move === 'DRIBBLE' ? 'Dribble' : move === 'SPRINT_DRIBBLE' ? 'Run with ball' : 'Pass';
  }

  editorPassCount(): number { return this.editorMoves.filter(move => move === 'PASS').length; }

  editorX(point: PhasePoint): number { return 8 + point.x * 1.04; }
  editorY(point: PhasePoint): number { return 5 + point.y * 0.7; }

  startEditorDrag(event: PointerEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.draggingPoint = index;
    this.dragStartedAt = { x: event.clientX, y: event.clientY };
    this.dragMoved = false;
    this.editorPitch?.nativeElement.setPointerCapture(event.pointerId);
  }

  moveEditorPoint(event: PointerEvent): void {
    if (this.draggingPoint < 0 || !this.editorPitch) return;
    if (this.dragStartedAt && Math.hypot(event.clientX - this.dragStartedAt.x,
        event.clientY - this.dragStartedAt.y) > 3) this.dragMoved = true;
    if (!this.dragMoved) return;
    const svg = this.editorPitch.nativeElement;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const cursor = svg.createSVGPoint();
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    const pos = cursor.matrixTransform(matrix.inverse());
    const x = Math.max(3, Math.min(94, (pos.x - 8) / 1.04));
    const y = Math.max(5, Math.min(95, (pos.y - 5) / 0.7));
    this.editorPoints = this.editorPoints.map((point, index) =>
      index === this.draggingPoint ? { x: Math.round(x), y: Math.round(y) } : point);
  }

  endEditorDrag(addTouch = true): void {
    const slot = this.draggingPoint < 0 ? null : this.editorSlots[this.draggingPoint];
    const wasClick = !this.dragMoved;
    this.draggingPoint = -1;
    this.dragStartedAt = null;
    this.dragMoved = false;
    if (addTouch && wasClick && slot !== null) this.selectEditorPlayer(slot);
  }

  private editorDraft(): PhaseTemplateDraft {
    return { name: this.editorName.trim(), slots: [...this.editorSlots],
      points: this.editorPoints.map(point => ({ ...point })), moves: [...this.editorMoves] };
  }

  previewEditor(nextVariant = false): void {
    if (this.editorSlots.length < 2 || !this.editorName.trim()) {
      this.editorMessage = 'Alege cel puțin doi jucători și dă un nume fazei.';
      return;
    }
    if (nextVariant) this.editorSeed = Math.floor(Math.random() * 1_000_000);
    this.editorBusy = true;
    this.editorMessage = '';
    this.lab.previewDraft(this.editorDraft(), this.editorOutcome, this.editorSeed).subscribe({
      next: preview => { this.editorBusy = false; this.show(preview); },
      error: error => {
        this.editorBusy = false;
        this.editorMessage = typeof error?.error === 'string' ? error.error : 'Faza nu este validă.';
      }
    });
  }

  saveEditor(): void {
    if (this.editorSlots.length < 2 || !this.editorName.trim()) {
      this.editorMessage = 'Alege cel puțin doi jucători și dă un nume fazei.';
      return;
    }
    this.editorBusy = true;
    this.lab.saveTemplate(this.editorDraft()).subscribe({
      next: saved => {
        this.editorBusy = false;
        this.editorMessage = `Faza „${saved.name}” a fost salvată.`;
        this.refreshTemplates();
      },
      error: error => {
        this.editorBusy = false;
        this.editorMessage = typeof error?.error === 'string' ? error.error : 'Nu am putut salva faza.';
      }
    });
  }

  loadEditor(template: PhaseTemplate): void {
    this.editorName = template.name;
    this.editorSlots = [...template.slots];
    this.editorPoints = template.points.map(point => ({ ...point }));
    this.editorMoves = template.moves?.length === template.slots.length - 1
      ? [...template.moves] : Array(template.slots.length - 1).fill('PASS');
    this.editorMessage = `Faza „${template.name}” este încărcată. Salvează pentru a crea o variantă nouă.`;
    this.previewEditor();
  }

  deleteEditor(template: PhaseTemplate): void {
    this.lab.deleteTemplate(template.id).subscribe({
      next: () => { this.editorMessage = `Faza „${template.name}” a fost ștearsă.`; this.refreshTemplates(); },
      error: () => this.editorMessage = 'Nu am putut șterge faza.'
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    if (this.replayTimer) clearTimeout(this.replayTimer);
  }

  refreshCatalog(): void {
    this.lab.catalog().subscribe({
      next: catalog => this.catalog = catalog,
      error: () => this.error = 'Nu pot încărca catalogul — backend pornit?'
    });
  }

  /** The taste agent proposes the phase it needs judged most. */
  agentNext(): void {
    this.loading = true;
    this.lab.next().subscribe({
      next: preview => this.show(preview),
      error: () => { this.loading = false; this.error = 'Generarea a eșuat.'; }
    });
  }

  generateManual(): void {
    this.loading = true;
    this.lab.generate(this.manualStrategy, this.manualScenario,
        this.manualOutcome, this.manualSeed).subscribe({
      next: preview => this.show(preview),
      error: () => { this.loading = false; this.error = 'Generarea a eșuat.'; }
    });
  }

  /** Another random variant of the same scenario/outcome. */
  regenerate(): void {
    if (!this.preview) { this.agentNext(); return; }
    this.manualStrategy = this.preview.strategy;
    this.manualScenario = this.preview.scenario;
    this.manualOutcome = this.preview.outcome;
    this.manualSeed = Math.floor(Math.random() * 1_000_000);
    this.generateManual();
  }

  rate(stars: number): void {
    if (!this.preview) return;
    this.lab.rate(this.preview, stars).subscribe({
      next: verdict => {
        this.lastVerdict = verdict;
        this.refreshCatalog();
        this.agentNext();
      },
      error: () => this.error = 'Nota nu a putut fi salvată.'
    });
  }

  scenariosOf(strategy: string): ScenarioStat[] {
    return this.catalog?.strategies.find(s => s.name === strategy)?.scenarios ?? [];
  }

  pickManual(strategy: string, scenario: string): void {
    this.manualStrategy = strategy;
    this.manualScenario = scenario;
    this.manualSeed = Math.floor(Math.random() * 1_000_000);
    this.generateManual();
  }

  onClipFinished(): void {
    // Loop the phase so it can be studied: replay after a short beat.
    if (this.replayTimer) clearTimeout(this.replayTimer);
    this.replayTimer = setTimeout(() => this.pitch?.replay(), 900);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'KEPT': return 'păstrat';
      case 'DROPPED': return 'eliminat';
      case 'TRIAL': return 'în probe';
      default: return 'explorare';
    }
  }

  private show(preview: PhasePreview): void {
    this.loading = false;
    this.error = null;
    this.preview = preview;
    if (preview.strategy !== 'AUTHORED') {
      this.manualStrategy = preview.strategy;
      this.manualScenario = preview.scenario;
      this.manualOutcome = preview.outcome;
      this.manualSeed = preview.seed;
    }
    this.clip = preview.phase ? this.toClip(preview.phase, preview) : null;
    if (this.replayTimer) clearTimeout(this.replayTimer);
  }

  private toClip(phase: MatchPhaseData, preview: PhasePreview): PitchClip {
    const names: { [playerId: number]: string } = {};
    for (const action of phase.actions || []) {
      if (action.playerId) names[action.playerId] = action.playerName || '';
      if (action.targetPlayerId) names[action.targetPlayerId] = action.targetPlayerName || '';
    }
    const shirtNumbers: { [playerId: number]: number } = {};
    for (const player of preview.players) shirtNumbers[player.id] = player.shirtNumber;
    const home = preview.players.filter(p => p.teamId === preview.homeTeamId).map(p => ({
      playerId: p.id, name: p.name, position: p.role, stamina: 100,
      minutesPlayed: 0, onPitch: true, yellowCardMinute: 0, redCardMinute: 0
    }));
    const away = preview.players.filter(p => p.teamId === preview.awayTeamId).map(p => ({
      playerId: p.id, name: p.name, position: p.role, stamina: 100,
      minutesPlayed: 0, onPitch: true, yellowCardMinute: 0, redCardMinute: 0
    }));
    const slots = [
      ...buildTeamSlots(home, preview.homeTeamId, true, shirtNumbers),
      ...buildTeamSlots(away, preview.awayTeamId, false, shirtNumbers)
    ];
    return phaseToClip(phase, slots, names);
  }
}
