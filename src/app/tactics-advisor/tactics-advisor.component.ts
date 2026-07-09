import { Component, OnInit } from '@angular/core';
import { TeamService } from '../services/team.service';
import {
  TacticsService, AnalyticalResponse, SimulatedResponse,
  LeagueWithTeams, LeagueTeam
} from '../services/tactics.service';

@Component({
  selector: 'app-tactics-advisor',
  templateUrl: './tactics-advisor.component.html',
  styleUrls: ['./tactics-advisor.component.css']
})
export class TacticsAdvisorComponent implements OnInit {

  // Shared controls
  teamId: number | null = null;
  formations: string[] = [];
  formation = '442';
  seasons = 10;

  activeTab: 'analytical' | 'simulated' = 'analytical';

  // Analytical state
  analytical: AnalyticalResponse | null = null;
  analyticalLoading = false;
  analyticalError = '';

  // Simulated state
  simulated: SimulatedResponse | null = null;
  simulatedLoading = false;
  simulatedError = '';

  // Opponent picker
  leagues: LeagueWithTeams[] = [];
  selectedOpponents: LeagueTeam[] = [];
  pickLeagueId: number | null = null;
  pickTeamId: number | null = null;

  constructor(public tacticsService: TacticsService, private teamService: TeamService) {}

  ngOnInit(): void {
    this.teamId = this.teamService.teamId || null;
    this.tacticsService.getFormations().subscribe({
      next: (f) => {
        this.formations = f || [];
        if (this.formations.length && !this.formations.includes(this.formation)) {
          this.formation = this.formations[0];
        }
      },
      error: () => { this.formations = ['442', '433', '4231', '352', '532', '4141']; }
    });
    this.tacticsService.getLeaguesAndTeams().subscribe({
      next: (l) => { this.leagues = l || []; },
      error: () => { this.leagues = []; }
    });
    if (this.teamId) {
      this.runAnalytical();
    }
  }

  setTab(tab: 'analytical' | 'simulated'): void {
    this.activeTab = tab;
  }

  runAnalytical(): void {
    if (this.teamId == null) { this.analyticalError = 'Pick a team.'; return; }
    this.analyticalLoading = true;
    this.analyticalError = '';
    this.analytical = null;
    this.tacticsService.getAnalytical(Number(this.teamId), this.formation).subscribe({
      next: (res) => { this.analyticalLoading = false; this.analytical = res; },
      error: (err) => {
        this.analyticalLoading = false;
        this.analyticalError = err?.error?.error || 'Failed to compute analytical tactics.';
      }
    });
  }

  runSimulated(): void {
    if (this.teamId == null) { this.simulatedError = 'Pick a team.'; return; }
    this.simulatedLoading = true;
    this.simulatedError = '';
    this.simulated = null;
    const oppIds = this.selectedOpponents.map(o => o.teamId);
    this.tacticsService.simulate(Number(this.teamId), this.formation, Number(this.seasons), oppIds).subscribe({
      next: (res) => { this.simulatedLoading = false; this.simulated = res; },
      error: (err) => {
        this.simulatedLoading = false;
        this.simulatedError = err?.error?.error || 'Failed to run simulation.';
      }
    });
  }

  // ===== Opponent picker =====
  get teamsForPickLeague(): LeagueTeam[] {
    const lg = this.leagues.find(l => l.competitionId === Number(this.pickLeagueId));
    return lg ? lg.teams : [];
  }

  addOpponent(): void {
    if (this.pickTeamId == null) return;
    const id = Number(this.pickTeamId);
    if (this.selectedOpponents.some(o => o.teamId === id)) return;
    const team = this.teamsForPickLeague.find(t => t.teamId === id);
    if (team) {
      this.selectedOpponents.push(team);
      this.pickTeamId = null;
    }
  }

  removeOpponent(id: number): void {
    this.selectedOpponents = this.selectedOpponents.filter(o => o.teamId !== id);
  }

  clearOpponents(): void {
    this.selectedOpponents = [];
  }
}
