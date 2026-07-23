import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ChairmanClubService } from '../services/chairman-club.service';
import {
  ChairmanClubDashboard, ChairmanClubSummary, TakeoverExecutionView,
  TakeoverQuoteView, TreasuryTransferView
} from './chairman-club.models';
import { ChairmanClubComponent } from './chairman-club.component';

describe('ChairmanClubComponent', () => {
  let fixture: ComponentFixture<ChairmanClubComponent>;
  let component: ChairmanClubComponent;
  let api: jasmine.SpyObj<ChairmanClubService>;
  let routeParams: BehaviorSubject<ParamMap>;
  let router: { navigate: jasmine.Spy };

  const money = (amount: number) => ({ amount, currency: 'EUR', minorUnitScale: 0 });
  const club = (teamId: number): ChairmanClubSummary => ({
    teamId, name: `${teamId} FC`, valuation: money(100 + teamId),
    controllingProfileId: null, controllingDisplayName: null, controlledByPrincipal: false
  });
  const dashboard = (teamId: number, controlledByPrincipal = false): ChairmanClubDashboard => ({
    teamId, name: `${teamId} FC`, controlledByPrincipal,
    valuation: { formulaVersion: 'club-valuation-v1', stateVersion: `state-${teamId}`,
      squadMarketValue: money(10), clubCash: money(20), debt: money(0), dueObligations: money(0),
      netCash: money(20), stadiumFacilitiesValue: money(30), reputationBrandValue: money(40),
      recentPerformanceBps: 100, recentPerformanceValue: money(1), totalValue: money(101) },
    capTable: { issuedShares: 100, freeFloat: 100, controlThresholdBps: 5001,
      controllingProfileId: null, controllingDisplayName: null, version: 0, holdings: [] },
    treasury: { balance: money(20), debt: money(0), monthlyWages: money(1),
      protectedReserve: money(3), dueObligations: money(0), distributableCash: money(17),
      withdrawalRestricted: false }
  });
  const quote = (teamId: number): TakeoverQuoteView => ({
    quoteId: `q-${teamId}`, teamId, sharesToAcquire: 100,
    unitPrice: money(2), premiumBps: 2000, totalConsideration: money(200),
    valuationFormulaVersion: 'club-valuation-v1', valuationStateVersion: `state-${teamId}`,
    instrumentVersion: 0, expiresAbsoluteDay: 10, status: 'OPEN', replayed: false
  });
  const execution = (teamId: number): TakeoverExecutionView => ({
    executionId: `e-${teamId}`, quoteId: `q-${teamId}`, teamId, sharesAcquired: 100,
    unitPrice: money(2), totalConsideration: money(200), cashBalanceAfter: money(800),
    quantityAfter: 100, season: 1, day: 1, replayed: false
  });
  const transfer = (teamId: number): TreasuryTransferView => ({
    transferId: `t-${teamId}`, teamId, direction: 'INJECTION', amount: money(500),
    personalBalanceAfter: money(500), clubBalanceAfter: money(520), distributableBefore: money(17),
    correlationId: `c-${teamId}`, season: 1, day: 1, replayed: false
  });

  beforeEach(async () => {
    api = jasmine.createSpyObj<ChairmanClubService>('ChairmanClubService',
      ['clubs', 'dashboard', 'quote', 'execute', 'transfer']);
    api.clubs.and.returnValue(of([club(7), club(8)]));
    api.dashboard.and.callFake(teamId => of(dashboard(teamId)));
    api.quote.and.callFake(teamId => of(quote(teamId)));
    api.execute.and.callFake(teamId => of(execution(teamId)));
    api.transfer.and.callFake(teamId => of(transfer(teamId)));
    routeParams = new BehaviorSubject<ParamMap>(convertToParamMap({ teamId: '7' }));
    router = { navigate: jasmine.createSpy('navigate') };

    await TestBed.configureTestingModule({
      declarations: [ChairmanClubComponent], imports: [CommonModule, FormsModule],
      providers: [
        { provide: ChairmanClubService, useValue: api },
        { provide: ActivatedRoute, useValue: { paramMap: routeParams.asObservable() } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ChairmanClubComponent);
    component = fixture.componentInstance;
  });

  function start(): void {
    fixture.detectChanges();
  }

  it('blocks duplicate in-flight takeover quote submissions', () => {
    const pending = new Subject<TakeoverQuoteView>();
    api.quote.and.returnValue(pending.asObservable());
    start();

    component.requestQuote();
    component.requestQuote();

    expect(api.quote).toHaveBeenCalledTimes(1);
    pending.next(quote(7));
    pending.complete();
  });

  it('reuses the same idempotency key after a failed quote retry', () => {
    api.quote.and.returnValue(throwError(() => ({ error: { message: 'temporary' } })));
    start();

    component.requestQuote();
    const first = api.quote.calls.mostRecent().args[1];
    api.quote.and.returnValue(of(quote(7)));
    component.requestQuote();

    expect(api.quote.calls.mostRecent().args[1]).toBe(first);
  });

  it('posts only positive integer treasury amounts and blocks double-click', () => {
    const pending = new Subject<TreasuryTransferView>();
    api.transfer.and.returnValue(pending.asObservable());
    start();
    component.amount = 500;

    component.transfer();
    component.transfer();

    expect(api.transfer).toHaveBeenCalledTimes(1);
    expect(api.transfer.calls.mostRecent().args.slice(0, 3)).toEqual([7, 'INJECTION', 500]);
    pending.next(transfer(7));
    pending.complete();
  });

  it('ignores an out-of-order dashboard response after selection changes from A to B', () => {
    const teamA = new Subject<ChairmanClubDashboard>();
    const teamB = new Subject<ChairmanClubDashboard>();
    api.dashboard.and.callFake(teamId => teamId === 7 ? teamA.asObservable() : teamB.asObservable());
    start();

    routeParams.next(convertToParamMap({ teamId: '8' }));
    teamB.next(dashboard(8));
    teamA.next(dashboard(7));

    expect(component.selectedTeamId).toBe(8);
    expect(component.dashboard?.teamId).toBe(8);
    expect(component.dashboardError).toBe('');
  });

  it('tracks route parameter changes for browser forward and back navigation', () => {
    start();

    routeParams.next(convertToParamMap({ teamId: '8' }));
    routeParams.next(convertToParamMap({ teamId: '7' }));

    expect(component.selectedTeamId).toBe(7);
    expect(component.dashboard?.teamId).toBe(7);
    expect(api.dashboard.calls.allArgs().map(args => args[0])).toEqual([7, 8, 7]);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not install a late quote for A after B becomes selected', () => {
    const pending = new Subject<TakeoverQuoteView>();
    api.quote.and.returnValue(pending.asObservable());
    start();
    component.requestQuote();

    routeParams.next(convertToParamMap({ teamId: '8' }));
    pending.next(quote(7));

    expect(component.selectedTeamId).toBe(8);
    expect(component.quote).toBeNull();
    expect(component.message).toBe('');
    expect(component.inFlight).toBeNull();
  });

  it('never submits an A quote against the selected B route target', () => {
    start();
    routeParams.next(convertToParamMap({ teamId: '8' }));
    component.quote = quote(7);

    component.executeTakeover();

    expect(api.execute).not.toHaveBeenCalled();
    expect(component.quote).toBeNull();
    expect(component.error).toContain('different club');
  });

  it('ignores a late takeover completion for A after selection moves to B', () => {
    const pending = new Subject<TakeoverExecutionView>();
    api.execute.and.returnValue(pending.asObservable());
    start();
    component.quote = quote(7);
    component.executeTakeover();
    expect(api.execute.calls.mostRecent().args[0]).toBe(7);

    routeParams.next(convertToParamMap({ teamId: '8' }));
    pending.next(execution(7));

    expect(component.selectedTeamId).toBe(8);
    expect(component.dashboard?.teamId).toBe(8);
    expect(component.message).toBe('');
    expect(api.dashboard.calls.allArgs().map(args => args[0])).toEqual([7, 8]);
  });

  it('ignores a late treasury completion for A and never refreshes B with A state', () => {
    const pending = new Subject<TreasuryTransferView>();
    api.transfer.and.returnValue(pending.asObservable());
    start();
    component.amount = 500;
    component.transfer();
    expect(api.transfer.calls.mostRecent().args[0]).toBe(7);

    routeParams.next(convertToParamMap({ teamId: '8' }));
    pending.next(transfer(7));

    expect(component.selectedTeamId).toBe(8);
    expect(component.dashboard?.teamId).toBe(8);
    expect(component.message).toBe('');
    expect(api.dashboard.calls.allArgs().map(args => args[0])).toEqual([7, 8]);
  });

  it('preserves a transfer success message across the dashboard refresh', () => {
    start();
    component.amount = 500;

    component.transfer();

    expect(component.message).toBe('Injection completed.');
    expect(component.dashboard?.teamId).toBe(7);
    expect(api.dashboard).toHaveBeenCalledTimes(2);
  });

  it('renders an explicit empty state when no clubs are available', () => {
    api.clubs.and.returnValue(of([]));
    start();
    fixture.detectChanges();

    expect(component.selectedTeamId).toBeNull();
    expect(api.dashboard).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('No clubs are available');
    expect(fixture.nativeElement.textContent).toContain('Check again');
  });

  it('retries the initial clubs request after an error', () => {
    api.clubs.and.returnValues(
      throwError(() => ({ error: { message: 'clubs unavailable' } })),
      of([club(7), club(8)]));
    start();
    expect(component.clubsError).toBe('clubs unavailable');

    component.retryClubs();
    fixture.detectChanges();

    expect(api.clubs).toHaveBeenCalledTimes(2);
    expect(component.clubsError).toBe('');
    expect(component.selectedTeamId).toBe(7);
    expect(component.dashboard?.teamId).toBe(7);
  });

  it('retries the selected dashboard after an error', () => {
    api.dashboard.and.returnValues(
      throwError(() => ({ error: { message: 'dashboard unavailable' } })),
      of(dashboard(7)));
    start();
    expect(component.dashboardError).toBe('dashboard unavailable');

    component.retryDashboard();
    fixture.detectChanges();

    expect(api.dashboard).toHaveBeenCalledTimes(2);
    expect(component.dashboardError).toBe('');
    expect(component.dashboard?.teamId).toBe(7);
  });
});
