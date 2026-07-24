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

  it('leaves Chairman loading read-only on GET failure and retries exactly once', () => {
    const built = build('chairman-mandate');
    built.component.chairmanModeRequested = true;
    built.mandateApi.tacticalMandate.and.returnValues(
      throwError(() => ({ error: { code: 'CLUB_NOT_FOUND', message: 'missing' } })),
      of({ teamId: 10, requiredFormation: null, lockedSlots: [], version: 0 }));
    built.component.chairmanReadOnly = true;
    built.component.chairmanMandate = null;
    built.component.retryChairmanMandate();
    expect(built.mandateApi.tacticalMandate).toHaveBeenCalledTimes(1);
    expect(built.component.canEdit).toBeFalse();
  });
});
