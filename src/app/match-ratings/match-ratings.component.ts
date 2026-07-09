import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface PlayerLine {
  playerId: number; playerName: string; position: string;
  rating: number; age: number; nationId: number; nationName: string;
}
interface MatchLineupRating {
  homeTeamId: number; homeTeamName: string; awayTeamId: number; awayTeamName: string;
  homeLineup: PlayerLine[]; awayLineup: PlayerLine[];
}

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
      next: (d) => { this.data = d; this.loading = false; },
      error: () => { this.error = true; this.loading = false; }
    });
  }

  /** Highest -> lowest rating, so the best performers are on top. */
  sorted(lineup: PlayerLine[] | undefined): PlayerLine[] {
    return (lineup || []).slice().sort((a, b) => b.rating - a.rating);
  }

  ratingClass(r: number): string {
    if (r >= 1300) return 'r-high';
    if (r >= 1000) return 'r-mid';
    return 'r-low';
  }
}
