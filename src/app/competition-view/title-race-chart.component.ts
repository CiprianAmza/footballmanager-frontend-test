import { Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';

/** One point of the title race: a team's title chance (0..1) after a number of games. */
export interface TitleRacePoint {
  gamesPlayed: number;
  teamId: number;
  teamName: string;
  title: number;
}

interface RaceSeries {
  teamId: number;
  name: string;
  slot: number;
  points: { games: number; value: number; x: number; y: number }[];
  path: string;
}

/**
 * The title race (design DESIGN_MEDIA_SI_COMPETITII §4.3): each contender's title chance after every matchday.
 * One y-axis (0–100%), 2px lines, a crosshair that snaps to the matchday and lists every team, a legend, and the
 * same numbers in a table below.
 */
@Component({
  selector: 'app-title-race-chart',
  template: `
    <div class="trc" *ngIf="series.length; else empty">
      <ul class="trc-legend" aria-label="Teams in the title race">
        <li *ngFor="let s of series"><span class="trc-key" [attr.data-slot]="s.slot"></span>{{ s.name }}</li>
      </ul>
      <div class="trc-plot" #plot (pointermove)="hover($event)" (pointerleave)="hoverIndex = null">
        <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" role="img"
             [attr.aria-label]="'Title chance per matchday for ' + series.length + ' teams'">
          <g class="trc-grid">
            <line *ngFor="let tick of yTicks" [attr.x1]="left" [attr.x2]="width - right"
                  [attr.y1]="y(tick / 100)" [attr.y2]="y(tick / 100)"></line>
          </g>
          <line class="trc-base" [attr.x1]="left" [attr.x2]="width - right" [attr.y1]="y(0)" [attr.y2]="y(0)"></line>
          <line class="trc-cross" *ngIf="hoverIndex !== null" [attr.x1]="x(games[hoverIndex])"
                [attr.x2]="x(games[hoverIndex])" [attr.y1]="top" [attr.y2]="y(0)"></line>
          <path *ngFor="let s of series" class="trc-line" [attr.data-slot]="s.slot" [attr.d]="s.path"></path>
        </svg>
        <!-- Dots are HTML so they stay round while the plot stretches to its width. -->
        <ng-container *ngFor="let s of series">
          <span *ngIf="lastPoint(s) as p" class="trc-dot" [attr.data-slot]="s.slot"
                [style.left.%]="p.x / width * 100" [style.top.%]="p.y / height * 100"></span>
          <span *ngIf="hoverIndex !== null && pointAt(s, games[hoverIndex]) as p" class="trc-dot"
                [attr.data-slot]="s.slot" [style.left.%]="p.x / width * 100" [style.top.%]="p.y / height * 100"></span>
        </ng-container>
        <div class="trc-y" *ngFor="let tick of yTicks" [style.top.%]="y(tick / 100) / height * 100">{{ tick }}%</div>
        <div class="trc-x">
          <span *ngFor="let g of xTicks" [style.left.%]="x(g) / width * 100">{{ g === 0 ? 'Start' : g }}</span>
        </div>
        <div class="trc-tip" *ngIf="hoverIndex !== null" [class.flip]="x(games[hoverIndex]) > width * 0.62"
             [style.left.%]="x(games[hoverIndex]) / width * 100">
          <div class="trc-tip-head">{{ games[hoverIndex] === 0 ? 'Before the season' : 'After ' + games[hoverIndex] + ' games' }}</div>
          <div class="trc-tip-row" *ngFor="let s of seriesByValue(games[hoverIndex])">
            <span class="trc-tip-key" [attr.data-slot]="s.slot"></span>
            <strong>{{ pct(valueAt(s, games[hoverIndex])) }}</strong><span>{{ s.name }}</span>
          </div>
        </div>
      </div>
      <details class="trc-table">
        <summary>Show as table</summary>
        <div class="trc-table-wrap">
          <table>
            <thead><tr><th>Games</th><th *ngFor="let s of series">{{ s.name }}</th></tr></thead>
            <tbody><tr *ngFor="let g of games"><td>{{ g === 0 ? 'Start' : g }}</td>
              <td *ngFor="let s of series">{{ pct(valueAt(s, g)) }}</td></tr></tbody>
          </table>
        </div>
      </details>
    </div>
    <ng-template #empty><p class="trc-empty">The title race appears after the first matchday.</p></ng-template>
  `,
  styles: [`
    :host {
      --trc-surface: #1a2935;
      --trc-text: #dce7e9;
      --trc-text-2: #a9bac3;
      --trc-muted: #819ca5;
      --trc-grid: #2b4050;
      --trc-base: #3b5160;
      --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500; --series-5: #d55181;
      display: block;
    }
    [data-slot="1"] { --c: var(--series-1); } [data-slot="2"] { --c: var(--series-2); }
    [data-slot="3"] { --c: var(--series-3); } [data-slot="4"] { --c: var(--series-4); }
    [data-slot="5"] { --c: var(--series-5); }
    .trc-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; list-style: none; margin: 0 0 14px; padding: 0;
      color: var(--trc-text-2); font-size: 12px; }
    .trc-legend li { display: flex; align-items: center; gap: 7px; }
    .trc-key, .trc-tip-key { display: inline-block; width: 16px; height: 2px; border-radius: 1px; background: var(--c); }
    .trc-plot { position: relative; height: 260px; margin: 0 0 30px 40px; touch-action: none; }
    .trc-plot svg { width: 100%; height: 100%; overflow: visible; display: block; }
    .trc-grid line { stroke: var(--trc-grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .trc-base { stroke: var(--trc-base); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .trc-cross { stroke: var(--trc-muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .trc-line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round;
      vector-effect: non-scaling-stroke; }
    .trc-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--c);
      box-shadow: 0 0 0 2px var(--trc-surface); transform: translate(-50%, -50%); pointer-events: none; }
    .trc-y { position: absolute; left: -40px; width: 34px; transform: translateY(-50%); text-align: right;
      color: var(--trc-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
    .trc-x { position: absolute; left: 0; right: 0; bottom: -22px; height: 16px; }
    .trc-x span { position: absolute; transform: translateX(-50%); color: var(--trc-muted); font-size: 11px;
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .trc-tip { position: absolute; top: 4px; transform: translateX(12px); min-width: 170px; padding: 10px 12px;
      background: #13202a; border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; pointer-events: none;
      color: var(--trc-text); font-size: 12px; z-index: 2; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
    .trc-tip.flip { transform: translateX(calc(-100% - 12px)); }
    .trc-tip-head { color: var(--trc-text-2); margin-bottom: 6px; }
    .trc-tip-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
    .trc-tip-row strong { color: #fff; min-width: 38px; font-variant-numeric: tabular-nums; }
    .trc-tip-row span:last-child { color: var(--trc-text-2); }
    .trc-table summary { cursor: pointer; color: #b2e6d4; font-size: 13px; }
    .trc-table-wrap { overflow-x: auto; margin-top: 10px; }
    .trc-table table { border-collapse: collapse; font-size: 12px; white-space: nowrap; }
    .trc-table th, .trc-table td { padding: 7px 12px; border-top: 1px solid var(--trc-grid); text-align: left;
      color: var(--trc-text); font-variant-numeric: tabular-nums; }
    .trc-table th { color: var(--trc-text-2); font-weight: 700; }
    .trc-empty { color: var(--trc-text-2); font-size: 13px; }
    @media (max-width: 760px) { .trc-plot { height: 210px; } }
  `]
})
export class TitleRaceChartComponent implements OnChanges {
  /** Every stored point of the season (all teams). */
  @Input() points: TitleRacePoint[] = [];
  /** The teams to draw, in legend order (at most five: the leading contenders). */
  @Input() teamIds: number[] = [];

  @ViewChild('plot') plot?: ElementRef<HTMLDivElement>;

  readonly width = 720;
  readonly height = 260;
  readonly top = 10;
  readonly right = 10;
  readonly left = 0;
  readonly bottom = 0;
  readonly yTicks = [0, 25, 50, 75, 100];

  series: RaceSeries[] = [];
  games: number[] = [];
  xTicks: number[] = [];
  hoverIndex: number | null = null;

  ngOnChanges(): void {
    const ids = this.teamIds.slice(0, 5);
    this.games = [...new Set(this.points.map(p => p.gamesPlayed))].sort((a, b) => a - b);
    this.xTicks = this.tickGames();
    this.series = ids.map((teamId, index) => {
      const mine = this.points.filter(p => p.teamId === teamId).sort((a, b) => a.gamesPlayed - b.gamesPlayed);
      const pts = mine.map(p => ({ games: p.gamesPlayed, value: p.title, x: this.x(p.gamesPlayed), y: this.y(p.title) }));
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      return { teamId, name: mine[0]?.teamName ?? `Team #${teamId}`, slot: index + 1, points: pts, path };
    }).filter(s => s.points.length > 0);
    this.hoverIndex = null;
  }

  x(games: number): number {
    const first = this.games[0] ?? 0;
    const last = this.games[this.games.length - 1] ?? 0;
    const span = this.width - this.left - this.right;
    if (last === first) return this.left + span / 2;
    return this.left + (games - first) / (last - first) * span;
  }

  y(chance: number): number {
    return this.top + (1 - Math.max(0, Math.min(1, chance))) * (this.height - this.top - this.bottom);
  }

  hover(event: PointerEvent): void {
    const box = this.plot?.nativeElement.getBoundingClientRect();
    if (!box || !this.games.length) return;
    const svgX = (event.clientX - box.left) / box.width * this.width;
    let best = 0;
    this.games.forEach((g, i) => { if (Math.abs(this.x(g) - svgX) < Math.abs(this.x(this.games[best]) - svgX)) best = i; });
    this.hoverIndex = best;
  }

  lastPoint(s: RaceSeries) { return s.points[s.points.length - 1]; }
  pointAt(s: RaceSeries, games: number) { return s.points.find(p => p.games === games); }
  valueAt(s: RaceSeries, games: number): number | null { return this.pointAt(s, games)?.value ?? null; }

  seriesByValue(games: number): RaceSeries[] {
    return [...this.series].sort((a, b) => (this.valueAt(b, games) ?? -1) - (this.valueAt(a, games) ?? -1));
  }

  pct(value: number | null): string {
    if (value === null || value === undefined) return '—';
    if (value > 0 && value < 0.005) return '<1%';
    return `${Math.round(value * 100)}%`;
  }

  /** About six readable matchday labels, always including the first and the last. */
  private tickGames(): number[] {
    if (this.games.length <= 6) return this.games;
    const step = Math.ceil((this.games.length - 1) / 5);
    const ticks = this.games.filter((_, i) => i % step === 0);
    const last = this.games[this.games.length - 1];
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }
}
