import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { urlApp } from '../app.component';

interface AuthResponse {
  success: boolean;
  userId?: number;
  username?: string;
  teamId?: number | null;
  managerId?: number | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private userId: number | null = null;
  private username: string | null = null;

  constructor(private http: HttpClient) {
    // Restore from localStorage on construction
    const saved = localStorage.getItem('fm_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.userId = parsed.userId;
        this.username = parsed.username;
      } catch {
        localStorage.removeItem('fm_user');
      }
    }
  }

  get isLoggedIn(): boolean {
    return this.userId !== null;
  }

  get currentUserId(): number | null {
    return this.userId;
  }

  get currentUsername(): string | null {
    return this.username;
  }

  login(username: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(urlApp + '/api/auth/login', { username }).pipe(
      tap(result => {
        if (result.success) {
          this.userId = result.userId!;
          this.username = result.username!;
          localStorage.setItem('fm_user', JSON.stringify({
            userId: this.userId,
            username: this.username
          }));
        }
      })
    );
  }

  logout(): void {
    this.userId = null;
    this.username = null;
    localStorage.removeItem('fm_user');
  }

  verifySession(): Observable<AuthResponse> {
    if (!this.userId) return of({ success: false });
    return this.http.get<AuthResponse>(urlApp + `/api/auth/me?userId=${this.userId}`).pipe(
      tap(result => {
        if (!result.success) {
          // User no longer exists in DB, clear local state
          this.logout();
        }
      })
    );
  }
}
