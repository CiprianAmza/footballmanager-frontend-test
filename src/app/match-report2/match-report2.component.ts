import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { urlApp } from '../app.component';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-match-report2',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './match-report2.component.html',
  styleUrls: ['./match-report2.component.css']
})
export class MatchReport2Component implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  competitionId = 0;
  season = 0;
  round = 0;
  teamId1 = 0;
  teamId2 = 0;
  loading = true;
  error = '';
  report: any = null;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.paramMap.subscribe(params => {
      this.competitionId = Number(params.get('competitionId'));
      this.season = Number(params.get('season'));
      this.round = Number(params.get('round'));
      this.teamId1 = Number(params.get('teamId1'));
      this.teamId2 = Number(params.get('teamId2'));
      this.load();
    }));
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  load(): void {
    if (![this.competitionId, this.season, this.round, this.teamId1, this.teamId2]
      .every(value => Number.isSafeInteger(value) && value > 0)) {
      this.loading = false;
      this.error = 'This match report link is incomplete.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.subscriptions.add(this.http.get<any>(`${urlApp}/match/report/${this.competitionId}/${this.season}/${this.round}/${this.teamId1}/${this.teamId2}`).subscribe({
      next: report => {
        this.report = report;
        this.loading = false;
        if (!report?.available) this.error = 'No completed match data is available for this fixture.';
      },
      error: () => {
        this.loading = false;
        this.error = 'The post-match report could not be loaded.';
      }
    }));
  }

  get summary(): any { return this.report?.summary || {}; }
  get stats(): any[] { return (this.report?.stats?.stats || []).slice(0, 14); }
  get raw(): any { return this.report?.stats?.raw || {}; }
  get lineups(): any { return this.report?.lineups || {}; }
  get events(): any[] { return (this.report?.events || []).filter((event: any) => event.eventType !== 'assist'); }
  get homeStarters(): any[] { return (this.lineups.homeLineup || []).filter((p: any) => !p.substitute && p.positionIndex < 30); }
  get awayStarters(): any[] { return (this.lineups.awayLineup || []).filter((p: any) => !p.substitute && p.positionIndex < 30); }
  get shots(): any[] { return this.report?.shotTimeline || []; }
  get momentum(): any[] { return this.report?.momentum || []; }

  get scoreParts(): string[] {
    const parts = String(this.summary.score || '0 - 0').split(/\s*-\s*/);
    return [parts[0] || '0', parts[1] || '0'];
  }

  get matchDateLabel(): string {
    const day = Number(this.report?.day || 0);
    return day > 0 ? `Season ${this.season}, day ${day}` : `Season ${this.season}, matchday ${this.round}`;
  }

  get averageHomeRating(): number {
    return this.average((this.lineups.homeLineup || []).filter((player: any) => player.performanceRating > 0));
  }

  get averageAwayRating(): number {
    return this.average((this.lineups.awayLineup || []).filter((player: any) => player.performanceRating > 0));
  }

  private average(players: any[]): number {
    if (!players.length) return 0;
    return players.reduce((sum, player) => sum + Number(player.performanceRating || 0), 0) / players.length;
  }

  gridColumn(positionIndex: number): number { return positionIndex % 5 + 1; }
  gridRow(positionIndex: number): number { return Math.floor(positionIndex / 5) + 1; }

  ratingClass(rating: number): string {
    if (rating >= 8) return 'rating-high';
    if (rating >= 6.5) return 'rating-mid';
    return 'rating-low';
  }

  eventIcon(type: string): string {
    const icons: Record<string, string> = {
      goal: '⚽', yellow_card: '▰', red_card: '■', substitution: '↔',
      shot_saved: '◉', shot_wide: '×', offside: '⚑'
    };
    return icons[type] || '•';
  }

  eventClass(event: any): string {
    return Number(event.teamId) === Number(this.teamId1) ? 'home-event' : 'away-event';
  }

  statNumber(value: unknown): number {
    const parsed = parseFloat(String(value ?? 0).replace('%', ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  statWidth(value: unknown, opposite: unknown): number {
    const current = Math.max(0, this.statNumber(value));
    const other = Math.max(0, this.statNumber(opposite));
    return current + other === 0 ? 50 : current * 100 / (current + other);
  }

  xgPoints(side: 'home' | 'away'): string {
    const field = side === 'home' ? 'homeCumulative' : 'awayCumulative';
    const relevant = this.shots.filter(shot => Number(shot.teamId) === Number(side === 'home' ? this.teamId1 : this.teamId2));
    const points = ['0,166'];
    for (const shot of relevant) {
      const x = Math.max(0, Math.min(480, Number(shot.minute || 0) / 90 * 480));
      const y = 166 - Number(shot[field] || 0) / this.xgMax * 142;
      points.push(`${x.toFixed(1)},${Math.max(12, y).toFixed(1)}`);
    }
    points.push(`480,${points[points.length - 1].split(',')[1]}`);
    return points.join(' ');
  }

  get xgMax(): number {
    return Math.max(1, ...this.shots.map(shot => Number(shot.homeCumulative || 0)), ...this.shots.map(shot => Number(shot.awayCumulative || 0)));
  }

  momentumHeight(value: number): number {
    const max = Math.max(.01, ...this.momentum.map(row => Math.abs(Number(row.value || 0))));
    return Math.max(4, Math.abs(Number(value || 0)) / max * 68);
  }

  formationLabel(value: string): string {
    if (!value) return 'Formation';
    return value.includes('-') ? value : value.split('').join('-');
  }

  abbreviation(value: unknown): string {
    return String(value || 'TEAM').slice(0, 3).toUpperCase();
  }
}
