import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-friendly',
  templateUrl: './friendly.component.html',
  styleUrls: ['./friendly.component.css']
})
export class FriendlyComponent implements OnInit {

  teamId!: number;
  season!: number;

  // Matches list
  matches: any[] = [];
  loadingMatches: boolean = false;

  // Schedule form
  showScheduleForm: boolean = false;
  opponents: any[] = [];
  filteredOpponents: any[] = [];
  availableDays: any[] = [];
  loadingOpponents: boolean = false;
  loadingDays: boolean = false;
  opponentSearch: string = '';
  selectedOpponentId: number | null = null;
  selectedOpponentName: string = '';
  selectedDay: number | null = null;
  scheduling: boolean = false;
  scheduleMessage: string = '';
  scheduleSuccess: boolean = false;

  // Expanded match details
  expandedMatchId: number | null = null;

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.teamId = this.teamService.teamId;
    this.season = this.teamService.currentSeason;
    this.loadMatches();
  }

  loadMatches(): void {
    this.loadingMatches = true;
    this.http.get<any[]>(`${urlApp}/friendly/matches/${this.teamId}/${this.season}`).subscribe({
      next: (data) => {
        this.matches = data;
        this.loadingMatches = false;
      },
      error: () => {
        this.matches = [];
        this.loadingMatches = false;
      }
    });
  }

  openScheduleForm(): void {
    this.showScheduleForm = true;
    this.scheduleMessage = '';
    this.selectedOpponentId = null;
    this.selectedOpponentName = '';
    this.selectedDay = null;
    this.opponentSearch = '';
    this.loadOpponents();
    this.loadAvailableDays();
  }

  closeScheduleForm(): void {
    this.showScheduleForm = false;
  }

  loadOpponents(): void {
    this.loadingOpponents = true;
    this.http.get<any[]>(`${urlApp}/friendly/opponents/${this.teamId}`).subscribe({
      next: (data) => {
        this.opponents = data;
        this.filteredOpponents = data.slice(0, 30);
        this.loadingOpponents = false;
      },
      error: () => {
        this.opponents = [];
        this.filteredOpponents = [];
        this.loadingOpponents = false;
      }
    });
  }

  loadAvailableDays(): void {
    this.loadingDays = true;
    this.http.get<any[]>(`${urlApp}/friendly/availableDays/${this.teamId}/${this.season}`).subscribe({
      next: (data) => {
        this.availableDays = data;
        this.loadingDays = false;
      },
      error: () => {
        this.availableDays = [];
        this.loadingDays = false;
      }
    });
  }

  filterOpponents(): void {
    if (!this.opponentSearch || this.opponentSearch.length < 2) {
      this.filteredOpponents = this.opponents.slice(0, 30);
      return;
    }
    const q = this.opponentSearch.toLowerCase();
    this.filteredOpponents = this.opponents.filter(o => o.name.toLowerCase().includes(q)).slice(0, 20);
  }

  selectOpponent(opp: any): void {
    this.selectedOpponentId = opp.teamId;
    this.selectedOpponentName = opp.name;
    this.opponentSearch = opp.name;
    this.filteredOpponents = [];
  }

  scheduleFriendly(): void {
    if (!this.selectedOpponentId || !this.selectedDay) return;
    this.scheduling = true;
    this.scheduleMessage = '';
    this.http.post<any>(`${urlApp}/friendly/schedule`, {
      teamId: this.teamId,
      opponentTeamId: this.selectedOpponentId,
      day: this.selectedDay,
      season: this.season
    }).subscribe({
      next: (res) => {
        this.scheduling = false;
        this.scheduleSuccess = res.success;
        this.scheduleMessage = res.message || res.error || 'Done';
        if (res.success) {
          this.loadMatches();
          this.loadAvailableDays();
        }
      },
      error: (err) => {
        this.scheduling = false;
        this.scheduleSuccess = false;
        this.scheduleMessage = err.error?.error || 'Failed to schedule friendly.';
      }
    });
  }

  cancelFriendly(matchId: number): void {
    this.http.delete<any>(`${urlApp}/friendly/cancel/${matchId}`).subscribe({
      next: () => { this.loadMatches(); },
      error: () => {}
    });
  }

  toggleMatchDetails(matchId: number): void {
    this.expandedMatchId = this.expandedMatchId === matchId ? null : matchId;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'status-completed';
      case 'SCHEDULED': return 'status-scheduled';
      case 'CANCELLED': return 'status-cancelled';
      default: return '';
    }
  }

  getResultClass(match: any): string {
    if (match.status !== 'COMPLETED') return '';
    const isHome = match.homeTeamId === this.teamId;
    const myGoals = isHome ? match.homeGoals : match.awayGoals;
    const oppGoals = isHome ? match.awayGoals : match.homeGoals;
    if (myGoals > oppGoals) return 'result-win';
    if (myGoals < oppGoals) return 'result-loss';
    return 'result-draw';
  }

  getOpponentName(match: any): string {
    return match.homeTeamId === this.teamId ? match.awayTeamName : match.homeTeamName;
  }

  getVenue(match: any): string {
    return match.homeTeamId === this.teamId ? 'Home' : 'Away';
  }

  getScheduledCount(): number {
    return this.matches.filter(m => m.status === 'SCHEDULED').length;
  }

  getCompletedCount(): number {
    return this.matches.filter(m => m.status === 'COMPLETED').length;
  }

  getPreSeasonDays(): any[] {
    return this.availableDays.filter(d => d.day <= 30);
  }

  getWinterBreakDays(): any[] {
    return this.availableDays.filter(d => d.day >= 201 && d.day <= 210);
  }

  getDayLabel(day: number): string {
    if (day <= 30) return `Pre-Season Day ${day}`;
    if (day >= 201 && day <= 210) return `Winter Break Day ${day - 200}`;
    return `Day ${day}`;
  }
}
