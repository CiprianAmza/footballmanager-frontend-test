import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ChairmanClubService } from '../services/chairman-club.service';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ClubCatalogScope, TakeoverExecutionView,
  TakeoverQuoteView
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
