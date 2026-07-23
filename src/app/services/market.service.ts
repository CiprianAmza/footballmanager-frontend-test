import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';
import {
  MarketInstrumentView, MarketPriceView, MarketTradePage, MarketTradeSide,
  MarketTradeView, PortfolioView
} from '../market/market.models';

@Injectable({ providedIn: 'root' })
export class MarketService {
  constructor(private http: HttpClient) {}

  instruments(): Observable<MarketInstrumentView[]> {
    return this.http.get<MarketInstrumentView[]>(urlApp + '/api/market/instruments');
  }
  history(instrumentId: number, limit = 30): Observable<MarketPriceView[]> {
    return this.http.get<MarketPriceView[]>(urlApp + `/api/market/instruments/${instrumentId}/history`,
      { params: new HttpParams().set('limit', limit) });
  }
  portfolio(): Observable<PortfolioView> {
    return this.http.get<PortfolioView>(urlApp + '/api/me/portfolio');
  }
  trades(page = 0, size = 50): Observable<MarketTradePage> {
    return this.http.get<MarketTradePage>(urlApp + '/api/me/trades', { params: { page, size } });
  }
  trade(instrumentId: number, side: MarketTradeSide, quantity: number,
        idempotencyKey: string): Observable<MarketTradeView> {
    return this.http.post<MarketTradeView>(urlApp + '/api/me/trades',
      { instrumentId, side, quantity, idempotencyKey });
  }
}
