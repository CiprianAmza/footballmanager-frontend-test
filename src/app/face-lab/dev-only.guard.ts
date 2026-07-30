import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

/**
 * Keeps the Face Lab out of any non-local build.
 *
 * The project has no `src/environments/` split to hang a compile-time flag on, so the
 * gate is the host: the lab is a local authoring tool and there is no reason for it to
 * resolve anywhere else. Anything else is redirected to /home rather than 404-ing.
 */
@Injectable({ providedIn: 'root' })
export class DevOnlyGuard implements CanActivate {
  private static readonly LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

  constructor(private router: Router) {}

  canActivate(): boolean | UrlTree {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return DevOnlyGuard.LOCAL_HOSTS.indexOf(host) >= 0 ? true : this.router.parseUrl('/home');
  }
}
