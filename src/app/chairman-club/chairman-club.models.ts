import { Money } from '../economy/economy.models';

export type ClubCatalogScope = 'ALL' | 'HELD' | 'CONTROLLED';

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
  competitionId: number;
  competitionName: string | null;
  valuation: Money;
  controllingProfileId: number | null;
  controllingDisplayName: string | null;
  principalShares: number;
  principalStakeBps: number;
  principalEquityValue: Money;
  heldByPrincipal: boolean;
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

export interface ChairmanCommandCentreView {
  teamId: number;
  teamName: string;
  color1: string | null;
  color2: string | null;
  stadium: ChairmanStadiumView;
  primaryCompetition: ChairmanCompetitionView | null;
  manager: ChairmanManagerView | null;
  staff: ChairmanStaffSummary;
  standing: ChairmanStandingView | null;
  recentForm: string[];
  nextFixtures: ChairmanFixtureView[];
  squad: ChairmanSquadSummary;
  finances: ChairmanFinanceSummary;
  ownership: ChairmanOwnershipSummary;
  season: number;
  currentDay: number;
  currentPhase: string | null;
}

export interface ChairmanStadiumView { name: string | null; capacity: number; }

export interface ChairmanCompetitionView {
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
}

export interface ChairmanManagerView {
  managerId: number;
  managerName: string | null;
  age: number;
  contractEndSeason: number;
  wage: number;
}

export interface ChairmanStaffSummary {
  managers: number;
  coaches: number;
  scouts: number;
  totalStaff: number;
}

export interface ChairmanStandingView {
  position: number;
  totalTeams: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface ChairmanFixtureView {
  competitionId: number;
  competitionName: string;
  seasonNumber: number;
  roundNumber: number;
  teamId1: number;
  teamId2: number;
  opponentTeamId: number;
  opponentTeamName: string;
  homeOrAway: string;
  day: number;
  dateDisplay: string;
  status: string;
}

export interface ChairmanSquadSummary {
  playerCount: number;
  averageAge: number;
  injuredPlayers: number;
  suspendedPlayers: number;
}

export interface ChairmanFinanceSummary {
  valuation: ClubValuationView;
  treasury: ClubTreasuryView;
  transferBudget: number;
  wageBudget: number;
  recentIncome: number;
  recentExpenses: number;
}

export interface ChairmanOwnershipSummary {
  principalProfileId: number;
  shares: number;
  stakeBps: number;
  equityValue: Money;
  controlled: boolean;
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
