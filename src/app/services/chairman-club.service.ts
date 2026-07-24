import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { urlApp } from '../app.component';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ClubCatalogScope, ClubCashTransferDirection,
  TakeoverExecutionView, TakeoverQuoteView, TreasuryTransferView
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
}
