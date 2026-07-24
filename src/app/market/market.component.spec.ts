import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MarketService } from '../services/market.service';
import { MarketComponent } from './market.component';
import { AdviserDashboardView, AdviceView, MarketInstrumentView, MarketTradeView } from './market.models';

describe('MarketComponent', () => {
  let fixture: ComponentFixture<MarketComponent>;
  let component: MarketComponent;
  let market: jasmine.SpyObj<MarketService>;
  const instrument: MarketInstrumentView = {
    id: 7, code: 'SAFE', type: 'COMPANY', name: 'Safe Co',
    price: { amount: 100, currency: 'EUR', minorUnitScale: 0 },
    totalSupply: 1000, availableSupply: 10, riskClass: 'SAFE_COMPANY', dailyLimitBps: 700, weeklyLimitBps: 5000,
    algorithmVersion: 'market-v1'
  };
  const adviser: AdviserDashboardView = {
    currentDate: { season: 1, day: 12 },
    currentContract: null,
    hireOptions: [{
      optionCode: 'VETERAN', adviserName: 'Veteran Trader', skill: 90, reputation: 92,
      salaryPerDay: { amount: 20000, currency: 'EUR', minorUnitScale: 0 }, durationDays: 365, modelVersion: 'advice-v1'
    }]
  };

  beforeEach(async () => {
    market = jasmine.createSpyObj<MarketService>(
      'MarketService', ['instruments', 'history', 'trade', 'adviserDashboard', 'hireAdviser', 'requestAdvice']
    );
    market.instruments.and.returnValue(of([instrument]));
    market.history.and.returnValue(of([]));
    market.adviserDashboard.and.returnValue(of(adviser));
    await TestBed.configureTestingModule({
      declarations: [MarketComponent],
      providers: [
        { provide: MarketService, useValue: market },
        { provide: AuthService, useValue: { careerRole: 'CHAIRMAN' } }
      ],
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

  it('reuses the same idempotency key when retrying the same failed trade', () => {
    market.trade.and.returnValue(throwError(() => ({ error: { message: 'temporary' } })));
    component.quantities[7] = 3;
    component.execute(instrument, 'SELL');
    const firstKey = market.trade.calls.mostRecent().args[3];
    component.execute(instrument, 'SELL');
    expect(market.trade.calls.mostRecent().args[3]).toBe(firstKey);
  });

  it('surfaces feature-flag-off state from the API', () => {
    market.instruments.and.returnValue(throwError(() => ({
      error: { code: 'REGENT_FEATURE_DISABLED', message: 'Regent off' }
    })));
    component.load();
    expect(component.flagOff).toBeTrue();
    expect(component.error).toBe('Regent off');
  });

  it('reuses the same hire key when retrying the same failed adviser hire', () => {
    market.hireAdviser.and.returnValue(throwError(() => ({ error: { message: 'temporary' } })));
    component.hire(adviser.hireOptions[0]);
    const firstKey = market.hireAdviser.calls.mostRecent().args[1];
    component.hire(adviser.hireOptions[0]);
    expect(market.hireAdviser.calls.mostRecent().args[1]).toBe(firstKey);
  });

  it('stores the latest advice card returned by the server', () => {
    component.adviser = {
      ...adviser,
      currentContract: {
        contractId: 1,
        adviserCode: 'VETERAN',
        adviserName: 'Veteran Trader',
        skill: 90,
        reputation: 92,
        salaryPerDay: { amount: 20000, currency: 'EUR', minorUnitScale: 0 },
        startDate: { season: 1, day: 1 },
        endDate: { season: 2, day: 1 },
        status: 'ACTIVE',
        terminationReason: null,
        modelVersion: 'advice-v1',
        replayed: false
      }
    };
    const advice: AdviceView = {
      recommendationId: 10, instrumentId: 7, instrumentCode: 'SAFE', instrumentName: 'Safe Co',
      action: 'HOLD', riskClass: 'SAFE_COMPANY', season: 1, day: 12, horizonDays: 6,
      confidence: 0.62, risk: 0.18, trailingReturn: 0.03, observedVolatility: 0.01,
      explanation: 'Wait for a stronger edge.', modelVersion: 'advice-v1', replayed: false
    };
    market.requestAdvice.and.returnValue(of(advice));
    component.selected = instrument;

    component.requestAdvice();

    expect(component.advice).toEqual(advice);
  });
});
