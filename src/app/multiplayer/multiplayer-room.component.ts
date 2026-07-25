import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, timer } from 'rxjs';
import { MultiplayerRoomService } from '../services/multiplayer-room.service';
import { MultiplayerState } from './multiplayer.models';

@Component({ selector: 'app-multiplayer-room', templateUrl: './multiplayer-room.component.html', styleUrls: ['./multiplayer-room.component.css'] })
export class MultiplayerRoomComponent implements OnInit, OnDestroy {
  state: MultiplayerState | null = null; password = ''; error = ''; message = ''; countdown = '';
  settings = { continueThresholdPercent: 50, dayTimeoutSeconds: 300, majorityTimeoutSeconds: 60, maxPlayers: 2 };
  private sub?: Subscription;
  constructor(private room: MultiplayerRoomService) {}
  ngOnInit(): void { this.refresh(); this.sub = timer(1000, 1000).subscribe(() => { if (this.state) this.countdown = this.remaining(); this.refresh(); }); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }
  refresh(): void { this.room.state().subscribe({ next: s => { this.state = s; this.settings = { continueThresholdPercent: s.continueThresholdPercent, dayTimeoutSeconds: s.dayTimeoutSeconds, majorityTimeoutSeconds: s.majorityTimeoutSeconds, maxPlayers: s.maxPlayers }; }, error: e => { if (e.status !== 404) this.error = this.typedError(e); } }); }
  create(): void { this.error = ''; this.room.create({ password: this.password, ...this.settings }).subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  join(): void { this.error = ''; this.room.join(this.password).subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  ready(): void { this.room.ready(!this.me()?.ready).subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  saveSettings(): void { this.room.settings(this.settings).subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  start(): void { this.room.start().subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  continueDay(): void { this.room.continue().subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  fastForward(): void { this.room.fastForward(!this.me()?.fastForwardEnabled).subscribe({ next: s => this.state = s, error: e => this.error = this.typedError(e) }); }
  me() { return this.state?.members.find(m => m.userId === this.state?.hostUserId) || this.state?.members[0]; }
  remaining(): string { const deadline = this.state?.effectiveDeadline; if (!deadline) return ''; const seconds = Math.max(0, Math.floor((Date.parse(deadline) - Date.now()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  private typedError(e: HttpErrorResponse): string { return e.error?.message || e.error?.detail || ({ 401: 'Parolă greșită', 409: 'Camera este plină sau jocul a pornit', 403: 'Acțiune permisă doar hostului' } as any)[e.status] || 'Operația multiplayer a eșuat'; }
}
