import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

/**
 * Animation Preview — updated to consume the CURRENT live-match engine data
 * shape (the same `LiveMatchData` the in-game live-match modal renders) instead
 * of the old single-clip frame animation. It simulates a full live match
 * between two arbitrary teams and plays back the engine's timeline of minute
 * events (goals, cards, shots, etc.) with a running scoreline, mirroring how
 * the live-match view in AppComponent steps through `liveMatchData.timeline`.
 */
@Component({
  selector: 'app-animation-preview',
  templateUrl: './animation-preview.component.html',
  styleUrls: ['./animation-preview.component.css']
})
export class AnimationPreviewComponent implements OnInit, OnDestroy {

  // Controls
  teamId1: number = 0;
  teamId2: number = 0;
  speed: number = 1;
  teams: any[] = [];

  // Live-match playback state
  liveMatchData: any = null;          // LiveMatchData DTO from the engine
  currentIndex = 0;                   // index into timeline
  playbackTimer: any = null;
  finished = false;
  loading = false;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.loadTeams();

    // Check for query params to auto-load
    this.route.queryParams.subscribe(params => {
      if (params['teamId1']) this.teamId1 = +params['teamId1'];
      if (params['teamId2']) this.teamId2 = +params['teamId2'];

      if (this.teamId1 && this.teamId2) {
        this.generate();
      }
    });
  }

  loadTeams(): void {
    this.http.get<any[]>(urlApp + '/teams/all').subscribe({
      next: (teams) => this.teams = teams.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')),
      error: () => console.error('Failed to load teams')
    });
  }

  swapTeams(): void {
    const tmp = this.teamId1;
    this.teamId1 = this.teamId2;
    this.teamId2 = tmp;
  }

  generate(): void {
    // Dropdown bindings deliver string ids; normalise so the equality guard
    // and the request URL are always numeric.
    this.teamId1 = +this.teamId1;
    this.teamId2 = +this.teamId2;
    if (!this.teamId1 || !this.teamId2 || this.teamId1 === this.teamId2) return;
    this.stop();
    this.loading = true;
    this.liveMatchData = null;
    this.finished = false;
    this.currentIndex = 0;

    const url = urlApp + `/match/animation/livePreview?teamId1=${this.teamId1}&teamId2=${this.teamId2}`;
    this.http.get<any>(url).subscribe({
      next: (data) => {
        this.loading = false;
        if (data && data.timeline && data.timeline.length > 0) {
          this.liveMatchData = data;
          this.currentIndex = 0;
          this.startPlayback();
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Failed to generate live preview', err);
      }
    });
  }

  private startPlayback(): void {
    this.stop();
    this.finished = false;
    const interval = this.getSpeedInterval();
    this.playbackTimer = setInterval(() => {
      if (!this.liveMatchData?.timeline) { this.stop(); return; }
      if (this.currentIndex < this.liveMatchData.timeline.length - 1) {
        this.currentIndex++;
      } else {
        this.finished = true;
        this.stop();
      }
    }, interval);
  }

  private getSpeedInterval(): number {
    // Base ~700ms per timeline entry at 1x, scaled by the speed multiplier.
    return Math.max(80, 700 / this.speed);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.playbackTimer && !this.finished) this.startPlayback();
  }

  skip(): void {
    this.stop();
    if (this.liveMatchData?.timeline?.length) {
      this.currentIndex = this.liveMatchData.timeline.length - 1;
    }
    this.finished = true;
  }

  replay(): void {
    if (!this.liveMatchData) return;
    this.currentIndex = 0;
    this.startPlayback();
  }

  // ===== Display helpers (mirror the live-match view in AppComponent) =====

  get currentMinute(): any {
    if (!this.liveMatchData?.timeline) return null;
    return this.liveMatchData.timeline[this.currentIndex];
  }

  get homeScore(): number {
    return this.currentMinute?.homeScore ?? 0;
  }

  get awayScore(): number {
    return this.currentMinute?.awayScore ?? 0;
  }

  /** Events revealed so far, newest first (same as live view's feed). */
  get visibleEvents(): any[] {
    if (!this.liveMatchData?.timeline) return [];
    return this.liveMatchData.timeline
      .slice(0, this.currentIndex + 1)
      .filter((m: any) => m.eventType && m.eventType !== 'none')
      .reverse();
  }

  get progressPct(): number {
    if (!this.liveMatchData) return 0;
    const total = 90
      + (this.liveMatchData.firstHalfStoppage || 0)
      + (this.liveMatchData.secondHalfStoppage || 0);
    return Math.min(100, ((this.currentMinute?.minute ?? 0) / total) * 100);
  }

  /** Match minute label with stoppage notation (e.g. 45+2'). */
  formatMatchMinute(rawMinute: number, firstHalfStoppage: number | undefined | null): string {
    const fhs = firstHalfStoppage || 0;
    if (rawMinute <= 45 + fhs && rawMinute > 45) {
      return `45+${rawMinute - 45}'`;
    }
    if (rawMinute > 90) {
      return `90+${rawMinute - 90}'`;
    }
    return `${rawMinute}'`;
  }

  getLiveEventIcon(eventType: string): string {
    switch (eventType) {
      case 'goal': return '⚽';
      case 'yellow_card': return '🟨';
      case 'red_card': return '🔴';
      case 'substitution': return '🔄';
      case 'shot_saved': return '🧤';
      case 'shot_wide': return '❌';
      case 'shot_blocked': return '🛡️';
      case 'chance': return '🎯';
      case 'half_time': return '⏸️';
      case 'full_time': return '🏁';
      case 'kickoff': return '📢';
      default: return '•';
    }
  }

  // ===== Player-ratings deep link =====
  // The match-ratings route is /match/ratings/:competitionId/:season/:round/:teamId1/:teamId2.
  // Pull the coordinates from the engine DTO (livePreview uses sentinel
  // competitionId=-1, season=0, round=0) and fall back to the controls.

  get ratingsCompetitionId(): number {
    return this.liveMatchData?.competitionId ?? -1;
  }

  get ratingsSeason(): number {
    // LiveMatchData carries no season; the preview is simulated under season 0.
    return this.liveMatchData?.season ?? 0;
  }

  get ratingsRound(): number {
    return this.liveMatchData?.round ?? 0;
  }

  get ratingsTeamId1(): number {
    return this.liveMatchData?.homeTeamId ?? this.teamId1;
  }

  get ratingsTeamId2(): number {
    return this.liveMatchData?.awayTeamId ?? this.teamId2;
  }

  /** Route-segment array for the player-ratings view of the current match. */
  get playerRatingsLink(): any[] {
    return ['/match/ratings',
      this.ratingsCompetitionId, this.ratingsSeason, this.ratingsRound,
      this.ratingsTeamId1, this.ratingsTeamId2];
  }

  private stop(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
