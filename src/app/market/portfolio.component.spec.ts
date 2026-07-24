import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MarketService } from '../services/market.service';
import { PortfolioComponent } from './portfolio.component';

describe('PortfolioComponent', () => {
  let fixture: ComponentFixture<PortfolioComponent>;
  let component: PortfolioComponent;
  let market: jasmine.SpyObj<MarketService>;

  beforeEach(async () => {
    market = jasmine.createSpyObj<MarketService>('MarketService', ['portfolio', 'trades', 'adviserDashboard']);
    market.portfolio.and.returnValue(of({
      positions: [],
      totalCostBasis: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      marketValue: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      unrealizedGain: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      realizedGain: { amount: 0, currency: 'EUR', minorUnitScale: 0 }
    }));
    market.trades.and.returnValue(of({ content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 }));
    market.adviserDashboard.and.returnValue(of({ currentDate: { season: 1, day: 1 }, currentContract: null, hireOptions: [] }));
    await TestBed.configureTestingModule({
      declarations: [PortfolioComponent],
      providers: [{ provide: MarketService, useValue: market }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(PortfolioComponent);
    component = fixture.componentInstance;
  });

  it('loads portfolio, trades and adviser status together', () => {
    fixture.detectChanges();
    expect(market.portfolio).toHaveBeenCalled();
    expect(market.trades).toHaveBeenCalled();
    expect(market.adviserDashboard).toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('enters flag-off state when the backend reports Regent disabled', () => {
    market.portfolio.and.returnValue(throwError(() => ({
      error: { code: 'REGENT_FEATURE_DISABLED', message: 'Regent off' }
    })));
    fixture.detectChanges();
    expect(component.flagOff).toBeTrue();
    expect(component.error).toBe('Regent off');
  });
});
