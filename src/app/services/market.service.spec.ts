import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlApp } from '../app.component';
import { MarketService } from './market.service';

describe('MarketService', () => {
  let service: MarketService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(MarketService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('submits only server-priced principal-safe trade fields', () => {
    service.trade(7, 'BUY', 15, 'safe-key').subscribe();
    const request = http.expectOne(urlApp + '/api/me/trades');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ instrumentId: 7, side: 'BUY', quantity: 15, idempotencyKey: 'safe-key' });
    expect(request.request.body.price).toBeUndefined();
    expect(request.request.body.accountId).toBeUndefined();
    expect(request.request.body.profileId).toBeUndefined();
    request.flush({});
  });

  it('submits only server-owned adviser hire fields', () => {
    service.hireAdviser('VETERAN', 'hire-key').subscribe();
    const request = http.expectOne(urlApp + '/api/me/market-adviser/hire');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ optionCode: 'VETERAN', idempotencyKey: 'hire-key' });
    expect(request.request.body.salaryPerDay).toBeUndefined();
    expect(request.request.body.profileId).toBeUndefined();
    request.flush({});
  });

  it('uses market, portfolio, history and trade-history endpoints', () => {
    service.instruments().subscribe();
    http.expectOne(urlApp + '/api/market/instruments').flush([]);
    service.history(4, 12).subscribe();
    const history = http.expectOne(request => request.url === urlApp + '/api/market/instruments/4/history');
    expect(history.request.params.get('limit')).toBe('12'); history.flush([]);
    service.portfolio().subscribe();
    http.expectOne(urlApp + '/api/me/portfolio').flush({});
    service.trades(2, 20).subscribe();
    const trades = http.expectOne(request => request.url === urlApp + '/api/me/trades');
    expect(trades.request.params.get('page')).toBe('2'); expect(trades.request.params.get('size')).toBe('20');
    trades.flush({ content: [] });
    service.adviserDashboard().subscribe();
    http.expectOne(urlApp + '/api/me/market-adviser').flush({ hireOptions: [] });
    service.requestAdvice(4).subscribe();
    const advice = http.expectOne(urlApp + '/api/market/instruments/4/advice');
    expect(advice.request.method).toBe('POST');
    expect(advice.request.body).toEqual({});
    advice.flush({});
  });
});
