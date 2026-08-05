import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MarketService } from '../services/market.service';
import {
  AdviserContractView, AdviserDashboardView, AdviserHireOptionView, AdviceView,
  MarketApiError, MarketInstrumentType, MarketInstrumentView, MarketPriceView,
  MarketRiskClass, MarketTradeSide, PortfolioPositionView, PortfolioView
} from './market.models';

type MarketSort = 'CHANGE_DESC' | 'PRICE_ASC' | 'PRICE_DESC' | 'NAME_ASC' | 'SUPPLY_DESC';
type DetailTab = 'OVERVIEW' | 'ADVISER';

@Component({ selector: 'app-market', templateUrl: './market.component.html', styleUrls: ['./market.component.css'] })
export class MarketComponent implements OnInit {
  instruments: MarketInstrumentView[] = [];
  history: MarketPriceView[] = [];
  portfolio: PortfolioView | null = null;
  selected: MarketInstrumentView | null = null;
  adviser: AdviserDashboardView | null = null;
  advice: AdviceView | null = null;
  quantities: Record<number, number> = {};

  query = '';
  riskFilter: MarketRiskClass | 'ALL' = 'ALL';
  typeFilter: MarketInstrumentType | 'ALL' = 'ALL';
  sort: MarketSort = 'CHANGE_DESC';
  detailTab: DetailTab = 'OVERVIEW';
  orderSide: MarketTradeSide = 'BUY';
  historyRange = 30;
  orderReviewOpen = false;
  orderError = '';

  busy = false;
  loading = true;
  portfolioLoading = true;
  historyLoading = false;
  adviserLoading = true;
  adviceLoading = false;
  error = '';
  portfolioError = '';
  historyError = '';
  adviserError = '';
  message = '';
  flagOff = false;
  private readonly pendingKeys = new Map<string, string>();
  private readonly pendingHireKeys = new Map<string, string>();
  private historyRequestId = 0;
  private adviceRequestId = 0;

  constructor(private market: MarketService, private auth: AuthService) {}

  ngOnInit(): void {
    this.load();
    this.loadAdviser();
  }

  get isChairman(): boolean { return this.auth.careerRole === 'CHAIRMAN'; }
  get currentContract(): AdviserContractView | null { return this.adviser?.currentContract ?? null; }
  get hireOptions(): AdviserHireOptionView[] { return this.adviser?.hireOptions ?? []; }
  get hasActiveContract(): boolean { return this.currentContract?.status === 'ACTIVE'; }

  get visibleInstruments(): MarketInstrumentView[] {
    const query = this.query.trim().toLowerCase();
    const rows = this.instruments.filter(instrument => {
      if (this.riskFilter !== 'ALL' && instrument.riskClass !== this.riskFilter) return false;
      if (this.typeFilter !== 'ALL' && instrument.type !== this.typeFilter) return false;
      return !query || `${instrument.code} ${instrument.name} ${instrument.type}`.toLowerCase().includes(query);
    });
    return [...rows].sort((left, right) => {
      if (this.sort === 'PRICE_ASC') return left.price.amount - right.price.amount;
      if (this.sort === 'PRICE_DESC') return right.price.amount - left.price.amount;
      if (this.sort === 'NAME_ASC') return left.name.localeCompare(right.name);
      if (this.sort === 'SUPPLY_DESC') return right.availableSupply - left.availableSupply;
      return right.dailyChangeBps - left.dailyChangeBps;
    });
  }

  get activeFilterCount(): number {
    return Number(!!this.query.trim()) + Number(this.riskFilter !== 'ALL') + Number(this.typeFilter !== 'ALL');
  }

  get selectedPosition(): PortfolioPositionView | null {
    if (!this.selected) return null;
    return this.portfolio?.positions.find(position => position.instrumentId === this.selected?.id) ?? null;
  }

  get selectedQuantity(): number {
    return this.selected ? Math.max(0, Math.floor(this.quantities[this.selected.id] || 0)) : 0;
  }

  get estimatedOrderTotal(): number {
    return this.selected ? this.selectedQuantity * this.selected.price.amount : 0;
  }

