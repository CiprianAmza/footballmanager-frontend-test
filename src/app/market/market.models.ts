import { Money } from '../economy/economy.models';

export type MarketInstrumentType = 'COMPANY' | 'CLUB';
export type MarketTradeSide = 'BUY' | 'SELL';

export interface MarketInstrumentView {
  id: number; code: string; type: MarketInstrumentType; teamId?: number;
  name: string; price: Money; totalSupply: number; availableSupply: number;
  dailyLimitBps: number; weeklyLimitBps: number; algorithmVersion: string;
  underlyingClubValuation?: Money; clubValuationVersion?: string;
}
export interface MarketPriceView {
  id: number; season: number; day: number; previousClose: Money;
  closePrice: Money; weeklyAnchorPrice: Money; dailyChangeBps: number; algorithmVersion: string;
}
export interface PortfolioPositionView {
  instrumentId: number; code: string; type: MarketInstrumentType; teamId?: number;
  name: string; quantity: number; costBasis: Money; marketValue: Money; unrealizedGain: Money;
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
