import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ArenaRun, ArenaTestDetail, RUN_KIND_LABELS, isActive } from './tactic-arena.service';

/** Total and per-run progress of a test, with cancel. State comes from the backend, so it survives reloads. */
@Component({
  selector: 'app-arena-progress',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <section class="ta-card">
      <div class="ta-head">
        <div>
          <h2>Simulation progress</h2>
          <p class="ta-sub">
            <span class="ta-status" [ngClass]="test.status">{{ test.status }}</span>
            {{ test.progress | number:'1.0-1' }}% total
            <ng-container *ngIf="test.status === 'QUEUED'"> · waiting for a free simulation slot</ng-container>
            <ng-container *ngIf="test.status === 'PREPARING'"> · generating the base world first</ng-container>
          </p>
        </div>
        <div class="ta-actions">
          <button type="button" class="ta-btn danger" *ngIf="active" [disabled]="cancelling" (click)="cancel.emit()">
            {{ cancelling ? 'Cancelling…' : 'Cancel test' }}
          </button>
        </div>
      </div>
      <div class="ta-bar" [class.done]="test.status === 'DONE'" [class.failed]="test.status === 'FAILED'">
        <div [style.width.%]="test.progress"></div>
      </div>
      <p class="ta-error" *ngIf="test.message">{{ test.message }}</p>

      <div class="ta-runs" style="margin-top: 14px">
        <div class="ta-run-row" *ngFor="let run of test.runs">
          <div><strong>{{ run.teamName || 'Chosen when the world is ready' }}</strong><div class="ta-small">{{ label(run) }}</div></div>
          <div><span class="ta-status" [ngClass]="run.status">{{ run.status }}</span></div>
          <div>
            <div class="ta-bar" [class.done]="run.status === 'DONE'" [class.failed]="run.status === 'FAILED'">
              <div [style.width.%]="run.progress"></div>
            </div>
            <div class="ta-small">
              Day {{ run.simulatedDays }} / {{ run.totalDays }}
              <span class="ta-error" *ngIf="run.message"> · {{ run.message }}</span>
            </div>
          </div>
          <div class="ta-strong">{{ run.progress | number:'1.0-0' }}%</div>
        </div>
      </div>
    </section>
  `
})
export class ArenaProgressComponent {
  @Input() test!: ArenaTestDetail;
  @Input() cancelling = false;
  @Output() cancel = new EventEmitter<void>();

  get active(): boolean { return isActive(this.test?.status); }

  label(run: ArenaRun): string { return RUN_KIND_LABELS[run.kind] || run.kind; }
}
