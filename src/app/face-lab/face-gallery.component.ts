import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { urlApp } from '../app.component';
import {
  FaceGenome, REFERENCE_GENOMES, REFERENCE_ORDER, describeGenome, makeRng, randomGenome,
  applyConstraints, PALETTE_FAMILY_IDS, SILHOUETTE_FAMILIES, EYE_TYPES, SIGNATURE_TYPES,
} from './face-genome';
import { freezeGenome } from './face-codegen';

type Tab = 'species' | 'validate' | 'evolve';
type FaceStyle = 'seinen' | 'sports' | 'premium';

interface BatchResponse {
  generation: number;
  genomes: FaceGenome[];
  source?: string;
}

interface LabStatus {
  latestGeneration: number;
  generations: number[];
  voteCount: number;
  pairCount: number;
  dataDir: string;
}

/** One card in the evolution tab. */
interface VoteCard {
  genome: FaceGenome;
  rating: number;
  touched: boolean;
}

/**
 * DEV-ONLY Face Lab gallery (`/dev/face-gallery`).
 *
 *  - "Specii"     : every shipped species across the 12 palette slots — the preview that
 *                   was missing, so visual iteration stops being blind.
 *  - "Parametric" : each reference genome rendered by drawParametric() next to the frozen
 *                   production renderer — the F1 acceptance check.
 *  - "Evoluție"   : the current generation of mixed genomes, each with a 1-100 slider.
 *                   Votes are POSTed to DevFaceLabController and consumed by face-lab/.
 */
@Component({
  selector: 'app-face-gallery',
  templateUrl: './face-gallery.component.html',
  styleUrls: ['./face-gallery.component.css'],
})
export class FaceGalleryComponent implements OnInit {

  readonly REFERENCE_ORDER = REFERENCE_ORDER;
  readonly PALETTE_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  readonly STYLES: FaceStyle[] = ['sports', 'seinen', 'premium'];
  readonly AXES = [
    { key: 'skinTone', label: 'skinTone (corp)' },
    { key: 'hairColor', label: 'hairColor (accent)' },
    { key: 'eyeColor', label: 'eyeColor (glow)' },
  ];

  tab: Tab = 'species';

  // ---- species tab controls ----
  style: FaceStyle = 'sports';
  baseFaceId = 0;
  axis = 'skinTone';
  faceSize = 76;
  /** Flatten the face component's own pitch-green vignette so palettes read honestly. */
  neutralBg = true;

  // ---- evolution tab ----
  generation = 0;
  cards: VoteCard[] = [];
  loading = false;
  saving = false;
  message = '';
  backendUp = false;
  status: LabStatus | null = null;
  localSeed = 20260730;
  batchSize = 24;

  // A/B mode
  abMode = false;
  abLeft = 0;
  abRight = 1;
  abDone = 0;

  constructor(private http: HttpClient) {}

  /** Precomputed so the template never rebuilds genome objects during change detection. */
  validationRows: { species: string; genome: FaceGenome }[] = [];

  ngOnInit(): void {
    this.rebuildValidation();
    this.refreshStatus(true);
  }

  rebuildValidation(): void {
    this.validationRows = REFERENCE_ORDER.map(s => ({ species: s, genome: this.referenceGenomeJittered(s) }));
  }

  // ==========================================================================
  // species / validate tabs
  // ==========================================================================

  /** Palette index for a card, applied to whichever colour axis the user is sweeping. */
  tone(slot: number, axis: string): number { return this.axis === axis ? slot : 0; }

  referenceGenome(species: string): FaceGenome {
    return REFERENCE_GENOMES[species] || REFERENCE_GENOMES['human'];
  }

  /** Reference genome recoloured to the current baseFaceId, so both panes vary together. */
  referenceGenomeJittered(species: string): FaceGenome {
    const g: FaceGenome = JSON.parse(JSON.stringify(this.referenceGenome(species)));
    g.silhouette.jitterSeed = this.baseFaceId % 4;
    return g;
  }

  inkWidthFor(style: FaceStyle): number {
    return style === 'sports' ? 1.7 : style === 'premium' ? 1.2 : 1.5;
  }

  describe(g: FaceGenome): string { return describeGenome(g); }

