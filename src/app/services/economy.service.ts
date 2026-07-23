import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';
import {
  AssetMutationView, CatalogItemView, LedgerPage, OwnedAssetView,
  PublicProfileView, RankingPage, WealthView
} from '../economy/economy.models';

@Injectable({ providedIn: 'root' })
export class EconomyService {
  constructor(private http: HttpClient) {}

  myProfile(): Observable<PublicProfileView> { return this.http.get<PublicProfileView>(urlApp + '/api/me/profile'); }
  myWealth(): Observable<WealthView> { return this.http.get<WealthView>(urlApp + '/api/me/wealth'); }
  myLedger(page = 0, size = 50): Observable<LedgerPage> {
    return this.http.get<LedgerPage>(urlApp + '/api/me/ledger', { params: { page, size } });
  }
  catalog(): Observable<CatalogItemView[]> { return this.http.get<CatalogItemView[]>(urlApp + '/api/assets/catalog'); }
  myAssets(): Observable<OwnedAssetView[]> { return this.http.get<OwnedAssetView[]>(urlApp + '/api/me/assets'); }
  purchase(catalogItemId: number, idempotencyKey: string): Observable<AssetMutationView> {
    return this.http.post<AssetMutationView>(urlApp + '/api/me/assets/purchases', { catalogItemId, idempotencyKey });
  }
  sell(ownedAssetId: number, idempotencyKey: string): Observable<AssetMutationView> {
    return this.http.post<AssetMutationView>(urlApp + `/api/me/assets/${ownedAssetId}/sell`, { idempotencyKey });
  }
  publicProfile(profileId: number): Observable<PublicProfileView> {
    return this.http.get<PublicProfileView>(urlApp + `/api/people/${profileId}`);
  }
  rankings(role: string, control: string, sort: string, page = 0, size = 50): Observable<RankingPage> {
    const params = new HttpParams().set('role', role).set('control', control)
      .set('sort', sort).set('page', page).set('size', size);
    return this.http.get<RankingPage>(urlApp + '/api/wealth-rankings', { params });
  }
}
