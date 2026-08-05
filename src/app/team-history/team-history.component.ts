import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { urlApp } from '../app.component'; // Ajusteaza calea daca e nevoie
import { LegacyRecordsData, LegendRow, BestElevenPlayer } from '../competition-records/competition-records.component';
import { TeamService } from '../services/team.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';

// Interfata bruta de la Backend
interface CompetitionHistory {
  id: number;
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
  seasonNumber: number;
  lastPosition: number; // 1, 2 sau 3
}

// Interfata procesata pentru UI
interface DetailedStat {
  competitionId: number;
  competitionName: string;
  typeId: number;
  championYears: number[];
  runnerUpYears: number[];
  thirdPlaceYears: number[];
  totalWins: number;
}

interface FriendlyHonour {
  eventId: number;
  name: string;
  eventType: 'MINI_CUP' | 'MINI_LEAGUE';
  season: number;
  hostNationName: string;
  locationName: string;
  organizerTeamName: string;
  prizePool: number;
}

interface FriendlyHonoursResponse {
  total: number;
  miniCups: number;
  miniLeagues: number;
  honours: FriendlyHonour[];
}

interface ClubLegendRecord {
  id: number;
  teamId: number;
  playerId: number;
  playerName: string;
  position: string;
  inductedSeason: number;
  inductedAt: number;
  reason: string;
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
}

@Component({
  selector: 'app-team-history',
  templateUrl: './team-history.component.html',
  styleUrls: ['./team-history.component.css']
})
export class TeamHistoryComponent implements OnInit {