  get maximumOrderQuantity(): number {
    if (!this.selected) return 0;
    if (this.orderSide === 'SELL') return this.selectedPosition?.quantity ?? 0;
    const affordable = Math.floor((this.portfolio?.cashBalance.amount ?? 0) / Math.max(1, this.selected.price.amount));
    return Math.max(0, Math.min(affordable, this.selected.availableSupply));
  }

  get portfolioReturnPercent(): number {
    const basis = this.portfolio?.totalCostBasis.amount ?? 0;
    return basis ? ((this.portfolio?.unrealizedGain.amount ?? 0) / basis) * 100 : 0;
  }

  get orderedHistory(): MarketPriceView[] { return [...this.history].reverse(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.flagOff = false;
    this.market.instruments().subscribe({
      next: rows => {
        const selectedId = this.selected?.id ?? rows[0]?.id ?? null;
        this.instruments = rows;
        rows.forEach(row => this.quantities[row.id] ||= 1);
        this.selected = selectedId === null ? null : rows.find(row => row.id === selectedId) ?? rows[0] ?? null;
        if (this.selected) this.showHistory(this.selected);
        else { this.history = []; this.historyError = ''; }
        this.loading = false;
      },
      error: error => { this.loading = false; this.handlePageError(error, 'Market could not be loaded.'); }
    });
    this.loadPortfolio();
  }

  loadPortfolio(): void {
    this.portfolioLoading = true;
    this.portfolioError = '';
    this.market.portfolio().subscribe({
      next: portfolio => { this.portfolio = portfolio; this.portfolioLoading = false; },
      error: error => {
        this.portfolioLoading = false;
        this.portfolioError = this.readError(error)?.message || 'Portfolio summary could not be loaded.';
      }
    });
  }

  loadAdviser(): void {
    this.adviserLoading = true;
    this.adviserError = '';
    this.market.adviserDashboard().subscribe({
      next: value => { this.adviser = value; this.adviserLoading = false; },
      error: error => {
        this.adviserLoading = false;
        const apiError = this.readError(error);
        if (apiError?.code === 'CHAIRMAN_FEATURE_DISABLED') { this.flagOff = true; this.adviserError = apiError.message; return; }
        this.adviserError = apiError?.message || 'Trader adviser panel could not be loaded.';
      }
    });
  }

  showHistory(instrument: MarketInstrumentView): void {
    this.selected = instrument;
    this.historyLoading = true;
    this.historyError = '';
    this.advice = null;
    this.orderReviewOpen = false;
    this.orderError = '';
    const requestId = ++this.historyRequestId;
    this.market.history(instrument.id, this.historyRange).subscribe({
      next: rows => {
        if (requestId !== this.historyRequestId || this.selected?.id !== instrument.id) return;
        this.history = rows; this.historyLoading = false;
      },
      error: error => {
        if (requestId !== this.historyRequestId || this.selected?.id !== instrument.id) return;
        this.historyLoading = false;
        this.historyError = this.readError(error)?.message || 'Price history could not be loaded.';
      }
    });
  }

  reloadHistory(): void { if (this.selected) this.showHistory(this.selected); }
  setDetailTab(tab: DetailTab): void { this.detailTab = tab; }
  setOrderSide(side: MarketTradeSide): void { this.orderSide = side; this.orderReviewOpen = false; this.orderError = ''; }
  clearFilters(): void { this.query = ''; this.riskFilter = 'ALL'; this.typeFilter = 'ALL'; }
  setMaximumQuantity(): void { if (this.selected) this.quantities[this.selected.id] = this.maximumOrderQuantity; }

  adjustQuantity(delta: number): void {
    if (!this.selected) return;
    this.quantities[this.selected.id] = Math.max(1, this.selectedQuantity + delta);
  }

  reviewOrder(): void {
    this.orderError = '';
    if (!this.selected || this.selectedQuantity <= 0) { this.orderError = 'Enter a quantity greater than zero.'; return; }
    if (this.selectedQuantity > this.maximumOrderQuantity) {
      this.orderError = this.orderSide === 'BUY'
        ? 'This order exceeds your buying power or the available supply.'
        : 'You cannot sell more shares than you currently own.';
      return;
    }
    this.orderReviewOpen = true;
  }

  confirmOrder(): void {
    if (!this.selected || !this.orderReviewOpen) return;
    this.execute(this.selected, this.orderSide);
  }

  closeOrderReview(): void { if (!this.busy) this.orderReviewOpen = false; }

  private execute(instrument: MarketInstrumentView, side: MarketTradeSide): void {
    const quantity = this.selectedQuantity;
    if (this.busy || quantity <= 0) return;
    this.error = ''; this.message = ''; this.busy = true;
    const operation = `${instrument.id}:${side}:${quantity}`;
    const idempotencyKey = this.pendingKeys.get(operation) || this.newKey(`trade-${instrument.id}-${side}`);
    this.pendingKeys.set(operation, idempotencyKey);
    this.market.trade(instrument.id, side, quantity, idempotencyKey).pipe(
      finalize(() => this.busy = false)
    ).subscribe({
      next: result => {
        this.pendingKeys.delete(operation);
        this.orderReviewOpen = false;
        this.message = `${result.side === 'BUY' ? 'Bought' : 'Sold'} ${result.quantity} ${result.code} shares at ${this.money(result.unitPrice.amount)}.`;
        this.load();
      },
      error: error => {
        this.orderError = this.readError(error)?.message || 'Trade failed. Retry uses the same safe key.';
      }
    });
  }

  hire(option: AdviserHireOptionView): void {
    if (!this.isChairman || this.busy) return;
    this.busy = true; this.adviserError = ''; this.message = '';
    const idempotencyKey = this.pendingHireKeys.get(option.optionCode) || this.newKey(`hire-${option.optionCode}`);
    this.pendingHireKeys.set(option.optionCode, idempotencyKey);
    this.market.hireAdviser(option.optionCode, idempotencyKey).pipe(finalize(() => this.busy = false)).subscribe({
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
    this.adviceLoading = true; this.adviserError = '';
    const instrumentId = this.selected.id;
    const requestId = ++this.adviceRequestId;
    this.market.requestAdvice(instrumentId).pipe(finalize(() => this.adviceLoading = false)).subscribe({
      next: advice => {
        if (requestId !== this.adviceRequestId || this.selected?.id !== instrumentId) return;
        this.advice = advice;
      },
      error: error => {
        if (requestId !== this.adviceRequestId || this.selected?.id !== instrumentId) return;
        this.adviserError = this.readError(error)?.message || 'Advice request failed.';
      }
    });
  }

  positionFor(instrumentId: number): PortfolioPositionView | null {
    return this.portfolio?.positions.find(position => position.instrumentId === instrumentId) ?? null;
  }

  riskLabel(riskClass: MarketRiskClass): string {
    return ({ SAFE_COMPANY: 'Low volatility', SPECULATIVE: 'High volatility', CLUB_EQUITY: 'Club equity' })[riskClass];
  }

  riskDescription(riskClass: MarketRiskClass): string {
    return ({
      SAFE_COMPANY: 'Designed for calmer price movement, while still carrying investment risk.',
      SPECULATIVE: 'Large day-to-day swings are possible. Size the position carefully.',
      CLUB_EQUITY: 'Price follows the underlying club valuation with limited market noise.'
    })[riskClass];
  }

  sparklinePoints(): string {
    const rows = this.orderedHistory;
    if (rows.length < 2) return '';
    const values = rows.map(row => row.closePrice.amount);
    const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(1, max - min);
    return values.map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / span) * 32}`).join(' ');
  }

  changeLabel(bps: number): string { return `${bps > 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`; }
  statusTone(status: string | undefined | null): string { return status === 'ACTIVE' ? 'status-good' : status === 'INSUFFICIENT_FUNDS' ? 'status-bad' : 'status-neutral'; }
  money(value: number): string { return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value || 0) + ' EUR'; }
  compactMoney(value: number): string { return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) + ' EUR'; }
  percent(value: number): string { return `${(value * 100).toFixed(1)}%`; }
  trackInstrument(_: number, value: MarketInstrumentView): number { return value.id; }
  trackOption(_: number, value: AdviserHireOptionView): string { return value.optionCode; }

  private handlePageError(error: unknown, fallback: string): void {
    const apiError = this.readError(error);
    if (apiError?.code === 'CHAIRMAN_FEATURE_DISABLED') { this.flagOff = true; this.error = apiError.message; return; }
    this.error = apiError?.message || fallback;
  }

  private readError(error: any): MarketApiError | null {
    return error?.error?.code && error?.error?.message ? error.error as MarketApiError : null;
  }

  private newKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
