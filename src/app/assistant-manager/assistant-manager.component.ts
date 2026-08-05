import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { bindTabToUrl, navigateToTab } from '../shared/url-tab-state';

@Component({
  selector: 'app-assistant-manager',
  templateUrl: './assistant-manager.component.html',
  styleUrls: ['./assistant-manager.component.css']
})
export class AssistantManagerComponent implements OnInit, OnDestroy {

  private tabSub?: Subscription;
  private readonly tabs = ['performance', 'briefing', 'formation', 'concerns', 'opponent', 'transfers'];

  teamId!: number;
  activeTab: string = 'performance';

  // Opta-style season review. Each section can fail independently so older
  // saves still show every metric their schema supports.
  performance: any = null;
  performanceInsights: Array<{ tone: string; title: string; evidence: string; action: string; confidence: string }> = [];
  loadingPerformance = false;
  performanceError = '';

  // Pre-match briefing
  briefing: any = null;
  loadingBriefing: boolean = false;
  opponentTeamId: number | null = null;

  // Formation suggestion
  formationSuggestion: any = null;
  loadingFormation: boolean = false;

  // Lineup concerns
  lineupConcerns: any = null;
  loadingConcerns: boolean = false;

  // Opponent analysis
  opponentAnalysis: any = null;
  loadingOpponent: boolean = false;
  opponentIdForAnalysis: number | null = null;

  // Transfer needs
  transferNeeds: any = null;
  loadingTransferNeeds: boolean = false;

  // Next opponent (from fixtures)
  nextOpponentId: number | null = null;
  nextOpponentName: string = '';

  constructor(private http: HttpClient, public teamService: TeamService,
              private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.tabSub = bindTabToUrl(this.route, this.tabs, 'performance', tab => this.activateTab(tab));
    this.teamId = this.teamService.teamId;
    this.loadNextOpponent();
    this.loadPerformance();
    this.loadFormationSuggestion();
    this.loadLineupConcerns();
  }

  setTab(tab: string): void {
    void navigateToTab(this.router, this.route, this.tabs, 'performance', tab);
  }

  ngOnDestroy(): void {
    this.tabSub?.unsubscribe();
  }