  // ==========================================================================
  // evolution tab
  // ==========================================================================

  /**
   * @param loadLatest also jump to the newest generation on disk. Only on first load and
   *   on an explicit "reîncarcă" — after submitting votes the user must stay on the
   *   generation they are rating, which is often a local one that is not on disk at all.
   */
  refreshStatus(loadLatest = false): void {
    this.http.get<LabStatus>(`${urlApp}/api/dev/facelab/status`).subscribe({
      next: st => {
        this.backendUp = true;
        this.status = st;
        if (!loadLatest) return;
        if (st.latestGeneration >= 0) this.loadBatch(st.latestGeneration);
        else this.generateLocalBatch();
      },
      error: () => {
        this.backendUp = false;
        this.message = 'Backend-ul Face Lab nu răspunde (facelab.enabled=true?) — generez local.';
        if (loadLatest) this.generateLocalBatch();
      },
    });
  }

  loadBatch(gen?: number): void {
    this.loading = true;
    const q = gen === undefined ? '' : `?generation=${gen}`;
    this.http.get<BatchResponse>(`${urlApp}/api/dev/facelab/batch${q}`).subscribe({
      next: b => {
        this.loading = false;
        this.generation = b.generation;
        // 'reference' = safety clamps only: whatever produced this batch already applied
        // the sampling rules, and re-applying them would silently rewrite the anchors.
        this.cards = (b.genomes || []).map(g => ({ genome: applyConstraints(g, 'reference'), rating: 50, touched: false }));
        this.message = `Generația ${b.generation} — ${this.cards.length} genomi.`;
        this.resetAb();
      },
      error: () => {
        this.loading = false;
        this.message = 'Nu am putut încărca batch-ul; generez local.';
        this.generateLocalBatch();
      },
    });
  }

  /** Seeded local generation — usable before face-lab/ has ever run. Reproducible. */
  generateLocalBatch(): void {
    const rng = makeRng(this.localSeed + this.generation * 7919);
    const out: FaceGenome[] = [];
    // seed the first generation with the shipped species so the model starts from known ground
    if (this.generation === 0) {
      for (const name of REFERENCE_ORDER) {
        const g: FaceGenome = JSON.parse(JSON.stringify(REFERENCE_GENOMES[name]));
        g.id = `g${this.generation}-ref-${name}`;
        g.meta = { op: 'reference', species: name };
        out.push(applyConstraints(g, 'reference'));
      }
    }
    let k = 0;
    while (out.length < this.batchSize) {
      out.push(randomGenome(rng, `g${this.generation}-r${k++}`));
    }
    this.cards = out.map(g => ({ genome: g, rating: 50, touched: false }));
    this.message = `Generație locală ${this.generation} (seed ${this.localSeed}) — ${this.cards.length} genomi.`;
    this.resetAb();
  }

  /** Push the locally-generated batch to the backend so face-lab/ can pick it up. */
  publishLocalBatch(): void {
    if (!this.backendUp) { this.message = 'Backend indisponibil.'; return; }
    this.saving = true;
    const body = { generation: this.generation, genomes: this.cards.map(c => c.genome) };
    this.http.post<any>(`${urlApp}/api/dev/facelab/generation`, body).subscribe({
      next: r => { this.saving = false; this.message = `Generația ${r.generation} salvată pe disc.`; this.refreshStatus(); },
      error: e => { this.saving = false; this.message = 'Salvare eșuată: ' + (e?.message || e?.status); },
    });
  }

  markTouched(card: VoteCard): void { card.touched = true; }

  get votedCount(): number { return this.cards.filter(c => c.touched).length; }

  submitVotes(): void {
    const voted = this.cards.filter(c => c.touched);
    if (!voted.length) { this.message = 'Nicio notă dată.'; return; }
    if (!this.backendUp) { this.message = 'Backend indisponibil — notele nu pot fi persistate.'; return; }
    this.saving = true;
    const body = {
      generation: this.generation,
      votes: voted.map(c => ({ genomeId: c.genome.id, rating: c.rating, genome: c.genome })),
    };
    this.http.post<any>(`${urlApp}/api/dev/facelab/votes`, body).subscribe({
      next: r => {
        this.saving = false;
        this.message = `${r.stored} note salvate (total ${r.totalVotes}).`;
        this.cards.forEach(c => c.touched = false);
        this.refreshStatus();
      },
      error: e => { this.saving = false; this.message = 'Salvare eșuată: ' + (e?.message || e?.status); },
    });
  }

