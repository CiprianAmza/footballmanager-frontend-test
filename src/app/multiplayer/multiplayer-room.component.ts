import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, timer, EMPTY } from 'rxjs';
import { catchError, exhaustMap } from 'rxjs/operators';
import { MultiplayerRoomService } from '../services/multiplayer-room.service';
import { MultiplayerState } from './multiplayer.models';

@Component({ selector: 'app-multiplayer-room', templateUrl: './multiplayer-room.component.html', styleUrls: ['./multiplayer-room.component.css'] })
export class MultiplayerRoomComponent implements OnInit, OnDestroy {
  state: MultiplayerState | null = null; password = ''; error = ''; message = ''; countdown = '';
  settings = { continueThresholdPercent: 50, dayTimeoutSeconds: 300, majorityTimeoutSeconds: 60, maxPlayers: 2, forceContinue: false };
  private sub?: Subscription;
  constructor(private room: MultiplayerRoomService) {}
  ngOnInit(): void { this.sub = timer(1000, 1000).pipe(exhaustMap(() => this.room.state().pipe(catchError(e => { if (e.status !== 404) this.error = this.typedError(e); return EMPTY; })))).subscribe(s => { this.applyState(s); this.countdown = this.remaining(); }); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }
  refresh(): void { this.room.state().subscribe({ next: s => { this.applyState(s); }, error: e => { if (e.status !== 404) this.error = this.typedError(e); } }); }
  create(): void { this.error = ''; this.room.create({ password: this.password, ...this.settings }).subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  join(): void { this.error = ''; this.room.join(this.password).subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  ready(): void { this.room.ready(!this.me()?.ready).subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  saveSettings(): void { this.room.settings(this.settings).subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  start(): void { this.room.start().subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  leave(): void { this.room.leave().subscribe({ next: () => { this.state = null; this.message = 'Left room'; }, error: e => this.error = this.typedError(e) }); }
  continueDay(): void { this.room.continue().subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  fastForward(): void { this.room.fastForward(!this.me()?.fastForwardEnabled).subscribe({ next: s => this.applyState(s), error: e => this.error = this.typedError(e) }); }
  me() { return this.state?.currentMember || this.state?.members.find(m => m.userId === this.state?.currentUserId); }
  private applyState(s: MultiplayerState): void { this.state = s; this.settings = { continueThresholdPercent: s.continueThresholdPercent, dayTimeoutSeconds: s.dayTimeoutSeconds, majorityTimeoutSeconds: s.majorityTimeoutSeconds, maxPlayers: s.maxPlayers, forceContinue: s.forceContinue }; }
  remaining(): string { const deadline = this.state?.effectiveDeadline; if (!deadline) return ''; const seconds = Math.max(0, Math.floor((Date.parse(deadline) - Date.now()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  private typedError(e: HttpErrorResponse): string { return e.error?.message || e.error?.detail || ({ 401: 'Parolă greșită', 409: 'Camera este plină sau jocul a pornit', 403: 'Acțiune permisă doar hostului' } as any)[e.status] || 'Operația multiplayer a eșuat'; }
}
