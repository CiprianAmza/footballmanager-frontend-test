import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { TeamService } from '../services/team.service';
import { HomeComponent } from '../home/home.component';

@Component({
  selector: 'app-home4',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './home4.component.html',
  styleUrls: ['./home4.component.css']
})
export class Home4Component extends HomeComponent {
  constructor(http: HttpClient, teamService: TeamService) { super(http, teamService); }

  get compactTable(): any[] {
    const own = this.leagueTable.findIndex(row => row.isHumanTeam || row.name === this.teamName || row.teamName === this.teamName);
    if (this.leagueTable.length <= 12 || own < 8) return this.leagueTable.slice(0, 12);
    return this.leagueTable.slice(Math.max(0, own - 7), Math.max(0, own - 7) + 12);
  }

  resultCode(match: any): string {
    const result = String(match?.score || '').match(/(\d+)\D+(\d+)/);
    if (!result) return '—';
    const home = Number(result[1]);
    const away = Number(result[2]);
    if (home === away) return 'D';
    return (match.homeOrAway === 'H' ? home > away : away > home) ? 'W' : 'L';
  }

  money(value: number): string {
    return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) + ' EUR';
  }

  confidenceWidth(value: number): number { return Math.max(4, Math.min(100, value || 0)); }
}
