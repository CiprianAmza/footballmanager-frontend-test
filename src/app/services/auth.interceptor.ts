import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CsrfTokenService } from './csrf-token.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private csrfToken: CsrfTokenService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    let secured = req.clone({ withCredentials: true });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      const token = this.csrfToken.token;
      if (token) secured = secured.clone({ setHeaders: { 'X-XSRF-TOKEN': token } });
    }
    return next.handle(secured);
  }
}
