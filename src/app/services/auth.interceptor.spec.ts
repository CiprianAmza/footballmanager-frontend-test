import { HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';
import { CsrfTokenService } from './csrf-token.service';

describe('AuthInterceptor', () => {
  it('uses cookies and never injects the legacy identity header', () => {
    localStorage.setItem('fm_user', JSON.stringify({ userId: 777 }));
    const csrfToken = new CsrfTokenService();
    csrfToken.update('server-token');
    const interceptor = new AuthInterceptor(csrfToken);
    let forwarded: HttpRequest<unknown> | undefined;
    const next: HttpHandler = {
      handle: request => {
        forwarded = request;
        return of(new HttpResponse({ status: 200 }));
      }
    };

    interceptor.intercept(new HttpRequest('GET', '/game/state'), next).subscribe();

    expect(forwarded?.withCredentials).toBeTrue();
    expect(forwarded?.headers.has('X-User-Id')).toBeFalse();
    localStorage.removeItem('fm_user');
  });

  it('adds the in-memory CSRF token to mutations', () => {
    const csrfToken = new CsrfTokenService();
    csrfToken.update('server-token');
    const interceptor = new AuthInterceptor(csrfToken);
    let forwarded: HttpRequest<unknown> | undefined;
    interceptor.intercept(new HttpRequest('POST', '/game/advance', {}), {
      handle: request => {
        forwarded = request;
        return of(new HttpResponse({ status: 200 }));
      }
    }).subscribe();

    expect(forwarded?.headers.get('X-XSRF-TOKEN')).toBe('server-token');
  });
});
