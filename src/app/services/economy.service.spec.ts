import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EconomyService } from './economy.service';
import { urlApp } from '../app.component';

describe('EconomyService', () => {
  let service: EconomyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(EconomyService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('buys using only the server catalog id and an idempotency key', () => {
    service.purchase(7, 'purchase-key').subscribe();
    const request = http.expectOne(urlApp + '/api/me/assets/purchases');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ catalogItemId: 7, idempotencyKey: 'purchase-key' });
    expect(request.request.body.price).toBeUndefined();
    expect(request.request.body.ownerId).toBeUndefined();
    request.flush({});
  });

  it('uses principal-scoped endpoints for private state', () => {
    service.myWealth().subscribe();
    http.expectOne(urlApp + '/api/me/wealth').flush({});
    service.myAssets().subscribe();
    http.expectOne(urlApp + '/api/me/assets').flush([]);
    service.myLedger(2, 25).subscribe();
    const ledger = http.expectOne(request => request.url === urlApp + '/api/me/ledger');
    expect(ledger.request.params.get('page')).toBe('2');
    expect(ledger.request.params.get('size')).toBe('25');
    ledger.flush({ content: [] });
  });

  it('sends exact ranking filters without client-side aggregation', () => {
    service.rankings('PLAYERS', 'AI', 'NET_WORTH').subscribe();
    const request = http.expectOne(req => req.url === urlApp + '/api/wealth-rankings');
    expect(request.request.params.get('role')).toBe('PLAYERS');
    expect(request.request.params.get('control')).toBe('AI');
    expect(request.request.params.get('sort')).toBe('NET_WORTH');
    request.flush({ content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 });
  });
});
