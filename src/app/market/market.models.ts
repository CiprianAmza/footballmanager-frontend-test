import { Money } from '../economy/economy.models';

export type MarketInstrumentType = 'COMPANY' | 'CLUB';
export type MarketTradeSide = 'BUY' | 'SELL';
export type MarketRiskClass = 'SAFE_COMPANY' | 'SPECULATIVE' | 'CLUB_EQUITY';
export type AdviceAction = 'BUY' | 'SELL' | 'HOLD';

export interface MarketInstrumentView {
  id: number; code: string; type: MarketInstrumentType; teamId?: number;
  name: string; price: Money; totalSupply: number; availableSupply: number;
  riskClass: MarketRiskClass; dailyLimitBps: number; weeklyLimitBps: number; algorithmVersion: string;
  underlyingClubValuation?: Money; clubValuationVersion?: string;
}
export interface MarketPriceView {
  id: number; season: number; day: number; previousClose: Money;
  closePrice: Money; weeklyAnchorPrice: Money; dailyChangeBps: number; algorithmVersion: string;
}
export interface PortfolioPositionView {
  instrumentId: number; code: string; type: MarketInstrumentType; teamId?: number;
  name: string; riskClass: MarketRiskClass; quantity: number; costBasis: Money; marketValue: Money; unrealizedGain: Money;
}
export interface PortfolioView {
  positions: PortfolioPositionView[]; totalCostBasis: Money; marketValue: Money;
  unrealizedGain: Money; realizedGain: Money;
}
export interface MarketTradeView {
  id: number; instrumentId: number; code: string; side: MarketTradeSide;
  quantity: number; unitPrice: Money; grossAmount: Money; costBasisAmount: Money;
  realizedGain: Money; season: number; day: number; idempotencyKey: string;
  cashBalanceAfter: Money; quantityAfter: number; costBasisAfter: Money; replayed: boolean;
}
export interface MarketTradePage {
  content: MarketTradeView[]; page: number; size: number; totalElements: number; totalPages: number;
}
export interface MarketGameDateView { season: number; day: number; }
export interface AdviserHireOptionView {
  optionCode: string; adviserName: string; skill: number; reputation: number;
  salaryPerDay: Money; durationDays: number; modelVersion: string;
}
export interface AdviserContractView {
  contractId: number; adviserCode: string; adviserName: string; skill: number; reputation: number;
  salaryPerDay: Money; startDate: MarketGameDateView; endDate: MarketGameDateView;
  status: string; terminationReason?: string | null; modelVersion: string; replayed: boolean;
}
export interface AdviserDashboardView {
  currentDate: MarketGameDateView; currentContract?: AdviserContractView | null; hireOptions: AdviserHireOptionView[];
}
export interface AdviceView {
  recommendationId: number; instrumentId: number; instrumentCode: string; instrumentName: string;
  action: AdviceAction; riskClass: MarketRiskClass; season: number; day: number; horizonDays: number;
  confidence: number; risk: number; trailingReturn: number; observedVolatility: number;
  explanation: string; modelVersion: string; replayed: boolean;
}
export interface MarketApiError {
  code: string;
  message: string;
}
