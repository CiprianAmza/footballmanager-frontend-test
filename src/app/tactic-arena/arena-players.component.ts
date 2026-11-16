import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ArenaPlayerStats } from './tactic-arena.service';

type Scope = 'ALL' | 'LEAGUE' | 'DIAMOND' | 'CUP';
type ColumnKey = 'name' | 'position' | 'age' | 'apps' | 'starts' | 'minutes' | 'goals' | 'assists'
  | 'avgRating' | 'motm' | 'yellow' | 'red' | 'cleanSheets';

interface Column { key: ColumnKey; label: string; title?: string; text?: boolean; perScope?: boolean; }

/** Per-competition columns available in `byKind`; the others are season totals only. */
const COLUMNS: Column[] = [
  { key: 'name', label: 'Player', text: true },
  { key: 'position', label: 'Pos', text: true },
  { key: 'age', label: 'Age' },
  { key: 'apps', label: 'Apps', perScope: true },
  { key: 'starts', label: 'Starts' },
  { key: 'minutes', label: 'Min', title: 'Minutes played' },
  { key: 'goals', label: 'Goals', perScope: true },
  { key: 'assists', label: 'Assists', perScope: true },
  { key: 'avgRating', label: 'Avg rating', perScope: true },
  { key: 'motm', label: 'MOTM', title: 'Player of the match' },
  { key: 'yellow', label: 'YC', title: 'Yellow cards' },
  { key: 'red', label: 'RC', title: 'Red cards' },
  { key: 'cleanSheets', label: 'CS', title: 'Clean sheets' }
];

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'LEAGUE', label: 'League' },
  { key: 'DIAMOND', label: 'Diamond League' }, { key: 'CUP', label: 'Cup' }
];

/**
 * "Players" panel of a run: season stats per player, drawn from the run data (not captured).
 * Sortable columns (default: average rating), columns without data are hidden, and an
 * All / League / Diamond League / Cup switch when the data has a per-competition split.
 */
@Component({
  selector: 'app-arena-players',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <section class="ta-players" *ngIf="players?.length">
      <div class="ta-players-head">
        <h3>Players</h3>
        <div class="ta-tabs ta-players-scopes" role="tablist" *ngIf="scopes.length > 1">
          <button *ngFor="let option of scopes" type="button" role="tab" [class.active]="scope === option.key"
                  [attr.aria-selected]="scope === option.key" (click)="scope = option.key">{{ option.label }}</button>
        </div>
      </div>
      <div class="ta-table-wrap ta-players-table">
        <table class="ta-table">
          <thead>
            <tr>
              <th *ngFor="let column of columns" class="sortable" [class.ta-left]="column.text"
                  [class.sorted]="sortKey === column.key" [attr.title]="column.title || null"
                  (click)="sortBy(column.key)">
                {{ column.label }}{{ sortKey === column.key ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let player of rows">
              <td *ngFor="let column of columns" [class.ta-left]="column.text" [class.ta-strong]="column.key === 'name'">
                {{ display(player, column) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class ArenaPlayersComponent {
  @Input() players: ArenaPlayerStats[] | null | undefined = null;
  scope: Scope = 'ALL';
  sortKey: ColumnKey = 'avgRating';
  sortDesc = true;

  get scopes(): { key: Scope; label: string }[] {
    const kinds = new Set<string>();
    for (const player of this.players || []) Object.keys(player.byKind || {}).forEach(kind => kinds.add(kind));
    if (!kinds.size) return [SCOPES[0]];
    return SCOPES.filter(option => option.key === 'ALL' || kinds.has(option.key));
  }

  /** Columns with at least one value in the current scope; per-competition scopes show only split columns. */
  get columns(): Column[] {
    return COLUMNS.filter(column => {
      if (this.scope !== 'ALL' && !column.text && !column.perScope) return false;
      return (this.players || []).some(player => {
        const value = this.value(player, column.key);
        return value !== null && value !== undefined && value !== '';
      });
    });
  }

  get rows(): ArenaPlayerStats[] {
    const players = (this.players || []).filter(player => this.scope === 'ALL' || !!player.byKind?.[this.scope]?.apps);
    const textual = COLUMNS.find(column => column.key === this.sortKey)?.text;
    return [...players].sort((left, right) => {
      const a = this.value(left, this.sortKey);
      const b = this.value(right, this.sortKey);
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      const order = textual ? String(a).localeCompare(String(b)) : Number(a) - Number(b);
      return this.sortDesc ? -order : order;
    });
  }

  sortBy(key: ColumnKey): void {
    if (this.sortKey === key) this.sortDesc = !this.sortDesc;
    else { this.sortKey = key; this.sortDesc = !COLUMNS.find(column => column.key === key)?.text; }
  }

  value(player: ArenaPlayerStats, key: ColumnKey): string | number | null | undefined {
    if (this.scope !== 'ALL' && ['apps', 'goals', 'assists', 'avgRating'].includes(key)) {
      return (player.byKind?.[this.scope] as any)?.[key];
    }
    return (player as any)[key];
  }

  display(player: ArenaPlayerStats, column: Column): string {
    const value = this.value(player, column.key);
    if (value === null || value === undefined || value === '') return '—';
    if (column.key === 'avgRating' && typeof value === 'number') return value.toFixed(2);
    return String(value);
  }
}
