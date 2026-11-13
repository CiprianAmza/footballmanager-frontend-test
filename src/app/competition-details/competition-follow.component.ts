import { Component, Input, OnChanges } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-competition-follow',
  template: `
    <button type="button" title="Saved in this browser" [attr.aria-pressed]="following" (click)="toggle()">
      {{ following ? 'Following' : 'Follow' }}
    </button>
    <small *ngIf="storageError" role="status">Could not save your preference.</small>
  `,
  styles: [`
    button { background: var(--fm-bg-input); color: var(--fm-text); border: 1px solid var(--fm-border);
      border-radius: 4px; padding: 6px 10px; cursor: pointer; }
    button[aria-pressed="true"] { color: var(--fm-accent); border-color: var(--fm-accent); }
    button:focus-visible { outline: 2px solid var(--fm-accent); outline-offset: 2px; }
    small { display: block; color: var(--fm-text-dim); }
  `]
})
export class CompetitionFollowComponent implements OnChanges {
  @Input() id: string | number = '';
  following = false;
  storageError = false;

  constructor(private auth: AuthService) {}

  private get key(): string {
    return `competition:${this.auth.currentUserId}:${this.id}:following`;
  }

  ngOnChanges(): void {
    this.following = false;
    this.storageError = false;
    try {
      this.following = localStorage.getItem(this.key) === 'true';
    } catch {
      this.storageError = true;
    }
  }

  toggle(): void {
    const next = !this.following;
    try {
      localStorage.setItem(this.key, String(next));
      this.following = next;
      this.storageError = false;
    } catch {
      this.storageError = true;
    }
  }
}
