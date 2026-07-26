import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { urlApp } from '../app.component';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ChairmanCommandCentreView, ClubCatalogScope,
  ClubCashTransferDirection, TakeoverExecutionView, TakeoverQuoteView, TreasuryTransferView,
  TacticalMandateUpdate, TacticalMandateView, TransferBudgetView
} from '../chairman-club/chairman-club.models';

@Injectable({ providedIn: 'root' })
export class ChairmanClubService {
  constructor(private http: HttpClient) {}

  clubs(scope: ClubCatalogScope = 'ALL'): Observable<ChairmanClubSummary[]> {
    const params = new HttpParams().set('scope', scope);
    return this.http.get<ChairmanClubSummary[]>(urlApp + '/api/clubs', { params });
  }

  dashboard(teamId: number): Observable<ChairmanClubDashboard> {
    return this.http.get<ChairmanClubDashboard>(
      urlApp + `/api/clubs/${teamId}/chairman-dashboard`);
  }

  commandCentre(teamId: number): Observable<ChairmanCommandCentreView> {
    return this.http.get<ChairmanCommandCentreView>(
      urlApp + `/api/clubs/${teamId}/chairman-command-centre`);
  }

  tacticalMandate(teamId: number): Observable<TacticalMandateView> {
    return this.http.get<TacticalMandateView>(
      urlApp + `/api/clubs/${teamId}/tactical-mandate`);
  }

  saveTacticalMandate(teamId: number, body: TacticalMandateUpdate): Observable<TacticalMandateView> {
    return this.http.put<TacticalMandateView>(
      urlApp + `/api/clubs/${teamId}/tactical-mandate`, body);
  }

  quote(teamId: number, idempotencyKey: string): Observable<TakeoverQuoteView> {
    return this.http.post<TakeoverQuoteView>(urlApp + `/api/clubs/${teamId}/takeover-quotes`,
      { idempotencyKey });
  }

  execute(teamId: number, quoteId: string,
          idempotencyKey: string): Observable<TakeoverExecutionView> {
    return this.http.post<TakeoverExecutionView>(urlApp + `/api/clubs/${teamId}/takeovers`,
      { quoteId, idempotencyKey });
  }

  transfer(teamId: number, direction: ClubCashTransferDirection, amount: number,
           idempotencyKey: string): Observable<TreasuryTransferView> {
    return this.http.post<TreasuryTransferView>(
      urlApp + `/api/clubs/${teamId}/treasury-transfers`,
      { direction, amount, idempotencyKey });
  }

  setTransferBudget(teamId: number, amount: number): Observable<TransferBudgetView> {
    return this.http.put<TransferBudgetView>(
      urlApp + `/api/clubs/${teamId}/transfer-budget`, { amount });
  }
}
