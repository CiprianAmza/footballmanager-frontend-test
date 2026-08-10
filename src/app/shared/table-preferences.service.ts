import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { urlApp } from '../app.component';
import { AuthService } from '../services/auth.service';

interface PreferenceResponse<T> {
  key: string;
  value: T;
}

@Injectable({ providedIn: 'root' })
export class TablePreferencesService {
  private readonly localPrefix = 'fm.table-preferences.v1';

  constructor(private http: HttpClient, private authService: AuthService) {}

  load<T extends object>(tableKey: string, defaults: T): Observable<T> {
    const cached = this.readLocal<T>(tableKey);
    return this.http.get<PreferenceResponse<Partial<T>>>(
      `${urlApp}/api/ui-preferences/${encodeURIComponent(tableKey)}`
    ).pipe(
      map(response => this.merge(defaults, response.value)),
      tap(value => this.writeLocal(tableKey, value)),
      catchError(() => of(cached ? this.merge(defaults, cached) : { ...defaults }))
    );
  }

  save<T extends object>(tableKey: string, value: T): void {
    this.writeLocal(tableKey, value);
    this.http.put(`${urlApp}/api/ui-preferences/${encodeURIComponent(tableKey)}`, value)
      .subscribe({ error: () => { /* Local cache remains available while the server is offline. */ } });
  }

  reset(tableKey: string): void {
    try { localStorage.removeItem(this.localKey(tableKey)); } catch { /* Storage can be unavailable. */ }
    this.http.delete(`${urlApp}/api/ui-preferences/${encodeURIComponent(tableKey)}`)
      .subscribe({ error: () => { /* A missing remote preference is already reset. */ } });
  }

  private merge<T extends object>(defaults: T, stored: Partial<T> | null | undefined): T {
    return { ...defaults, ...(stored || {}) };
  }

  private readLocal<T>(tableKey: string): Partial<T> | null {
    try {
      const raw = localStorage.getItem(this.localKey(tableKey));
      return raw ? JSON.parse(raw) as Partial<T> : null;
    } catch {
      return null;
    }
  }

  private writeLocal<T>(tableKey: string, value: T): void {
    try { localStorage.setItem(this.localKey(tableKey), JSON.stringify(value)); } catch { /* Best effort cache. */ }
  }

  private localKey(tableKey: string): string {
    const userScope = this.authService.currentUserId ?? this.authService.currentUsername ?? 'anonymous';
    return `${this.localPrefix}.${userScope}.${tableKey}`;
  }
}
