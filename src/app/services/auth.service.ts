import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { urlApp } from '../app.component';
import { CsrfTokenService } from './csrf-token.service';

export type CareerRole = 'MANAGER' | 'CHAIRMAN';

export interface AuthResponse {
  success: boolean;
  userId?: number;
  username?: string;
  email?: string;
  teamId?: number | null;
  managerId?: number | null;
  careerRole?: CareerRole;
  profileId?: number;
  roles?: string[];
  chairmanEnabled?: boolean;
  error?: string;
}

export interface RegistrationRequest {
  username: string;
  email: string;
  password: string;
  displayName: string;
  careerRole: CareerRole;
  startingWealth?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private user: AuthResponse | null = null;
  private readonly restoredSubject = new BehaviorSubject<AuthResponse | null>(null);
  readonly sessionRestored$ = this.restoredSubject.asObservable();
  sessionChecked = false;

  constructor(private http: HttpClient, private csrfToken: CsrfTokenService) {
    this.verifySession().subscribe();
  }

  get isLoggedIn(): boolean {
    return this.user?.success === true && this.user.userId !== undefined;
  }

  get currentUserId(): number | null {
    return this.user?.userId ?? null;
  }

  get currentUsername(): string | null {
    return this.user?.username ?? null;
  }

  get careerRole(): CareerRole | null {
    return this.user?.careerRole ?? null;
  }

  get chairmanEnabled(): boolean {
    return this.user?.chairmanEnabled === true;
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.ensureCsrfToken().pipe(
      switchMap(() => this.http.post<AuthResponse>(urlApp + '/api/auth/login', { username, password })),
      tap(result => this.apply(result))
    );
  }

  register(request: RegistrationRequest): Observable<AuthResponse> {
    return this.ensureCsrfToken().pipe(
      switchMap(() => this.http.post<AuthResponse>(urlApp + '/api/auth/register', request))
    );
  }

  logout(): Observable<{ success: boolean }> {
    return this.ensureCsrfToken().pipe(
      switchMap(() => this.http.post<{ success: boolean }>(urlApp + '/api/auth/logout', {})),
      catchError(() => of({ success: true })),
      finalize(() => this.apply(null))
    );
  }

  verifySession(): Observable<AuthResponse> {
    return this.ensureCsrfToken().pipe(
      switchMap(() => this.http.get<AuthResponse>(urlApp + '/api/auth/me')),
      tap(result => this.apply(result.success ? result : null)),
      catchError(() => {
        this.apply(null);
        return of({ success: false });
      }),
      finalize(() => {
        this.sessionChecked = true;
        this.restoredSubject.next(this.user);
      })
    );
  }

  private ensureCsrfToken(): Observable<unknown> {
    return this.http.get<{ token: string }>(urlApp + '/api/auth/csrf').pipe(
      tap(result => this.csrfToken.update(result.token))
    );
  }

  private apply(result: AuthResponse | null): void {
    this.user = result?.success ? result : null;
    if (this.sessionChecked) this.restoredSubject.next(this.user);
  }
}
