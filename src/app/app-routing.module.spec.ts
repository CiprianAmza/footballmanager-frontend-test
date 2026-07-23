import { APP_ROUTES } from './app-routing.module';
import { FeatureUnavailableComponent } from './feature-unavailable/feature-unavailable.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { LegacyBoardroomGuard } from './services/legacy-boardroom.guard';

describe('Phase 1A route manifest', () => {
  it('keeps legacy Boardroom pages behind the canonical redirect guard', () => {
    const legacy = APP_ROUTES.filter(route => route.path?.startsWith('boardroom'));
    const assetsWithoutId = legacy.find(route => route.path === 'boardroom/assets');
    expect(assetsWithoutId).toBeDefined();

    for (const route of legacy) {
      expect(route.canActivate).toContain(LegacyBoardroomGuard);
    }
  });

  it('uses honest unavailable pages for mock-only features', () => {
    expect(APP_ROUTES.find(route => route.path === 'dev-center')?.component).toBe(FeatureUnavailableComponent);
    expect(APP_ROUTES.find(route => route.path === 'squad-dynamics')?.component).toBe(FeatureUnavailableComponent);
  });

  it('ends with a wildcard Not Found route', () => {
    const lastRoute = APP_ROUTES[APP_ROUTES.length - 1];
    expect(lastRoute.path).toBe('**');
    expect(lastRoute.component).toBe(NotFoundComponent);
  });
});
