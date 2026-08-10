import { of, throwError } from 'rxjs';
import { PlayerComponent } from './player.component';

describe('PlayerComponent Phase 1A', () => {
  function createFixture(getResponse: (url: string) => any): { component: PlayerComponent; http: jasmine.SpyObj<any> } {
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post', 'delete']);
    http.get.and.callFake((url: string) => getResponse(url));
    http.post.and.returnValue(of({}));
    http.delete.and.returnValue(of({}));
    const route = {
      params: of({ playerId: '7' }),
      queryParamMap: of({ get: () => null }),
      snapshot: { queryParamMap: { get: () => null } }
    };
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const teamService = { teamId: 99, currentSeason: 4, transferWindowOpen: true };
    const authService = { careerRole: 'MANAGER' };
    const adminService = { isAuthenticated: false };
    return {
      component: new PlayerComponent(
        http as any, route as any, router, teamService as any, authService as any, adminService as any
      ),
      http
    };
  }

  function createComponent(getResponse: (url: string) => any): PlayerComponent {
    return createFixture(getResponse).component;
  }

  it('uses only reported identity values and honest missing-value labels', () => {
    const component = createComponent(() => of({}));

    component.playerView = {};
    expect(component.shirtNumberLabel).toBe('—');
    expect(component.positionLabel).toBe('Unknown');
    expect(component.ratingLabel).toBe('—');
    expect(component.preferredFootLabel).toBe('Unknown');

    component.playerView = { shirtNumber: 1, position: 'GK', rating: 12, preferredFoot: 'Left' };
    expect(component.shirtNumberLabel).toBe(1);
    expect(component.positionLabel).toBe('GK');
    expect(component.ratingLabel).toBe(12);
    expect(component.preferredFootLabel).toBe('Left');
  });

  it('does not create a club route for free agents or missing team ids', () => {
    const component = createComponent(() => of({}));

    for (const teamId of [0, -1, null, undefined, 'N/A']) {
      component.playerView = { teamId, teamName: 'N/A' };
      expect(component.teamRoute).toBeNull();
      expect(component.teamLabel).toBe('No club');
    }

    component.playerView = { teamId: 8, teamName: 'Orbit FC' };
    expect(component.teamRoute).toEqual(['/team', 8]);
    expect(component.teamLabel).toBe('Orbit FC');
  });

  it('shows the Stay Forward badge only from the explicit API flag', () => {
    const component = createComponent(() => of({}));

    for (const playerView of [
      {},
      { name: 'Kvekrpur' },
      { name: 'Kvekrpur', stayForward: false },
      { name: 'Kvekrpur', stayForward: null }
    ]) {
      component.playerView = playerView;
      expect(component.hasStayForwardTrait()).toBeFalse();
    }

    component.playerView = { name: 'Kvekrpur', stayForward: true };
    expect(component.hasStayForwardTrait()).toBeTrue();
  });

  it('exposes loading success and retryable not-found states', () => {
    const success = createComponent((url: string) => {
      if (url.includes('/humans/7')) return of({ id: 7, name: 'Keeper', teamId: 1, position: 'GK' });
      if (url.includes('/shortlist/check/7')) return of({ inShortlist: false });
      if (url.includes('/stats/playerForm/7')) return of(null);
      if (url.includes('/tactic/allRoleSuitabilities/7')) return of([]);
      if (url.includes('/awards/player/7')) return of({ goldenBoots: 0, ballonDors: 0, awards: [] });
      return of(null);
    });
    success.ngOnInit();
    expect(success.loading).toBeFalse();
    expect(success.errorMessage).toBe('');
    expect(success.playerView.name).toBe('Keeper');

    const missing = createComponent((url: string) => url.includes('/humans/7')
      ? throwError(() => ({ status: 404 }))
      : of({ goldenBoots: 0, ballonDors: 0, awards: [] }));
    missing.ngOnInit();
    expect(missing.loading).toBeFalse();
    expect(missing.playerView).toBeNull();
    expect(missing.errorMessage).toBe('Player not found.');
  });

  it('preserves competition identity in season-stat mappings', () => {
    const component = createComponent((url: string) => {
      if (url.includes('/stats/getStats/7/4')) {
        return of({
          4: {
            teamName: 'Cluj Orbit',
            seasonNumber: 4,
            competitionEntries: [{
              competitionId: 21,
              competitionTypeId: 4,
              competitionName: 'League of Champions',
              games: 3,
              gamesAsSubstitute: 1,
              goals: 2,
              assists: 1,
              avgRating: 74.25
            }]
          }
        });
      }
      return of(null);
    });
    component.playerId = 7;
    component.selectedSeason = 4;
    component.fetchSeasonStats();

    expect(component.seasonStats.competitions[0].competitionId).toBe(21);
    expect(component.seasonStats.competitions[0].competitionTypeId).toBe(4);
    expect(component.competitionLink(component.seasonStats.competitions[0]))
      .toEqual(['/european-rounds', 21, 4]);
  });

  it('shows the correct direct market action for club players and free agents', () => {
    const component = createComponent(() => of(null));

    component.playerView = { id: 7, teamId: 8, isFreeAgent: false, isRetired: false };
    expect(component.canMakeTransferOffer()).toBeTrue();
    expect(component.canOfferFreeAgentContract()).toBeFalse();

    component.playerView = { id: 7, teamId: 0, isFreeAgent: true, isRetired: false };
    expect(component.canMakeTransferOffer()).toBeFalse();
    expect(component.canOfferFreeAgentContract()).toBeTrue();

    component.playerView = { id: 7, teamId: 99, isFreeAgent: false, isRetired: false };
    expect(component.canMakeTransferOffer()).toBeFalse();
    expect(component.canOfferFreeAgentContract()).toBeFalse();
  });

  it('submits direct offers with the active club identity', () => {
    const fixture = createFixture(() => of(null));
    fixture.component.playerId = 7;
    fixture.component.playerView = { id: 7, name: 'Target', teamId: 8, isFreeAgent: false };
    fixture.http.post.and.returnValue(of({ status: 'counter', askingPrice: 125000 }));

    fixture.component.submitTransferOffer(100000);

    expect(fixture.http.post.calls.mostRecent().args[0]).toContain('/transferOffer/makeOffer');
    expect(fixture.http.post.calls.mostRecent().args[1]).toEqual({
      playerId: 7,
      offerAmount: 100000,
      teamId: 99
    });
  });

  it('submits free-agent contract terms from the profile', () => {
    const fixture = createFixture(() => of(null));
    fixture.component.playerId = 7;
    fixture.component.playerView = { id: 7, name: 'Free Player', teamId: 0, isFreeAgent: true };
    fixture.component.freeAgentWageOffer = 12000;
    fixture.component.freeAgentContractYears = 3;
    fixture.http.post.and.returnValue(of({ success: false, message: 'Higher wage required.' }));

    fixture.component.submitFreeAgentContract();

    expect(fixture.http.post.calls.mostRecent().args[0]).toContain('/transferOffer/signFreeAgent');
    expect(fixture.http.post.calls.mostRecent().args[1]).toEqual({
      playerId: 7,
      offeredWage: 12000,
      contractYears: 3,
      teamId: 99
    });
  });
});
