export type CareerType = 'PLAYER' | 'MANAGER' | 'CHAIRMAN';
export type ControlType = 'AI' | 'USER';
export type AssetType = 'APARTMENT' | 'VILLA' | 'HOTEL' | 'CAR';

export interface Money { amount: number; currency: string; minorUnitScale: number; }
export interface AccountView {
  accountId: number; profileId: number; cash: Money;
  lifetimeCareerEarnings: Money; realizedInvestmentGain: Money; version: number;
}
export interface WealthView {
  profileId: number; cash: Money; assetValue: Money; investmentValue: Money;
  clubEquityValue: Money; netWorth: Money; lifetimeCareerEarnings: Money;
  realizedInvestmentGain: Money;
}
export interface PublicProfileView {
  profileId: number; displayName: string; careerType: CareerType; controlType: ControlType;
  active: boolean; retired: boolean; wealth: WealthView;
}
export interface CatalogItemView {
  id: number; code: string; type: AssetType; apartmentRooms?: number;
  name: string; iconKey: string; purchasePrice: Money; resaleHaircutBps: number;
}
export interface OwnedAssetView {
  id: number; catalogItemId: number; catalogCode: string; type: AssetType;
  apartmentRooms?: number; name: string; purchasePrice: Money; currentValue: Money;
  purchaseSeason: number; purchaseDay: number; status: 'OWNED' | 'SOLD'; salePrice?: Money;
}
export interface AssetMutationView { asset: OwnedAssetView; account: AccountView; replayed: boolean; }
export interface LedgerEntryView {
  id: number; type: string; signedAmount: number; careerEarningsDelta: number;
  balanceAfter: number; season: number; day: number; correlationId: string;
  idempotencyKey: string; description: string;
}
export interface LedgerPage { content: LedgerEntryView[]; page: number; size: number; totalElements: number; totalPages: number; }
export interface RankingEntry { rank: number; profile: PublicProfileView; }
export interface RankingPage { content: RankingEntry[]; page: number; size: number; totalElements: number; totalPages: number; }
