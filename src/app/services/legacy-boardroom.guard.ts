import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Legacy Boardroom pages accept actor/team ids from the URL and expose mutation
 * controls that are not covered by the reviewed Regent contract. They never
 * render: an eligible Chairman is sent to Economy, everybody else to Home.
 * Backend authorization remains authoritative and is outside this frontend fix.
 */
@Injectable({ providedIn: 'root' })
export class LegacyBoardroomGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): UrlTree {
    const canUseEconomy = this.auth.isLoggedIn
      && this.auth.careerRole === 'CHAIRMAN'
      && this.auth.regentEnabled;
    return this.router.parseUrl(canUseEconomy ? '/economy' : '/home');
  }
}