  teamId!: number;
  teamName: string = '';
  historyStats: DetailedStat[] = [];
  records?: LegacyRecordsData;
  friendlyHonours?: FriendlyHonoursResponse;
  officialLegends: ClubLegendRecord[] = [];
  activeTab: 'legends' | 'honours' | 'players' | 'sales' = 'legends';
  loading: boolean = true;
  failed = false;
  legendActionPlayerId: number | null = null;
  legendError = '';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router,
    private teamService: TeamService,
    private feedback: UiFeedbackService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']);
      this.loadHistory();
    });
  }

  loadHistory() {
    this.loading = true;
    
    const nameReq = this.http.get(urlApp + `/teams/getTeamNameById/${this.teamId}`, { responseType: 'text' });
    const historyReq = this.http.get<CompetitionHistory[]>(urlApp + `/history/teamCompetitionWins/${this.teamId}`);
    const recordsReq = this.http.get<LegacyRecordsData>(urlApp + `/stats/records/club/${this.teamId}?limit=20`);
    const friendlyHonoursReq = this.http.get<FriendlyHonoursResponse>(urlApp + `/friendly/honours/${this.teamId}`);
    const legendsReq = this.http.get<ClubLegendRecord[]>(urlApp + `/club-legends/team/${this.teamId}`);

    forkJoin([nameReq, historyReq, recordsReq, friendlyHonoursReq, legendsReq]).subscribe({
      next: ([name, historyData, records, friendlyHonours, legends]) => {
        this.teamName = name;
        this.processHistory(historyData);
        this.records = records;
        this.friendlyHonours = friendlyHonours;
        this.officialLegends = legends;
        this.failed = false;
        this.loading = false;
      },
      error: () => { this.failed = true; this.loading = false; }
    });
  }

  processHistory(data: CompetitionHistory[]) {
    const map = new Map<number, DetailedStat>();

    data.forEach(h => {
      // Ignoram locurile mai jos de 3
      if (h.lastPosition > 3) return;

      if (!map.has(h.competitionId)) {
        map.set(h.competitionId, {
          competitionId: h.competitionId,
          competitionName: h.competitionName,
          typeId: h.competitionTypeId,
          championYears: [],
          runnerUpYears: [],
          thirdPlaceYears: [],
          totalWins: 0
        });
      }

      const stat = map.get(h.competitionId)!;

      if (h.lastPosition === 1) {
        stat.championYears.push(h.seasonNumber);
        stat.totalWins++;
      } else if (h.lastPosition === 2) {
        stat.runnerUpYears.push(h.seasonNumber);
      } else if (h.lastPosition === 3) {
        stat.thirdPlaceYears.push(h.seasonNumber);
      }
    });

    // Sortam anii crescator (cel mai recent ultimul)
    map.forEach(stat => {
      stat.championYears.sort((a, b) => a - b);
      stat.runnerUpYears.sort((a, b) => a - b);
      stat.thirdPlaceYears.sort((a, b) => a - b);
    });

    // Convertim in array si sortam competitiile: cele cu cele mai multe trofee primele
    this.historyStats = Array.from(map.values()).sort((a, b) => b.totalWins - a.totalWins);
  }

  goBack() {
    this.router.navigate(['/team', this.teamId]); // Sau ruta ta principala de echipa
  }
  goToCompetition(competitionId: number) {
    this.router.navigate(['/competition', competitionId]);
  }

  changeSeason(season: number): void {
    this.loading = true;
    this.http.get<LegacyRecordsData>(urlApp + `/stats/records/club/${this.teamId}?limit=20&season=${season}`).subscribe({
      next: records => { this.records = records; this.loading = false; },
      error: () => { this.failed = true; this.loading = false; }
    });
  }

  setTab(tab: 'legends' | 'honours' | 'players' | 'sales'): void { this.activeTab = tab; }
  get canManageLegends(): boolean { return this.teamId > 0 && this.teamId === this.teamService.teamId; }
  isOfficialLegend(playerId: number): boolean { return this.officialLegends.some(legend => legend.playerId === playerId); }

  async inductLegend(player: LegendRow): Promise<void> {
    if (!this.canManageLegends || this.legendActionPlayerId !== null || this.isOfficialLegend(player.playerId)) return;
    const confirmed = await this.feedback.confirm(`Induct ${player.playerName} into ${this.teamName}'s official Hall of Fame?`, {
      title: 'Make club legend', confirmLabel: 'Induct player', tone: 'success'
    });
    if (!confirmed) return;
    this.legendActionPlayerId = player.playerId;
    this.legendError = '';
    const reason = player.goals > 0
      ? `${player.appearances} appearances and ${player.goals} goals for ${this.teamName}`
      : `${player.appearances} appearances for ${this.teamName}`;
    this.http.post<ClubLegendRecord>(urlApp + `/club-legends/team/${this.teamId}/player/${player.playerId}`,
      { teamId: this.teamId, reason }).subscribe({
      next: legend => {
        this.officialLegends = [legend, ...this.officialLegends.filter(item => item.playerId !== legend.playerId)];
        this.legendActionPlayerId = null;
      },
      error: error => {
        this.legendError = error?.error?.message || error?.error || 'The player could not be inducted as a club legend.';
        this.legendActionPlayerId = null;
      }
    });
  }

  async removeLegend(playerId: number): Promise<void> {
    if (!this.canManageLegends || this.legendActionPlayerId !== null) return;
    const legend = this.officialLegends.find(item => item.playerId === playerId);
    const confirmed = await this.feedback.confirm(`Remove ${legend?.playerName || 'this player'} from the official Hall of Fame? Their match history will remain unchanged.`, {
      title: 'Remove club legend', confirmLabel: 'Remove status', tone: 'error'
    });
    if (!confirmed) return;
    this.legendActionPlayerId = playerId;
    this.legendError = '';
    this.http.delete(urlApp + `/club-legends/team/${this.teamId}/player/${playerId}`).subscribe({
      next: () => {
        this.officialLegends = this.officialLegends.filter(legend => legend.playerId !== playerId);
        this.legendActionPlayerId = null;
      },
      error: error => {
        this.legendError = error?.error?.message || error?.error || 'The club legend status could not be removed.';
        this.legendActionPlayerId = null;
      }
    });
  }

  trackPlayer(_: number, row: LegendRow): number { return row.playerId; }
  trackOfficialLegend(_: number, row: ClubLegendRecord): number { return row.playerId; }
  trackEleven(index: number, row: BestElevenPlayer): string { return `${row.slot}-${row.player.playerId}-${index}`; }
  formatMoney(value: number): string { return new Intl.NumberFormat('en-GB').format(value || 0); }
}
