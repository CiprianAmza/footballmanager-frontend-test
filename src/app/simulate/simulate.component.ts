import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { TacticsService, LeagueWithTeams, LeagueTeam } from '../services/tactics.service';

interface StandingRow {
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

@Component({
  selector: 'app-simulate',
  templateUrl: './simulate.component.html',
  styleUrls: ['./simulate.component.css']
})
export class SimulateComponent implements OnInit {

  leagues: LeagueWithTeams[] = [];
  selectedTeams: LeagueTeam[] = [];
  pickLeagueId: number | null = null;
  pickTeamId: number | null = null;

  seasons = 10;

  standings: StandingRow[] = [];
  loading = false;
  error = '';
  ran = false;

  constructor(
    private http: HttpClient,
    private teamService: TeamService,
    private tacticsService: TacticsService
  ) {}

  ngOnInit(): void {
    this.tacticsService.getLeaguesAndTeams().subscribe({
      next: (l) => {
        this.leagues = l || [];
        this.preselectOwnLeague();
      },
      error: () => { this.leagues = []; }
    });
  }

  private preselectOwnLeague(): void {
    const myId = this.teamService.teamId;
    if (!myId) return;
    const lg = this.leagues.find(l => l.teams.some(t => t.teamId === myId));
    if (lg) {
      this.pickLeagueId = lg.competitionId;
      this.selectedTeams = [...lg.teams];
    }
  }

  get teamsForPickLeague(): LeagueTeam[] {
    const lg = this.leagues.find(l => l.competitionId === Number(this.pickLeagueId));
    return lg ? lg.teams : [];
  }

  addTeam(): void {
    if (this.pickTeamId == null) return;
    const id = Number(this.pickTeamId);
    if (this.selectedTeams.some(t => t.teamId === id)) return;
    const team = this.teamsForPickLeague.find(t => t.teamId === id);
    if (team) { this.selectedTeams.push(team); this.pickTeamId = null; }
  }

  addWholeLeague(): void {
    const lg = this.leagues.find(l => l.competitionId === Number(this.pickLeagueId));
    if (!lg) return;
    lg.teams.forEach(t => {
      if (!this.selectedTeams.some(s => s.teamId === t.teamId)) this.selectedTeams.push(t);
    });
  }

  removeTeam(id: number): void {
    this.selectedTeams = this.selectedTeams.filter(t => t.teamId !== id);
  }

  clearTeams(): void { this.selectedTeams = []; }

  simulate(): void {
    if (this.selectedTeams.length < 2) {
      this.error = 'Pick at least two teams to simulate.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.ran = true;
    const body = { teamIds: this.selectedTeams.map(t => t.teamId), seasons: Number(this.seasons) };
    this.http.post<{ standings: StandingRow[] }>(urlApp + '/competition/simulate', body).subscribe({
      next: (res) => {
        this.loading = false;
        this.standings = (res.standings || []).sort((a, b) => b.points - a.points);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Simulation failed.';
      }
    });
  }
}
