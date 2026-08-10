import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

/**
 * Keeps page-level tabs in the URL so browser Back/Forward restores the exact
 * subpage. The default tab is represented by a missing `tab` parameter to keep
 * canonical links short; non-tab query parameters are always preserved.
 */
export function tabFromUrl<T extends string>(
  route: ActivatedRoute,
  allowedTabs: readonly T[],
  defaultTab: T,
  paramName = 'tab'
): T {
  const requested = route.snapshot.queryParamMap.get(paramName) as T | null;
  return requested && allowedTabs.includes(requested) ? requested : defaultTab;
}

export function bindTabToUrl<T extends string>(
  route: ActivatedRoute,
  allowedTabs: readonly T[],
  defaultTab: T,
  activate: (tab: T) => void,
  paramName = 'tab'
): Subscription {
  return route.queryParamMap.subscribe(params => {
    const requested = params.get(paramName) as T | null;
    activate(requested && allowedTabs.includes(requested) ? requested : defaultTab);
  });
}

export function navigateToTab<T extends string>(
  router: Router,
  route: ActivatedRoute,
  allowedTabs: readonly T[],
  defaultTab: T,
  requestedTab: T,
  paramName = 'tab'
): Promise<boolean> {
  const tab = allowedTabs.includes(requestedTab) ? requestedTab : defaultTab;
  if (tabFromUrl(route, allowedTabs, defaultTab, paramName) === tab) {
    return Promise.resolve(true);
  }
  return router.navigate([], {
    relativeTo: route,
    queryParams: { [paramName]: tab === defaultTab ? null : tab },
    queryParamsHandling: 'merge'
  });
}
