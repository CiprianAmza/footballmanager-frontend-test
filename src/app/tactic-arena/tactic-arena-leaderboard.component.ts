import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import {
  ARENA_SETTING_COLUMNS, ARENA_TIERS, ArenaClubResult, ArenaLeaderboard, ArenaReferenceTeam, ArenaSettingKey, ArenaSplit,
  ArenaTestSummary, ArenaTier, ArenaTierResult, ENGINE_TITLE, TacticArenaService,
  engineLabel, formationLabel, isActive, pointsPct, predictionLabel, referenceNames, signed
} from './tactic-arena.service';

type Split = 'overall' | 'home' | 'away';
type Category = 'general' | 'diamond' | 'club';
type EngineFilter = 'all' | 'classic' | '2d';
type View = 'results' | 'settings';
/** A club that has CLUB tests, with how many. */
interface ClubChoice { key: string; label: string; name: string; count: number; }
type SortKey = 'pld' | 'pts' | 'gd' | 'gf' | 'ga' | 'xgf' | 'xga' | 'xgd' | 'leaguePos' | 'diamond' | 'dlPos' | 'uploaded';
/** One club's entry of a test: a reference tier (General) or a Diamond League club. */
type ClubEntry = (ArenaTierResult | ArenaClubResult) & { predictedPosition?: number | null };
const TEAM_TIER: Record<string, ArenaTier> = { top: 'TOP', mid: 'MID', bottom: 'BOTTOM' };
const TIER_TITLES: Record<ArenaTier, string> = { TOP: 'Top club', MID: 'Mid-table club', BOTTOM: 'Bottom club' };

interface BestCard { title: string; club: string | null; test: ArenaTestSummary | null; split: ArenaSplit | null; }
interface TeamOption { key: string; label: string; }

