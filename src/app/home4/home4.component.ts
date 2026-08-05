import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { urlApp } from '../app.component';
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
  managerProfile: any = null;
  squadPlayers: any[] = [];
  homeAvailability: any[] = [];
  opponentAvailability: any[] = [];
  trainingSchedule: any[] = [];
  teamScouts: any[] = [];
  scoutAssignments: any[] = [];
  staffOverview: any = null;
  financeDetail: any = null;
  teamStats: any = null;
  seasonOverview: any = null;
  detailedPlayerStats: any[] = [];
  supplementaryLoading = false;

  constructor(private workspaceHttp: HttpClient, teamService: TeamService) { super(workspaceHttp, teamService); }

  override loadData(): void {
    super.loadData();
    const teamId = this.teamService.teamId;
    if (teamId) this.loadWorkspace(teamId);
  }

  private loadWorkspace(teamId: number): void {
    const season = this.teamService.currentSeason || 1;
    this.supplementaryLoading = true;

    this.workspaceHttp.get<any>(urlApp + '/api/auth/me').subscribe({
      next: auth => {
        if (!auth?.managerId) return;
        this.workspaceHttp.get<any>(urlApp + `/managers/profile/${auth.managerId}`).subscribe({
          next: profile => this.managerProfile = profile,
          error: () => this.managerProfile = null
        });
      }
    });
    this.workspaceHttp.get<any[]>(urlApp + `/tactic/getPlayers/${teamId}`).subscribe({
      next: rows => this.squadPlayers = rows || [], error: () => this.squadPlayers = []
    });
    this.workspaceHttp.get<any[]>(urlApp + `/teams/availability/${teamId}`).subscribe({
      next: rows => this.homeAvailability = rows || [], error: () => this.homeAvailability = []
    });
    this.workspaceHttp.get<any>(urlApp + `/match/preview/${teamId}`).subscribe({
      next: preview => {
        this.matchPreview = preview;
        const opponentId = Number(preview?.homeTeamId) === Number(teamId) ? preview?.awayTeamId : preview?.homeTeamId;
        if (opponentId) this.workspaceHttp.get<any[]>(urlApp + `/teams/availability/${opponentId}`).subscribe({
          next: rows => this.opponentAvailability = rows || [], error: () => this.opponentAvailability = []
        });
      }
    });
    this.workspaceHttp.get<any[]>(urlApp + `/training/schedule/${teamId}`).subscribe({
      next: rows => this.trainingSchedule = rows || [], error: () => this.trainingSchedule = []
    });
    this.workspaceHttp.get<any[]>(urlApp + `/scouts/team/${teamId}`).subscribe({
      next: rows => this.teamScouts = rows || [], error: () => this.teamScouts = []
    });
    this.workspaceHttp.get<any[]>(urlApp + `/scouts/assignments/${teamId}`).subscribe({
      next: rows => this.scoutAssignments = rows || [], error: () => this.scoutAssignments = []
    });
    this.workspaceHttp.get<any>(urlApp + `/staff/overview/${teamId}`).subscribe({
      next: value => this.staffOverview = value, error: () => this.staffOverview = null
    });
    this.workspaceHttp.get<any>(urlApp + `/teams/finances/${teamId}`).subscribe({
      next: value => this.financeDetail = value, error: () => this.financeDetail = null
    });
    this.workspaceHttp.get<any>(urlApp + `/stats/teamDataHub/${teamId}/${season}`).subscribe({
      next: value => this.teamStats = value, error: () => this.teamStats = null
    });
    this.workspaceHttp.get<any[]>(urlApp + `/stats/team/${teamId}/season/${season}?limit=20`).subscribe({
      next: rows => this.detailedPlayerStats = rows || [], error: () => this.detailedPlayerStats = []
    });
    this.workspaceHttp.get<any>(urlApp + `/stats/overview/${season}?limit=100&scope=ALL`).subscribe({
      next: value => { this.seasonOverview = value; this.supplementaryLoading = false; },
      error: () => { this.seasonOverview = null; this.supplementaryLoading = false; }
    });
  }

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

  get ownTeamIsHome(): boolean { return Number(this.matchPreview?.homeTeamId) === Number(this.teamService.teamId); }
  get ownTeamNews(): any[] { return this.homeAvailability.slice(0, 3); }
  get opponentTeamNews(): any[] { return this.opponentAvailability.slice(0, 3); }
  get opponentName(): string { return this.ownTeamIsHome ? this.matchPreview?.awayTeamName : this.matchPreview?.homeTeamName; }

  get managerReputationLabel(): string {
    const value = Number(this.managerProfile?.reputation || 0);
    return value >= 8000 ? 'World class' : value >= 5000 ? 'Continental' : value >= 2500 ? 'National' : 'Developing';
  }

  get managerAttributes(): { label: string; value: number }[] {
    if (!this.managerProfile) return [];
    const attack = this.toTwenty(this.managerProfile.offensiveAbility);
    const defence = this.toTwenty(this.managerProfile.defensiveAbility);
    return [
      { label: 'Attacking', value: attack },
      { label: 'Defending', value: defence },
      { label: 'Tactical', value: Number(this.managerProfile.coachingTactical) || Math.round((attack + defence) / 2) },
      { label: 'Technical', value: Number(this.managerProfile.coachingTechnical) || attack },
      { label: 'Mental', value: Number(this.managerProfile.coachingMental) || Math.round((attack + defence) / 2) },
      { label: 'Motivating', value: Number(this.managerProfile.motivating) || Math.max(1, Math.round(Number(this.managerProfile.reputation || 0) / 500)) },
      { label: 'Youth', value: Number(this.managerProfile.workingWithYoungsters) || 10 }
    ];
  }

  get playerLeaderCards(): { icon: string; label: string; name: string; value: string; playerId?: number }[] {
    const goals = this.topDetailed('goals');
    const rating = this.topDetailed('averageRating');
    const assists = this.topDetailed('assists');
    const passes = this.overviewLeader('passesCompleted');
    const chances = this.overviewLeader('chancesCreated');
    return [
      this.playerCard('●', 'Top goalscorer', goals, goals ? `${goals.goals} goals` : '—'),
      this.playerCard('★', 'Highest average rating', rating, rating ? Number(rating.averageRating).toFixed(2) : '—'),
      this.playerCard('↗', 'Most assists', assists, assists ? `${assists.assists} assists` : '—'),
      this.playerCard('◎', 'Most completed passes', passes, passes ? `${passes.value} passes` : '—'),
      this.playerCard('◆', 'Most chances created', chances, chances ? `${chances.value} chances` : '—')
    ];
  }

  get squadGroups(): { tone: string; label: string; names: string }[] {
    const injured = this.homeAvailability.filter(row => row.type === 'INJURY');
    const suspended = this.homeAvailability.filter(row => row.type === 'SUSPENSION');
    const lowCondition = this.squadPlayers.filter(player => Number(player.condition ?? player.fitness ?? 100) < 70);
    const expiring = this.squadPlayers.filter(player => Number(player.contractEndSeason) > 0
      && Number(player.contractEndSeason) <= Number(this.teamService.currentSeason));
    return [
      { tone: 'green', label: `${this.squadPlayers.length || '—'} registered players`, names: 'First-team and development squad' },
      { tone: injured.length ? 'red' : 'green', label: `${injured.length} injured`, names: this.names(injured) || 'No current injuries' },
      { tone: suspended.length ? 'amber' : 'green', label: `${suspended.length} suspended`, names: this.names(suspended) || 'No suspensions' },
      { tone: lowCondition.length ? 'amber' : 'green', label: `${lowCondition.length} low condition`, names: this.names(lowCondition) || 'Squad condition is healthy' },
      { tone: expiring.length ? 'red' : 'green', label: `${expiring.length} expiring contracts`, names: this.names(expiring) || 'No immediate expiries' }
    ];
  }

  get trainingSegments(): { label: string; count: number; percent: number; color: string }[] {
    const colors: Record<string, string> = { Match: '#67b86f', Tactical: '#57a8c2', Physical: '#d8844e', General: '#d3bd59', Rest: '#697b88' };
    const counts: Record<string, number> = {};
    this.trainingSchedule.forEach(row => counts[row.sessionType || 'General'] = (counts[row.sessionType || 'General'] || 0) + 1);
    const total = Math.max(1, this.trainingSchedule.length);
    return Object.keys(counts).map(label => ({ label, count: counts[label], percent: Math.round(counts[label] * 100 / total), color: colors[label] || '#8397a6' }));
  }

  get trainingGradient(): string {
    let cursor = 0;
    const stops = this.trainingSegments.map(segment => {
      const start = cursor; cursor += segment.percent;
      return `${segment.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.length ? stops.join(',') : '#364955 0 100%'})`;
  }

  get prioritySessions(): any[] {
    return [...this.trainingSchedule].filter(row => row.sessionType !== 'Rest')
      .sort((a, b) => Number(b.intensity) - Number(a.intensity)).slice(0, 4);
  }

  get scoutingRows(): any[] {
    return this.teamScouts.slice(0, 9).map(scout => {
      const assignment = this.scoutAssignments.find(row => Number(row.scoutId) === Number(scout.id)
        || row.scoutName === scout.name);
      return { ...scout, assignment };
    });
  }

  get salaryUtilization(): number {
    const budget = Number(this.financeDetail?.salaryBudget || 0);
    if (!budget) return 0;
    return Math.max(0, Math.min(100, Math.round(Number(this.financeDetail?.monthlyWages || 0) * 100 / budget)));
  }

  get teamStatRows(): { label: string; value: string }[] {
    const stats = this.teamStats || {};
    return [
      { label: 'Matches played', value: String(stats.totalMatches ?? '—') },
      { label: 'Goals scored', value: String(stats.goalsScored ?? '—') },
      { label: 'Goals conceded', value: String(stats.goalsConceded ?? '—') },
      { label: 'Clean sheets', value: String(stats.cleanSheets ?? '—') },
      { label: 'Win percentage', value: stats.winPercentage != null ? `${Number(stats.winPercentage).toFixed(0)}%` : '—' },
      { label: 'Average rating', value: stats.avgTeamRating != null ? Number(stats.avgTeamRating).toFixed(2) : '—' }
    ];
  }

  private toTwenty(value: number): number { return Math.max(1, Math.min(20, Math.round(Number(value || 0) / 5))); }
  private names(rows: any[]): string { return rows.slice(0, 4).map(row => row.playerName || row.name).filter(Boolean).join(', '); }
  private topDetailed(field: string): any {
    return [...this.detailedPlayerStats].sort((left, right) => Number(right[field] || 0) - Number(left[field] || 0))[0];
  }
  private overviewLeader(key: string): any {
    const category = (this.seasonOverview?.categories || []).find((row: any) => row.key === key);
    return (category?.leaders || []).find((row: any) => Number(row.teamId) === Number(this.teamService.teamId));
  }
  private playerCard(icon: string, label: string, row: any, value: string): any {
    return { icon, label, name: row?.playerName || 'No data yet', value, playerId: row?.playerId };
  }
}
