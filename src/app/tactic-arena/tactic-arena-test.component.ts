import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { EMPTY, Subscription, firstValueFrom, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ArenaCompetitionsPanelComponent } from './arena-competitions-panel.component';
import { ArenaProgressComponent } from './arena-progress.component';
import { ArenaResultsComponent } from './arena-results.component';
import { ArenaSchedulePanelComponent } from './arena-schedule-panel.component';
import { captureElement } from './dom-capture';
import { TacticArenaEditorComponent } from './tactic-arena-editor.component';
import {
  ArenaImageKind, ArenaRun, ArenaSetup, ArenaTestDetail, IMAGE_KIND_LABELS, RUN_KIND_LABELS,
  TacticArenaService, formationLabel, isActive
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
              {{ formation(test.formation) }} · {{ test.teamName }} · {{ test.leagueName }} · by {{ test.owner }}
              · season {{ test.season }}, days {{ test.startDay }}–{{ test.endDay }} · engine {{ test.engine }}
              · {{ test.createdAt | date:'dd.MM.yyyy HH:mm' }}
            </p>
            <p class="ta-notice" *ngIf="test.leagueMatchesRemaining < test.leagueMatchesTotal">
              The season was already under way: {{ test.leagueMatchesRemaining }} of {{ test.leagueMatchesTotal }}
              league matches were simulated.
            </p>
          </div>
          <div class="ta-actions"><a class="ta-btn" routerLink="/tactic-arena">Leaderboard</a></div>
        </div>

        <app-arena-progress *ngIf="test.status !== 'DONE'" [test]="test" [cancelling]="cancelling"
                            (cancel)="cancelTest()"></app-arena-progress>

        <section class="ta-card">
          <app-arena-results [results]="test.results" title="Results · reference clubs"
                             emptyText="Available when the three reference runs have finished."></app-arena-results>
        </section>
        <section class="ta-card">
          <app-arena-results [results]="test.chosen" [title]="'Chosen club · ' + test.teamName"
                             emptyText="Available when the chosen club's run has finished."></app-arena-results>
        </section>

        <section class="ta-card" *ngFor="let run of test.runs; trackBy: trackRun">
          <h2>{{ runLabel(run) }} · {{ run.teamName }} <span class="ta-small">(reputation {{ run.teamReputation }})</span>
            <span class="ta-status" [ngClass]="run.status" *ngIf="run.status !== 'DONE'">{{ run.status }}</span></h2>
          <p class="ta-error" *ngIf="run.message">{{ run.message }}</p>
          <app-arena-results *ngIf="run.stats" [results]="run.stats"></app-arena-results>
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

  private shots = new Map<string, ShotState>();
  private setups = new Map<number, ArenaSetup>();
  private queue: CaptureJob[] = [];
  private working = false;
  private destroyed = false;
  private poll?: Subscription;
  private routeSub?: Subscription;

  constructor(private api: TacticArenaService, private route: ActivatedRoute, private changes: ChangeDetectorRef) {}

  ngOnInit(): void {
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
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.reset();
    this.routeSub?.unsubscribe();
  }

  runLabel(run: ArenaRun): string { return RUN_KIND_LABELS[run.kind] || run.kind; }
  kindLabel(kind: ArenaImageKind): string { return IMAGE_KIND_LABELS[kind]; }
  trackRun(_: number, run: ArenaRun): number { return run.id; }

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
          competitionName: result.leagueName, reputation: run.teamReputation
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
            next: blob => this.shots.set(key, { status: 'ready', url: URL.createObjectURL(blob) }),
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
