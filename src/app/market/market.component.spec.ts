import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { MarketService } from '../services/market.service';
import { MarketComponent } from './market.component';
import { MarketInstrumentView, MarketTradeView } from './market.models';

describe('MarketComponent', () => {
  let fixture: ComponentFixture<MarketComponent>;
  let component: MarketComponent;
  let market: jasmine.SpyObj<MarketService>;
  const instrument: MarketInstrumentView = {
    id: 7, code: 'SAFE', type: 'COMPANY', name: 'Safe Co',
    price: { amount: 100, currency: 'EUR', minorUnitScale: 0 },
    totalSupply: 1000, availableSupply: 10, dailyLimitBps: 700, weeklyLimitBps: 5000,
    algorithmVersion: 'market-v1'
  };

  beforeEach(async () => {
    market = jasmine.createSpyObj<MarketService>('MarketService', ['instruments', 'history', 'trade']);
    market.instruments.and.returnValue(of([instrument]));
    market.history.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      declarations: [MarketComponent], providers: [{ provide: MarketService, useValue: market }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MarketComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('blocks double submit while a trade is in flight', () => {
    const pending = new Subject<MarketTradeView>();
    market.trade.and.returnValue(pending);
    component.quantities[7] = 2;
    component.execute(instrument, 'BUY');
    component.execute(instrument, 'BUY');
    expect(market.trade).toHaveBeenCalledTimes(1);
    expect(market.trade.calls.mostRecent().args.slice(0, 3)).toEqual([7, 'BUY', 2]);
    pending.next({ side: 'BUY', quantity: 2, code: 'SAFE', unitPrice: instrument.price } as MarketTradeView);
    pending.complete();
  });

  it('reuses the same idempotency key when retrying the same failed operation', () => {
    market.trade.and.returnValue(throwError(() => ({ error: { message: 'temporary' } })));
    component.quantities[7] = 3;
    component.execute(instrument, 'SELL');
    const firstKey = market.trade.calls.mostRecent().args[3];
    component.execute(instrument, 'SELL');
    expect(market.trade.calls.mostRecent().args[3]).toBe(firstKey);
  });
});
