import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ChairmanRegentGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean | UrlTree {
    return this.auth.isLoggedIn && this.auth.regentEnabled && this.auth.careerRole === 'CHAIRMAN'
      ? true : this.router.parseUrl('/home');
  }
}
