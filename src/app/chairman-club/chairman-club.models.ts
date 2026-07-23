import { Money } from '../economy/economy.models';

export interface ClubValuationView {
  formulaVersion: string;
  stateVersion: string;
  squadMarketValue: Money;
  clubCash: Money;
  debt: Money;
  dueObligations: Money;
  netCash: Money;
  stadiumFacilitiesValue: Money;
  reputationBrandValue: Money;
  recentPerformanceBps: number;
  recentPerformanceValue: Money;
  totalValue: Money;
}

export interface ClubHoldingView {
  profileId: number;
  displayName: string;
  protectedUser: boolean;
  quantity: number;
  stakeBps: number;
  equityValue: Money;
  controlling: boolean;
}

export interface ClubCapTableView {
  issuedShares: number;
  freeFloat: number;
  controlThresholdBps: number;
  controllingProfileId: number | null;
  controllingDisplayName: string | null;
  version: number;
  holdings: ClubHoldingView[];
}

export interface ClubTreasuryView {
  balance: Money;
  debt: Money;
  monthlyWages: Money;
  protectedReserve: Money;
  dueObligations: Money;
  distributableCash: Money;
  withdrawalRestricted: boolean;
}

export interface ChairmanClubSummary {
  teamId: number;
  name: string;
  valuation: Money;
  controllingProfileId: number | null;
  controllingDisplayName: string | null;
  controlledByPrincipal: boolean;
}

export interface ChairmanClubDashboard {
  teamId: number;
  name: string;
  valuation: ClubValuationView;
  capTable: ClubCapTableView;
  treasury: ClubTreasuryView;
  controlledByPrincipal: boolean;
}

export interface TakeoverQuoteView {
  quoteId: string;
  teamId: number;
  sharesToAcquire: number;
  unitPrice: Money;
  premiumBps: number;
  totalConsideration: Money;
  valuationFormulaVersion: string;
  valuationStateVersion: string;
  instrumentVersion: number;
  expiresAbsoluteDay: number;
  status: 'OPEN' | 'EXECUTED';
  replayed: boolean;
}

export interface TakeoverExecutionView {
  executionId: string;
  quoteId: string;
  teamId: number;
  sharesAcquired: number;
  unitPrice: Money;
  totalConsideration: Money;
  cashBalanceAfter: Money;
  quantityAfter: number;
  season: number;
  day: number;
  replayed: boolean;
}

export type ClubCashTransferDirection = 'INJECTION' | 'WITHDRAWAL';

export interface TreasuryTransferView {
  transferId: string;
  teamId: number;
  direction: ClubCashTransferDirection;
  amount: Money;
  personalBalanceAfter: Money;
  clubBalanceAfter: Money;
  distributableBefore: Money;
  correlationId: string;
  season: number;
  day: number;
  replayed: boolean;
}
