import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface CountryCoefficient {
  leagueId: number; leagueName: string; coefficient: number; rank: number;
  locSpots: number; locEntry: string; starsCupSpots: number;
  perSeason: { [key: number]: number };
}

export interface ClubCoefficient {
  teamId: number; teamName: string; leagueName: string; coefficient: number; rank: number;
  perSeason: { [key: number]: number };
}

export interface LeagueStrengthEntry {
  rank: number; competitionId: number; competitionName: string; competitionTypeId: number; tier: number;
  averageTopElevenRating: number; multiplier: number; teamCount: number; completeTeamCount: number;
}

export interface CoefficientWorkspace {
  countries: CountryCoefficient[];
  clubs: ClubCoefficient[];
  summary: any;
  strength: { season: number; ranking: LeagueStrengthEntry[] };
}

export interface DistributionLine {
  label: string; amountMinimum: number; amountMaximum: number; sharePercent: number;
}

export interface CompetitionPrizeView {
  competitionId: number; name: string; kind: string; scope: string; tier: number;
  poolMinimum: number; poolMaximum: number; paidToDate: number; distributionBasis: string;
  distribution: DistributionLine[];
}

export interface PrizeMoneyOverview {
  season: number;
  economy: {
    clubCash: number; transferBudgets: number; salaryBudgets: number; clubDebt: number;
    seasonIncome: number; seasonSpending: number; prizeMoneyPaid: number;
  };
  summary: {
    domesticMinimum: number; domesticMaximum: number; europeanMinimum: number; europeanMaximum: number;
    unofficialPools: number; totalMinimum: number; totalMaximum: number; paidToDate: number;
  };
  incomeByCategory: { category: string; amount: number }[];
  spendingByCategory: { category: string; amount: number }[];
  competitions: CompetitionPrizeView[];
}

@Injectable({ providedIn: 'root' })
export class CompetitionIntelligenceService {
  constructor(private http: HttpClient) {}

  loadWorkspace(season: number): Observable<CoefficientWorkspace> {
    return forkJoin({
      countries: this.http.get<CountryCoefficient[]>(`${urlApp}/competition/getCountryCoefficients`),
      clubs: this.http.get<ClubCoefficient[]>(`${urlApp}/competition/getClubCoefficients`),
      summary: this.http.get<any>(`${urlApp}/competition/getEuropeanSummary`),
      strength: this.http.get<any>(`${urlApp}/stats/league-strength/${season}`)
    });
  }

  loadPrizeMoney(season: number): Observable<PrizeMoneyOverview> {
    return this.http.get<PrizeMoneyOverview>(`${urlApp}/competition/prizeMoneyOverview/${season}`);
  }
}
