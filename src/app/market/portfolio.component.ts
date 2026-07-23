import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MarketService } from '../services/market.service';
import { MarketTradeView, PortfolioView } from './market.models';

@Component({ selector: 'app-portfolio', templateUrl: './portfolio.component.html', styleUrls: ['./market.component.css'] })
export class PortfolioComponent implements OnInit {
  portfolio: PortfolioView | null = null;
  trades: MarketTradeView[] = [];
  loading = true;
  error = '';
  constructor(private market: MarketService) {}
  ngOnInit(): void {
    forkJoin({ portfolio: this.market.portfolio(), trades: this.market.trades() }).subscribe({
      next: result => { this.portfolio = result.portfolio; this.trades = result.trades.content; this.loading = false; },
      error: error => { this.error = error?.error?.message || 'Portfolio could not be loaded.'; this.loading = false; }
    });
  }
  money(value: number): string { return new Intl.NumberFormat('en-GB').format(value) + ' EUR'; }
}
