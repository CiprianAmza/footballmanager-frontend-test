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
    built.component.ngOnInit();
    built.component.saveData();
    built.component.askAssistant();

    expect(built.http.post).not.toHaveBeenCalled();
    expect(built.http.get.calls.allArgs().some((args: any[]) => String(args[0]).includes('/tactic/askAssistant/'))).toBeFalse();
  });

  it('saves the exact mandate version and locks without using manager save endpoints', () => {
    const built = build('chairman-mandate');
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
});
