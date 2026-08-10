import { Component, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { KitColors, MatchPhaseData, PitchClip } from '../models/live-match.model';
import { buildTeamSlots } from '../live-match/ambient-synthesizer';
import { MatchPitchComponent } from '../live-match/match-pitch.component';
import { phaseToClip } from '../live-match/phase-clip';
import {
  PhaseCatalog, PhaseLabService, PhasePreview, ScenarioStat
} from '../services/phase-lab.service';

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

  catalog: PhaseCatalog | null = null;
  preview: PhasePreview | null = null;
  clip: PitchClip | null = null;
  loading = false;
  error: string | null = null;
  /** Last submitted rating's refreshed scenario stats. */
  lastVerdict: ScenarioStat | null = null;

  homeKit = HOME_KIT;
  awayKit = AWAY_KIT;

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
    this.manualStrategy = preview.strategy;
    this.manualScenario = preview.scenario;
    this.manualOutcome = preview.outcome;
    this.manualSeed = preview.seed;
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
