import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import {
  ArenaLeaderboard, ArenaSplit, ArenaTestSummary, TacticArenaService, formationLabel, isActive, signed
} from './tactic-arena.service';

type Split = 'overall' | 'home' | 'away';
type SortKey = 'pld' | 'pts' | 'gd' | 'gf' | 'ga' | 'xgf' | 'xga' | 'xgd' | 'uploaded';

/** /tactic-arena — every tested tactic, like the fm-arena aggregator table. */
@Component({
  selector: 'app-tactic-arena-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <div class="ta-page">
      <div class="ta-head">
        <div>
          <span class="ta-eyebrow">Tactic Arena</span>
          <h1>Tactic testing</h1>
          <p class="ta-sub" *ngIf="board">
            {{ board.testsCount }} tactics have been tested. Total number of matches played is {{ board.matchesPlayed }}.
          </p>
        </div>
        <div class="ta-actions">
          <a class="ta-btn primary" routerLink="/tactic-arena/new">Test a tactic</a>
        </div>
      </div>

      <p class="ta-error" *ngIf="error">{{ error }}</p>
      <p class="ta-small" *ngIf="board?.gitPush?.enabled && board?.gitPush?.lastAttemptAt">
        Export push: <span [class.ta-pos]="board?.gitPush?.ok" [class.ta-neg]="board?.gitPush?.ok === false">{{ board?.gitPush?.message }}</span>
      </p>

      <div class="ta-tabs" role="tablist">
        <button *ngFor="let tab of tabs" type="button" role="tab" [class.active]="split === tab.key"
                [attr.aria-selected]="split === tab.key" (click)="split = tab.key">{{ tab.label }}</button>
      </div>
      <div class="ta-table-wrap">
        <table class="ta-table">
          <thead>
            <tr>
              <th class="ta-left">Thread</th>
              <th class="ta-left">Formation</th>
              <th class="ta-left">Owner</th>
              <th class="ta-left">Club</th>
              <th class="ta-left">League</th>
              <th *ngFor="let column of numericColumns" class="sortable" [class.sorted]="sortKey === column.key"
                  (click)="sortBy(column.key)">{{ column.label }}{{ sortKey === column.key ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th class="sortable" [class.sorted]="sortKey === 'uploaded'" (click)="sortBy('uploaded')">
                Uploaded{{ sortKey === 'uploaded' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let test of sortedTests; trackBy: trackById" class="ta-link-row" (click)="open(test)">
              <td class="ta-left ta-thread">
                <a [routerLink]="['/tactic-arena', test.id]" (click)="$event.stopPropagation()">{{ test.name }}</a>
                <ng-container *ngIf="test.status !== 'DONE'">
                  <span class="ta-status" [ngClass]="test.status">{{ test.status }}</span>
                  <span class="ta-inline-progress" *ngIf="active(test)">
                    <span class="ta-bar"><div [style.width.%]="test.progress"></div></span>
                    <span class="ta-small">{{ test.progress | number:'1.0-0' }}%</span>
                  </span>
                </ng-container>
              </td>
              <td class="ta-left">{{ formation(test.formation) }}</td>
              <td class="ta-left">{{ test.owner }}</td>
              <td class="ta-left">{{ test.teamName }}</td>
              <td class="ta-left">{{ test.leagueName }}</td>
              <ng-container *ngIf="row(test) as s; else emptyCells">
                <td>{{ s.pld }}</td>
                <td class="ta-strong">{{ s.pts }} / {{ s.ptsMax }}</td>
                <td [class.ta-pos]="s.gd > 0" [class.ta-neg]="s.gd < 0">{{ signed(s.gd) }}</td>
                <td>{{ s.gf }}</td>
                <td>{{ s.ga }}</td>
                <td>{{ s.xgf ?? '—' }}</td>
                <td>{{ s.xga ?? '—' }}</td>
                <td [class.ta-pos]="(s.xgd ?? 0) > 0" [class.ta-neg]="(s.xgd ?? 0) < 0">{{ signed(s.xgd) }}</td>
              </ng-container>
              <ng-template #emptyCells>
                <td class="ta-muted" *ngFor="let column of numericColumns">—</td>
              </ng-template>
              <td>{{ (test.finishedAt || test.createdAt) | date:'dd.MM.yyyy' }}</td>
            </tr>
            <tr *ngIf="board && !board.tests.length">
              <td class="ta-left ta-muted" [attr.colspan]="numericColumns.length + 6">No tactic has been tested yet.</td>
            </tr>
            <tr *ngIf="!board && !error">
              <td class="ta-left ta-muted" [attr.colspan]="numericColumns.length + 6">Loading…</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ta-small">PTS = average league points per season / maximum possible, from the three reference clubs of the chosen club's league.</p>
    </div>
  `
})
export class TacticArenaLeaderboardComponent implements OnInit, OnDestroy {
  board: ArenaLeaderboard | null = null;
  error = '';
  split: Split = 'overall';
  sortKey: SortKey = 'pts';
  sortDesc = true;
  readonly tabs: { key: Split; label: string }[] = [
    { key: 'overall', label: 'Overall' }, { key: 'home', label: 'Home' }, { key: 'away', label: 'Away' }
  ];
  readonly numericColumns: { key: SortKey; label: string }[] = [
    { key: 'pld', label: 'PLD' }, { key: 'pts', label: 'PTS' }, { key: 'gd', label: 'GD' },
    { key: 'gf', label: 'GF' }, { key: 'ga', label: 'GA' }, { key: 'xgf', label: 'xGF' },
    { key: 'xga', label: 'xGA' }, { key: 'xgd', label: 'xGD' }
  ];
  readonly signed = signed;
  readonly formation = formationLabel;
  readonly active = (test: ArenaTestSummary) => isActive(test.status);
  private poll?: Subscription;

  constructor(private api: TacticArenaService, private router: Router) {}

  ngOnInit(): void {
    // Refreshed every 5 s so tests in progress show their current percentage.
    this.poll = timer(0, 5000).pipe(switchMap(() => this.api.leaderboard().pipe(
      catchError(error => {
        this.error = error?.error?.error || 'The leaderboard could not be loaded.';
        return EMPTY;
      })
    ))).subscribe(board => { this.board = board; this.error = ''; });
  }

  ngOnDestroy(): void { this.poll?.unsubscribe(); }

  row(test: ArenaTestSummary): ArenaSplit | null {
    return test.results ? test.results[this.split] : null;
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) this.sortDesc = !this.sortDesc;
    else { this.sortKey = key; this.sortDesc = key !== 'ga' && key !== 'xga'; }
  }

  get sortedTests(): ArenaTestSummary[] {
    const tests = [...(this.board?.tests || [])];
    const value = (test: ArenaTestSummary): number | null => {
      if (this.sortKey === 'uploaded') return Date.parse(test.finishedAt || test.createdAt) || 0;
      const split = this.row(test);
      if (!split) return null;
      return (split as any)[this.sortKey] ?? null;
    };
    return tests.sort((left, right) => {
      const a = value(left);
      const b = value(right);
      if (a === null && b === null) return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (a === null) return 1;
      if (b === null) return -1;
      return this.sortDesc ? b - a : a - b;
    });
  }

  trackById(_: number, test: ArenaTestSummary): number { return test.id; }

  open(test: ArenaTestSummary): void { void this.router.navigate(['/tactic-arena', test.id]); }
}