  private activateTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'performance' && !this.performance && !this.loadingPerformance) {
      this.loadPerformance();
    }
    if (tab === 'briefing' && !this.briefing && this.nextOpponentId) {
      this.loadPreMatchBriefing();
    }
    if (tab === 'formation' && !this.formationSuggestion) {
      this.loadFormationSuggestion();
    }
    if (tab === 'concerns' && !this.lineupConcerns) {
      this.loadLineupConcerns();
    }
    if (tab === 'transfers' && !this.transferNeeds) {
      this.loadTransferNeeds();
    }
  }

  loadPerformance(): void {
    const season = this.teamService.currentSeason;
    if (!this.teamId || !season) return;
    const base = urlApp + `/stats/team/${this.teamId}/season/${season}`;
    this.loadingPerformance = true;
    this.performanceError = '';
    forkJoin({
      underlying: this.http.get<any>(`${base}/underlying-performance`).pipe(catchError(() => of(null))),
      shots: this.http.get<any>(`${base}/shot-creation`).pipe(catchError(() => of(null))),
      progression: this.http.get<any>(`${base}/possession-progression`).pipe(catchError(() => of(null))),
      pressing: this.http.get<any>(`${base}/pressing-defence`).pipe(catchError(() => of(null))),
      setPieces: this.http.get<any>(`${base}/set-pieces`).pipe(catchError(() => of(null)))
    }).subscribe({
      next: data => {
        this.performance = data;
        this.performanceInsights = this.buildPerformanceInsights(data);
        this.loadingPerformance = false;
        if (!Object.values(data).some(Boolean)) this.performanceError = 'No statistical report could be loaded.';
      },
      error: () => {
        this.performance = null;
        this.performanceInsights = [];
        this.performanceError = 'The assistant could not prepare the statistical report.';
        this.loadingPerformance = false;
      }
    });
  }

  private buildPerformanceInsights(data: any): Array<{ tone: string; title: string; evidence: string; action: string; confidence: string }> {
    const insights: Array<{ tone: string; title: string; evidence: string; action: string; confidence: string }> = [];
    const u = data?.underlying;
    const p = data?.pressing;
    const progression = data?.progression;
    const sp = data?.setPieces;
    if (!u?.matches) {
      return [{ tone: 'info', title: 'Awaiting match evidence', evidence: 'No completed matches are available for this season.', action: 'Revisit the report after the first competitive fixture.', confidence: 'LOW' }];
    }
    if (u.xgDifferencePer90 >= 0.3) {
      insights.push({ tone: 'positive', title: 'The process is producing an advantage', evidence: `We create ${this.signed(u.xgDifferencePer90)} xG more than we allow per match.`, action: 'Protect the current chance-quality advantage before changing the system.', confidence: u.confidence });
    } else if (u.xgDifferencePer90 <= -0.3) {
      insights.push({ tone: 'risk', title: 'Opponents are creating the better chances', evidence: `Our xG difference is ${this.signed(u.xgDifferencePer90)} per match.`, action: 'Reduce conceded box entries and review the locations of shots against.', confidence: u.confidence });
    }
    if (u.pointsDelta >= 3) {
      insights.push({ tone: 'watch', title: 'Results are ahead of performance', evidence: `${u.actualPoints} points versus ${u.expectedPoints} expected points.`, action: 'Do not rely on the current finishing and result variance being permanent.', confidence: u.confidence });
    } else if (u.pointsDelta <= -3) {
      insights.push({ tone: 'opportunity', title: 'Results undersell the performances', evidence: `${u.actualPoints} points versus ${u.expectedPoints} expected points.`, action: 'Keep the underlying process stable and focus on execution in both boxes.', confidence: u.confidence });
    }
    if (u.conversionDeltaPercentagePoints <= -2) {
      insights.push({ tone: 'opportunity', title: 'Finishing is costing goals', evidence: `Conversion is ${Math.abs(u.conversionDeltaPercentagePoints).toFixed(1)} percentage points below the chance model.`, action: 'Prioritise finishing work and improve shot selection rather than chasing volume alone.', confidence: u.confidence });
    }
    if (progression?.matches >= 3 && progression.averages?.finalThirdToBoxPercentage < 35) {
      insights.push({ tone: 'watch', title: 'Progression stalls before the box', evidence: `Only ${progression.averages.finalThirdToBoxPercentage}% of final-third entries become box entries.`, action: 'Add between-the-lines support, overlaps or a more direct final pass.', confidence: 'MEDIUM' });
    }
    if (p?.matches >= 3 && p.averages?.pressureSuccessPercentage < 35) {
      insights.push({ tone: 'risk', title: 'The press is not converting pressure', evidence: `${p.averages.pressureSuccessPercentage}% of modelled pressures are successful.`, action: 'Compact the pressing unit before increasing intensity.', confidence: 'MEDIUM' });
    }
    if (sp?.matches >= 3 && sp.summary?.setPieceShareOfTotalXgaPercentage >= 25) {
      insights.push({ tone: 'risk', title: 'Set pieces account for too much danger', evidence: `${sp.summary.setPieceShareOfTotalXgaPercentage}% of xGA comes from set plays.`, action: sp.insights?.[0]?.recommendation || 'Review marking responsibilities and second-ball structure.', confidence: 'MEDIUM' });
    }
    if (!insights.length) {
      insights.push({ tone: 'info', title: 'No major statistical deviation', evidence: 'The current indicators are close to the team baseline.', action: 'Use the opponent report for the next match-specific adjustment.', confidence: u.confidence || 'LOW' });
    }
    return insights.slice(0, 5);
  }

  loadNextOpponent(): void {
    const season = this.teamService.currentSeason;
    this.http.get<any[]>(urlApp + `/match/calendar/${this.teamId}/${season}`).subscribe({
      next: (entries) => {
        const upcoming = entries.find(e => e.status === 'upcoming');
        if (upcoming) {
          this.nextOpponentId = upcoming.opponentTeamId;
          this.nextOpponentName = upcoming.opponentTeamName;
          this.opponentIdForAnalysis = upcoming.opponentTeamId;
          this.loadPreMatchBriefing();
        }
      },
      error: () => {}
    });
  }

  loadPreMatchBriefing(): void {
    if (!this.nextOpponentId) return;
    this.loadingBriefing = true;
    this.http.get<any>(urlApp + `/assistant/preMatchBriefing/${this.teamId}/${this.nextOpponentId}`).subscribe({
      next: (data) => { this.briefing = data; this.loadingBriefing = false; },
      error: () => { this.briefing = null; this.loadingBriefing = false; }
    });
  }

  loadFormationSuggestion(): void {
    this.loadingFormation = true;
    this.http.get<any>(urlApp + `/assistant/suggestFormation/${this.teamId}`).subscribe({
      next: (data) => { this.formationSuggestion = data; this.loadingFormation = false; },
      error: () => { this.formationSuggestion = null; this.loadingFormation = false; }
    });
  }

  loadLineupConcerns(): void {
    this.loadingConcerns = true;
    this.http.get<any>(urlApp + `/assistant/lineupConcerns/${this.teamId}`).subscribe({
      next: (data) => { this.lineupConcerns = data; this.loadingConcerns = false; },
      error: () => { this.lineupConcerns = null; this.loadingConcerns = false; }
    });
  }

  loadOpponentAnalysis(): void {
    if (!this.opponentIdForAnalysis) return;
    this.loadingOpponent = true;
    this.http.get<any>(urlApp + `/assistant/analyzeOpponent/${this.teamId}/${this.opponentIdForAnalysis}`).subscribe({
      next: (data) => { this.opponentAnalysis = data; this.loadingOpponent = false; },
      error: () => { this.opponentAnalysis = null; this.loadingOpponent = false; }
    });
  }

  loadTransferNeeds(): void {
    this.loadingTransferNeeds = true;
    this.http.get<any>(urlApp + `/assistant/transferNeeds/${this.teamId}`).subscribe({
      next: (data) => { this.transferNeeds = data; this.loadingTransferNeeds = false; },
      error: () => { this.transferNeeds = null; this.loadingTransferNeeds = false; }
    });
  }

  getStrengthClass(strength: string): string {
    switch (strength) {
      case 'VERY_STRONG': return 'str-very-strong';
      case 'STRONG': return 'str-strong';
      case 'AVERAGE': return 'str-average';
      case 'WEAK': return 'str-weak';
      default: return '';
    }
  }

  getConcernIcon(type: string): string {
    switch ((type || '').toUpperCase()) {
      case 'INJURED': return '\uD83C\uDFE5';
      case 'LOW_MORALE': return '\uD83D\uDE1E';
      case 'LOW_FITNESS': return '\uD83C\uDFCB\uFE0F';
      case 'CONTRACT_EXPIRING': return '\uD83D\uDCDD';
      case 'WANTS_TRANSFER': return '\uD83D\uDCE4';
      default: return '\u26A0\uFE0F';
    }
  }

  signed(value: number | null | undefined): string {
    const safe = Number(value || 0);
    return `${safe > 0 ? '+' : ''}${safe.toFixed(2)}`;
  }

  ratioPercent(numerator: number | null | undefined, denominator: number | null | undefined): number {
    const top = Number(numerator || 0);
    const bottom = Number(denominator || 0);
    return bottom > 0 ? Math.round(top * 1000 / bottom) / 10 : 0;
  }

  take(values: unknown, limit: number): any[] {
    return Array.isArray(values) ? values.slice(0, limit) : [];
  }

  tone(value: number | null | undefined, inverse = false): string {
    const safe = Number(value || 0);
    if (Math.abs(safe) < 0.01) return 'neutral';
    const positive = inverse ? safe < 0 : safe > 0;
    return positive ? 'good' : 'bad';
  }

  getConcernSeverityClass(severity: string): string {
    switch (severity) {
      case 'HIGH': return 'severity-high';
      case 'MEDIUM': return 'severity-medium';
      case 'LOW': return 'severity-low';
      default: return '';
    }
  }
}
