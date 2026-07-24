import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MarketService } from '../services/market.service';
import {
  AdviserContractView, AdviserDashboardView, AdviserHireOptionView, AdviceView,
  MarketApiError, MarketInstrumentView, MarketPriceView, MarketRiskClass, MarketTradeSide
} from './market.models';

@Component({ selector: 'app-market', templateUrl: './market.component.html', styleUrls: ['./market.component.css'] })
export class MarketComponent implements OnInit {
  instruments: MarketInstrumentView[] = [];
  history: MarketPriceView[] = [];
  selected: MarketInstrumentView | null = null;
  adviser: AdviserDashboardView | null = null;
  advice: AdviceView | null = null;
  quantities: Record<number, number> = {};
  busy = false;
  loading = true;
  historyLoading = false;
  adviserLoading = true;
  adviceLoading = false;
  error = '';
  historyError = '';
  adviserError = '';
  message = '';
  flagOff = false;
  private readonly pendingKeys = new Map<string, string>();
  private readonly pendingHireKeys = new Map<string, string>();

  constructor(private market: MarketService, private auth: AuthService) {}

  ngOnInit(): void {
    this.load();
    this.loadAdviser();
  }

  get isChairman(): boolean {
    return this.auth.careerRole === 'CHAIRMAN';
  }

  get currentContract(): AdviserContractView | null {
    return this.adviser?.currentContract ?? null;
  }

  get hireOptions(): AdviserHireOptionView[] {
    return this.adviser?.hireOptions ?? [];
  }

  get hasActiveContract(): boolean {
    return this.currentContract?.status === 'ACTIVE';
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.flagOff = false;
    this.market.instruments().subscribe({
      next: rows => {
        this.instruments = rows;
        rows.forEach(row => this.quantities[row.id] ||= 1);
        if (!this.selected || !rows.some(row => row.id === this.selected?.id)) {
          this.selected = rows[0] ?? null;
          if (this.selected) this.showHistory(this.selected);
          else this.history = [];
        }
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.handlePageError(error, 'Market could not be loaded.');
      }
    });
  }

  loadAdviser(): void {
    this.adviserLoading = true;
    this.adviserError = '';
    this.market.adviserDashboard().subscribe({
      next: value => {
        this.adviser = value;
        this.adviserLoading = false;
      },
      error: error => {
        this.adviserLoading = false;
        const apiError = this.readError(error);
        if (apiError?.code === 'REGENT_FEATURE_DISABLED') {
          this.flagOff = true;
          this.adviserError = apiError.message;
          return;
        }
        this.adviserError = apiError?.message || 'Trader adviser panel could not be loaded.';
      }
    });
  }

  showHistory(instrument: MarketInstrumentView): void {
    this.selected = instrument;
    this.historyLoading = true;
    this.historyError = '';
    this.advice = null;
    this.market.history(instrument.id).subscribe({
      next: rows => {
        this.history = rows;
        this.historyLoading = false;
      },
      error: error => {
        this.historyLoading = false;
        this.historyError = this.readError(error)?.message || 'Price history could not be loaded.';
      }
    });
  }

  execute(instrument: MarketInstrumentView, side: MarketTradeSide): void {
    const quantity = Math.floor(this.quantities[instrument.id] || 0);
    if (this.busy || quantity <= 0) return;
    this.error = '';
    this.message = '';
    this.busy = true;
    const operation = `${instrument.id}:${side}:${quantity}`;
    const idempotencyKey = this.pendingKeys.get(operation) || this.newKey(`trade-${instrument.id}-${side}`);
    this.pendingKeys.set(operation, idempotencyKey);
    this.market.trade(instrument.id, side, quantity, idempotencyKey).pipe(
      finalize(() => this.busy = false)
    ).subscribe({
      next: result => {
        this.pendingKeys.delete(operation);
        this.message = `${result.side === 'BUY' ? 'Bought' : 'Sold'} ${result.quantity} ${result.code} shares at ${this.money(result.unitPrice.amount)}.`;
        this.load();
        if (this.selected?.id === instrument.id) this.showHistory(instrument);
      },
      error: error => this.error = this.readError(error)?.message || 'Trade failed. Retry uses the same safe key.'
    });
  }

  hire(option: AdviserHireOptionView): void {
    if (!this.isChairman || this.busy) return;
    this.busy = true;
    this.adviserError = '';
    this.message = '';
    const idempotencyKey = this.pendingHireKeys.get(option.optionCode) || this.newKey(`hire-${option.optionCode}`);
    this.pendingHireKeys.set(option.optionCode, idempotencyKey);
    this.market.hireAdviser(option.optionCode, idempotencyKey).pipe(
      finalize(() => this.busy = false)
    ).subscribe({
      next: contract => {
        this.pendingHireKeys.delete(option.optionCode);
        this.message = `${contract.adviserName} is now under contract at ${this.money(contract.salaryPerDay.amount)} per day.`;
        this.loadAdviser();
      },
      error: error => this.adviserError = this.readError(error)?.message || 'Trader adviser hire failed.'
    });
  }

  requestAdvice(): void {
    if (!this.selected || this.adviceLoading || !this.isChairman) return;
    this.adviceLoading = true;
    this.adviserError = '';
    this.market.requestAdvice(this.selected.id).pipe(
      finalize(() => this.adviceLoading = false)
    ).subscribe({
      next: advice => this.advice = advice,
      error: error => this.adviserError = this.readError(error)?.message || 'Advice request failed.'
    });
  }

  riskLabel(riskClass: MarketRiskClass): string {
    switch (riskClass) {
      case 'SAFE_COMPANY': return 'Safe company';
      case 'SPECULATIVE': return 'Speculative';
      case 'CLUB_EQUITY': return 'Club equity';
    }
  }

  riskDescription(riskClass: MarketRiskClass): string {
    switch (riskClass) {
      case 'SAFE_COMPANY':
        return 'Usually calmer day to day, but still capable of losing value.';
      case 'SPECULATIVE':
        return 'High-volatility instrument. Sharp swings can happen in either direction.';
      case 'CLUB_EQUITY':
        return 'Anchored to club fundamentals, with limited market noise around valuation.';
    }
  }

  statusTone(status: string | undefined | null): string {
    if (status === 'ACTIVE') return 'status-good';
    if (status === 'INSUFFICIENT_FUNDS') return 'status-bad';
    return 'status-neutral';
  }

  money(value: number): string { return new Intl.NumberFormat('en-GB').format(value) + ' EUR'; }
  percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
  trackInstrument(_: number, value: MarketInstrumentView): number { return value.id; }
  trackOption(_: number, value: AdviserHireOptionView): string { return value.optionCode; }

  private handlePageError(error: unknown, fallback: string): void {
    const apiError = this.readError(error);
    if (apiError?.code === 'REGENT_FEATURE_DISABLED') {
      this.flagOff = true;
      this.error = apiError.message;
      return;
    }
    this.error = apiError?.message || fallback;
  }

  private readError(error: any): MarketApiError | null {
    if (error?.error?.code && error?.error?.message) return error.error as MarketApiError;
    return null;
  }

  private newKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
