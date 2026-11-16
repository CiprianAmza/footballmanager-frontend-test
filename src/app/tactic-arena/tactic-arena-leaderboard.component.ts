import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import {
  ARENA_TIERS, ArenaClubResult, ArenaLeaderboard, ArenaReferenceTeam, ArenaSplit, ArenaTestSummary, ArenaTier,
  ArenaTierResult, TacticArenaService,
  formationLabel, isActive, pointsPct, predictionLabel, referenceNames, signed
} from './tactic-arena.service';

type Split = 'overall' | 'home' | 'away';
type Category = 'general' | 'diamond';
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
 * Category and team are kept in the URL (?cat=diamond&team=top|mid|bottom|<teamId>).
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

      <div class="ta-tabs ta-cat-tabs" role="tablist" *ngIf="hasDiamond">
        <button type="button" role="tab" [class.active]="cat === 'general'" [attr.aria-selected]="cat === 'general'"
                (click)="selectCategory('general')">General</button>
        <button type="button" role="tab" [class.active]="cat === 'diamond'" [attr.aria-selected]="cat === 'diamond'"
                (click)="selectCategory('diamond')">Diamond League clubs</button>
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
        <label class="ta-team-pick">
          <span>Team</span>
          <select [value]="team" (change)="selectTeam($any($event.target).value)">
            <option *ngFor="let option of teamOptions" [value]="option.key" [selected]="option.key === team">{{ option.label }}</option>
          </select>
        </label>
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
              <th *ngIf="showLeaguePos" class="sortable" [class.sorted]="sortKey === 'leaguePos'" (click)="sortBy('leaguePos')"
                  [attr.title]="team === 'all' ? 'Final league place of the top · mid-table · bottom club' : 'Final league place / clubs'">
                League pos{{ sortKey === 'leaguePos' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th *ngIf="showDiamond" class="sortable" [class.sorted]="sortKey === 'diamond'" (click)="sortBy('diamond')"
                  title="Diamond League points / maximum">Diamond League{{ sortKey === 'diamond' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
              <th *ngIf="showDlPos" class="sortable" [class.sorted]="sortKey === 'dlPos'" (click)="sortBy('dlPos')"
                  title="Final Diamond League place / clubs">DL pos{{ sortKey === 'dlPos' ? (sortDesc ? ' ▼' : ' ▲') : '' }}</th>
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
              <td class="ta-left">{{ test.teamName || '—' }}
                <span class="ta-small" *ngIf="test.predictedPosition != null" title="Media prediction">· {{ prediction(test.predictedPosition, test.leagueSize) }}</span></td>
              <td class="ta-left">{{ test.leagueName || '—' }}</td>
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
                  [attr.title]="leagueDeltaTitle(test)">{{ leaguePosText(test) }}</td>
              <td *ngIf="showDiamond">
                <ng-container *ngIf="diamondRow(test) as d; else noDiamond">{{ d.pts }} / {{ d.ptsMax }}
                  <span class="ta-small" *ngIf="pct(d) !== null">{{ pct(d) | number:'1.0-0' }}%</span></ng-container>
                <ng-template #noDiamond><span class="ta-muted">—</span></ng-template>
              </td>
              <td *ngIf="showDlPos">{{ dlPosText(test) }}</td>
              <td>{{ (test.finishedAt || test.createdAt) | date:'dd.MM.yyyy' }}</td>
            </tr>
            <tr *ngIf="board && !categoryTests.length">
              <td class="ta-left ta-muted" [attr.colspan]="columnCount">No tactic has been tested in this category yet.</td>
            </tr>
            <tr *ngIf="!board && !error">
              <td class="ta-left ta-muted" [attr.colspan]="columnCount">Loading…</td>
            </tr>
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
      this.cat = params.get('cat') === 'diamond' ? 'diamond' : 'general';
      this.team = params.get('team') || 'all';
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

  get hasDiamond(): boolean {
    return !!this.board?.diamondTeams?.length || (this.board?.tests || []).some(test => this.isDiamond(test));
  }

  get categoryTests(): ArenaTestSummary[] {
    const diamond = this.cat === 'diamond';
    return (this.board?.tests || []).filter(test => this.isDiamond(test) === diamond);
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

  private updateUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { cat: this.cat === 'diamond' ? 'diamond' : null, team: this.team === 'all' ? null : this.team },
      queryParamsHandling: 'merge', replaceUrl: true
    });
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
    if (team === 'all') return test.results ? test.results[split] : null;
    if (this.cat === 'diamond') {
      return (test.byClub || []).find(club => String(club.teamId) === team)?.results?.[split] || null;
    }
    const tier = TEAM_TIER[team];
    return tier ? test.byTier?.[tier]?.results?.[split] || null : null;
  }

  row(test: ArenaTestSummary): ArenaSplit | null { return this.splitOf(test, this.team, this.split); }

  /** Diamond League figures for the chosen team view (the average, or one club's run). */
  private diamondOf(test: ArenaTestSummary, team: string, split: Split): ArenaSplit | null {
    if (team === 'all') return test.diamond?.[split] || null;
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
    if (team === 'all') return null;
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
    if (this.team === 'all') {
      const places = this.tierPlaces(test).filter((place): place is number => place != null);
      return places.length ? places.reduce((sum, place) => sum + place, 0) / places.length : null;
    }
    return this.entry(test)?.finalPosition ?? null;
  }

  /** > 0: finished above the media prediction, < 0: below (one club only). */
  leagueDelta(test: ArenaTestSummary): number {
    const entry = this.entry(test);
    const predicted = this.entryPrediction(entry);
    if (entry?.finalPosition == null || predicted == null) return 0;
    return predicted - entry.finalPosition;
  }

  leagueDeltaTitle(test: ArenaTestSummary): string | null {
    const delta = this.leagueDelta(test);
    if (!delta) return null;
    return delta > 0 ? `${delta} place(s) above the media prediction` : `${-delta} place(s) below the media prediction`;
  }

  /** Diamond League entry for "DL pos": the chosen club, or the top club with "All" (General). */
  private dlEntry(test: ArenaTestSummary): ClubEntry | null {
    if (this.team === 'all') return this.cat === 'general' ? test.byTier?.TOP || null : null;
    return this.entry(test);
  }

  private dlEntryPosition(test: ArenaTestSummary): number | null {
    return this.dlEntry(test)?.diamond?.position ?? null;
  }

  dlPosText(test: ArenaTestSummary): string {
    const diamond = this.dlEntry(test)?.diamond;
    if (diamond?.position == null) return '—';
    return diamond.of ? `${diamond.position} / ${diamond.of}` : `${diamond.position}`;
  }

  /** "League pos": not for "All 8 clubs" (too many places); only when some test has places. */
  get showLeaguePos(): boolean {
    if (this.cat === 'diamond' && this.team === 'all') return false;
    return this.categoryTests.some(test => this.team === 'all'
      ? this.tierPlaces(test).some(place => place != null)
      : this.entry(test)?.finalPosition != null);
  }

  /** "DL pos": not for "All 8 clubs" (they all play each other); only when some test has it. */
  get showDlPos(): boolean {
    if (this.cat === 'diamond' && this.team === 'all') return false;
    return this.categoryTests.some(test => this.dlEntryPosition(test) != null);
  }

  get columnCount(): number {
    return this.numericColumns.length + 6 + [this.showLeaguePos, this.showDiamond, this.showDlPos].filter(Boolean).length;
  }

  /** The Diamond League column only appears when a test of the category has Diamond League figures. */
  get showDiamond(): boolean {
    return this.categoryTests.some(test => !!test.diamond
      || Object.values(test.byTier || {}).some(entry => !!entry?.diamond)
      || (test.byClub || []).some(club => !!club.diamond));
  }

  /** Best tactic of the category and for each of its clubs; ties broken by goal difference. */
  get bestCards(): BestCard[] {
    const pick = (team: string, diamond = false) => {
      let best: { test: ArenaTestSummary; split: ArenaSplit } | null = null;
      for (const test of this.categoryTests) {
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
    const tests = [...this.categoryTests];
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
