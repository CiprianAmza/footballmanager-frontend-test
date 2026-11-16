import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EMPTY, Subscription, firstValueFrom, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ArenaCompetitionsPanelComponent } from './arena-competitions-panel.component';
import { ArenaProgressComponent } from './arena-progress.component';
import { ArenaResultsComponent } from './arena-results.component';
import { ArenaSchedulePanelComponent } from './arena-schedule-panel.component';
import { captureElement } from './dom-capture';
import { TacticArenaEditorComponent } from './tactic-arena-editor.component';
import {
  ArenaImageKind, ArenaRun, ArenaSetup, ArenaTestDetail, IMAGE_KIND_LABELS, runRoleLabel,
  ArenaResults, TacticArenaService, formationLabel, isActive, isDiamondLeague, signed
} from './tactic-arena.service';

interface ShotState {
  status: 'loading' | 'queued' | 'capturing' | 'ready' | 'failed';
  url?: string;
  error?: string;
}

interface CaptureJob { run: ArenaRun; kind: ArenaImageKind; }

const IMAGE_KINDS: ArenaImageKind[] = ['tactic', 'schedule', 'competitions'];

/**
 * /tactic-arena/:id — results block, the chosen club's run apart, then for every run the
 * tactic, the full schedule and the competition overview as screenshots. A missing
 * screenshot is drawn off-screen with the game's own components, captured once, uploaded
 * and shown; when capture fails the live panel is shown instead.
 */
