import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MarketService } from '../services/market.service';
import { AdviserDashboardView, MarketApiError, MarketTradeView, PortfolioPositionView, PortfolioView } from './market.models';

@Component({ selector: 'app-portfolio', templateUrl: './portfolio.component.html', styleUrls: ['./portfolio.component.css'] })
export class PortfolioComponent implements OnInit {
  portfolio: PortfolioView | null = null;
  trades: MarketTradeView[] = [];
  adviser: AdviserDashboardView | null = null;
  loading = true;
  error = '';
  flagOff = false;
  positionFilter: 'ALL' | 'CLUB' | 'COMPANY' = 'ALL';
  positionSort: 'VALUE' | 'RETURN' | 'NAME' = 'VALUE';
  tradePage = 0;
  totalTrades = 0;
  loadingMoreTrades = false;
  tradeError = '';
  showAllTrades = false;

  constructor(private market: MarketService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.flagOff = false;
    forkJoin({
      portfolio: this.market.portfolio(),
      trades: this.market.trades(),
      adviser: this.market.adviserDashboard()
    }).subscribe({
      next: result => {
        this.portfolio = result.portfolio;
        this.trades = result.trades.content;
        this.tradePage = result.trades.page;
        this.totalTrades = result.trades.totalElements;
        this.showAllTrades = false;
        this.adviser = result.adviser;
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        const apiError = this.readError(error);
        if (apiError?.code === 'CHAIRMAN_FEATURE_DISABLED') {
          this.flagOff = true;
          this.error = apiError.message;
          return;
        }
        this.error = apiError?.message || 'Portfolio could not be loaded.';
      }
    });
  }

  get totalWealth(): number {
    return (this.portfolio?.marketValue?.amount || 0) + (this.portfolio?.cashBalance?.amount || 0);
  }

  get cashShare(): number {
    return this.totalWealth > 0 ? ((this.portfolio?.cashBalance?.amount || 0) / this.totalWealth) * 100 : 0;
  }

  get investedShare(): number { return this.totalWealth > 0 ? 100 - this.cashShare : 0; }

  get unrealizedReturnPercent(): number {
    const basis = this.portfolio?.totalCostBasis?.amount || 0;
    return basis > 0 ? ((this.portfolio?.unrealizedGain?.amount || 0) / basis) * 100 : 0;
  }

  get visiblePositions(): PortfolioPositionView[] {
    const positions = (this.portfolio?.positions || [])
      .filter(position => this.positionFilter === 'ALL' || position.type === this.positionFilter);
    return positions.sort((a, b) => {
      if (this.positionSort === 'NAME') return a.name.localeCompare(b.name);
      if (this.positionSort === 'RETURN') return this.positionReturnPercent(b) - this.positionReturnPercent(a);
      return b.marketValue.amount - a.marketValue.amount;
    });
  }

  get displayedTrades(): MarketTradeView[] {
    return this.showAllTrades ? this.trades : this.trades.slice(0, 8);
  }

  positionReturnPercent(position: PortfolioPositionView): number {
    return position.costBasis.amount > 0
      ? position.unrealizedGain.amount / position.costBasis.amount * 100 : 0;
  }

  positionWeightPercent(position: PortfolioPositionView): number {
    const value = this.portfolio?.marketValue?.amount || 0;
    return value > 0 ? position.marketValue.amount / value * 100 : 0;
  }

  loadMoreTrades(): void {
    if (this.loadingMoreTrades || this.trades.length >= this.totalTrades) return;
    this.loadingMoreTrades = true;
    this.tradeError = '';
    this.market.trades(this.tradePage + 1, 50).subscribe({
      next: page => {
        this.trades = [...this.trades, ...page.content];
        this.tradePage = page.page;
        this.totalTrades = page.totalElements;
        this.loadingMoreTrades = false;
      },
      error: () => {
        this.loadingMoreTrades = false;
        this.tradeError = 'Older trades could not be loaded.';
      }
    });
  }

  money(value: number): string { return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value) + ' EUR'; }
  signedMoney(value: number): string { return (value > 0 ? '+' : '') + this.money(value); }
  riskLabel(value: string): string { return value.replaceAll('_', ' ').toLowerCase(); }

  private readError(error: any): MarketApiError | null {
    if (error?.error?.code && error?.error?.message) return error.error as MarketApiError;
    return null;
  }
}
