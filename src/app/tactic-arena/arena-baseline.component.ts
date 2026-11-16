import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ArenaBaseline, TacticArenaService } from './tactic-arena.service';

/**
 * The base world (season 1, day 1) every run starts from: its state, the generation progress
 * and the button that generates it again. Emits `ready` when it becomes READY.
 */
@Component({
  selector: 'app-arena-baseline',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <section class="ta-card" *ngIf="baseline as b">
      <div class="ta-head">
        <div>
          <h2>Base world</h2>
          <p class="ta-sub" *ngIf="b.status === 'READY'">
            Generated {{ b.createdAt | date:'dd.MM.yyyy HH:mm' }} · {{ b.clubs }} clubs · season {{ b.season }},
            days {{ b.startDay }}–{{ b.endDay }}<ng-container *ngIf="b.appVersion"> · {{ b.appVersion }}</ng-container>
          </p>
          <p class="ta-notice" *ngIf="b.status === 'MISSING'">There is no base world yet. Generate it to start testing (several minutes).</p>
          <p class="ta-sub" *ngIf="b.status === 'BUILDING'">
            Generating a new world{{ b.builtByOtherInstance ? ' (by another backend)' : '' }}… {{ b.progress | number:'1.0-0' }}%
          </p>
          <p class="ta-error" *ngIf="b.status === 'FAILED'">The last generation failed: {{ b.message }}</p>
        </div>
        <div class="ta-actions">
          <button type="button" class="ta-btn" [disabled]="b.status === 'BUILDING' || rebuilding" (click)="rebuild(b)">
            {{ b.status === 'READY' ? 'Rebuild world' : 'Generate world' }}
          </button>
        </div>
      </div>
      <div class="ta-bar" *ngIf="b.status === 'BUILDING'"><div [style.width.%]="b.progress"></div></div>
      <p class="ta-error" *ngIf="error">{{ error }}</p>
    </section>
  `
})
export class ArenaBaselineComponent implements OnInit, OnDestroy {
  @Output() ready = new EventEmitter<ArenaBaseline>();
  baseline: ArenaBaseline | null = null;
  rebuilding = false;
  error = '';
  private poll?: Subscription;

  constructor(private api: TacticArenaService) {}

  ngOnInit(): void { this.watch(); }
  ngOnDestroy(): void { this.poll?.unsubscribe(); }

  rebuild(current: ArenaBaseline): void {
    const question = current.status === 'READY'
      ? 'Delete the base world and generate a new one? This takes several minutes; tests not started yet will fail.'
      : 'Generate the base world now? This takes several minutes.';
    if (!window.confirm(question)) return;
    this.rebuilding = true;
    this.error = '';
    this.api.rebuildBaseline().subscribe({
      next: baseline => { this.rebuilding = false; this.baseline = baseline; this.watch(); },
      error: error => {
        this.rebuilding = false;
        this.error = error?.error?.error || (error?.status === 409
          ? 'The world cannot be rebuilt while a test is running or a generation is under way.'
          : 'The world could not be rebuilt.');
      }
    });
  }

  /** Polls every 3 s while the world is being generated, otherwise reads it once. */
  private watch(): void {
    this.poll?.unsubscribe();
    let wasReady = this.baseline?.status === 'READY';
    this.poll = timer(0, 3000).pipe(switchMap(() => this.api.baseline().pipe(
      catchError(error => { this.error = error?.error?.error || 'The base world state could not be loaded.'; return EMPTY; })
    ))).subscribe(baseline => {
      this.baseline = baseline;
      this.error = '';
      if (baseline.status === 'READY' && !wasReady) this.ready.emit(baseline);
      wasReady = baseline.status === 'READY';
      if (baseline.status !== 'BUILDING') this.poll?.unsubscribe();
    });
  }
}
