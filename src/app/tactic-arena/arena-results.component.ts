import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ArenaResults, ArenaSplit, XPTS_TITLE, ptsVsExpected, signed, xptsText } from './tactic-arena.service';

/** The fm-arena results block: Overall / Home / Away rows and "Based on N test result(s)". */
@Component({
  selector: 'app-arena-results',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <section class="ta-results">
      <h3 *ngIf="title">{{ title }}</h3>
      <table class="ta-table" *ngIf="results; else noResults">
        <thead>
          <tr>
            <th class="ta-left"></th><th>PLD</th><th>PTS</th><th [attr.title]="xptsTitle">xPts</th><th>GD</th><th>GF</th><th>GA</th>
            <th>xGF</th><th>xGA</th><th>xGD</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows">
            <td class="ta-left ta-strong">{{ row.label }}</td>
            <td>{{ row.split.pld }}</td>
            <td class="ta-strong" [attr.title]="vsExpected(row.split)">{{ row.split.pts }} / {{ row.split.ptsMax }}</td>
            <td>{{ xpts(row.split.xpts) }}</td>
            <td [class.ta-pos]="row.split.gd > 0" [class.ta-neg]="row.split.gd < 0">{{ signed(row.split.gd) }}</td>
            <td>{{ row.split.gf }}</td>
            <td>{{ row.split.ga }}</td>
            <td>{{ row.split.xgf ?? '—' }}</td>
            <td>{{ row.split.xga ?? '—' }}</td>
            <td [class.ta-pos]="(row.split.xgd ?? 0) > 0" [class.ta-neg]="(row.split.xgd ?? 0) < 0">{{ signed(row.split.xgd) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="ta-based" *ngIf="results">Based on {{ results.basedOn }} test result(s)</p>
      <ng-template #noResults><p class="ta-muted">{{ emptyText }}</p></ng-template>
    </section>
  `
})
export class ArenaResultsComponent {
  @Input() results: ArenaResults | null = null;
  @Input() title = '';
  @Input() emptyText = 'No results yet.';
  readonly signed = signed;
  readonly xpts = xptsText;
  readonly xptsTitle = XPTS_TITLE;
  readonly vsExpected = ptsVsExpected;

  get rows(): { label: string; split: ArenaSplit }[] {
    if (!this.results) return [];
    return [
      { label: 'Overall', split: this.results.overall },
      { label: 'Home', split: this.results.home },
      { label: 'Away', split: this.results.away }
    ].filter(row => !!row.split);
  }
}