  nextGeneration(): void {
    this.generation++;
    if (this.backendUp && this.status && this.status.generations.indexOf(this.generation) >= 0) {
      this.loadBatch(this.generation);
    } else {
      this.generateLocalBatch();
    }
  }

  prevGeneration(): void {
    if (this.generation === 0) return;
    this.generation--;
    if (this.backendUp && this.status && this.status.generations.indexOf(this.generation) >= 0) {
      this.loadBatch(this.generation);
    } else {
      this.generateLocalBatch();
    }
  }

  // ---- A/B pairwise ----

  private resetAb(): void { this.abLeft = 0; this.abRight = Math.min(1, this.cards.length - 1); this.abDone = 0; }

  nextPair(): void {
    if (this.cards.length < 2) return;
    const rng = makeRng(this.localSeed + this.generation * 131 + this.abDone * 7);
    let a = Math.floor(rng() * this.cards.length);
    let b = Math.floor(rng() * this.cards.length);
    if (a === b) b = (b + 1) % this.cards.length;
    this.abLeft = a; this.abRight = b;
  }

  pickWinner(side: 'left' | 'right'): void {
    if (this.cards.length < 2) return;
    const a = this.cards[this.abLeft].genome, b = this.cards[this.abRight].genome;
    const winner = side === 'left' ? a : b;
    this.abDone++;
    if (this.backendUp) {
      this.http.post(`${urlApp}/api/dev/facelab/pairs`, {
        generation: this.generation, aId: a.id, bId: b.id, winnerId: winner.id, a, b,
      }).subscribe({ next: () => {}, error: () => { this.message = 'Perechea nu a putut fi salvată.'; } });
    }
    this.nextPair();
  }

  // ==========================================================================
  // misc
  // ==========================================================================

  trackByIndex(i: number): number { return i; }

  // ---- F4: distillation ----------------------------------------------------

  /** Index of the card selected for freezing, or -1. */
  distillIndex = -1;
  distillName = '';
  distillNationId: number | null = null;
  distillPreview = '';

  selectForDistill(i: number): void {
    this.distillIndex = i;
    if (!this.distillName) this.distillName = 'newspecies';
    this.distillPreview = '';
  }

  distill(): void {
    if (this.distillIndex < 0 || this.distillIndex >= this.cards.length) {
      this.message = 'Selectează întâi o față (butonul „îngheață").';
      return;
    }
    const g = this.cards[this.distillIndex].genome;
    const frozen = freezeGenome(g, this.distillName || 'newspecies', this.distillNationId);
    this.distillPreview = frozen.full;
    this.message = `Specie „${frozen.speciesId}" distilată — ${frozen.methodName}() + 3 palete × 12.`;
  }

  downloadDistill(): void {
    if (!this.distillPreview) { this.distill(); }
    if (!this.distillPreview) return;
    const name = (this.distillName || 'newspecies').toLowerCase().replace(/[^a-z0-9]/g, '') || 'newspecies';
    const blob = new Blob([this.distillPreview], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `face-lab-${name}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  copyDistill(): void {
    if (!this.distillPreview) this.distill();
    if (this.distillPreview && navigator.clipboard) {
      navigator.clipboard.writeText(this.distillPreview).then(
        () => this.message = 'Artefactul de distilare a fost copiat.',
        () => this.message = 'Copierea a eșuat.');
    }
  }

  copyGenome(g: FaceGenome): void {
    const text = JSON.stringify(g, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => this.message = `Genom ${g.id} copiat în clipboard.`,
        () => this.message = 'Copierea a eșuat.');
    }
  }

  get axisSummary(): string {
    return `${SILHOUETTE_FAMILIES.length} siluete × ${EYE_TYPES.length} tipuri de ochi × ` +
      `${SIGNATURE_TYPES.length} signature × ${PALETTE_FAMILY_IDS.length} familii de palete`;
  }
}
