import { APP_ROUTES } from '../app-routing.module';

describe('experimental UI comparison routes', () => {
  it('keeps every comparison prototype on a separate route', () => {
    const paths = APP_ROUTES.map(route => route.path).filter(Boolean);
    expect(paths).toContain('home4');
    expect(paths).toContain('squad4/:teamId');
    expect(paths).toContain('tactics6/:teamId');
    expect(paths).toContain('match-centre2/:matchKey');
    expect(paths).toContain('ui-lab');
  });
});
