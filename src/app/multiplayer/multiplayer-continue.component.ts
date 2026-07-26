import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, exhaustMap } from 'rxjs/operators';
import { TeamService } from '../services/team.service';
import { MultiplayerRoomService } from '../services/multiplayer-room.service';
import { MultiplayerState } from './multiplayer.models';

@Component({ selector: 'app-multiplayer-continue', templateUrl: './multiplayer-continue.component.html', styleUrls: ['./multiplayer-continue.component.css'] })
export class MultiplayerContinueComponent implements OnInit, OnDestroy {
  @Output() activeChange = new EventEmitter<boolean>();
  @Output() liveMatchKeyChange = new EventEmitter<{ key: string; interactive: boolean }>();
  state: MultiplayerState | null = null; dayCountdown = ''; majorityCountdown = ''; busy = false; error = '';
  ffSeasons = 1;
  private lastSeason = 0; private lastDay = 0;
  private poll?: Subscription;
  constructor(private room: MultiplayerRoomService, private teamService: TeamService) {}
  ngOnInit(): void { this.poll = timer(1000, 1000).pipe(exhaustMap(() => this.room.state().pipe(catchError(e => { if (e.status === 404) { this.state = null; this.activeChange.emit(false); } else this.error = e.error?.message || 'Multiplayer unavailable'; return EMPTY; })))).subscribe(s => this.applyState(s)); }
  ngOnDestroy(): void { this.poll?.unsubscribe(); }
  continueDay(): void { if (this.busy || !this.state) return; this.busy = true; this.room.continue().subscribe({ next: s => { this.busy = false; this.applyState(s); }, error: e => { this.busy = false; this.error = e.error?.message || 'Continue failed'; } }); }
  toggleFastForward(): void { if (!this.state || this.busy) return; this.busy = true; const enabled = !this.state.currentMember?.fastForwardEnabled; this.room.fastForward(enabled, this.ffSeasons).subscribe({ next: s => { this.busy = false; this.applyState(s); }, error: e => { this.busy = false; this.error = e.error?.message || 'Fast Forward failed'; } }); }
  applyState(nextState: MultiplayerState): void {
    const previousKey = this.state?.liveMatchKey;
    const changedDay = this.lastSeason !== 0 && (this.lastSeason !== nextState.season || this.lastDay !== nextState.day);
    this.lastSeason = nextState.season;
    this.lastDay = nextState.day;
    this.state = nextState;
    this.activeChange.emit(nextState.status === 'ACTIVE');
    this.updateCountdowns();
    if (changedDay) this.teamService.loadGameState();
    if (nextState.liveMatchKey && nextState.liveMatchKey !== previousKey) {
      this.liveMatchKeyChange.emit({ key: nextState.liveMatchKey, interactive: !!nextState.liveMatchInteractive });
    }
  }
  private updateCountdowns(): void { this.dayCountdown = this.remaining(this.state?.dayDeadline); this.majorityCountdown = this.remaining(this.state?.majorityDeadline); }
  private remaining(value?: string): string { if (!value) return '—'; const seconds = Math.max(0, Math.floor((Date.parse(value) - Date.now()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
}