/**
 * /tactic-arena — every tested tactic, like the fm-arena aggregator table, in two categories:
 * General (3 fixed reference clubs: top, mid-table, bottom) and Diamond League clubs (8 clubs).
 * The "Team" selector shows the average of the category's clubs or one club's own run.
 * A third category, Club, holds one club's season 1 played N times (figures = the mean of the seasons).
 * Category, team / club, engine filter and column set are kept in the URL
 * (?cat=diamond|club&team=top|mid|bottom|<teamId>&engine=classic|2d&view=settings); the tactic-settings
 * filters live in the page only and apply to both column sets.
 */
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
            {{ doneCount }} tactics have been tested. Total number of matches played is {{ matchesCount }}.
          </p>
        </div>
        <div class="ta-actions">
          <a class="ta-btn primary" routerLink="/tactic-arena/new">Test a tactic</a>
        </div>
      </div>

      <p class="ta-error" *ngIf="error">{{ error }}</p>
      <p class="ta-small" *ngIf="board?.baseline as b">
        Every run plays season 1 of the base world:
        <ng-container *ngIf="b.status === 'READY'">generated {{ b.createdAt | date:'dd.MM.yyyy HH:mm' }}, {{ b.clubs }} clubs.</ng-container>
        <ng-container *ngIf="b.status === 'BUILDING'">being generated ({{ b.progress | number:'1.0-0' }}%).</ng-container>
        <ng-container *ngIf="b.status === 'MISSING'">not generated yet (see Test a tactic).</ng-container>
        <ng-container *ngIf="b.status === 'FAILED'"><span class="ta-neg">last generation failed.</span></ng-container>
      </p>
      <p class="ta-small" *ngIf="board?.gitPush?.enabled && board?.gitPush?.lastAttemptAt">
        Export push: <span [class.ta-pos]="board?.gitPush?.ok" [class.ta-neg]="board?.gitPush?.ok === false">{{ board?.gitPush?.message }}</span>
      </p>

      <div class="ta-tabs ta-cat-tabs" role="tablist" *ngIf="hasDiamond || hasClub">
        <button type="button" role="tab" [class.active]="cat === 'general'" [attr.aria-selected]="cat === 'general'"
                (click)="selectCategory('general')">General</button>
        <button type="button" role="tab" *ngIf="hasDiamond || cat === 'diamond'" [class.active]="cat === 'diamond'"
                [attr.aria-selected]="cat === 'diamond'" (click)="selectCategory('diamond')">Diamond League clubs</button>
        <button type="button" role="tab" *ngIf="hasClub || cat === 'club'" [class.active]="cat === 'club'"
                [attr.aria-selected]="cat === 'club'" (click)="selectCategory('club')">Club</button>
      </div>

      <div class="ta-best-grid" *ngIf="board" [class.compact]="cat === 'diamond'">
        <div class="ta-best" *ngFor="let card of bestCards">
          <span class="ta-eyebrow">{{ card.title }}</span>
          <span class="ta-small" *ngIf="card.club">{{ card.club }}</span>
          <ng-container *ngIf="card.test && card.split; else noBest">
            <a class="ta-best-name" [routerLink]="['/tactic-arena', card.test.id]">{{ card.test.name }}</a>
            <span class="ta-small">{{ formation(card.test.formation) }} · <strong>{{ card.split.pts }} / {{ card.split.ptsMax }}</strong> pts
              · GD {{ signed(card.split.gd) }}</span>
          </ng-container>
          <ng-template #noBest><span class="ta-muted">No finished test yet.</span></ng-template>
        </div>
      </div>

      <div class="ta-tabs-bar">
        <div class="ta-tabs" role="tablist">
          <button *ngFor="let tab of tabs" type="button" role="tab" [class.active]="split === tab.key"
                  [attr.aria-selected]="split === tab.key" (click)="split = tab.key">{{ tab.label }}</button>
        </div>
        <div class="ta-bar-controls">
          <div class="ta-seg" role="group" aria-label="Columns">
            <button type="button" [class.active]="view === 'results'" [attr.aria-pressed]="view === 'results'"
                    (click)="selectView('results')">Results</button>
            <button type="button" [class.active]="view === 'settings'" [attr.aria-pressed]="view === 'settings'"
                    (click)="selectView('settings')">Tactic settings</button>
          </div>
          <label class="ta-team-pick" [attr.title]="engineTitle">
            <span>Engine</span>
            <select [value]="engine" (change)="selectEngine($any($event.target).value)">
              <option value="all" [selected]="engine === 'all'">All</option>
              <option value="classic" [selected]="engine === 'classic'">Classic</option>
              <option value="2d" [selected]="engine === '2d'">2D</option>
            </select>
          </label>
          <label class="ta-team-pick" *ngIf="cat !== 'club'">
            <span>Team</span>
            <select [value]="team" (change)="selectTeam($any($event.target).value)">
              <option *ngFor="let option of teamOptions" [value]="option.key" [selected]="option.key === team">{{ option.label }}</option>
            </select>
          </label>
          <label class="ta-team-pick" *ngIf="cat === 'club'">
            <span>Club</span>
            <select [value]="clubKey || ''" (change)="selectClub($any($event.target).value)">
              <option *ngIf="!clubChoices.length" value="">No club test yet</option>
              <option *ngFor="let club of clubChoices" [value]="club.key" [selected]="club.key === clubKey">{{ club.label }}</option>
            </select>
          </label>
        </div>
      </div>
      <div class="ta-chips" *ngIf="activeFilters.length">
        <span class="ta-small">Filtered by</span>
        <button type="button" class="ta-chip" *ngFor="let chip of activeFilters" (click)="setFilter(chip.key, '')"
                [attr.title]="'Remove the filter ' + chip.label">{{ chip.label }}: {{ chip.text }} <span aria-hidden="true">×</span></button>
        <button type="button" class="ta-chip-clear" (click)="clearFilters()">Clear all</button>
        <span class="ta-small">· {{ visibleTests.length }} of {{ scopeTests.length }} tests shown</span>
      </div>

      <ng-template #threadCell let-test>
        <a [routerLink]="['/tactic-arena', test.id]" (click)="$event.stopPropagation()">{{ test.name }}</a>
        <ng-container *ngIf="test.status !== 'DONE'">
          <span class="ta-status" [ngClass]="test.status">{{ test.status }}</span>
          <span class="ta-inline-progress" *ngIf="active(test)">
            <span class="ta-bar"><div [style.width.%]="test.progress"></div></span>
            <span class="ta-small">{{ test.progress | number:'1.0-0' }}%</span>
          </span>
        </ng-container>
      </ng-template>

      <!-- Tactic settings view: the formation and the 15 team instructions of every test. -->
      <div class="ta-table-wrap" *ngIf="view === 'settings'">
        <table class="ta-table ta-settings-table">
          <thead>
            <tr>
              <th>#</th>
              <th class="ta-left">Name</th>
              <th class="ta-left" [attr.title]="engineTitle">Engine</th>
              <th class="ta-left" *ngFor="let col of settingColumns">{{ col.label }}</th>
              <th class="sortable" [class.sorted]="sortKey === 'pts'" (click)="sortBy('pts')" title="League points as a share of the maximum">
                Pts %{{ sortKey === 'pts' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th class="sortable" [class.sorted]="sortKey === 'gd'" (click)="sortBy('gd')">
                GD{{ sortKey === 'gd' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th *ngIf="cat === 'club' && showLeaguePos" class="sortable" [class.sorted]="sortKey === 'leaguePos'" (click)="sortBy('leaguePos')"
                  title="Mean final league place over the season runs">
                League pos{{ sortKey === 'leaguePos' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
            </tr>
            <tr class="ta-filter-row">
              <th></th><th></th><th></th>
              <th class="ta-left" *ngFor="let col of settingColumns">
                <select [class.active]="!!filters[col.key]" [attr.aria-label]="'Filter ' + col.label"
                        (change)="setFilter(col.key, $any($event.target).value)">
                  <option value="" [selected]="!filters[col.key]">Any</option>
                  <option *ngFor="let value of filterOptions(col.key)" [value]="value"
                          [selected]="filters[col.key] === value">{{ settingText(col.key, value) }}</option>
                </select>
              </th>
              <th></th><th></th>
              <th *ngIf="cat === 'club' && showLeaguePos"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let test of sortedTests; let i = index; trackBy: trackById" class="ta-link-row" (click)="open(test)">
              <td class="ta-muted">{{ i + 1 }}</td>
              <td class="ta-left ta-thread"><ng-container *ngTemplateOutlet="threadCell; context: { $implicit: test }"></ng-container></td>
              <td class="ta-left" [attr.title]="engineTitle">{{ engineText(test.engine) }}</td>
              <td class="ta-left" *ngFor="let col of settingColumns"
                  [class.ta-set-default]="isDefault(test, col.key)" [class.ta-set-changed]="isChanged(test, col.key)"
                  [attr.title]="isChanged(test, col.key) ? 'Default: ' + settingText(col.key, col.defaultValue) : null">
                {{ settingText(col.key, settingValue(test, col.key)) }}</td>
              <ng-container *ngIf="row(test) as s; else emptySettingFigures">
                <td class="ta-strong">{{ pct(s) !== null ? (pct(s) | number:'1.0-0') + '%' : '—' }}</td>
                <td [class.ta-pos]="s.gd > 0" [class.ta-neg]="s.gd < 0">{{ signed(s.gd) }}</td>
              </ng-container>
              <ng-template #emptySettingFigures><td class="ta-muted">—</td><td class="ta-muted">—</td></ng-template>
              <td *ngIf="cat === 'club' && showLeaguePos" [class.ta-pos]="leagueDelta(test) > 0" [class.ta-neg]="leagueDelta(test) < 0"
                  [attr.title]="leaguePosTitle(test)">{{ leaguePosText(test) }}</td>
            </tr>
            <ng-container *ngTemplateOutlet="emptyRows"></ng-container>
          </tbody>
        </table>
      </div>

      <ng-template #emptyRows>
        <tr *ngIf="board && !scopeTests.length">
          <td class="ta-left ta-muted" [attr.colspan]="columnCount">No tactic has been tested in this category yet{{ engine !== 'all' ? ' with this engine' : '' }}.</td>
        </tr>
        <tr *ngIf="board && scopeTests.length && !visibleTests.length">
          <td class="ta-left ta-muted" [attr.colspan]="columnCount">No test matches the filters.</td>
        </tr>
        <tr *ngIf="!board && !error">
          <td class="ta-left ta-muted" [attr.colspan]="columnCount">Loading…</td>
        </tr>
      </ng-template>

      <div class="ta-table-wrap" *ngIf="view === 'results'">
        <table class="ta-table">
          <thead>
            <tr>
              <th class="ta-left">Thread</th>
              <th class="ta-left" [attr.title]="engineTitle">Engine</th>
              <th class="ta-left">Formation</th>
              <th class="ta-left">Owner</th>
              <th class="ta-left">Club</th>
              <th class="ta-left">League</th>
              <th *ngIf="cat === 'club'" title="How many times season 1 was played with this club">Seasons</th>
              <th *ngFor="let column of numericColumns" class="sortable" [class.sorted]="sortKey === column.key"
                  (click)="sortBy(column.key)">{{ column.label }}{{ sortKey === column.key ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th *ngIf="showLeaguePos" class="sortable" [class.sorted]="sortKey === 'leaguePos'" (click)="sortBy('leaguePos')"
                  [attr.title]="cat === 'club' ? 'Mean final league place over the season runs' : team === 'all' ? 'Final league place of the top · mid-table · bottom club' : 'Final league place / clubs'">
                League pos{{ sortKey === 'leaguePos' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th *ngIf="showDiamond" class="sortable" [class.sorted]="sortKey === 'diamond'" (click)="sortBy('diamond')"
                  title="Diamond League points / maximum">Diamond League{{ sortKey === 'diamond' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th *ngIf="showDlPos" class="sortable" [class.sorted]="sortKey === 'dlPos'" (click)="sortBy('dlPos')"
                  [attr.title]="cat === 'club' ? 'Mean final Diamond League place over the season runs' : 'Final Diamond League place / clubs'">DL pos{{ sortKey === 'dlPos' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th class="sortable" [class.sorted]="sortKey === 'uploaded'" (click)="sortBy('uploaded')">
                Uploaded{{ sortKey === 'uploaded' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let test of sortedTests; trackBy: trackById" class="ta-link-row" (click)="open(test)">
              <td class="ta-left ta-thread"><ng-container *ngTemplateOutlet="threadCell; context: { $implicit: test }"></ng-container></td>
              <td class="ta-left" [attr.title]="engineTitle">{{ engineText(test.engine) }}</td>
              <td class="ta-left">{{ formation(test.formation) }}</td>
              <td class="ta-left">{{ test.owner }}</td>
              <td class="ta-left">{{ test.teamName || '—' }}
                <span class="ta-small" *ngIf="test.predictedPosition != null" title="Media prediction">· {{ prediction(test.predictedPosition, test.leagueSize) }}</span></td>
              <td class="ta-left">{{ test.leagueName || '—' }}</td>
              <td *ngIf="cat === 'club'">{{ seasonsCount(test) ?? '—' }}</td>
              <ng-container *ngIf="row(test) as s; else emptyCells">
                <td>{{ s.pld }}</td>
                <td class="ta-strong">{{ s.pts }} / {{ s.ptsMax }}
                  <span class="ta-small" *ngIf="pct(s) !== null">{{ pct(s) | number:'1.0-0' }}%</span></td>
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
              <td *ngIf="showLeaguePos" [class.ta-pos]="leagueDelta(test) > 0" [class.ta-neg]="leagueDelta(test) < 0"
                  [attr.title]="leaguePosTitle(test)">{{ leaguePosText(test) }}</td>
              <td *ngIf="showDiamond">
                <ng-container *ngIf="diamondRow(test) as d; else noDiamond">{{ d.pts }} / {{ d.ptsMax }}
                  <span class="ta-small" *ngIf="pct(d) !== null">{{ pct(d) | number:'1.0-0' }}%</span></ng-container>
                <ng-template #noDiamond><span class="ta-muted">—</span></ng-template>
              </td>
              <td *ngIf="showDlPos" [attr.title]="dlPosTitle(test)">{{ dlPosText(test) }}</td>
              <td>{{ (test.finishedAt || test.createdAt) | date:'dd.MM.yyyy' }}</td>
            </tr>
            <ng-container *ngTemplateOutlet="emptyRows"></ng-container>
          </tbody>
        </table>
      </div>
      <p class="ta-small" *ngIf="cat === 'general'">PTS = league points per season / maximum possible, from the general simulations:
        the same tactic on the fixed reference clubs{{ refs ? ' (' + refs + ')' : '' }}, so every test is comparable.
        "All reference clubs" is their average; Top / Mid-table / Bottom club shows that club's run alone.
        The chosen club's own run (custom) is on the test page.</p>
      <p class="ta-small" *ngIf="cat === 'diamond'">PTS = league points per season / maximum possible, from the same tactic on
        each of the Diamond League clubs{{ diamondNames ? ' (' + diamondNames + ')' : '' }}. "All 8 clubs" is their average; picking
        a club shows its run alone. The percentage is used to sort when maxima differ.</p>
      <p class="ta-small" *ngIf="cat === 'club'">PTS = league points per season / maximum possible, the mean of season 1 played
        several times (Seasons) with the same club{{ clubName ? ' (' + clubName + ')' : '' }}. League pos and DL pos are the mean
        final places; hover a cell for each season's place.</p>
      <p class="ta-small">Engine: 2D = 2D engine for the tested club's matches, classic engine for the rest; Classic = classic engine for every match.</p>
      <p class="ta-small">Best cards use the Overall figures (points share of the maximum), ties broken by goal difference.</p>
    </div>
  `
})
export class TacticArenaLeaderboardComponent implements OnInit, OnDestroy {
  board: ArenaLeaderboard | null = null;
  error = '';
  split: Split = 'overall';
  cat: Category = 'general';
  team = 'all';
  sortKey: SortKey = 'pts';
  sortDesc = true;
  engine: EngineFilter = 'all';
  view: View = 'results';
  /** Active tactic-settings filters (column key → value); they apply to both column sets. */
  filters: Partial<Record<ArenaSettingKey, string>> = {};
  readonly settingColumns = ARENA_SETTING_COLUMNS;
  readonly engineTitle = ENGINE_TITLE;
  readonly engineText = engineLabel;
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
  readonly prediction = predictionLabel;
  readonly pct = pointsPct;
  readonly active = (test: ArenaTestSummary) => isActive(test.status);
  private poll?: Subscription;
  private querySub?: Subscription;

  constructor(private api: TacticArenaService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe(params => {
      const cat = params.get('cat');
      this.cat = cat === 'diamond' || cat === 'club' ? cat : 'general';
      this.team = params.get('team') || 'all';
      const engine = params.get('engine');
      this.engine = engine === 'classic' || engine === '2d' ? engine : 'all';
      this.view = params.get('view') === 'settings' ? 'settings' : 'results';
    });
    // Refreshed every 5 s so tests in progress show their current percentage.
    this.poll = timer(0, 5000).pipe(switchMap(() => this.api.leaderboard().pipe(
      catchError(error => {
        this.error = error?.error?.error || 'The leaderboard could not be loaded.';
        return EMPTY;
      })
    ))).subscribe(board => { this.board = board; this.error = ''; });
  }

  ngOnDestroy(): void { this.poll?.unsubscribe(); this.querySub?.unsubscribe(); }

  // ---------- categories ----------

  private isDiamond(test: ArenaTestSummary): boolean { return test.category === 'DIAMOND'; }
  private isClub(test: ArenaTestSummary): boolean { return test.category === 'CLUB'; }

  get hasDiamond(): boolean {
    return !!this.board?.diamondTeams?.length || (this.board?.tests || []).some(test => this.isDiamond(test));
  }

  get hasClub(): boolean { return (this.board?.tests || []).some(test => this.isClub(test)); }

  /** The tests of the current category (no engine, club or settings filter). */
  get categoryTests(): ArenaTestSummary[] {
    return (this.board?.tests || []).filter(test => {
      if (this.cat === 'diamond') return this.isDiamond(test);
      if (this.cat === 'club') return this.isClub(test);
      return !this.isDiamond(test) && !this.isClub(test);
    });
  }

  private engineMatches(test: ArenaTestSummary): boolean {
    if (this.engine === 'all') return true;
    return engineLabel(test.engine) === (this.engine === '2d' ? '2D' : 'Classic');
  }

  /** The category's tests after the engine filter and, in the Club category, the chosen club. */
  get scopeTests(): ArenaTestSummary[] {
    const club = this.cat === 'club' ? this.clubKey : null;
    return this.categoryTests.filter(test => this.engineMatches(test)
      && (this.cat !== 'club' || String(test.teamId) === club));
  }

  /** The scope's tests that pass every tactic-settings filter: the rows of both column sets. */
  get visibleTests(): ArenaTestSummary[] {
    const active = this.activeFilterKeys;
    if (!active.length) return this.scopeTests;
    return this.scopeTests.filter(test => active.every(key => this.settingValue(test, key) === this.filters[key]));
  }

  get doneCount(): number { return this.categoryTests.filter(test => test.status === 'DONE').length; }

  get matchesCount(): number {
    return this.categoryTests.filter(test => test.status === 'DONE')
      .reduce((sum, test) => sum + (test.results?.overall?.pld || 0), 0);
  }

  selectCategory(cat: Category): void {
    this.cat = cat;
    this.team = 'all';
    this.updateUrl();
  }

  selectTeam(value: string): void {
    this.team = this.teamOptions.some(option => option.key === value) ? value : 'all';
    this.updateUrl();
  }

  selectClub(value: string): void {
    this.team = this.clubChoices.some(club => club.key === value) ? value : 'all';
    this.updateUrl();
  }

  selectEngine(value: string): void {
    this.engine = value === 'classic' || value === '2d' ? value : 'all';
    this.updateUrl();
  }

  selectView(view: View): void {
    this.view = view;
    this.updateUrl();
  }

  private updateUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        cat: this.cat === 'general' ? null : this.cat, team: this.team === 'all' ? null : this.team,
        engine: this.engine === 'all' ? null : this.engine, view: this.view === 'settings' ? 'settings' : null
      },
      queryParamsHandling: 'merge', replaceUrl: true
    });
  }

  // ---------- Club category ----------

  /** The clubs that have CLUB tests, most tests first ("Zero · 3 / 20"). */
  get clubChoices(): ClubChoice[] {
    const clubs = new Map<string, ClubChoice>();
    for (const test of (this.board?.tests || []).filter(t => this.isClub(t) && t.teamId != null)) {
      const key = String(test.teamId);
      const known = clubs.get(key);
      if (known) { known.count++; continue; }
      const name = test.teamName || `Club ${test.teamId}`;
      const label = this.clubText({ teamId: test.teamId!, name, predictedPosition: test.predictedPosition, leagueSize: test.leagueSize }) || name;
      clubs.set(key, { key, name, label, count: 1 });
    }
    return [...clubs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /** The chosen club of the Club category: the URL's, else the club with most tests. */
  get clubKey(): string | null {
    const choices = this.clubChoices;
    return choices.find(club => club.key === this.team)?.key ?? choices[0]?.key ?? null;
  }

  get clubName(): string | null {
    const key = this.clubKey;
    return this.clubChoices.find(club => club.key === key)?.name ?? null;
  }

  seasonsCount(test: ArenaTestSummary): number | null {
    return test.repeats ?? (test.byClub?.length || null);
  }

  /** Each season run's final league place, in order (null while a run is not done). */
  private seasonPlaces(test: ArenaTestSummary): (number | null)[] {
    return (test.byClub || []).map(run => run.finalPosition ?? null);
  }

  private seasonDlPlaces(test: ArenaTestSummary): (number | null)[] {
    return (test.byClub || []).map(run => run.diamond?.position ?? null);
  }

  private mean(places: (number | null)[]): number | null {
    const known = places.filter((place): place is number => place != null);
    return known.length ? known.reduce((sum, place) => sum + place, 0) / known.length : null;
  }

  private placesTitle(places: (number | null)[]): string | null {
    return places.some(place => place != null) ? places.map(place => place ?? '—').join(' · ') : null;
  }

  // ---------- tactic settings ----------

  /** The test's value of a settings column; the formation falls back to the test's own. */
  settingValue(test: ArenaTestSummary, key: ArenaSettingKey): string | null {
    const value = test.settings?.[key];
    if (value != null && value !== '') return value;
    return key === 'tactic' ? test.formation || null : null;
  }

  settingText(key: ArenaSettingKey, value: string | null | undefined): string {
    if (value == null || value === '') return '—';
    return key === 'tactic' ? formationLabel(value) : value;
  }

  private defaultOf(key: ArenaSettingKey): string | undefined {
    return ARENA_SETTING_COLUMNS.find(col => col.key === key)?.defaultValue;
  }

  isDefault(test: ArenaTestSummary, key: ArenaSettingKey): boolean {
    const value = this.settingValue(test, key);
    return value == null || value === this.defaultOf(key);
  }

  isChanged(test: ArenaTestSummary, key: ArenaSettingKey): boolean {
    const value = this.settingValue(test, key);
    return value != null && value !== this.defaultOf(key);
  }

  /** The values of a column present in the scope's rows (plus the active one), default first. */
  filterOptions(key: ArenaSettingKey): string[] {
    const values = new Set<string>();
    for (const test of this.scopeTests) {
      const value = this.settingValue(test, key);
      if (value != null) values.add(value);
    }
    const active = this.filters[key];
    if (active) values.add(active);
    const def = this.defaultOf(key);
    return [...values].sort((a, b) => (a === def ? -1 : b === def ? 1 : this.settingText(key, a).localeCompare(this.settingText(key, b))));
  }

  setFilter(key: ArenaSettingKey, value: string): void {
    const next = { ...this.filters };
    if (value) next[key] = value; else delete next[key];
    this.filters = next;
  }

  clearFilters(): void { this.filters = {}; }

  private get activeFilterKeys(): ArenaSettingKey[] {
    return ARENA_SETTING_COLUMNS.map(col => col.key).filter(key => !!this.filters[key]);
  }

  get activeFilters(): { key: ArenaSettingKey; label: string; text: string }[] {
    return ARENA_SETTING_COLUMNS.filter(col => !!this.filters[col.key])
      .map(col => ({ key: col.key, label: col.label, text: this.settingText(col.key, this.filters[col.key]) }));
  }

  // ---------- clubs ----------

  get refs(): string | null { return referenceNames(this.board?.referenceTeams); }
  get diamondNames(): string | null { return referenceNames(this.diamondClubs); }

  /** The reference club of a tier: by its `tier`, else by position (top, mid, bottom). */
  private refTeam(tier: ArenaTier): ArenaReferenceTeam | null {
    const teams = this.board?.referenceTeams || [];
    const tagged = teams.find(team => team.tier === tier);
    if (tagged) return tagged;
    return teams.every(team => !team.tier) ? teams[ARENA_TIERS.indexOf(tier)] || null : null;
  }

  /** The Diamond League clubs: from the response, else gathered from the tests' per-club results. */
  private get diamondClubs(): ArenaReferenceTeam[] {
    if (this.board?.diamondTeams?.length) return this.board.diamondTeams;
    const clubs = new Map<number, ArenaReferenceTeam>();
    for (const test of this.board?.tests || []) {
      for (const club of test.byClub || []) {
        if (!clubs.has(club.teamId)) {
          clubs.set(club.teamId, { teamId: club.teamId, name: club.teamName, predictedPosition: club.predictedPosition, leagueSize: club.leagueSize });
        }
      }
    }
    return [...clubs.values()];
  }

  private clubText(team: ArenaReferenceTeam | null): string | null {
    const name = team?.name || team?.teamName;
    if (!name) return null;
    return team?.predictedPosition != null ? `${name} · ${predictionLabel(team.predictedPosition, team.leagueSize)}` : name;
  }

  get teamOptions(): TeamOption[] {
    if (this.cat === 'diamond') {
      return [
        { key: 'all', label: `All ${this.diamondClubs.length || 8} clubs` },
        ...this.diamondClubs.filter(team => team.teamId != null)
          .map(team => ({ key: String(team.teamId), label: this.clubText(team) || `Club ${team.teamId}` }))
      ];
    }
    const option = (key: string, tier: ArenaTier): TeamOption => {
      const club = this.clubText(this.refTeam(tier));
      return { key, label: club ? `${TIER_TITLES[tier]} — ${club}` : TIER_TITLES[tier] };
    };
    return [{ key: 'all', label: 'All reference clubs' }, option('top', 'TOP'), option('mid', 'MID'), option('bottom', 'BOTTOM')];
  }

  // ---------- figures ----------

  /** The figures shown for a test: the category average, or one club's own run. */
  private splitOf(test: ArenaTestSummary, team: string, split: Split): ArenaSplit | null {
    // Club category: always the mean of the season runs.
    if (team === 'all' || this.cat === 'club') return test.results ? test.results[split] : null;
    if (this.cat === 'diamond') {
      return (test.byClub || []).find(club => String(club.teamId) === team)?.results?.[split] || null;
    }
    const tier = TEAM_TIER[team];
    return tier ? test.byTier?.[tier]?.results?.[split] || null : null;
  }

  row(test: ArenaTestSummary): ArenaSplit | null { return this.splitOf(test, this.team, this.split); }

  /** Diamond League figures for the chosen team view (the average, or one club's run). */
  private diamondOf(test: ArenaTestSummary, team: string, split: Split): ArenaSplit | null {
    if (team === 'all' || this.cat === 'club') return test.diamond?.[split] || null;
    if (this.cat === 'diamond') {
      return (test.byClub || []).find(club => String(club.teamId) === team)?.diamond?.[split] || null;
    }
    const tier = TEAM_TIER[team];
    return tier ? test.byTier?.[tier]?.diamond?.[split] || null : null;
  }

  diamondRow(test: ArenaTestSummary): ArenaSplit | null { return this.diamondOf(test, this.team, this.split); }

  // ---------- final places ----------

  /** The chosen club's entry (null with "All"). */
  private entry(test: ArenaTestSummary, team = this.team): ClubEntry | null {
    if (team === 'all' || this.cat === 'club') return null;
    if (this.cat === 'diamond') return (test.byClub || []).find(club => String(club.teamId) === team) || null;
    const tier = TEAM_TIER[team];
    return tier ? test.byTier?.[tier] || null : null;
  }

  /** The prediction of a club entry: its own, else the reference club's of that tier. */
  private entryPrediction(entry: ClubEntry | null, team = this.team): number | null {
    if (!entry) return null;
    if (entry.predictedPosition != null) return entry.predictedPosition;
    const tier = TEAM_TIER[team];
    return tier ? this.refTeam(tier)?.predictedPosition ?? null : null;
  }

  /** General + All: the three reference clubs' places, top · mid · bottom. */
  private tierPlaces(test: ArenaTestSummary): (number | null)[] {
    return ARENA_TIERS.map(tier => test.byTier?.[tier]?.finalPosition ?? null);
  }

  leaguePosText(test: ArenaTestSummary): string {
    if (this.cat === 'club') {
      const mean = this.mean(this.seasonPlaces(test));
      return mean == null ? '—' : mean.toFixed(1);
    }
    if (this.team === 'all') {
      const places = this.tierPlaces(test);
      return places.some(place => place != null) ? places.map(place => place ?? '—').join(' · ') : '—';
    }
    const entry = this.entry(test);
    if (entry?.finalPosition == null) return '—';
    return entry.finalLeagueSize ? `${entry.finalPosition} / ${entry.finalLeagueSize}` : `${entry.finalPosition}`;
  }

  /** Sort value: the club's place, or the average of the three reference places. */
  private leaguePosValue(test: ArenaTestSummary): number | null {
    if (this.cat === 'club') return this.mean(this.seasonPlaces(test));
    if (this.team === 'all') {
      const places = this.tierPlaces(test).filter((place): place is number => place != null);
      return places.length ? places.reduce((sum, place) => sum + place, 0) / places.length : null;
    }
    return this.entry(test)?.finalPosition ?? null;
  }

  /** > 0: finished above the media prediction, < 0: below (one club only). */
  leagueDelta(test: ArenaTestSummary): number {
    if (this.cat === 'club') {
      const mean = this.mean(this.seasonPlaces(test));
      return mean == null || test.predictedPosition == null ? 0 : test.predictedPosition - mean;
    }
    const entry = this.entry(test);
    const predicted = this.entryPrediction(entry);
    if (entry?.finalPosition == null || predicted == null) return 0;
    return predicted - entry.finalPosition;
  }

  leagueDeltaTitle(test: ArenaTestSummary): string | null {
    const delta = this.leagueDelta(test);
    if (!delta) return null;
    const places = this.cat === 'club' ? Math.abs(delta).toFixed(1) : `${Math.abs(delta)}`;
    return delta > 0 ? `${places} place(s) above the media prediction` : `${places} place(s) below the media prediction`;
  }

  /** League pos cell title: the Club category lists each season's place ("3 · 5 · 5"). */
  leaguePosTitle(test: ArenaTestSummary): string | null {
    const delta = this.leagueDeltaTitle(test);
    if (this.cat !== 'club') return delta;
    const places = this.placesTitle(this.seasonPlaces(test));
    if (!places) return delta;
    const size = (test.byClub || []).find(run => run.finalLeagueSize)?.finalLeagueSize ?? test.leagueSize;
    const line = `Season places: ${places}${size ? ' (of ' + size + ')' : ''}`;
    return delta ? `${line}\n${delta}` : line;
  }

  dlPosTitle(test: ArenaTestSummary): string | null {
    if (this.cat !== 'club') return null;
    const places = this.placesTitle(this.seasonDlPlaces(test));
    return places ? `Season places: ${places}` : null;
  }

  /** Diamond League entry for "DL pos": the chosen club, or the top club with "All" (General). */
  private dlEntry(test: ArenaTestSummary): ClubEntry | null {
    if (this.team === 'all') return this.cat === 'general' ? test.byTier?.TOP || null : null;
    return this.entry(test);
  }

  private dlEntryPosition(test: ArenaTestSummary): number | null {
    if (this.cat === 'club') return this.mean(this.seasonDlPlaces(test));
    return this.dlEntry(test)?.diamond?.position ?? null;
  }

  dlPosText(test: ArenaTestSummary): string {
    if (this.cat === 'club') {
      const mean = this.mean(this.seasonDlPlaces(test));
      return mean == null ? '—' : mean.toFixed(1);
    }
    const diamond = this.dlEntry(test)?.diamond;
    if (diamond?.position == null) return '—';
    return diamond.of ? `${diamond.position} / ${diamond.of}` : `${diamond.position}`;
  }

  /** "League pos": not for "All 8 clubs" (too many places); only when some test has places. */
  get showLeaguePos(): boolean {
    if (this.cat === 'club') return this.scopeTests.some(test => this.seasonPlaces(test).some(place => place != null));
    if (this.cat === 'diamond' && this.team === 'all') return false;
    return this.scopeTests.some(test => this.team === 'all'
      ? this.tierPlaces(test).some(place => place != null)
      : this.entry(test)?.finalPosition != null);
  }

  /** "DL pos": not for "All 8 clubs" (they all play each other); only when some test has it. */
  get showDlPos(): boolean {
    if (this.cat === 'diamond' && this.team === 'all') return false;
    return this.scopeTests.some(test => this.dlEntryPosition(test) != null);
  }

  get columnCount(): number {
    if (this.view === 'settings') {
      return 3 + this.settingColumns.length + 2 + (this.cat === 'club' && this.showLeaguePos ? 1 : 0);
    }
    return this.numericColumns.length + 7 + (this.cat === 'club' ? 1 : 0)
      + [this.showLeaguePos, this.showDiamond, this.showDlPos].filter(Boolean).length;
  }

  /** The Diamond League column only appears when a test of the category has Diamond League figures. */
  get showDiamond(): boolean {
    return this.scopeTests.some(test => !!test.diamond
      || Object.values(test.byTier || {}).some(entry => !!entry?.diamond)
      || (test.byClub || []).some(club => !!club.diamond));
  }

  /** Best tactic of the category and for each of its clubs; ties broken by goal difference. */
  get bestCards(): BestCard[] {
    const pick = (team: string, diamond = false) => {
      let best: { test: ArenaTestSummary; split: ArenaSplit } | null = null;
      for (const test of this.visibleTests) {
        const value = diamond ? this.diamondOf(test, team, 'overall') : this.splitOf(test, team, 'overall');
        if (!value) continue;
        const a = pointsPct(value) ?? value.pts;
        const b = best ? pointsPct(best.split) ?? best.split.pts : -Infinity;
        if (!best || a > b || (a === b && value.gd > best.split.gd)) best = { test, split: value };
      }
      return best;
    };
    const card = (title: string, club: string | null, team: string, diamond = false): BestCard => {
      const best = pick(team, diamond);
      return { title, club, test: best?.test || null, split: best?.split || null };
    };
    const diamondCard = this.showDiamond ? [card('Best in the Diamond League', null, 'all', true)] : [];
    if (this.cat === 'club') {
      const key = this.clubKey;
      const club = this.clubChoices.find(choice => choice.key === key);
      return [card(club ? `Best for ${club.name}` : 'Best for the club', club?.label ?? null, 'all'), ...diamondCard];
    }
    if (this.cat === 'diamond') {
      return [
        card(`Best overall (${this.diamondClubs.length || 8} clubs)`, null, 'all'),
        ...this.diamondClubs.filter(team => team.teamId != null)
          .map(team => card(`Best for ${team.name || team.teamName || 'club ' + team.teamId}`,
            team.predictedPosition != null ? `prediction ${predictionLabel(team.predictedPosition, team.leagueSize)}` : null,
            String(team.teamId))),
        ...diamondCard
      ];
    }
    return [
      card('Best overall', this.refs, 'all'),
      card('Best for a top club', this.clubText(this.refTeam('TOP')), 'top'),
      card('Best for a mid-table club', this.clubText(this.refTeam('MID')), 'mid'),
      card('Best for a bottom club', this.clubText(this.refTeam('BOTTOM')), 'bottom'),
      ...diamondCard
    ];
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) this.sortDesc = !this.sortDesc;
    // Places sort best (lowest) first; goals against too.
    else { this.sortKey = key; this.sortDesc = !['ga', 'xga', 'leaguePos', 'dlPos'].includes(key); }
  }

  get sortedTests(): ArenaTestSummary[] {
    const tests = [...this.visibleTests];
    const value = (test: ArenaTestSummary): number | null => {
      if (this.sortKey === 'uploaded') return Date.parse(test.finishedAt || test.createdAt) || 0;
      if (this.sortKey === 'leaguePos') return this.leaguePosValue(test);
      if (this.sortKey === 'dlPos') return this.dlEntryPosition(test);
      if (this.sortKey === 'diamond') {
        const diamond = this.diamondRow(test);
        return diamond ? pointsPct(diamond) ?? diamond.pts : null;
      }
      const split = this.row(test);
      if (!split) return null;
      // Points sort by share of the maximum, so seasons of different length compare fairly.
      if (this.sortKey === 'pts') return pointsPct(split) ?? split.pts;
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
