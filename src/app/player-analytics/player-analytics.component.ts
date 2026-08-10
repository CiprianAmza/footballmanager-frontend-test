import { Component, Input, OnDestroy, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { RatingTierService } from '../services/rating-tier.service';
import { TeamService } from '../services/team.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { bindTabToUrl, navigateToTab } from '../shared/url-tab-state';

const ANALYTICS_TABS = ['lab', 'legacy', 'goalkeeper'] as const;
type AnalyticsTab = typeof ANALYTICS_TABS[number];

interface MetricEntry {
  metric: string;
  valuePer90: number;
  percentile: number;
}

interface PlayerAnalyticsView {
  playerId: number;
  playerName: string;
  position: string;
  positionGroup: string;
  competitionId: number;
  seasonNumber: number;
  overall: number;
  sampleAppearances: number;
  peerCount: number;
  metrics: MetricEntry[];
  heatmap: number[][];
}

/**
 * Faza 1 synthetic player analytics — StatsBomb-style percentile bars + a pitch
 * heatmap, all hand-rolled SVG/CSS (no charting deps).
 *
 * Picker reuses the shape of /stats/player/{id}/competitionBreakdown to populate
 * a competition + season selector, then calls
 * /stats/player/{id}/{competitionId}/{season}/analytics.
 */
@Component({
  selector: 'app-player-analytics',
  templateUrl: './player-analytics.component.html',
  styleUrls: ['./player-analytics.component.css']
})
export class PlayerAnalyticsComponent implements OnInit, OnChanges, OnDestroy {

  private tabSub?: Subscription;

  @Input() playerId!: number;

  // Picker state
  competitions: { competitionId: number; competitionName: string }[] = [];
  seasons: number[] = [];
  selectedCompetitionId?: number;
  selectedSeason?: number;

  // Result
  analytics?: PlayerAnalyticsView;
  loading = false;
  loadingPicker = false;
  error = '';
  lab?: any;
  goalkeeperHub?: any;
  labLoading = false;
  labError = '';
  goalkeeperError = '';
  analyticsSection: AnalyticsTab = 'lab';

  // Heatmap geometry (SVG units)
  readonly pitchW = 360;
  readonly pitchH = 240;

  constructor(private http: HttpClient, public ratingTier: RatingTierService, private teamService: TeamService,
              private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.tabSub = bindTabToUrl(
      this.route, ANALYTICS_TABS, 'lab', tab => this.analyticsSection = tab, 'analyticsTab'
    );
    this.fetchPicker();
  }

  ngOnDestroy(): void {
    this.tabSub?.unsubscribe();
  }

  setAnalyticsSection(tab: AnalyticsTab): void {
    void navigateToTab(this.router, this.route, ANALYTICS_TABS, 'lab', tab, 'analyticsTab');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['playerId'] && !changes['playerId'].firstChange) {
      this.analytics = undefined;
      this.lab = undefined;
      this.goalkeeperHub = undefined;
      this.fetchPicker();
    }
  }

  private fetchPicker(): void {
    if (!this.playerId) return;
    this.loadingPicker = true;
    this.http.get<any>(urlApp + `/stats/player/${this.playerId}/competitionBreakdown`).subscribe({
      next: (data) => {
        const byComp = (data?.byCompetition ?? []) as any[];
        this.competitions = byComp.map(c => ({
          competitionId: c.competitionId,
          competitionName: c.competitionName || ('Competition ' + c.competitionId)
        }));
        const byTypeSeason = (data?.byTypeAndSeason ?? []) as any[];
        const seasonSet = new Set<number>();
        byTypeSeason.forEach(r => { if (r.seasonNumber != null) seasonSet.add(r.seasonNumber); });
        this.seasons = Array.from(seasonSet).sort((a, b) => b - a);

        const currentSeason = Number(this.teamService.currentSeason || 1);
        if (!this.seasons.includes(currentSeason)) {
          this.seasons = [currentSeason, ...this.seasons].sort((a, b) => b - a);
        }

        if (this.competitions.length) this.selectedCompetitionId = this.competitions[0].competitionId;
        if (this.seasons.length) this.selectedSeason = this.seasons[0];
        this.loadingPicker = false;
        this.loadAnalytics();
      },
      error: () => {
        this.loadingPicker = false;
        this.error = 'Could not load competition list.';
        this.selectedSeason = Number(this.teamService.currentSeason || 1);
        this.seasons = [this.selectedSeason];
        this.loadPerformanceLab();
      }
    });
  }

  loadAnalytics(): void {
    this.loadPerformanceLab();
    if (!this.playerId || this.selectedCompetitionId == null || this.selectedSeason == null) return;
    this.loading = true;
    this.error = '';
    this.http.get<PlayerAnalyticsView>(
      urlApp + `/stats/player/${this.playerId}/${this.selectedCompetitionId}/${this.selectedSeason}/analytics`
    ).subscribe({
      next: (data) => { this.analytics = data; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load analytics.'; }
    });
  }

  loadPerformanceLab(): void {
    if (!this.playerId || this.selectedSeason == null) return;
    this.labLoading = true;
    this.labError = '';
    this.goalkeeperError = '';
    this.http.get<any>(urlApp + `/stats/player/${this.playerId}/season/${this.selectedSeason}/performance-lab`).subscribe({
      next: data => {
        this.lab = data;
        this.labLoading = false;
      },
      error: () => {
        this.labLoading = false;
        this.labError = 'The Player Performance Lab could not be loaded.';
      }
    });
    this.http.get<any>(urlApp + `/stats/player/${this.playerId}/season/${this.selectedSeason}/goalkeeper-hub`).subscribe({
      next: data => { this.goalkeeperHub = data; },
      error: () => { this.goalkeeperError = 'The Goalkeeper Hub could not be loaded.'; }
    });
  }

  qualityLabel(value: string): string {
    if (!value) return '';
    if (value.startsWith('OBSERVED')) return 'Observed';
    if (value.startsWith('DERIVED')) return 'Derived';
    if (value.startsWith('INFERRED')) return 'Inferred';
    return 'Modelled';
  }

  resultClass(match: any): string {
    if (match.goalsFor > match.goalsAgainst) return 'win';
    if (match.goalsFor < match.goalsAgainst) return 'loss';
    return 'draw';
  }

  // ---- Display helpers ----

  /** Percentile threshold colors (red / orange / green), StatsBomb-style. */
  percentileColor(pct: number): string {
    if (pct >= 70) return '#27ae60';
    if (pct >= 40) return '#e67e22';
    return '#c0392b';
  }

  badgeColor(): string {
    return this.analytics ? this.ratingTier.tierColor(this.analytics.overall) : '#7f8c8d';
  }

  badgeTier(): string {
    return this.analytics ? this.ratingTier.tierName(this.analytics.overall) : '';
  }

  // Heatmap cell geometry
  cellW(): number { return this.analytics?.heatmap?.[0]?.length ? this.pitchW / this.analytics.heatmap[0].length : 0; }
  cellH(): number { return this.analytics?.heatmap?.length ? this.pitchH / this.analytics.heatmap.length : 0; }

  cellColor(density: number): string {
    // green-to-yellow-to-red heat ramp by density
    const d = Math.max(0, Math.min(1, density));
    const r = Math.round(40 + d * 200);
    const g = Math.round(160 - d * 120);
    const b = Math.round(60 - d * 40);
    return `rgb(${r},${g},${b})`;
  }

  cellOpacity(density: number): number {
    return 0.15 + 0.75 * Math.max(0, Math.min(1, density));
  }

  // Percentile bar width (out of a 100% track)
  barWidthPct(pct: number): number {
    return Math.max(0, Math.min(100, pct));
  }
}
