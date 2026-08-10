import { convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { bindTabToUrl, navigateToTab, tabFromUrl } from './url-tab-state';

describe('URL tab state', () => {
  const tabs = ['overview', 'contract'] as const;

  it('restores valid tabs and falls back safely for invalid URLs', () => {
    const params = new BehaviorSubject(convertToParamMap({ tab: 'contract' }));
    const route: any = {
      queryParamMap: params.asObservable(),
      snapshot: { queryParamMap: convertToParamMap({ tab: 'contract' }) }
    };
    let active = 'overview';
    const subscription = bindTabToUrl(route, tabs, 'overview', tab => active = tab);

    expect(active).toBe('contract');
    expect(tabFromUrl(route, tabs, 'overview')).toBe('contract');

    params.next(convertToParamMap({ tab: 'unknown' }));
    expect(active).toBe('overview');
    subscription.unsubscribe();
  });

  it('pushes a navigable URL entry while preserving other query parameters', async () => {
    const route: any = {
      snapshot: { queryParamMap: convertToParamMap({ actingTeamId: '86' }) }
    };
    const router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    await navigateToTab(router, route, tabs, 'overview', 'contract');

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: { tab: 'contract' },
      queryParamsHandling: 'merge'
    });
  });
});
