import { Component, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { HomeComponent } from '../home/home.component';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-home3',
  templateUrl: './home3.component.html',
  styleUrls: ['./home3.component.css']
})
export class Home3Component extends HomeComponent {
  constructor(http: HttpClient, teamService: TeamService, private router: Router) {
    super(http, teamService);
  }

  get cockpitTable(): any[] {
    if (this.leagueTable.length <= 10) return this.leagueTable;
    const index = this.leagueTable.findIndex(row => row.isHumanTeam || row.name === this.teamName || row.teamName === this.teamName);
    if (index < 0 || index < 7) return this.leagueTable.slice(0, 10);
    const start = Math.min(index - 6, this.leagueTable.length - 10);
    return this.leagueTable.slice(Math.max(0, start), Math.max(0, start) + 10);
  }

  get predictionTone(): string {
    const prediction = String(this.matchPreview?.prediction || '').toLowerCase();
    const userIsHome = Number(this.matchPreview?.homeTeamId) === Number(this.teamService.teamId);
    if (prediction.includes('home') && prediction.includes('win')) return userIsHome ? 'positive' : 'negative';
    if (prediction.includes('away') && prediction.includes('win')) return userIsHome ? 'negative' : 'positive';
    if (prediction.includes('loss') || prediction.includes('lose')) return 'negative';
    return 'neutral';
  }

  resultCode(match: any): string {
    const score = String(match?.score || '');
    const values = score.match(/(\d+)\D+(\d+)/);
    if (!values) return '–';
    const home = Number(values[1]);
    const away = Number(values[2]);
    if (home === away) return 'D';
    const userWon = match.homeOrAway === 'H' ? home > away : away > home;
    return userWon ? 'W' : 'L';
  }

  resultTone(match: any): string {
    const code = this.resultCode(match);
    return code === 'W' ? 'win' : code === 'L' ? 'loss' : code === 'D' ? 'draw' : '';
  }

  formatCompactMoney(value: number): string {
    const absolute = Math.abs(Number(value) || 0);
    if (absolute >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
    if (absolute >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
    return `€${value || 0}`;
  }

  @HostListener('window:keydown', ['$event'])
  handleHotkeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (!event.altKey) return;

    const teamId = this.teamService.teamId;
    const routes: { [key: string]: any[] } = {
      s: ['/team', teamId],
      t: ['/tactics', teamId],
      i: ['/inbox'],
      m: ['/transfers', teamId, this.teamService.currentSeason],
      f: ['/fixtures', teamId],
      d: ['/data-hub']
    };
    const route = routes[event.key.toLowerCase()];
    if (!route) return;
    event.preventDefault();
    this.router.navigate(route);
  }
}
