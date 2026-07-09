import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TeamService } from '../services/team.service';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-season-summary',
  templateUrl: './season-summary.component.html',
  styleUrls: ['./season-summary.component.css']
})
export class SeasonSummaryComponent implements OnInit {

  season: number = 1;
  summary: any = null;
  loading = true;
  activeTab = 'standings';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.season = +params['season'] || this.teamService.currentSeason - 1;
      if (this.season < 1) this.season = 1;
      this.loadSummary();
    });
  }

  loadSummary(): void {
    this.loading = true;
    this.http.get<any>(`${urlApp}/game/seasonSummary/${this.season}`).subscribe({
      next: (data) => {
        this.summary = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading season summary:', err);
        this.loading = false;
      }
    });
  }

  getLeagueStandings(): any[] {
    if (!this.summary?.standings) return [];
    return this.summary.standings.filter((s: any) => s.competitionTypeId === 1 || s.competitionTypeId === 3);
  }

  getCupStandings(): any[] {
    if (!this.summary?.standings) return [];
    return this.summary.standings.filter((s: any) => s.competitionTypeId === 2);
  }

  formatMoney(value: number): string {
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return Math.floor(value / 1_000) + 'K';
    return String(value);
  }
}
