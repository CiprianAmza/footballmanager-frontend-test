import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

export interface LegendRow {
  rank: number;
  playerId: number;
  playerName: string;
  position: string;
  teamId: number | null;
  teamName: string;
  multipleClubs: boolean;
  firstSeason: number;
  lastSeason: number;
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
  trophies: number;
  recordValue: number;
}

export interface CareerMove {
  seasonNumber: number; fromTeamId: number; fromTeamName: string;
  toTeamId: number; toTeamName: string; fee: number;
}
export interface OwnedClub { teamId: number; teamName: string; }
export interface WhereAreTheyNow {
  status: 'ACTIVE_PLAYER' | 'FREE_AGENT' | 'RETIRED' | 'MANAGER' | 'STAFF' | 'OWNER' | 'OTHER' | 'UNKNOWN';
  statusLabel: string;
  currentTeamId: number | null;
  currentTeamName: string | null;
  role: string;
  retired: boolean;
  appearancesAfterSeason: number;
  goalsAfterSeason: number;
  assistsAfterSeason: number;
  lastActiveSeason: number | null;
  transferJourney: CareerMove[];
  ownedClubs: OwnedClub[];
  summary: string;
}
export interface BestElevenPlayer {
  slot: string;
  player: LegendRow;
  legacyScore: number;
  whereAreTheyNow?: WhereAreTheyNow | null;
}
export interface TransferRecord {
  playerId: number; playerName: string; fromTeamId: number; fromTeamName: string;
  toTeamId: number; toTeamName: string; fee: number; seasonNumber: number;
}
export interface LegacyRecordsData {
  scopeType: 'CLUB' | 'COMPETITION' | 'WORLD';
  scopeId: number | null;
  scopeName: string;
  currentSeason: number;
  selectedSeason: number;
  availableSeasons: number[];
  limit: number;
  allTimeScorers: LegendRow[];
  allTimeAssists: LegendRow[];
  allTimeAppearances: LegendRow[];
  trophyLeaders: LegendRow[];
  seasonScorers: LegendRow[];
  seasonAssists: LegendRow[];
  seasonAppearances: LegendRow[];
  seasonBestEleven: BestElevenPlayer[];
  allTimeBestEleven: BestElevenPlayer[];
  playerHistory: LegendRow[];
  recordSales: TransferRecord[];
}

type RecordMetric = 'goals' | 'assists' | 'appearances' | 'trophies';

@Component({
  selector: 'app-competition-records',
  templateUrl: './competition-records.component.html',
  styleUrls: ['./competition-records.component.css']
})
export class CompetitionRecordsComponent implements OnInit {
  competitionId = 0;
  world = false;
  data?: LegacyRecordsData;
  metric: RecordMetric = 'goals';
  limit = 20;
  readonly limitOptions = [10, 20, 50, 100];
  loading = false;
  failed = false;

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.competitionId = Number(params.get('competitionId')) || 0;
      this.world = !this.competitionId;
      this.load();
    });
  }

  load(season?: number): void {
    this.loading = true;
    this.failed = false;
    const scope = this.world ? '/stats/records/world' : `/stats/records/competition/${this.competitionId}`;
    const selected = season ?? this.data?.selectedSeason;
    const seasonQuery = selected ? `&season=${selected}` : '';
    this.http.get<LegacyRecordsData>(urlApp + `${scope}?limit=${this.limit}${seasonQuery}`).subscribe({
      next: data => { this.data = data; this.loading = false; },
      error: () => { this.data = undefined; this.failed = true; this.loading = false; }
    });
  }

  setMetric(metric: RecordMetric): void { this.metric = metric; }

  seasonRows(): LegendRow[] {
    if (!this.data) return [];
    if (this.metric === 'goals') return this.data.seasonScorers;
    if (this.metric === 'assists') return this.data.seasonAssists;
    if (this.metric === 'appearances') return this.data.seasonAppearances;
    return [];
  }

  allTimeRows(): LegendRow[] {
    if (!this.data) return [];
    if (this.metric === 'goals') return this.data.allTimeScorers;
    if (this.metric === 'assists') return this.data.allTimeAssists;
    if (this.metric === 'appearances') return this.data.allTimeAppearances;
    return this.data.trophyLeaders;
  }

  metricTitle(): string {
    return ({ goals: 'Goals', assists: 'Assists', appearances: 'Appearances', trophies: 'Trophies won' } as const)[this.metric];
  }

  seasonRange(row: LegendRow): string {
    return row.firstSeason === row.lastSeason ? `Season ${row.firstSeason}` : `S${row.firstSeason}–S${row.lastSeason}`;
  }

  trackRecord(index: number, row: LegendRow): string { return `${row.playerId}-${index}`; }
  trackEleven(index: number, row: BestElevenPlayer): string { return `${row.slot}-${row.player.playerId}-${index}`; }
  formatMoney(value: number): string { return new Intl.NumberFormat('en-GB').format(value || 0); }
}
