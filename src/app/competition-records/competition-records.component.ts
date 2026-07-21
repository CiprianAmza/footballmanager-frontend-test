import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface CompetitionRecordRow {
  rank: number;
  playerId: number;
  playerName: string;
  teamId: number | null;
  teamName: string;
  multipleClubs: boolean;
  seasonNumber: number | null;
  firstSeason: number | null;
  lastSeason: number | null;
  appearances: number;
  goals: number;
  assists: number;
  recordValue: number;
}

interface CompetitionRecordsData {
  competitionId: number;
  competitionName: string;
  currentSeason: number;
  limit: number;
  goalsSingleSeason: CompetitionRecordRow[];
  goalsAllTime: CompetitionRecordRow[];
  assistsSingleSeason: CompetitionRecordRow[];
  assistsAllTime: CompetitionRecordRow[];
}

type RecordMetric = 'goals' | 'assists';

@Component({
  selector: 'app-competition-records',
  templateUrl: './competition-records.component.html',
  styleUrls: ['./competition-records.component.css']
})
export class CompetitionRecordsComponent implements OnInit {
  competitionId = 0;
  data?: CompetitionRecordsData;
  metric: RecordMetric = 'goals';
  limit = 20;
  readonly limitOptions = [10, 20, 50];
  loading = false;
  failed = false;

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.competitionId = Number(params.get('competitionId'));
      this.load();
    });
  }

  load(): void {
    if (!this.competitionId) return;
    this.loading = true;
    this.failed = false;
    this.http.get<CompetitionRecordsData>(
      urlApp + `/stats/competition/${this.competitionId}/records?limit=${this.limit}`
    ).subscribe({
      next: data => {
        this.data = data;
        this.loading = false;
      },
      error: () => {
        this.data = undefined;
        this.failed = true;
        this.loading = false;
      }
    });
  }

  setMetric(metric: RecordMetric): void {
    this.metric = metric;
  }

  singleSeasonRows(): CompetitionRecordRow[] {
    if (!this.data) return [];
    return this.metric === 'goals' ? this.data.goalsSingleSeason : this.data.assistsSingleSeason;
  }

  allTimeRows(): CompetitionRecordRow[] {
    if (!this.data) return [];
    return this.metric === 'goals' ? this.data.goalsAllTime : this.data.assistsAllTime;
  }

  seasonRange(row: CompetitionRecordRow): string {
    if (row.firstSeason == null) return '—';
    return row.firstSeason === row.lastSeason
      ? `Season ${row.firstSeason}`
      : `S${row.firstSeason}–S${row.lastSeason}`;
  }

  trackRecord(index: number, row: CompetitionRecordRow): string {
    return `${row.playerId}-${row.seasonNumber ?? 'all'}-${index}`;
  }
}