@Component({
  selector: 'app-tactic-arena-test',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ArenaResultsComponent, ArenaProgressComponent,
    ArenaSchedulePanelComponent, ArenaCompetitionsPanelComponent, TacticArenaEditorComponent
  ],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <div class="ta-page">
      <p class="ta-error" *ngIf="error">{{ error }}</p>
      <ng-container *ngIf="test">
        <div class="ta-head">
          <div>
            <span class="ta-eyebrow">Tactic Arena · test #{{ test.id }}</span>
            <h1>{{ test.name }}</h1>
            <p class="ta-sub">
              {{ formation(test.formation) }} ·
              <ng-container *ngIf="test.teamName; else generalTest">{{ test.teamName }} · {{ test.leagueName || '—' }}</ng-container>
              <ng-template #generalTest>general test (reference clubs only)</ng-template>
              · by {{ test.owner }}
              · season {{ test.season }}, days {{ test.startDay }}–{{ test.endDay }} · engine {{ test.engine }}
              · {{ test.createdAt | date:'dd.MM.yyyy HH:mm' }}
            </p>
          </div>
          <div class="ta-actions"><a class="ta-btn" routerLink="/tactic-arena">Leaderboard</a></div>
        </div>

        <app-arena-progress *ngIf="test.status !== 'DONE'" [test]="test" [cancelling]="cancelling"
                            (cancel)="cancelTest()"></app-arena-progress>

        <section class="ta-card">
          <app-arena-results [results]="test.results"
                             [title]="test.category === 'DIAMOND' ? 'Results · Diamond League clubs' : 'Results · reference clubs'"
                             emptyText="Available when all reference runs have finished."></app-arena-results>
        </section>

        <section class="ta-card">
          <h2>Tested clubs</h2>
          <p class="ta-small">Click a club to see its season: results, tactic, schedule and competition overview.</p>
          <div class="ta-table-wrap ta-runs-table">
            <table class="ta-table">
              <thead>
                <tr>
                  <th class="ta-left" aria-hidden="true"></th>
                  <th class="ta-left">Club</th>
                  <th class="ta-left">Role</th>
                  <th>Reputation</th>
                  <th title="Media prediction: predicted place / clubs in the league">Media prediction</th>
                  <th title="Final league place / clubs in the league">Finished</th>
                  <th>PLD</th><th>PTS</th><th>GD</th><th>GF</th><th>GA</th><th>xGF</th><th>xGA</th><th>xGD</th>
                  <th title="Diamond League points / maximum · final place / clubs">Diamond League</th>
                  <th class="ta-left">Cups</th>
                </tr>
              </thead>
              <tbody>
                <ng-container *ngFor="let run of test.runs; trackBy: trackRun">
                  <tr class="ta-link-row ta-run-head" [class.ta-open]="expanded === run.index"
                      tabindex="0" role="button" [attr.aria-expanded]="expanded === run.index"
                      [attr.aria-controls]="'ta-run-' + run.index"
                      (click)="toggle(run)" (keydown.enter)="toggle(run)" (keydown.space)="$event.preventDefault(); toggle(run)">
                    <td class="ta-left ta-caret" aria-hidden="true">{{ expanded === run.index ? '▾' : '▸' }}</td>
                    <td class="ta-left ta-strong">{{ run.teamName || 'Chosen when the world is ready' }}</td>
                    <td class="ta-left">{{ runLabel(run) }}</td>
                    <td>{{ run.teamName ? run.teamReputation : '—' }}</td>
                    <td>{{ prediction(run) }}</td>
                    <td [class.ta-pos]="finishDelta(run) > 0" [class.ta-neg]="finishDelta(run) < 0"
                        [attr.title]="finishTitle(run)">{{ finished(run) }}</td>
                    <ng-container *ngIf="run.status === 'DONE' && run.stats?.overall as s; else runPending">
                      <td>{{ s.pld }}</td>
                      <td class="ta-strong">{{ s.pts }} / {{ s.ptsMax }}</td>
                      <td [class.ta-pos]="s.gd > 0" [class.ta-neg]="s.gd < 0">{{ signed(s.gd) }}</td>
                      <td>{{ s.gf }}</td>
                      <td>{{ s.ga }}</td>
                      <td>{{ s.xgf ?? '—' }}</td>
                      <td>{{ s.xga ?? '—' }}</td>
                      <td [class.ta-pos]="(s.xgd ?? 0) > 0" [class.ta-neg]="(s.xgd ?? 0) < 0">{{ signed(s.xgd) }}</td>
                    </ng-container>
                    <ng-template #runPending>
                      <td colspan="8">
                        <span class="ta-status" [ngClass]="run.status">{{ run.status }}</span>
                        <span class="ta-small" *ngIf="run.status !== 'DONE'"> {{ run.progress | number:'1.0-0' }}%</span>
                      </td>
                    </ng-template>
                    <td>{{ diamondText(run) }}</td>
                    <td class="ta-left ta-small ta-cups">{{ cups(run) }}</td>
                  </tr>
                  <tr class="ta-run-detail" *ngIf="expanded === run.index" [attr.id]="'ta-run-' + run.index">
                    <td colspan="16" class="ta-left">
                      <h3>{{ runLabel(run) }} · {{ run.teamName || 'chosen when the world is ready' }}
                        <span class="ta-small" *ngIf="run.teamName">· reputation {{ run.teamReputation }} · media prediction {{ prediction(run) }}</span></h3>
                      <p class="ta-error" *ngIf="run.message">{{ run.message }}</p>
                      <app-arena-results *ngIf="run.stats" [results]="run.stats" title="League"></app-arena-results>
                      <app-arena-results *ngIf="diamondResults(run) as diamond" [results]="diamond"
                                         [title]="'Diamond League' + (run.diamond?.position != null ? ' · finished ' + run.diamond?.position + ' / ' + (run.diamond?.of ?? '—') : '')"></app-arena-results>
                      <p class="ta-muted" *ngIf="!run.stats">Available when this run has finished ({{ run.progress | number:'1.0-0' }}%).</p>
                      <div class="ta-shots" *ngIf="run.status === 'DONE' && run.result">
                        <div class="ta-shot" *ngFor="let kind of kinds">
                          <figure *ngIf="shot(run, kind) as state">
                            <figcaption>{{ kindLabel(kind) }}
                              <span class="ta-small" *ngIf="state.status === 'loading'"> · loading…</span>
                              <span class="ta-small" *ngIf="state.status === 'queued' || state.status === 'capturing'"> · creating screenshot…</span>
                              <span class="ta-small ta-error" *ngIf="state.status === 'failed'"> · screenshot failed ({{ state.error }}), live panel below</span>
                            </figcaption>
                            <img *ngIf="state.url" [src]="state.url" [alt]="kindLabel(kind) + ' · ' + run.teamName" (click)="lightbox = state.url!">
                            <div class="ta-live-panel" *ngIf="state.status === 'failed'">
                              <ng-container *ngTemplateOutlet="panel; context: { run: run, kind: kind }"></ng-container>
                            </div>
                          </figure>
                        </div>
                      </div>
                    </td>
                  </tr>
                </ng-container>
              </tbody>
            </table>
          </div>
        </section>
      </ng-container>
      <p class="ta-muted" *ngIf="!test && !error">Loading…</p>
    </div>

    <!-- Off-screen stage: the panel being captured. -->
    <div class="ta-stage" #stage *ngIf="job" aria-hidden="true">
      <ng-container *ngTemplateOutlet="panel; context: { run: job.run, kind: job.kind }"></ng-container>
    </div>

    <ng-template #panel let-run="run" let-kind="kind">
      <app-tactic-arena-editor *ngIf="kind === 'tactic'" [setup]="setupFor(run)" [arenaReadOnly]="true"></app-tactic-arena-editor>
      <app-arena-schedule-panel *ngIf="kind === 'schedule'" [result]="run.result"></app-arena-schedule-panel>
      <app-arena-competitions-panel *ngIf="kind === 'competitions'" [result]="run.result"></app-arena-competitions-panel>
    </ng-template>

    <div class="ta-lightbox" *ngIf="lightbox" (click)="lightbox = ''" role="dialog" aria-label="Screenshot">
      <img [src]="lightbox" alt="Screenshot, full size">
    </div>
  `
})
export class TacticArenaTestComponent implements OnInit, OnDestroy {
  @ViewChild('stage') stage?: ElementRef<HTMLElement>;

  test: ArenaTestDetail | null = null;
  error = '';
  cancelling = false;
  lightbox = '';
  job: CaptureJob | null = null;
  readonly kinds = IMAGE_KINDS;
  readonly formation = formationLabel;
  readonly signed = signed;
  /** Index of the run whose details are open (kept in the URL as ?run=), or null. */
  expanded: number | null = null;

  private shots = new Map<string, ShotState>();
  private setups = new Map<number, ArenaSetup>();
  private queue: CaptureJob[] = [];
  private working = false;
  private destroyed = false;
  private poll?: Subscription;
  private routeSub?: Subscription;
  private querySub?: Subscription;

  constructor(private api: TacticArenaService, private route: ActivatedRoute, private router: Router,
              private changes: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe(params => {
      const run = params.get('run');
      this.expanded = run !== null && run !== '' && !isNaN(Number(run)) ? Number(run) : null;
    });
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      this.reset();
      if (!id) { this.error = 'Unknown test.'; return; }
      this.poll = timer(0, 3000).pipe(switchMap(() => this.api.test(id).pipe(
        catchError(error => {
          this.error = error?.status === 404 ? 'This test does not exist.' : (error?.error?.error || 'The test could not be loaded.');
          return EMPTY;
        })
      ))).subscribe(test => {
        this.test = test;
        this.error = '';
        this.syncShots(test);
        if (!isActive(test.status)) this.poll?.unsubscribe();
        this.updateCaptureMarker();
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.reset();
    this.routeSub?.unsubscribe();
    this.querySub?.unsubscribe();
  }

  runLabel(run: ArenaRun): string { return runRoleLabel(run); }
  kindLabel(kind: ArenaImageKind): string { return IMAGE_KIND_LABELS[kind]; }
  trackRun(_: number, run: ArenaRun): number { return run.id; }

  /** Opens / closes a run's details; the open run is kept in the URL so a link leads to it. */
  toggle(run: ArenaRun): void {
    const next = this.expanded === run.index ? null : run.index;
    this.expanded = next;
    void this.router.navigate([], {
      relativeTo: this.route, queryParams: { run: next }, queryParamsHandling: 'merge', replaceUrl: true
    });
  }

  /** Media prediction "6 / 12", or "—". */
  prediction(run: ArenaRun): string {
    if (run.predictedPosition == null) return '—';
    const size = this.leagueSize(run);
    return size ? `${run.predictedPosition} / ${size}` : `${run.predictedPosition}`;
  }

  /** Final league place "3 / 12", or "—" until the run is done. */
  finished(run: ArenaRun): string {
    const place = this.finalPlace(run);
    if (place == null) return '—';
    const size = this.leagueSize(run);
    return size ? `${place} / ${size}` : `${place}`;
  }

  /** > 0: finished above the prediction, < 0: below, 0: as predicted or unknown. */
  finishDelta(run: ArenaRun): number {
    const place = this.finalPlace(run);
    if (place == null || run.predictedPosition == null) return 0;
    return run.predictedPosition - place;
  }

  finishTitle(run: ArenaRun): string | null {
    const delta = this.finishDelta(run);
    if (!delta) return null;
    return delta > 0 ? `${delta} place(s) above the media prediction` : `${-delta} place(s) below the media prediction`;
  }

  /** Cups in one short line: "Cup: Semi-final · Champions Cup 🏆". */
  cups(run: ArenaRun): string {
    const cups = (run.result?.competitions || []).filter(comp => !this.isLeague(comp));
    if (!cups.length) return run.result ? '—' : '';
    return cups.map(comp => comp.trophy ? `${comp.name} 🏆` : `${comp.name}: ${comp.stageReached || comp.statusLabel || '—'}`)
      .join(' · ');
  }

  private leagueSize(run: ArenaRun): number | null {
    return run.leagueSize ?? (run.result?.leagueTable?.length || null);
  }

  private finalPlace(run: ArenaRun): number | null {
    const league = (run.result?.competitions || []).find(comp => this.isLeague(comp) && comp.position != null);
    return league?.position ?? null;
  }

  /** The club's own league: the Diamond League (type 7) is a league in format but not this one. */
  private isLeague(comp: { kind?: string; typeId?: number; name?: string }): boolean {
    if (isDiamondLeague(comp)) return false;
    return comp.kind === 'LEAGUE' || comp.typeId === 1 || comp.typeId === 3;
  }

  /** "45 / 84 · 3 / 8", or "—" when the club does not play in the Diamond League. */
  diamondText(run: ArenaRun): string {
    const diamond = run.diamond;
    if (!diamond?.overall) return '—';
    const points = `${diamond.overall.pts} / ${diamond.overall.ptsMax}`;
    return diamond.position != null ? `${points} · ${diamond.position} / ${diamond.of ?? '—'}` : points;
  }

  private diamondCache = new WeakMap<object, ArenaResults>();

  /** The run's Diamond League figures in the results-block shape (stable per response). */
  diamondResults(run: ArenaRun): ArenaResults | null {
    const diamond = run.diamond;
    if (!diamond?.overall) return null;
    let results = this.diamondCache.get(diamond);
    if (!results) {
      results = { basedOn: diamond.basedOn ?? 1, overall: diamond.overall, home: diamond.home, away: diamond.away };
      this.diamondCache.set(diamond, results);
    }
    return results;
  }

  shot(run: ArenaRun, kind: ArenaImageKind): ShotState | undefined {
    return this.shots.get(this.key(run, kind));
  }

  /** Stable per run: a new object on every change detection would reload the editor. */
  setupFor(run: ArenaRun): ArenaSetup | null {
    const result = run.result;
    if (!result) return null;
    let setup = this.setups.get(run.id);
    if (!setup) {
      setup = {
        team: {
          teamId: result.teamId, name: result.teamName, competitionId: result.leagueId,
          competitionName: result.leagueName, reputation: run.teamReputation,
          color1: result.color1 || undefined, color2: result.color2 || undefined
        },
        players: result.squad || [],
        formationCatalog: [],
        savedTactic: result.tactic,
        teamView: null
      };
      this.setups.set(run.id, setup);
    }
    return setup;
  }

  cancelTest(): void {
    if (!this.test || this.cancelling) return;
    this.cancelling = true;
    this.api.cancel(this.test.id).subscribe({
      next: () => this.cancelling = false,
      error: error => { this.cancelling = false; this.error = error?.error?.error || 'The test could not be cancelled.'; }
    });
  }

  private key(run: ArenaRun, kind: ArenaImageKind): string { return `${run.id}:${kind}`; }

  private syncShots(test: ArenaTestDetail): void {
    for (const run of test.runs || []) {
      if (run.status !== 'DONE' || !run.result) continue;
      for (const kind of IMAGE_KINDS) {
        const key = this.key(run, kind);
        if (this.shots.has(key)) continue;
        if ((run.images || []).includes(kind)) {
          this.shots.set(key, { status: 'loading' });
          this.api.image(test.id, run.id, kind).subscribe({
            next: blob => {
              this.shots.set(key, { status: 'ready', url: URL.createObjectURL(blob) });
              this.updateCaptureMarker();
            },
            error: () => this.enqueue(run, kind)
          });
        } else {
          this.enqueue(run, kind);
        }
      }
    }
  }

  private enqueue(run: ArenaRun, kind: ArenaImageKind): void {
    this.shots.set(this.key(run, kind), { status: 'queued' });
    this.queue.push({ run, kind });
    void this.drain();
  }

  /** One capture at a time, on the off-screen stage. */
  private async drain(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length && !this.destroyed && this.test) {
        const next = this.queue.shift()!;
        const key = this.key(next.run, next.kind);
        this.shots.set(key, { status: 'capturing' });
        this.job = next;
        this.changes.detectChanges();
        try {
          const element = this.stage?.nativeElement;
          if (!element) throw new Error('stage missing');
          await this.waitUntilDrawn(element, next.kind);
          const blob = await captureElement(element);
          const testId = this.test.id;
          await firstValueFrom(this.api.uploadImage(testId, next.run.id, next.kind, blob));
          next.run.images = [...(next.run.images || []).filter(kind => kind !== next.kind), next.kind];
          this.shots.set(key, { status: 'ready', url: URL.createObjectURL(blob) });
        } catch (error: any) {
          console.error('Tactic Arena screenshot failed', error);
          this.shots.set(key, { status: 'failed', error: error?.error?.error || error?.message || 'unknown error' });
        }
        this.job = null;
        this.changes.detectChanges();
      }
    } finally {
      this.working = false;
      this.updateCaptureMarker();
    }
  }

  /**
   * Completion marker for unattended (headless) capture: `<body data-arena-capture>` is
   * `pending` while anything is still to load, draw or upload, then `done` - or `failed`
   * (reasons in the console) when a capture failed for good. Only set once the test itself has
   * finished, so no further run can bring new images.
   */
  private updateCaptureMarker(): void {
    if (this.destroyed || !this.test) return;
    const body = document.body;
    const busy = this.working || this.queue.length > 0
      || [...this.shots.values()].some(state => state.status === 'loading' || state.status === 'queued' || state.status === 'capturing');
    if (busy || isActive(this.test.status)) { body.setAttribute('data-arena-capture', 'pending'); return; }
    const failures = [...this.shots.entries()].filter(([, state]) => state.status === 'failed');
    if (failures.length) {
      for (const [key, state] of failures) console.error(`Tactic Arena capture failed for run:kind ${key}: ${state.error}`);
      body.setAttribute('data-arena-capture', 'failed');
    } else {
      body.setAttribute('data-arena-capture', 'done');
    }
  }

  private async waitUntilDrawn(stage: HTMLElement, kind: ArenaImageKind): Promise<void> {
    const started = Date.now();
    if (kind === 'tactic') {
      // The pitch needs the formation layout from the backend before the XI is visible.
      while (stage.querySelectorAll('.grid-cell.allowed .node').length < 11) {
        // An eleven that does not fill the formation's own cells never reaches 11: capture what is drawn.
        if (Date.now() - started > 6000) break;
        await delay(150);
        this.changes.detectChanges();
      }
    }
    await delay(kind === 'tactic' ? 700 : 250);
    // Two frames so the panel is painted; a background tab gets no frames, so a timer ends the wait.
    await new Promise<void>(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 500);
    });
  }

  private reset(): void {
    this.poll?.unsubscribe();
    document.body.removeAttribute('data-arena-capture');
    this.queue = [];
    this.job = null;
    for (const state of this.shots.values()) if (state.url) URL.revokeObjectURL(state.url);
    this.shots.clear();
    this.setups.clear();
    this.test = null;
    this.error = '';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
