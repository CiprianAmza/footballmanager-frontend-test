import { Component, NgZone, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';
import { KitColors, PitchClip } from '../models/live-match.model';
import {
  goalAnimationToFrames, kitsFromAnimation, MatchPitchComponent
} from '../live-match/match-pitch.component';
import {
  AMBIENT_TRANSITION_MS, AmbientState, ambientFrame, buildTeamSlots,
  emptyAmbientState, phaseFor, samePhase
} from '../live-match/ambient-synthesizer';
import {
  PitchStyle, readPitchStyle, writePitchStyle
} from '../live-match/pitch-projection';

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

  // ---- 2D pitch preview (same renderer + ambient synthesis as the live view) ----
  showPitch = true;
  /** Flat 2D vs 2.5D broadcast camera — shared preference with the live view. */
  pitchStyle: PitchStyle = readPitchStyle();
  pitchClip: PitchClip | null = null;
  homeKit: KitColors = {};
  awayKit: KitColors = {};
  @ViewChild(MatchPitchComponent) pitch?: MatchPitchComponent;

  private ambient: AmbientState = emptyAmbientState();
  private ambientLayoutKey = '';
  private ambientNames: { [playerId: number]: string } = {};
  private shirtNumbers: { [playerId: number]: number } = {};
  private rafId: number | null = null;
  private lastFrameTs = 0;

  constructor(private http: HttpClient, private route: ActivatedRoute, private zone: NgZone) {}

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

  togglePitch(): void {
    this.showPitch = !this.showPitch;
  }

  /** Presentation only — the ambient RAF and any spliced clip carry on. */
  togglePitchStyle(): void {
    this.pitchStyle = this.pitchStyle === 'broadcast' ? 'classic' : 'broadcast';
    writePitchStyle(this.pitchStyle);
  }

  /** Ambient loop for the preview board. The live viewer has its own single
   *  clock; this route is a standalone sandbox, so it runs its own RAF. */
  private startPitchLoop(): void {
    if (this.rafId !== null) return;
    this.zone.runOutsideAngular(() => {
      this.lastFrameTs = 0;
      const step = (timestamp: number) => {
        if (this.lastFrameTs === 0) this.lastFrameTs = timestamp;
        const dt = Math.min(100, timestamp - this.lastFrameTs);
        this.lastFrameTs = timestamp;
        this.renderPitch(dt);
        this.rafId = requestAnimationFrame(step);
      };
      this.rafId = requestAnimationFrame(step);
    });
  }

  private stopPitchLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private renderPitch(dt: number): void {
    if (!this.pitch || !this.liveMatchData || !this.showPitch) return;
    this.ambient.elapsedMs += dt;
    this.ambient.transitionMs = Math.min(this.ambient.transitionMs + dt, AMBIENT_TRANSITION_MS);
    if (this.pitchClip) {
      this.pitch.advance(dt);
      return;
    }
    this.pitch.renderFrame(ambientFrame(this.ambient), this.ambientNames);
  }

  /** Rebuild the ambient picture from the timeline position we're playing. */
  private refreshAmbient(): void {
    const data = this.liveMatchData;
    if (!data) return;

    const names: { [playerId: number]: string } = {};
    for (const player of [...(data.homePitch || []), ...(data.awayPitch || [])]) {
      names[player.playerId] = (player.name || '').split(' ').pop() || '';
    }
    this.ambientNames = names;

    const clips: any[] = [
      ...(data.canonicalAnimations || []),
      ...Object.values(data.goalAnimations || {})
    ];
    for (const clip of clips) {
      for (const player of clip?.players || []) {
        if (player.shirtNumber) this.shirtNumbers[player.playerId] = player.shirtNumber;
      }
    }
    if (clips[0]) {
      const kits = kitsFromAnimation(clips[0]);
      this.homeKit = kits.home;
      this.awayKit = kits.away;
    }

    const flipped = (data.timeline || [])
      .slice(0, this.currentIndex + 1)
      .some((event: any) => event.eventType === 'half_time');
    const homeAttacksRight = !flipped;

    const homePlayers = (data.homePitch || []).filter((p: any) => p.onPitch !== false);
    const awayPlayers = (data.awayPitch || []).filter((p: any) => p.onPitch !== false);
    const layoutKey = [
      homeAttacksRight,
      homePlayers.map((p: any) => `${p.playerId}:${p.position}`).join(','),
      awayPlayers.map((p: any) => `${p.playerId}:${p.position}`).join(',')
    ].join('|');
    if (layoutKey !== this.ambientLayoutKey) {
      this.ambientLayoutKey = layoutKey;
      this.ambient.slots = [
        ...buildTeamSlots(homePlayers, data.homeTeamId, homeAttacksRight, this.shirtNumbers),
        ...buildTeamSlots(awayPlayers, data.awayTeamId, !homeAttacksRight, this.shirtNumbers)
      ];
    }

    const phase = phaseFor(this.currentMinute, data.homeTeamId, data.awayTeamId, homeAttacksRight);
    if (!samePhase(phase, this.ambient.current)) {
      this.ambient.previous = this.ambient.current;
      this.ambient.current = phase;
      this.ambient.transitionMs = 0;
    }
  }

  /** Splice the engine's clip for this minute onto the same canvas. */
  private maybePlayClipAt(minute: number): void {
    const data: any = this.liveMatchData;
    if (!data) return;
    const canonical = (data.canonicalAnimations || [])
      .filter((clip: any) => Number(clip?.minute) === Number(minute))
      .sort((a: any, b: any) => Number(a?.slotIndex ?? 0) - Number(b?.slotIndex ?? 0));
    const animation = canonical[0] || data.goalAnimations?.[minute];
    if (!animation) return;
    const kits = kitsFromAnimation(animation);
    this.homeKit = kits.home;
    this.awayKit = kits.away;
    this.pitchClip = goalAnimationToFrames(animation);
  }

  onClipFinished(): void {
    this.zone.run(() => this.pitchClip = null);
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
          this.pitchClip = null;
          this.ambient = emptyAmbientState();
          this.ambientLayoutKey = '';
          this.refreshAmbient();
          this.startPitchLoop();
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
        this.refreshAmbient();
        this.maybePlayClipAt(this.currentMinute?.minute ?? 0);
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
    this.stopPitchLoop();
  }
}
