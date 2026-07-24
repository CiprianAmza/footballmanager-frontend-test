import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ChairmanClubService } from '../services/chairman-club.service';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ClubCatalogScope, TakeoverExecutionView,
  TakeoverQuoteView, TreasuryTransferView
} from './chairman-club.models';
import { ChairmanClubComponent } from './chairman-club.component';

describe('ChairmanClubComponent', () => {
  let fixture: ComponentFixture<ChairmanClubComponent>;
  let component: ChairmanClubComponent;
  let api: jasmine.SpyObj<ChairmanClubService>;
  let routeParams: BehaviorSubject<ParamMap>;
  let routeQuery: BehaviorSubject<ParamMap>;
  let router: Router;

  const money = (amount: number) => ({ amount, currency: 'EUR', minorUnitScale: 0 });
  const club = (teamId: number, controlled = false, held = false): ChairmanClubSummary => ({
    teamId, name: `${teamId} FC`, competitionId: 22, competitionName: 'Real League',
    valuation: money(100 + teamId), controllingProfileId: controlled ? 5 : null,
    controllingDisplayName: controlled ? 'Chairman' : null, principalShares: held ? 60 : 0,
    principalStakeBps: held ? 6000 : 0, principalEquityValue: money(held ? 60 : 0),
    heldByPrincipal: held, controlledByPrincipal: controlled
  });
  const dashboard = (teamId: number): ChairmanClubDashboard => ({
    teamId, name: `${teamId} FC`, controlledByPrincipal: true,
    valuation: { formulaVersion: 'club-valuation-v1', stateVersion: `state-${teamId}`,
      squadMarketValue: money(10), clubCash: money(20), debt: money(0), dueObligations: money(0),
      netCash: money(20), stadiumFacilitiesValue: money(30), reputationBrandValue: money(40),
      recentPerformanceBps: 100, recentPerformanceValue: money(1), totalValue: money(101) },
    capTable: { issuedShares: 100, freeFloat: 40, controlThresholdBps: 5001,
      controllingProfileId: 5, controllingDisplayName: 'Chairman', version: 1, holdings: [] },
    treasury: { balance: money(20), debt: money(0), monthlyWages: money(1),
      protectedReserve: money(3), dueObligations: money(0), distributableCash: money(17),
      withdrawalRestricted: false }
  });
  const quote = (teamId: number): TakeoverQuoteView => ({
    quoteId: `q-${teamId}`, teamId, sharesToAcquire: 60, unitPrice: money(2), premiumBps: 2000,
    totalConsideration: money(120), valuationFormulaVersion: 'club-valuation-v1',
    valuationStateVersion: `state-${teamId}`, instrumentVersion: 1, expiresAbsoluteDay: 10,
    status: 'OPEN', replayed: false
  });
  const execution = (teamId: number): TakeoverExecutionView => ({
    executionId: `e-${teamId}`, quoteId: `q-${teamId}`, teamId, sharesAcquired: 60,
    unitPrice: money(2), totalConsideration: money(120), cashBalanceAfter: money(800),
    quantityAfter: 60, season: 1, day: 1, replayed: false
  });
  const treasuryTransfer = (teamId: number, direction: 'INJECTION' | 'WITHDRAWAL',
                            amount: number): TreasuryTransferView => ({
    transferId: `t-${teamId}`, teamId, direction, amount: money(amount),
    personalBalanceAfter: money(500), clubBalanceAfter: money(600), distributableBefore: money(700),
    correlationId: `c-${teamId}`, season: 1, day: 1, replayed: false
  });

  beforeEach(async () => {
    api = jasmine.createSpyObj<ChairmanClubService>('ChairmanClubService',
      ['clubs', 'dashboard', 'quote', 'execute', 'transfer']);
    api.clubs.and.returnValue(of([club(7), club(8, true, true)]));
    api.dashboard.and.callFake(teamId => of(dashboard(teamId)));
    api.quote.and.callFake(teamId => of(quote(teamId)));
    api.execute.and.callFake(teamId => of(execution(teamId)));
    api.transfer.and.returnValue(of({} as any));
    routeParams = new BehaviorSubject<ParamMap>(convertToParamMap({ teamId: '7' }));
    routeQuery = new BehaviorSubject<ParamMap>(convertToParamMap({ scope: 'ALL' }));
    await TestBed.configureTestingModule({
      declarations: [ChairmanClubComponent],
      imports: [CommonModule, FormsModule, RouterTestingModule],
      providers: [
        { provide: ChairmanClubService, useValue: api },
        { provide: ActivatedRoute, useValue: {
          paramMap: routeParams.asObservable(), queryParamMap: routeQuery.asObservable()
        } },
      ]
    }).compileComponents();
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture = TestBed.createComponent(ChairmanClubComponent);
    component = fixture.componentInstance;
  });

  function start(): void { fixture.detectChanges(); }

  it('loads ALL by default and gives each tab its backend scope', () => {
    start();
    expect(api.clubs).toHaveBeenCalledWith('ALL');
    component.selectScope('HELD');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { scope: 'HELD' }
    }));
    routeQuery.next(convertToParamMap({ scope: 'HELD' }));
    routeQuery.next(convertToParamMap({ scope: 'CONTROLLED' }));
    expect(api.clubs.calls.allArgs().map(args => args[0])).toEqual(['ALL', 'HELD', 'CONTROLLED']);
  });

  it('normalizes an invalid query scope to ALL', () => {
    routeQuery.next(convertToParamMap({ scope: 'NOT_VALID' }));
    start();
    expect(component.scope).toBe('ALL');
    expect(api.clubs).toHaveBeenCalledWith('ALL');
  });

  it('updates scope from browser back and forward navigation', () => {
    start();
    routeQuery.next(convertToParamMap({ scope: 'HELD' }));
    routeQuery.next(convertToParamMap({ scope: 'CONTROLLED' }));
    routeQuery.next(convertToParamMap({ scope: 'ALL' }));
    expect(component.scope).toBe('ALL');
    expect(api.clubs.calls.allArgs().map(args => args[0])).toEqual(['ALL', 'HELD', 'CONTROLLED', 'ALL']);
  });

  it('ignores a late catalog response from the previous scope', () => {
    const all = new Subject<ChairmanClubSummary[]>();
    const held = new Subject<ChairmanClubSummary[]>();
    api.clubs.and.callFake(scope => scope === 'ALL' ? all.asObservable() : held.asObservable());
    start();
    routeQuery.next(convertToParamMap({ scope: 'HELD' }));
    all.next([club(99)]);
    held.next([club(8, true, true)]);
    expect(component.clubs.map(value => value.teamId)).toEqual([8]);
  });

  it('does not request a private dashboard for a public club', () => {
    api.clubs.and.returnValue(of([club(7, false, true)]));
    start();
    expect(component.selectedClub?.controlledByPrincipal).toBeFalse();
    expect(api.dashboard).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Request takeover quote');
    expect(fixture.nativeElement.textContent).not.toContain('Club treasury');
  });

  it('refreshes selectedClub when the same team loses canonical control', () => {
    api.clubs.and.returnValues(of([club(7, true, true)]), of([club(7, false, true)]));
    start();
    expect(component.dashboard).not.toBeNull();
    component.retryClubs();
    expect(component.selectedClub?.controlledByPrincipal).toBeFalse();
    expect(component.dashboard).toBeNull();
    expect(component.quote).toBeNull();
  });

  it('refreshes selectedClub when the same team gains canonical control', () => {
    api.clubs.and.returnValues(of([club(7, false, true)]), of([club(7, true, true)]));
    start();
    component.retryClubs();
    expect(component.selectedClub?.controlledByPrincipal).toBeTrue();
    expect(api.dashboard).toHaveBeenCalledWith(7);
  });

  it('canonicalizes a requested team absent from the current scope', () => {
    routeParams.next(convertToParamMap({ teamId: '99' }));
    api.clubs.and.returnValue(of([club(7), club(8, true, true)]));
    start();

    expect(component.selectedTeamId).toBe(8);
    expect(router.navigate).toHaveBeenCalledWith(['/chairman/clubs', 8], {
      queryParams: { scope: 'ALL' }, replaceUrl: true
    });
  });

  it('canonicalizes an invalid scope query to ALL with replaceUrl', () => {
    routeQuery.next(convertToParamMap({ scope: 'BROKEN' }));
    start();

    expect(component.scope).toBe('ALL');
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { scope: 'ALL' }, replaceUrl: true
    }));
  });

  it('canonicalizes the same invalid team again after the route becomes valid', () => {
    routeParams.next(convertToParamMap({ teamId: '99' }));
    api.clubs.and.returnValue(of([club(7), club(8, true, true)]));
    start();
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect((router.navigate as jasmine.Spy).calls.mostRecent().args).toEqual([
      ['/chairman/clubs', 8], { queryParams: { scope: 'ALL' }, replaceUrl: true }
    ]);

    routeParams.next(convertToParamMap({ teamId: '8' }));
    routeParams.next(convertToParamMap({ teamId: '99' }));

    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect((router.navigate as jasmine.Spy).calls.mostRecent().args).toEqual([
      ['/chairman/clubs', 8], { queryParams: { scope: 'ALL' }, replaceUrl: true }
    ]);
  });

  it('requests a dashboard only for a controlled club', () => {
    api.clubs.and.returnValue(of([club(8, true, true)]));
    routeParams.next(convertToParamMap({ teamId: '8' }));
    start();
    expect(api.dashboard).toHaveBeenCalledWith(8);
    expect(fixture.nativeElement.textContent).toContain('Club treasury');
  });

  it('ignores a stale dashboard after switching clubs', () => {
    const first = new Subject<ChairmanClubDashboard>();
    const second = new Subject<ChairmanClubDashboard>();
    api.clubs.and.returnValue(of([club(7, true, true), club(8, true, true)]));
    api.dashboard.and.callFake(teamId => teamId === 7 ? first.asObservable() : second.asObservable());
    start();
    routeParams.next(convertToParamMap({ teamId: '8' }));
    second.next(dashboard(8));
    first.next(dashboard(7));
    expect(component.selectedTeamId).toBe(8);
    expect(component.dashboard?.teamId).toBe(8);
  });

  it('ignores late quote, execute and transfer results after club selection changes', () => {
    const quotePending = new Subject<TakeoverQuoteView>();
    api.quote.and.returnValue(quotePending.asObservable());
    start();
    component.requestQuote();
    routeParams.next(convertToParamMap({ teamId: '8' }));
    quotePending.next(quote(7));
    expect(component.quote).toBeNull();

    component.selectedClub = club(8, false, true);
    component.selectedTeamId = 8;
    const executePending = new Subject<TakeoverExecutionView>();
    api.execute.and.returnValue(executePending.asObservable());
    component.quote = quote(8);
    component.executeTakeover();
    routeParams.next(convertToParamMap({ teamId: '7' }));
    executePending.next(execution(8));
    expect(component.message).toBe('');

    component.selectedClub = club(8, true, true);
    component.selectedTeamId = 8;
    const transferPending = new Subject<any>();
    api.transfer.and.returnValue(transferPending.asObservable());
    component.amount = 500;
    component.transfer();
    routeParams.next(convertToParamMap({ teamId: '7' }));
    transferPending.next({ teamId: 8, direction: 'INJECTION', amount: money(500) });
    expect(component.amount).toBe(500);
  });

  it('renders canonical competition links, holdings and no hardcoded competition name', () => {
    api.clubs.and.returnValue(of([club(7, false, true)]));
    start();
    expect(fixture.nativeElement.textContent).toContain('Real League');
    expect(fixture.nativeElement.textContent).toContain('60');
    expect(fixture.nativeElement.textContent).toContain('60.00%');
    expect(fixture.nativeElement.textContent).not.toContain('Premier League');
    expect(fixture.nativeElement.querySelector('a[href="/competition/22"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/team/7"]')).not.toBeNull();
  });

  it('shows quote total, premium and expiry from the server and confirms control after execute', () => {
    api.clubs.and.returnValues(of([club(7)]), of([club(7, true, true)]));
    start();
    component.requestQuote();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('120');
    expect(fixture.nativeElement.textContent).toContain('20.00%');
    expect(fixture.nativeElement.textContent).toContain('10');
    component.executeTakeover();
    expect(api.execute).toHaveBeenCalledWith(7, 'q-7', jasmine.any(String));
    expect(api.dashboard).toHaveBeenCalledWith(7);
    expect(router.navigate).toHaveBeenCalledWith(['/chairman/clubs', 7], { queryParams: { scope: 'ALL' } });
  });

  it('rejects an execute request when the quote belongs to another club', () => {
    start();
    component.quote = quote(8);
    component.executeTakeover();

    expect(api.execute).not.toHaveBeenCalled();
    expect(component.quote).toBeNull();
    expect(component.actionError).toContain('different club');
  });

  it('ignores an execute response with a mismatched quote id', () => {
    start();
    component.quote = quote(7);
    api.execute.and.returnValue(of({ ...execution(7), teamId: 99, quoteId: 'wrong-quote' }));
    component.executeTakeover();

    expect(component.actionError).toContain('did not match');
    expect(component.quote?.quoteId).toBe('q-7');
    expect(api.dashboard).toHaveBeenCalledTimes(0);
  });

  it('ignores a treasury response with a mismatched amount', () => {
    api.clubs.and.returnValue(of([club(7, true, true)]));
    start();
    component.amount = 500;
    api.transfer.and.returnValue(of({
      teamId: 7, direction: 'INJECTION', amount: money(499)
    } as TreasuryTransferView));
    component.transfer();

    expect(component.amount).toBe(500);
    expect(component.message).toBe('');
    expect(component.actionError).toContain('did not match');
    expect(api.dashboard).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate quote submissions', () => {
    const quotePending = new Subject<TakeoverQuoteView>();
    api.quote.and.returnValue(quotePending.asObservable());
    start();
    component.requestQuote();
    component.requestQuote();
    expect(api.quote).toHaveBeenCalledTimes(1);
    quotePending.next(quote(7));
    quotePending.complete();
  });

  it('blocks duplicate transfer submissions and releases inFlight after valid completion', () => {
    const transferPending = new Subject<TreasuryTransferView>();
    api.clubs.and.returnValue(of([club(7, true, true)]));
    api.transfer.and.returnValue(transferPending.asObservable());
    start();

    component.amount = 500;
    component.direction = 'INJECTION';
    component.transfer();
    component.transfer();
    expect(api.transfer).toHaveBeenCalledTimes(1);
    expect(component.inFlight).toBe('transfer');
    transferPending.next(treasuryTransfer(7, 'INJECTION', 500));
    transferPending.complete();
    expect(component.inFlight).toBeNull();
  });

  it('maps stale quote errors and clears the quote and its key', () => {
    api.quote.and.returnValue(throwError(() => ({ error: { code: 'TAKEOVER_QUOTE_STALE' } })));
    start();
    component.requestQuote();
    expect(component.actionError).toBe('The club valuation or ownership changed. Request a new quote.');
    expect(component.quote).toBeNull();
    api.quote.and.returnValue(of(quote(7)));
    component.requestQuote();
    expect(api.quote.calls.mostRecent().args[1]).not.toBe(api.quote.calls.argsFor(0)[1]);
  });

  it('reuses a transient action key on retry', () => {
    api.quote.and.returnValues(
      throwError(() => ({ error: { message: 'temporary' } })), of(quote(7)));
    start();
    component.requestQuote();
    const firstKey = api.quote.calls.argsFor(0)[1];
    component.requestQuote();
    expect(api.quote.calls.argsFor(1)[1]).toBe(firstKey);
  });

  it('rotates the affected key after an idempotency mismatch', () => {
    api.quote.and.returnValues(
      throwError(() => ({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'mismatch' } })),
      of(quote(7)));
    start();
    component.requestQuote();
    const firstKey = api.quote.calls.argsFor(0)[1];
    component.requestQuote();
    expect(api.quote.calls.argsFor(1)[1]).not.toBe(firstKey);
  });

  it('preserves an unknown API error message', () => {
    api.quote.and.returnValue(throwError(() => ({ error: { code: 'NEW_CODE', message: 'Server says no' } })));
    start();
    component.requestQuote();
    expect(component.actionError).toBe('Server says no');
  });

  it('retries catalog and dashboard errors', () => {
    api.clubs.and.returnValues(
      throwError(() => ({ error: { message: 'catalog unavailable' } })), of([club(7, true, true)]));
    start();
    expect(component.clubsError).toBe('catalog unavailable');
    component.retryClubs();
    expect(component.selectedClub?.teamId).toBe(7);

    api.dashboard.and.returnValues(
      throwError(() => ({ error: { message: 'dashboard unavailable' } })), of(dashboard(7)));
    component.retryDashboard();
    expect(component.dashboardError).toBe('dashboard unavailable');
    component.retryDashboard();
    expect(component.dashboard?.teamId).toBe(7);
  });

  it('uses distinct empty messages for each catalog scope', () => {
    api.clubs.and.returnValue(of([]));
    start();
    expect(fixture.nativeElement.textContent).toContain('No clubs are available.');
    routeQuery.next(convertToParamMap({ scope: 'HELD' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You do not currently hold shares in any club.');
    routeQuery.next(convertToParamMap({ scope: 'CONTROLLED' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You do not currently control a club.');
  });
});
