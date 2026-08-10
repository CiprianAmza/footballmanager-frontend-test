import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CompetitionIntelligenceService, CompetitionPrizeView, PrizeMoneyOverview } from '../services/competition-intelligence.service';
import { TeamService } from '../services/team.service';

@Component({ selector: 'app-competition-money', templateUrl: './competition-money.component.html', styleUrls: ['../coefficients-lab.css'] })
export class CompetitionMoneyComponent implements OnInit, OnDestroy {
  data?: PrizeMoneyOverview; loading = true; error = ''; scope = 'ALL'; selected?: CompetitionPrizeView;
  private subscription?: Subscription; private loadedSeason = -1; private requestId = 0;
  constructor(private intelligence: CompetitionIntelligenceService, private team: TeamService) {}
  ngOnInit(): void { this.subscription = this.team.currentSeason$.subscribe(season => { if (season && season !== this.loadedSeason) this.load(season); }); }
  ngOnDestroy(): void { this.subscription?.unsubscribe(); }
  load(season: number): void { const requestId = ++this.requestId; this.loadedSeason = season; this.loading = true; this.error = ''; this.intelligence.loadPrizeMoney(season).subscribe({ next: data => { if (requestId !== this.requestId) return; this.data = data; this.selected = this.visible[0] || data.competitions[0]; this.loading = false; }, error: () => { if (requestId !== this.requestId) return; this.error = 'The global prize-money ledger could not be loaded.'; this.loading = false; } }); }
  get visible(): CompetitionPrizeView[] { return (this.data?.competitions || []).filter(row => this.scope === 'ALL' || row.scope === this.scope); }
  setScope(scope: string): void { this.scope = scope; this.selected = this.visible[0]; }
  money(value: number): string { const abs = Math.abs(value || 0); if (abs >= 1e9) return `€${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}bn`; if (abs >= 1e6) return `€${(value / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}m`; if (abs >= 1e3) return `€${(value / 1e3).toFixed(0)}k`; return `€${value || 0}`; }
  progress(row: CompetitionPrizeView): number { return Math.min(100, row.paidToDate / Math.max(row.poolMaximum, 1) * 100); }
  label(value: string): string { return value.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()); }
}
