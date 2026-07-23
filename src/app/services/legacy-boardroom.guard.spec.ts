import { LegacyBoardroomGuard } from './legacy-boardroom.guard';

describe('LegacyBoardroomGuard', () => {
  function buildGuard(auth: any): { guard: LegacyBoardroomGuard; router: jasmine.SpyObj<any> } {
    const router = jasmine.createSpyObj('Router', ['parseUrl']);
    router.parseUrl.and.callFake((url: string) => url as any);
    return { guard: new LegacyBoardroomGuard(auth, router), router };
  }

  it('redirects an eligible Chairman to the canonical Economy page', () => {
    const { guard, router } = buildGuard({ isLoggedIn: true, careerRole: 'CHAIRMAN', regentEnabled: true });
    expect(guard.canActivate() as any).toBe('/economy');
    expect(router.parseUrl).toHaveBeenCalledOnceWith('/economy');
  });

  it('redirects every other legacy Boardroom request to Home', () => {
    for (const auth of [
      { isLoggedIn: false, careerRole: null, regentEnabled: false },
      { isLoggedIn: true, careerRole: 'MANAGER', regentEnabled: true },
      { isLoggedIn: true, careerRole: 'CHAIRMAN', regentEnabled: false }
    ]) {
      const { guard } = buildGuard(auth);
      expect(guard.canActivate() as any).toBe('/home');
    }
  });
});
