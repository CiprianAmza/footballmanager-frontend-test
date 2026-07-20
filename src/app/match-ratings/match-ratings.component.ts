import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface PlayerLine {
  playerId: number; playerName: string; position: string;
  positionIndex: number; formation: string; role?: string; duty?: string;
  substitute: boolean; performanceRating: number; goals: number; assists: number;
  rating: number; age: number; nationId: number; nationName: string;
  baseFaceId: number; skinTone: number; hairStyle: number; hairColor: number;
  eyeColor: number; faceShape: number; noseShape: number; eyeShape: number;
  mouthShape: number; browShape: number; species: string;
}
interface MatchLineupRating {
  homeTeamId: number; homeTeamName: string; awayTeamId: number; awayTeamName: string;
  homeFormation: string; awayFormation: string;
  homeLineup: PlayerLine[]; awayLineup: PlayerLine[];
}
interface TeamSide { name: string; formation: string; lineup: PlayerLine[]; side: 'home' | 'away'; }

@Component({
  selector: 'app-match-ratings',
  templateUrl: './match-ratings.component.html',
  styleUrls: ['./match-ratings.component.css']
})
export class MatchRatingsComponent implements OnInit, OnChanges {
  /** When embedded (e.g. from animation-preview) pass these instead of using route params. */
  @Input() competitionId?: number;
  @Input() season?: number;
  @Input() round?: number;
  @Input() teamId1?: number;
  @Input() teamId2?: number;

  data?: MatchLineupRating;
  sides: TeamSide[] = [];
  loading = false;
  error = false;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    if (this.competitionId === undefined) {
      this.route.paramMap.subscribe(p => {
        this.competitionId = +(p.get('competitionId') || 0);
        this.season = +(p.get('season') || 0);
        this.round = +(p.get('round') || 0);
        this.teamId1 = +(p.get('teamId1') || 0);
        this.teamId2 = +(p.get('teamId2') || 0);
        this.fetch();
      });
    } else {
      this.fetch();
    }
  }

  ngOnChanges(): void {
    if (this.competitionId !== undefined && this.teamId1 !== undefined) this.fetch();
  }

  private fetch(): void {
    if (!this.competitionId || !this.teamId1 || !this.teamId2) return;
    this.loading = true; this.error = false;
    const url = `${urlApp}/match/playerRatings/${this.competitionId}/${this.season}/${this.round}/${this.teamId1}/${this.teamId2}`;
    this.http.get<MatchLineupRating>(url).subscribe({
      next: (d) => {
        this.data = d;
        this.sides = [
          { name: d.homeTeamName, formation: d.homeFormation, lineup: d.homeLineup || [], side: 'home' },
          { name: d.awayTeamName, formation: d.awayFormation, lineup: d.awayLineup || [], side: 'away' }
        ];
        this.loading = false;
      },
      error: () => { this.error = true; this.loading = false; }
    });
  }

  starters(lineup: PlayerLine[] | undefined): PlayerLine[] {
    return (lineup || []).filter(p => !p.substitute && p.positionIndex < 30);
  }

  bench(lineup: PlayerLine[] | undefined): PlayerLine[] {
    return (lineup || []).filter(p => p.substitute || p.positionIndex >= 30);
  }

  gridColumn(positionIndex: number): number { return positionIndex % 5 + 1; }
  gridRow(positionIndex: number): number { return Math.floor(positionIndex / 5) + 1; }

  ratingClass(r: number): string {
    if (r >= 8) return 'r-high';
    if (r >= 6.5) return 'r-mid';
    return 'r-low';
  }

  formatFormation(value: string | undefined): string {
    if (!value) return 'Formation unavailable';
    const known: Record<string, string> = {
      '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1',
      '352': '3-5-2', '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1',
      '4321': '4-3-2-1', '4222': '4-2-2-2', '3421': '3-4-2-1', '532': '5-3-2',
      '5212': '5-2-1-2', '541': '5-4-1', '3511': '3-5-1-1'
    };
    return known[value] || value;
  }

  hasLineups(): boolean { return this.sides.some(side => this.starters(side.lineup).length > 0); }
  trackByPlayer(_: number, player: PlayerLine): number { return player.playerId; }
}
