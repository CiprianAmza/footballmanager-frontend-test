import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, skip } from 'rxjs/operators';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface CheckpointStatus {
  enabled: boolean;
  intervalMatchdays: number;
  matchdaysSinceCheckpoint: number;
  state: 'IDLE' | 'SAVING' | 'SAVED' | 'RESTORED' | 'FAILED' | 'DISABLED';
  message: string;
  season: number | null;
  day: number | null;
  capturedAt: string | null;
  persistedAt: string | null;
}

interface NextMatch {
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  competitionName: string;
  round: number;
  prediction: string;
  homePowerRating: number;
  awayPowerRating: number;
}

interface TodayBrief {
  teamId: number;
  teamName: string;
  season: number;
  day: number;
  nextMatch: NextMatch | null;
  lineup: { formation: string; starters: number; bench: number; saved: boolean; warnings: string[] };
  unreadCount: number;
  attention: { kind: 'lineup' | 'inbox' | 'board'; title: string; detail: string }[];
  checkpoint: CheckpointStatus;
}

@Component({
  selector: 'app-home-today',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-today.component.html',
  styleUrls: ['./home-today.component.css']
})
export class HomeTodayComponent implements OnInit, OnDestroy {
  brief: TodayBrief | null = null;
  loading = true;
  error = '';
  savePending = false;
  saveMessage = '';
  private subscriptions = new Subscription();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private http: HttpClient, public teamService: TeamService) {}

  ngOnInit(): void {
    this.load();
    this.subscriptions.add(this.teamService.refresh$.subscribe(() => this.load()));
    this.subscriptions.add(this.teamService.teamId$.pipe(skip(1), distinctUntilChanged())
      .subscribe(() => this.load()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  load(): void {
    this.loading = !this.brief;
    this.error = '';
    this.http.get<TodayBrief>(`${urlApp}/manager/today`).subscribe({
      next: brief => {
        this.brief = brief;
        this.loading = false;
        if (brief.checkpoint.state === 'SAVING') this.scheduleStatusPoll();
      },
      error: () => {
        this.loading = false;
        this.error = 'Today’s briefing could not be loaded.';
      }
    });
  }

  saveCheckpoint(): void {
    if (!this.brief?.checkpoint.enabled || this.savePending) return;
    this.savePending = true;
    this.saveMessage = 'Capturing the current game day…';
    this.http.post<CheckpointStatus>(`${urlApp}/game/checkpoints`, {}).subscribe({
      next: status => {
        this.updateCheckpoint(status);
        this.saveMessage = 'Snapshot captured. Writing to PostgreSQL…';
        this.scheduleStatusPoll();
      },
      error: (error: HttpErrorResponse) => {
        this.savePending = false;
        this.saveMessage = error.status === 409
          ? 'A checkpoint is already in progress.'
          : 'Could not start the checkpoint. Please try again.';
        if (error.status === 409) this.scheduleStatusPoll();
      }
    });
  }

  get savedDayIsCurrent(): boolean {
    const brief = this.brief;
    return !!brief && ['SAVED', 'RESTORED'].includes(brief.checkpoint.state)
      && brief.checkpoint.season === brief.season && brief.checkpoint.day === brief.day;
  }

  get checkpointHeadline(): string {
    const status = this.brief?.checkpoint;
    if (!status?.enabled) return 'Automatic checkpoints unavailable';
    if (status.state === 'SAVING') return 'Saving in background';
    if (status.state === 'FAILED') return 'Checkpoint failed';
    if (!status.persistedAt) return 'No checkpoint saved yet';
    return this.savedDayIsCurrent ? 'Checkpoint available for this day' : 'Newer game day in memory';
  }

  get opponentName(): string {
    const match = this.brief?.nextMatch;
    if (!match) return '';
    return match.homeTeamId === this.brief?.teamId ? match.awayTeamName : match.homeTeamName;
  }

  attentionRoute(kind: string): any[] {
    const teamId = this.brief?.teamId || this.teamService.teamId;
    if (kind === 'lineup') return ['/squad2', teamId];
    if (kind === 'board') return ['/home2'];
    return ['/inbox'];
  }

  private updateCheckpoint(status: CheckpointStatus): void {
    if (this.brief) this.brief = { ...this.brief, checkpoint: status };
  }

  private scheduleStatusPoll(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.http.get<CheckpointStatus>(`${urlApp}/game/checkpoints`).subscribe({
        next: status => {
          this.updateCheckpoint(status);
          if (status.state === 'SAVING') {
            this.scheduleStatusPoll();
          } else {
            this.savePending = false;
            this.saveMessage = status.state === 'FAILED'
              ? `Checkpoint failed: ${status.message || 'please retry.'}`
              : status.state === 'SAVED' ? 'Checkpoint saved in PostgreSQL.' : '';
          }
        },
        error: () => {
          this.savePending = false;
          this.saveMessage = 'Could not verify the checkpoint status. Refresh to try again.';
        }
      });
    }, 1200);
  }
}
