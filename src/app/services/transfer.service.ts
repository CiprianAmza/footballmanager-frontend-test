import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface TransferOffer {
  id: number;
  playerId: number;
  playerName: string;
  fromTeamId: number;
  fromTeamName: string;
  toTeamId: number;
  toTeamName: string;
  offerAmount: number;
  askingPrice: number;
  status: string;
  seasonNumber: number;
  direction: string;
  createdAt: string;
}

export interface AvailablePlayer {
  id: number;
  name: string;
  position: string;
  age: number;
  estimatedRating: number;
  scoutingAccuracy: number;
  teamName: string;
  teamId: number;
  transferValue: number;
}

export interface ScoutReport {
  playerId: number;
  playerName: string;
  position: string;
  age: number;
  teamName: string;
  estimatedRating: number;
  scoutingAccuracy: number;
  estimatedTransferValue: number;
}

export interface Loan {
  id: number;
  playerId: number;
  playerName: string;
  parentTeamId: number;
  parentTeamName: string;
  loanTeamId: number;
  loanTeamName: string;
  seasonNumber: number;
  status: string;
  loanFee: number;
  buyOptionFee: number;
  buyObligatory: boolean;
  parentWageContribution: number;
}

export interface FreeAgent {
  id: number;
  name: string;
  position: string;
  age: number;
  rating: number;
  wage: number;
  transferValue: number;
}

export interface PreContractPlayer {
  id: number;
  name: string;
  position: string;
  age: number;
  rating: number;
  currentTeamId: number;
  currentTeamName: string;
  contractEndSeason: number;
  wageDemand: number;
}

export interface ActiveLoansResponse {
  loansIn: Loan[];
  loansOut: Loan[];
}

@Injectable({
  providedIn: 'root'
})
export class TransferService {

  constructor(private http: HttpClient) {}

  getIncomingOffers(teamId: number): Observable<TransferOffer[]> {
    return this.http.get<TransferOffer[]>(urlApp + `/transferOffer/incoming/${teamId}`);
  }

  getOutgoingOffers(teamId: number): Observable<TransferOffer[]> {
    return this.http.get<TransferOffer[]>(urlApp + `/transferOffer/outgoing/${teamId}`);
  }

  getOfferHistory(teamId: number, season: number): Observable<TransferOffer[]> {
    return this.http.get<TransferOffer[]>(urlApp + `/transferOffer/history/${teamId}/${season}`);
  }

  makeOffer(playerId: number, offerAmount: number): Observable<TransferOffer> {
    return this.http.post<TransferOffer>(urlApp + `/transferOffer/makeOffer`, { playerId, offerAmount });
  }

  respondToOffer(offerId: number, action: 'accept' | 'reject' | 'counter', counterAmount?: number): Observable<TransferOffer> {
    return this.http.post<TransferOffer>(urlApp + `/transferOffer/respond/${offerId}`, { action, counterAmount });
  }

  getAvailablePlayers(teamId: number): Observable<AvailablePlayer[]> {
    return this.http.get<AvailablePlayer[]>(urlApp + `/transferOffer/availablePlayers/${teamId}`);
  }

  getScoutReport(playerId: number, teamId: number): Observable<ScoutReport> {
    return this.http.get<ScoutReport>(urlApp + `/scouting/report/${playerId}/${teamId}`);
  }

  getBoughtPlayers(teamId: number, season: number): Observable<any[]> {
    return this.http.get<any[]>(urlApp + `/transfers/boughtPlayers/${teamId}/${season}`);
  }

  getSoldPlayers(teamId: number, season: number): Observable<any[]> {
    return this.http.get<any[]>(urlApp + `/transfers/soldPlayers/${teamId}/${season}`);
  }

  getActiveLoans(teamId: number): Observable<ActiveLoansResponse> {
    return this.http.get<ActiveLoansResponse>(urlApp + `/loans/active/${teamId}`);
  }

  makeLoanOffer(playerId: number, loanFee: number, buyOptionFee: number = 0, buyObligatory: boolean = false, parentWageContribution: number = 0): Observable<Loan> {
    return this.http.post<Loan>(urlApp + `/loans/offer`, { playerId, loanFee, buyOptionFee, buyObligatory, parentWageContribution });
  }

  exerciseBuyOption(loanId: number): Observable<any> {
    return this.http.post<any>(urlApp + `/loans/exerciseBuyOption/${loanId}`, {});
  }

  getLoanHistory(teamId: number, season: number): Observable<ActiveLoansResponse> {
    return this.http.get<ActiveLoansResponse>(urlApp + `/loans/history/${teamId}/${season}`);
  }

  recallLoan(loanId: number): Observable<any> {
    return this.http.post<any>(urlApp + `/loans/recall/${loanId}`, {});
  }

  getFreeAgents(teamId: number): Observable<FreeAgent[]> {
    return this.http.get<FreeAgent[]>(urlApp + `/transferOffer/freeAgents/${teamId}`);
  }

  signFreeAgent(playerId: number, offeredWage: number, contractYears: number): Observable<any> {
    return this.http.post<any>(urlApp + `/transferOffer/signFreeAgent`, { playerId, offeredWage, contractYears });
  }

  getPreContractAvailable(teamId: number): Observable<PreContractPlayer[]> {
    return this.http.get<PreContractPlayer[]>(urlApp + `/contract/preContractAvailable/${teamId}`);
  }

  signPreContract(playerId: number, offeredWage: number, contractYears: number): Observable<any> {
    return this.http.post<any>(urlApp + `/contract/preContract`, { playerId, offeredWage, contractYears });
  }

  setContractClauses(playerId: number, clauses: any): Observable<any> {
    return this.http.post<any>(urlApp + `/contract/setClauses`, { playerId, ...clauses });
  }
}
