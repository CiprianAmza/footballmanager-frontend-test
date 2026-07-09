import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const saved = localStorage.getItem('fm_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.userId) {
          const cloned = req.clone({
            setHeaders: { 'X-User-Id': String(parsed.userId) }
          });
          return next.handle(cloned);
        }
      } catch {
        // Invalid localStorage data, continue without header
      }
    }
    return next.handle(req);
  }
}
