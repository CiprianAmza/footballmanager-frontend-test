import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { ChairmanClubService } from '../services/chairman-club.service';
import { ChairmanClubDashboard, TakeoverQuoteView } from './chairman-club.models';
import { ChairmanClubComponent } from './chairman-club.component';

describe('ChairmanClubComponent', () => {
  let fixture: ComponentFixture<ChairmanClubComponent>;
  let component: ChairmanClubComponent;
  let api: jasmine.SpyObj<ChairmanClubService>;

  const money = (amount: number) => ({ amount, currency: 'EUR', minorUnitScale: 0 });
  const dashboard: ChairmanClubDashboard = {
    teamId: 7, name: 'Seven FC', controlledByPrincipal: false,
    valuation: { formulaVersion: 'club-valuation-v1', stateVersion: 'abc',
      squadMarketValue: money(10), clubCash: money(20), debt: money(0), dueObligations: money(0),
      netCash: money(20), stadiumFacilitiesValue: money(30), reputationBrandValue: money(40),
      recentPerformanceBps: 100, recentPerformanceValue: money(1), totalValue: money(101) },
    capTable: { issuedShares: 100, freeFloat: 100, controlThresholdBps: 5001,
      controllingProfileId: null, controllingDisplayName: null, version: 0, holdings: [] },
    treasury: { balance: money(20), debt: money(0), monthlyWages: money(1),
      protectedReserve: money(3), dueObligations: money(0), distributableCash: money(17),
      withdrawalRestricted: false }
  };
  const quote: TakeoverQuoteView = { quoteId: 'q1', teamId: 7, sharesToAcquire: 100,
    unitPrice: money(2), premiumBps: 2000, totalConsideration: money(200),
    valuationFormulaVersion: 'club-valuation-v1', valuationStateVersion: 'abc',
    instrumentVersion: 0, expiresAbsoluteDay: 10, status: 'OPEN', replayed: false };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ChairmanClubService>('ChairmanClubService',
      ['clubs', 'dashboard', 'quote', 'execute', 'transfer']);
    api.clubs.and.returnValue(of([{ teamId: 7, name: 'Seven FC', valuation: money(101),
      controllingProfileId: null, controllingDisplayName: null, controlledByPrincipal: false }]));
    api.dashboard.and.returnValue(of(dashboard));
    await TestBed.configureTestingModule({
      declarations: [ChairmanClubComponent], imports: [CommonModule, FormsModule],
      providers: [
        { provide: ChairmanClubService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '7' } } } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ChairmanClubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('blocks duplicate in-flight takeover quote submissions', () => {
    const pending = new Subject<TakeoverQuoteView>();
    api.quote.and.returnValue(pending.asObservable());
    component.requestQuote();
    component.requestQuote();
    expect(api.quote).toHaveBeenCalledTimes(1);
    pending.next(quote); pending.complete();
  });

  it('reuses the same idempotency key after a failed quote retry', () => {
    api.quote.and.returnValue(throwError(() => ({ error: { message: 'temporary' } })));
    component.requestQuote();
    const first = api.quote.calls.mostRecent().args[1];
    api.quote.and.returnValue(of(quote));
    component.requestQuote();
    expect(api.quote.calls.mostRecent().args[1]).toBe(first);
  });

  it('posts only positive integer treasury amounts and blocks double-click', () => {
    dashboard.controlledByPrincipal = true;
    const pending = new Subject<any>();
    api.transfer.and.returnValue(pending.asObservable());
    component.amount = 500;
    component.transfer();
    component.transfer();
    expect(api.transfer).toHaveBeenCalledTimes(1);
    expect(api.transfer.calls.mostRecent().args.slice(0, 3)).toEqual([7, 'INJECTION', 500]);
    pending.next({ direction: 'INJECTION' }); pending.complete();
  });
});
