import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthService } from './auth.service';
import { AuthInterceptor } from './auth.interceptor';
import { urlApp } from '../app.component';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('fm_user', JSON.stringify({ userId: 999, username: 'spoofed' }));
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    http.expectOne(urlApp + '/api/auth/csrf').flush({ token: 'csrf' });
    http.expectOne(urlApp + '/api/auth/me').flush({ success: false }, { status: 401, statusText: 'Unauthorized' });
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('fm_user');
  });

  it('restores identity only from the server session', () => {
    expect(service.isLoggedIn).toBeFalse();
    expect(service.currentUserId).toBeNull();
  });

  it('logs in with a password and credentialed requests without X-User-Id', () => {
    service.login('alice', 'correct-password').subscribe(result => expect(result.success).toBeTrue());
    http.expectOne(urlApp + '/api/auth/csrf').flush({ token: 'csrf' });
    const login = http.expectOne(urlApp + '/api/auth/login');
    expect(login.request.withCredentials).toBeTrue();
    expect(login.request.headers.has('X-User-Id')).toBeFalse();
    expect(login.request.headers.get('X-XSRF-TOKEN')).toBe('csrf');
    expect(login.request.body).toEqual({ username: 'alice', password: 'correct-password' });
    login.flush({ success: true, userId: 1, username: 'alice', careerRole: 'MANAGER' });

    expect(service.currentUserId).toBe(1);
    expect(localStorage.getItem('fm_user')).not.toContain('alice');
  });

  it('registers an explicit career role', () => {
    service.register({
      username: 'chair', email: 'chair@example.com', password: 'long-password',
      displayName: 'Chair Person', careerRole: 'CHAIRMAN'
    }).subscribe();
    http.expectOne(urlApp + '/api/auth/csrf').flush({ token: 'csrf' });
    const registration = http.expectOne(urlApp + '/api/auth/register');
    expect(registration.request.body.careerRole).toBe('CHAIRMAN');
    registration.flush({ success: true, userId: 2, username: 'chair', careerRole: 'CHAIRMAN' });
  });
});
