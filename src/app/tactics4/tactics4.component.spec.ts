import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { Tactics4Component } from './tactics4.component';

describe('Tactics4Component chairman mandate mode', () => {
  function build(mode: string | null, auth: any = {
    isLoggedIn: true, careerRole: 'CHAIRMAN', chairmanEnabled: true
  }) {
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    http.get.and.callFake((url: string) => {
      if (url.includes('/tactic/getPlayers/')) return of([]);
      if (url.includes('/tactic/getAllPossibleTactics/')) return of([{ tacticName: '442', totalRating: 0 }]);
      if (url.includes('/tactic/formationLayout/')) return of([]);
      return of({});
    });
    const route = { queryParamMap: of(convertToParamMap(mode ? { mode } : {})), params: of(convertToParamMap({ teamId: '10' })) } as unknown as ActivatedRoute;
    const team = { teamId: 10 };
    const ratingTiers = { tierColor: () => '#fff' };
    const permissions = { getLockState: () => of({ isPickXiAllowed: true, lockedSlots: new Set(), lockedPositions: new Set() }) };
    const admin = { isAuthenticated: false };
    const mandateApi = jasmine.createSpyObj('ChairmanClubService', ['tacticalMandate', 'saveTacticalMandate']);
    mandateApi.tacticalMandate.and.returnValue(of({ teamId: 10, requiredFormation: null, lockedSlots: [], version: 0 }));
    mandateApi.saveTacticalMandate.and.returnValue(of({ teamId: 10, requiredFormation: '442', lockedSlots: [], version: 1 }));
    const component = new Tactics4Component(route, http, team as any, ratingTiers as any,
      permissions as any, admin as any, auth, mandateApi);
    return { component, http, mandateApi };
  }

  it('does not request tactical mandate in manager mode', () => {
    const built = build(null, { isLoggedIn: true, careerRole: 'MANAGER', chairmanEnabled: true });
    built.component.ngOnInit();
    expect(built.mandateApi.tacticalMandate).not.toHaveBeenCalled();
  });

  it('enters Chairman mode only for the authenticated enabled Chairman', () => {
    const enabled = build('chairman-mandate');
    enabled.component.ngOnInit();
    expect(enabled.component.isChairmanMode).toBeTrue();
    expect(enabled.mandateApi.tacticalMandate).toHaveBeenCalledWith(10);

    const manager = build('chairman-mandate', { isLoggedIn: true, careerRole: 'MANAGER', chairmanEnabled: true });
    manager.component.ngOnInit();
    expect(manager.component.isChairmanMode).toBeFalse();
    expect(manager.mandateApi.tacticalMandate).not.toHaveBeenCalled();
  });

  it('does not call manager saveFormation or askAssistant in Chairman mode', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.component.teamId = 10;
    built.component.ngOnInit();
    built.component.saveData();
    built.component.askAssistant();

    expect(built.http.post).not.toHaveBeenCalled();
    expect(built.http.get.calls.allArgs().some((args: any[]) => String(args[0]).includes('/tactic/askAssistant/'))).toBeFalse();
  });

  it('saves the exact mandate version and locks without using manager save endpoints', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.component.ngOnInit();
    built.component.chairmanMandate = { teamId: 10, requiredFormation: '442', lockedSlots: [], version: 4 } as any;
    built.component.chairmanFormationEnabled = true;
    built.component.selectedTactic = '442';
    built.component.allowedIndexes = [1];
    built.component.players = [{ id: 42, name: 'Player', rating: 10, position: 'MC' } as any];
    built.component.fieldPositions[1].player = built.component.players[0];
    built.component.toggleChairmanLock(1);
    built.component.saveChairmanMandate();

    expect(built.mandateApi.saveTacticalMandate).toHaveBeenCalledWith(10, {
      requiredFormation: '442', lockedSlots: [{ positionIndex: 1, playerId: 42 }], expectedVersion: 4
    });
    expect(built.http.post).not.toHaveBeenCalled();
  });

  it('keeps incompatible locks and blocks saving instead of relocating them', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.component.ngOnInit();
    built.component.chairmanFormationEnabled = true;
    built.component.selectedTactic = '433';
    built.component.chairmanLocks = [{ positionIndex: 29, playerId: 42 }];
    built.component.allowedIndexes = [1, 3, 10];
    built.component.saveChairmanMandate();

    expect(built.component.chairmanInvalidLocks).toEqual([{ positionIndex: 29, playerId: 42 }]);
    expect(built.mandateApi.saveTacticalMandate).not.toHaveBeenCalled();
    expect(built.component.chairmanLocks).toEqual([{ positionIndex: 29, playerId: 42 }]);
  });

  it('blocks duplicate saves while the first PUT is in flight', () => {
    const built = build('chairman-mandate');
    built.component.ngOnInit();
    built.component.chairmanFormationEnabled = true;
    built.component.selectedTactic = '442';
    built.component.allowedIndexes = [1];
    const pending = new Subject<any>();
    built.mandateApi.saveTacticalMandate.and.returnValue(pending.asObservable());

    built.component.saveChairmanMandate();
    built.component.saveChairmanMandate();

    expect(built.mandateApi.saveTacticalMandate).toHaveBeenCalledTimes(1);
    pending.next({ teamId: 10, requiredFormation: '442', lockedSlots: [], version: 1 });
    pending.complete();
  });

  it('refreshes after a stale PUT without retrying the PUT', () => {
    const built = build('chairman-mandate');
    built.component.ngOnInit();
    built.component.chairmanFormationEnabled = true;
    built.component.selectedTactic = '442';
    built.component.allowedIndexes = [1];
    built.mandateApi.saveTacticalMandate.and.returnValue(
      throwError(() => ({ error: { code: 'TACTICAL_MANDATE_STALE', message: 'stale' } })));

    built.component.saveChairmanMandate();

    expect(built.mandateApi.saveTacticalMandate).toHaveBeenCalledTimes(1);
    expect(built.mandateApi.tacticalMandate).toHaveBeenCalledTimes(2);
  });

  it('uses the ngModel checkbox value for both OFF to ON and ON to OFF payloads', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.component.teamId = 10;
    built.component.chairmanMandate = { teamId: 10, requiredFormation: null, lockedSlots: [], version: 3 } as any;
    built.component.chairmanReadOnly = false;
    built.component.selectedTactic = '433';
    built.component.chairmanFormationEnabled = true;
    built.component.toggleChairmanFormation();
    expect(built.component.chairmanRequiredFormation).toBe('433');

    built.component.chairmanFormationEnabled = false;
    built.component.toggleChairmanFormation();
    expect(built.component.chairmanRequiredFormation).toBeNull();
    built.component.saveChairmanMandate();
    expect(built.mandateApi.saveTacticalMandate).toHaveBeenCalledWith(10, jasmine.objectContaining({
      requiredFormation: null, expectedVersion: 3
    }));
  });

  it('keeps Chairman lock pairs immutable across pitch drag, squad drag, drop and right-click', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    const locked = { id: 42, name: 'Locked', rating: 80, position: 'MC' } as any;
    const free = { id: 43, name: 'Free', rating: 79, position: 'MC' } as any;
    built.component.chairmanReadOnly = false;
    built.component.players = [locked, free];
    built.component.chairmanLocks = [{ positionIndex: 1, playerId: 42 }];
    built.component.allowedIndexes = [1, 2];
    built.component.fieldPositions[1].player = locked;
    built.component.fieldPositions[2].player = free;

    const transfer = (player: any) => ({ dataTransfer: { getData: () => JSON.stringify(player), setData: () => {} } } as any);
    built.component.drag({ dataTransfer: { setData: jasmine.createSpy('setData') } } as any, locked);
    expect(built.component.fieldPositions[1].player).toBe(locked);
    built.component.drop(transfer(free), 1);
    expect(built.component.fieldPositions[1].player).toBe(locked);
    built.component.dropSubstitute(transfer(locked), 0);
    expect(built.component.substitutes[0].player).toBeNull();
    built.component.onRightClick(1, { preventDefault: () => {} } as any);
    expect(built.component.fieldPositions[1].player).toBe(locked);

    built.component.drop(transfer(free), 2);
    expect(built.component.fieldPositions[2].player).toEqual(free);
    built.component.toggleChairmanLock(1);
    expect(built.component.chairmanLocks).toEqual([]);
  });

  it('ignores an older team load after a newer team generation completes', () => {
    const players10 = new Subject<any[]>();
    const tactics10 = new Subject<any[]>();
    const view10 = new Subject<any>();
    const players20 = new Subject<any[]>();
    const tactics20 = new Subject<any[]>();
    const view20 = new Subject<any>();
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    http.get.and.callFake((url: string) => {
      if (url.includes('/tactic/getPlayers/10')) return players10.asObservable();
      if (url.includes('/tactic/getAllPossibleTactics/10')) return tactics10.asObservable();
      if (url.includes('/tactic/teamView/10')) return view10.asObservable();
      if (url.includes('/tactic/getPlayers/20')) return players20.asObservable();
      if (url.includes('/tactic/getAllPossibleTactics/20')) return tactics20.asObservable();
      if (url.includes('/tactic/teamView/20')) return view20.asObservable();
      return of({});
    });
    const route = { queryParamMap: of(convertToParamMap({})), params: of(convertToParamMap({ teamId: '10' })) } as any;
    const component = new Tactics4Component(route, http, { teamId: 10 } as any,
      { tierColor: () => '#fff' } as any, { getLockState: () => of({}) } as any,
      { isAuthenticated: false } as any, { isLoggedIn: false } as any, build(null).mandateApi);
    component.teamId = 10;
    component.ngOnInit();
    component.teamId = 20;
    component.ngOnChanges({ teamId: { firstChange: false } } as any);
    players10.next([{ id: 10, name: 'old', rating: 1, position: 'GK' }]); players10.complete();
    tactics10.next([{ tacticName: '442', totalRating: 0 }]); tactics10.complete();
    view10.next({ managerName: 'old' }); view10.complete();
    players20.next([{ id: 20, name: 'new', rating: 2, position: 'GK' }]); players20.complete();
    tactics20.next([{ tacticName: '433', totalRating: 0 }]); tactics20.complete();
    view20.next({ managerName: 'new' }); view20.complete();
    expect(component.players.map(player => player.id)).toEqual([20]);
    expect(component.managerName).toBe('new');
  });

  it('resets manager context before switching to Chairman and ignores late manager data', () => {
    const mode$ = new Subject<any>();
    const managerPlayers = new Subject<any[]>();
    const managerTactics = new Subject<any[]>();
    const managerView = new Subject<any>();
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    http.get.and.callFake((url: string) => {
      if (url.includes('/tactic/getPlayers/20')) return managerPlayers.asObservable();
      if (url.includes('/tactic/getAllPossibleTactics/20')) return managerTactics.asObservable();
      if (url.includes('/tactic/teamView/20')) return managerView.asObservable();
      if (url.includes('/tactic/getPlayers/30')) return of([{ id: 30, name: 'Chairman player', rating: 90, position: 'GK' }]);
      if (url.includes('/tactic/getAllPossibleTactics/30')) return of([{ tacticName: '433', totalRating: 0 }]);
      if (url.includes('/tactic/formationLayout/433')) return of([]);
      return of({});
    });
    const mandateApi = jasmine.createSpyObj('ChairmanClubService', ['tacticalMandate', 'saveTacticalMandate']);
    mandateApi.tacticalMandate.and.returnValue(of({ teamId: 30, requiredFormation: '433', lockedSlots: [], version: 1 }));
    const route = { queryParamMap: mode$.asObservable(), params: of(convertToParamMap({ teamId: '20' })) } as any;
    const component = new Tactics4Component(route, http, { teamId: 20 } as any,
      { tierColor: () => '#fff' } as any, { getLockState: () => of({}) } as any,
      { isAuthenticated: false } as any, { isLoggedIn: true, careerRole: 'CHAIRMAN', chairmanEnabled: true } as any,
      mandateApi);
    component.teamId = 20;
    component.ngOnInit();
    mode$.next(convertToParamMap({}));
    component.teamId = 30;
    mode$.next(convertToParamMap({ mode: 'chairman-mandate' }));

    managerPlayers.next([{ id: 20, name: 'late manager player', rating: 99, position: 'GK' }]);
    managerPlayers.complete(); managerTactics.next([{ tacticName: '442', totalRating: 0 }]); managerTactics.complete();
    managerView.next({ managerName: 'late manager' }); managerView.complete();

    expect(component.players.map(player => player.id)).toEqual([30]);
    expect(component.managerName).toBe('Manager');
    expect(component.selectedTactic).toBe('433');
    expect(component.chairmanMandate?.teamId).toBe(30);
  });

  it('keeps a technical GET failure read-only and retries before allowing versioned PUT', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.mandateApi.tacticalMandate.and.returnValues(
      throwError(() => ({ status: 500, message: 'server down' })),
      of({ teamId: 10, requiredFormation: null, lockedSlots: [], version: 7 }));
    built.component.ngOnInit();

    expect(built.component.chairmanMandate).toBeNull();
    expect(built.component.chairmanReadOnly).toBeTrue();
    expect(built.component.chairmanControlDenied).toBeFalse();
    expect(built.component.canEdit).toBeFalse();
    built.component.saveChairmanMandate();
    expect(built.mandateApi.saveTacticalMandate).not.toHaveBeenCalled();

    built.component.retryChairmanMandate();
    expect(built.mandateApi.tacticalMandate).toHaveBeenCalledTimes(2);
    expect(built.component.chairmanMandate?.version).toBe(7);
    expect(built.component.chairmanReadOnly).toBeFalse();
    expect(built.component.canEdit).toBeTrue();
    built.component.saveChairmanMandate();
    expect(built.mandateApi.saveTacticalMandate).toHaveBeenCalledWith(10,
      jasmine.objectContaining({ expectedVersion: 7 }));
  });

  it('reconciles Chairman locks after each prerequisite regardless of response order', () => {
    const built = build('chairman-mandate');
    const component = built.component as any;
    built.component.ngOnInit();
    expect(component.isChairmanMode).toBeTrue();
    component.formationOptions = [{ key: '442', label: '4-4-2' }];
    component.selectedTactic = '';
    component.applyChairmanLocksToField = jasmine.createSpy('applyLocks');
    component.updateChairmanInvalidLocks = jasmine.createSpy('invalidLocks');

    for (const prerequisite of ['players', 'formations', 'layout', 'mandate']) {
      component.reconcileChairmanPrerequisites();
      expect(component.selectedTactic).toBe('442', prerequisite);
      expect(component.applyChairmanLocksToField).toHaveBeenCalled();
      expect(component.updateChairmanInvalidLocks).toHaveBeenCalled();
    }
  });

  it('materializes persistent locks for different prerequisite response orders', () => {
    const orders = [
      ['players', 'formations', 'mandate', 'layout'],
      ['formations', 'layout', 'players', 'mandate']
    ];
    for (const order of orders) {
      const built = build('chairman-mandate');
      const players = new Subject<any[]>();
      const formations = new Subject<any[]>();
      const layout = new Subject<any[]>();
      let playerRequests = 0;
      let layoutRequests = 0;
      built.http.get.and.callFake((url: string) => {
        if (url.includes('/tactic/getPlayers/')) return playerRequests++ === 0 ? players.asObservable() : of([]);
        if (url.includes('/tactic/getAllPossibleTactics/')) return formations.asObservable();
        if (url.includes('/tactic/formationLayout/')) return layoutRequests++ === 0 ? layout.asObservable() : of([{ index: 1 }]);
        return of({});
      });
      const mandate = new Subject<any>();
      built.mandateApi.tacticalMandate.and.returnValue(mandate.asObservable());
      built.component.ngOnInit();
      if (order[0] === 'layout') built.component.setFormationIndices('442');
      for (const prerequisite of order) {
        if (prerequisite === 'players') players.next([{ id: 42, name: 'Player', rating: 10, position: 'MC' }]);
        if (prerequisite === 'formations') formations.next([{ tacticName: '442', totalRating: 0 }]);
        if (prerequisite === 'layout') {
          if (layoutRequests === 0) built.component.setFormationIndices('442');
          layout.next([{ index: 1 }]);
        }
        if (prerequisite === 'mandate') mandate.next({ teamId: 10, requiredFormation: '442', lockedSlots: [{ positionIndex: 1, playerId: 42 }], version: 1 });
      }
      expect(built.component.fieldPositions[1].player?.id).toBe(42);
      expect(built.component.chairmanInvalidLocks).toEqual([]);
    }
  });

  it('reconciles and materializes locks after Players failure and retry', () => {
    const built = build('chairman-mandate');
    const playersFailed = new Subject<any[]>();
    const playersRetry = new Subject<any[]>();
    const formations = new Subject<any[]>();
    const mandate = new Subject<any>();
    let playerRequests = 0;
    built.http.get.and.callFake((url: string) => {
      if (url.includes('/tactic/getPlayers/')) return (playerRequests++ === 0 ? playersFailed : playersRetry).asObservable();
      if (url.includes('/tactic/getAllPossibleTactics/')) return formations.asObservable();
      if (url.includes('/tactic/formationLayout/')) return of([{ index: 1 }]);
      return of({});
    });
    built.mandateApi.tacticalMandate.and.returnValue(mandate.asObservable());
    built.component.ngOnInit();
    formations.next([{ tacticName: '442', totalRating: 0 }]);
    mandate.next({ teamId: 10, requiredFormation: '442', lockedSlots: [{ positionIndex: 1, playerId: 42 }], version: 1 });
    playersFailed.error(new Error('temporary players failure'));
    expect(built.component.playersError).toContain('Players could not be loaded');

    built.component.retryPlayers();
    playersRetry.next([{ id: 42, name: 'Player', rating: 10, position: 'MC' }]);
    expect(built.component.fieldPositions[1].player?.id).toBe(42);
    expect(built.component.chairmanInvalidLocks).toEqual([]);
  });

  it('represents a loaded version-zero mandate as an explicit empty state', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.component.chairmanMandate = { teamId: 10, requiredFormation: null, lockedSlots: [], version: 0 } as any;
    built.component.chairmanRequiredFormation = null;
    built.component.chairmanLocks = [];
    built.component.chairmanLoaded = true;
    expect(built.component.chairmanHasRestrictions).toBeFalse();
    expect(built.component.chairmanMandate).not.toBeNull();
  });

  it('unlocks an absent-player lock by position without changing other locks', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.component.teamId = 10;
    built.component.chairmanReadOnly = false;
    built.component.chairmanMandate = { teamId: 10, requiredFormation: null,
      lockedSlots: [{ positionIndex: 5, playerId: 999 }, { positionIndex: 6, playerId: 7 }], version: 2 } as any;
    built.component.chairmanLocks = [{ positionIndex: 5, playerId: 999 }, { positionIndex: 6, playerId: 7 }];
    built.component.players = [{ id: 7, name: 'Other', rating: 70, position: 'MC' } as any];

    expect(built.component.chairmanLockLabel({ positionIndex: 5, playerId: 999 })).toBe('Slot 5 · Player 999');
    built.component.unlockChairmanLock(5);
    expect(built.component.chairmanLocks).toEqual([{ positionIndex: 6, playerId: 7 }]);
    built.component.saveChairmanMandate();
    expect(built.mandateApi.saveTacticalMandate).toHaveBeenCalledWith(10,
      jasmine.objectContaining({ lockedSlots: [{ positionIndex: 6, playerId: 7 }] }));
  });
});
