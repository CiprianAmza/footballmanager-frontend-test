import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MarketService } from '../services/market.service';
import { AdviserDashboardView, MarketApiError, MarketTradeView, PortfolioView } from './market.models';

@Component({ selector: 'app-portfolio', templateUrl: './portfolio.component.html', styleUrls: ['./market.component.css'] })
export class PortfolioComponent implements OnInit {
  portfolio: PortfolioView | null = null;
  trades: MarketTradeView[] = [];
  adviser: AdviserDashboardView | null = null;
  loading = true;
  error = '';
  flagOff = false;

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

  money(value: number): string { return new Intl.NumberFormat('en-GB').format(value) + ' EUR'; }
  riskLabel(value: string): string { return value.replaceAll('_', ' ').toLowerCase(); }

  private readError(error: any): MarketApiError | null {
    if (error?.error?.code && error?.error?.message) return error.error as MarketApiError;
    return null;
  }
}
