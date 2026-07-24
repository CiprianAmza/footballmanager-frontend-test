import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ChairmanRegentGuard } from './chairman-regent.guard';

describe('ChairmanRegentGuard', () => {
  it('requires authenticated chairman identity and the REGENT flag', () => {
    const auth = { isLoggedIn: true, chairmanEnabled: true, careerRole: 'CHAIRMAN' };
    const router = { parseUrl: jasmine.createSpy('parseUrl').and.returnValue('blocked') };
    TestBed.configureTestingModule({ providers: [ChairmanRegentGuard,
      { provide: AuthService, useValue: auth }, { provide: Router, useValue: router }] });
    const guard = TestBed.inject(ChairmanRegentGuard);
    expect(guard.canActivate()).toBeTrue();
    auth.careerRole = 'MANAGER';
    expect(guard.canActivate()).toBe('blocked' as any);
  });
});
