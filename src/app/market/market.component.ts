import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { MarketService } from '../services/market.service';
import { MarketInstrumentView, MarketPriceView, MarketTradeSide } from './market.models';

@Component({ selector: 'app-market', templateUrl: './market.component.html', styleUrls: ['./market.component.css'] })
export class MarketComponent implements OnInit {
  instruments: MarketInstrumentView[] = [];
  history: MarketPriceView[] = [];
  selected: MarketInstrumentView | null = null;
  quantities: Record<number, number> = {};
  busy = false;
  loading = true;
  error = '';
  message = '';
  private readonly pendingKeys = new Map<string, string>();

  constructor(private market: MarketService) {}
  ngOnInit(): void { this.load(); }

  load(): void {
    this.market.instruments().subscribe({
      next: rows => {
        this.instruments = rows;
        rows.forEach(row => this.quantities[row.id] ||= 1);
        this.loading = false;
      },
      error: error => { this.error = error?.error?.message || 'Market could not be loaded.'; this.loading = false; }
    });
  }
  showHistory(instrument: MarketInstrumentView): void {
    this.selected = instrument;
    this.market.history(instrument.id).subscribe({
      next: rows => this.history = rows,
      error: error => this.error = error?.error?.message || 'Price history could not be loaded.'
    });
  }
  execute(instrument: MarketInstrumentView, side: MarketTradeSide): void {
    const quantity = Math.floor(this.quantities[instrument.id] || 0);
    if (this.busy || quantity <= 0) return;
    this.error = ''; this.message = ''; this.busy = true;
    const operation = `${instrument.id}:${side}:${quantity}`;
    const idempotencyKey = this.pendingKeys.get(operation) || this.newKey(instrument.id, side);
    this.pendingKeys.set(operation, idempotencyKey);
    this.market.trade(instrument.id, side, quantity, idempotencyKey).pipe(
      finalize(() => this.busy = false)
    ).subscribe({
      next: result => {
        this.pendingKeys.delete(operation);
        this.message = `${result.side === 'BUY' ? 'Bought' : 'Sold'} ${result.quantity} ${result.code} shares at ${this.money(result.unitPrice.amount)}.`;
        this.load();
      },
      error: error => this.error = error?.error?.message || 'Trade failed. Retry uses the same safe key.'
    });
  }
  money(value: number): string { return new Intl.NumberFormat('en-GB').format(value) + ' EUR'; }
  trackInstrument(_: number, value: MarketInstrumentView): number { return value.id; }
  private newKey(instrumentId: number, side: MarketTradeSide): string {
    return `market-${instrumentId}-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
