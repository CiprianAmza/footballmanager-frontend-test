import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CsrfTokenService {
  private value: string | null = null;

  get token(): string | null {
    return this.value;
  }

  update(token: string | null): void {
    this.value = token;
  }
}
