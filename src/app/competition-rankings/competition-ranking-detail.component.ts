import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClubEconomyRow, CompetitionEconomyDetail, CompetitionHubService, PlayerWageRow } from '../services/competition-hub.service';

type ClubSort = 'teamName' | 'homeMatches' | 'totalAttendance' | 'averageAttendance' | 'players' | 'totalPlayerWages' | 'averagePlayerWage' | 'highestPlayerWage';
type PlayerSort = 'playerName' | 'teamName' | 'position' | 'age' | 'wage';

@Component({
  selector: 'app-competition-ranking-detail',
  templateUrl: './competition-ranking-detail.component.html',
  styleUrls: ['./competition-rankings.component.css', './competition-ranking-detail.component.css']
})
export class CompetitionRankingDetailComponent implements OnInit, OnDestroy {
  private subscription = new Subscription();
  data?: CompetitionEconomyDetail;
  loading = true;
  error = '';
  view: 'clubs' | 'players' = 'clubs';
  selectedTeamId: number | null = null;
  search = '';
  clubSort: ClubSort = 'totalAttendance';
  clubDirection: 'asc' | 'desc' = 'desc';
  playerSort: PlayerSort = 'wage';
  playerDirection: 'asc' | 'desc' = 'desc';
  competitionId = 0;

  constructor(private hub: CompetitionHubService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.subscription.add(this.route.paramMap.subscribe(params => {
      this.competitionId = Number(params.get('competitionId'));
      this.load();
    }));
  }
  ngOnDestroy(): void { this.subscription.unsubscribe(); }

  load(): void {
    if (!Number.isInteger(this.competitionId) || this.competitionId <= 0) {
      this.error = 'Invalid competition.';
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = '';
    this.subscription.add(this.hub.economyRankingDetail(this.competitionId).subscribe({
      next: data => { this.data = data; this.loading = false; },
      error: () => { this.error = 'Could not load this competition breakdown.'; this.loading = false; }
    }));
  }

  sortClubs(key: ClubSort): void {
    if (this.clubSort === key) this.clubDirection = this.clubDirection === 'desc' ? 'asc' : 'desc';
    else { this.clubSort = key; this.clubDirection = key === 'teamName' ? 'asc' : 'desc'; }
  }
  sortPlayers(key: PlayerSort): void {
    if (this.playerSort === key) this.playerDirection = this.playerDirection === 'desc' ? 'asc' : 'desc';
    else { this.playerSort = key; this.playerDirection = key === 'playerName' || key === 'teamName' || key === 'position' ? 'asc' : 'desc'; }
  }
  clubArrow(key: ClubSort): string { return this.clubSort === key ? this.clubDirection === 'asc' ? '▲' : '▼' : '↕'; }
  playerArrow(key: PlayerSort): string { return this.playerSort === key ? this.playerDirection === 'asc' ? '▲' : '▼' : '↕'; }

  get clubs(): ClubEconomyRow[] {
    const query = this.search.trim().toLowerCase();
    const direction = this.clubDirection === 'asc' ? 1 : -1;
    return [...(this.data?.clubs || [])].filter(row => !query || row.teamName.toLowerCase().includes(query))
      .sort((a, b) => this.compare(a[this.clubSort], b[this.clubSort]) * direction || a.teamName.localeCompare(b.teamName));
  }
  get players(): PlayerWageRow[] {
    const query = this.search.trim().toLowerCase();
    const direction = this.playerDirection === 'asc' ? 1 : -1;
    return [...(this.data?.players || [])]
      .filter(row => this.selectedTeamId == null || row.teamId === this.selectedTeamId)
      .filter(row => !query || row.playerName.toLowerCase().includes(query) || row.teamName.toLowerCase().includes(query))
      .sort((a, b) => this.compare(a[this.playerSort], b[this.playerSort]) * direction || a.playerName.localeCompare(b.playerName));
  }
  private compare(a: string | number, b: string | number): number {
    return typeof a === 'number' && typeof b === 'number' ? a - b : String(a || '').localeCompare(String(b || ''));
  }
  showClubPlayers(teamId: number): void { this.selectedTeamId = teamId; this.view = 'players'; this.search = ''; }
  showAllPlayers(): void { this.selectedTeamId = null; this.view = 'players'; this.search = ''; }
  get selectedClubName(): string { return this.data?.clubs.find(row => row.teamId === this.selectedTeamId)?.teamName || 'All clubs'; }
  get totalHomeMatches(): number { return (this.data?.clubs || []).reduce((sum, row) => sum + row.homeMatches, 0); }
  get totalAttendance(): number { return (this.data?.clubs || []).reduce((sum, row) => sum + row.totalAttendance, 0); }
  get averageAttendance(): number { return this.totalHomeMatches ? Math.round(this.totalAttendance / this.totalHomeMatches) : 0; }
  money(value: number): string { return `€${Number(value || 0).toLocaleString('en-US')}`; }
  number(value: number): string { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }); }
}
