import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClubEconomyRow, CompetitionEconomyRanking, CompetitionEconomyRow, CompetitionHubService, PlayerWageRow } from '../services/competition-hub.service';
import { GameEventsService } from '../services/game-events.service';

type RankingSection = 'competitions' | 'clubs' | 'players';
type CompetitionMetric = 'averageAttendance' | 'totalAttendance' | 'averagePlayerWage' | 'totalPlayerWages' | 'highestPlayerWage';
type ClubMetric = 'totalAttendance' | 'averageAttendance' | 'totalPlayerWages' | 'averagePlayerWage' | 'highestPlayerWage';
type CompetitionSort = CompetitionMetric | 'competitionName' | 'homeMatches' | 'clubs' | 'players';
type ClubSort = ClubMetric | 'teamName' | 'homeMatches' | 'players';
type PlayerSort = 'playerName' | 'teamName' | 'position' | 'age' | 'wage';

@Component({
  selector: 'app-competition-rankings',
  templateUrl: './competition-rankings.component.html',
  styleUrls: ['./competition-rankings.component.css']
})
export class CompetitionRankingsComponent implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  data?: CompetitionEconomyRanking;
  section: RankingSection = 'competitions';
  competitionMetric: CompetitionMetric = 'averageAttendance';
  clubMetric: ClubMetric = 'totalAttendance';
  competitionSort: CompetitionSort = 'averageAttendance';
  competitionDirection: 'asc' | 'desc' = 'desc';
  clubSort: ClubSort = 'totalAttendance';
  clubDirection: 'asc' | 'desc' = 'desc';
  playerSort: PlayerSort = 'wage';
  playerDirection: 'asc' | 'desc' = 'desc';
  scope: 'ALL' | 'LEAGUE' | 'CUP' = 'ALL';
  minMatches = 1;
  search = '';
  loading = true;
  error = '';

  readonly competitionMetrics: { key: CompetitionMetric; label: string }[] = [
    { key: 'averageAttendance', label: 'Spectators / match' },
    { key: 'totalAttendance', label: 'Total spectators' },
    { key: 'averagePlayerWage', label: 'Average player wage' },
    { key: 'totalPlayerWages', label: 'Club payroll combined' },
    { key: 'highestPlayerWage', label: 'Highest player wage' }
  ];
  readonly clubMetrics: { key: ClubMetric; label: string }[] = [
    { key: 'totalAttendance', label: 'Most spectators' },
    { key: 'averageAttendance', label: 'Spectators / match' },
    { key: 'totalPlayerWages', label: 'Highest payroll' },
    { key: 'averagePlayerWage', label: 'Average player wage' },
    { key: 'highestPlayerWage', label: 'Highest player wage' }
  ];

  constructor(private hub: CompetitionHubService, private route: ActivatedRoute,
              private events: GameEventsService) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.paramMap.subscribe(params => {
      const value = params.get('section');
      this.section = value === 'clubs' || value === 'players' ? value : 'competitions';
    }));
    this.subscriptions.add(this.events.on('standings').subscribe(() => this.load(false)));
    this.load();
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  load(spinner = true): void {
    if (spinner) this.loading = true;
    this.error = '';
    this.hub.economyRanking().subscribe({
      next: data => {
        this.data = data;
        if (!data.competitions.some(row => row.homeMatches > 0) && this.competitionMetric === 'averageAttendance') {
          this.competitionMetric = 'averagePlayerWage';
          this.competitionSort = 'averagePlayerWage';
        }
        if (!data.clubs.some(row => row.homeMatches > 0) && this.clubMetric === 'totalAttendance') {
          this.clubMetric = 'totalPlayerWages';
          this.clubSort = 'totalPlayerWages';
        }
        this.loading = false;
      },
      error: () => { this.error = 'Could not load the rankings. Please retry.'; this.loading = false; }
    });
  }

  get competitionRows(): CompetitionEconomyRow[] {
    const q = this.search.trim().toLowerCase();
    const attendanceMetric = this.competitionSort === 'averageAttendance' || this.competitionSort === 'totalAttendance' || this.competitionSort === 'homeMatches';
    const wageMetric = this.competitionSort === 'averagePlayerWage' || this.competitionSort === 'totalPlayerWages' || this.competitionSort === 'highestPlayerWage';
    const direction = this.competitionDirection === 'asc' ? 1 : -1;
    return [...(this.data?.competitions || [])]
      .filter(row => !q || row.competitionName.toLowerCase().includes(q))
      .filter(row => this.scope === 'ALL' || (this.scope === 'LEAGUE' ? row.typeId === 1 || row.typeId === 3 : row.typeId !== 1 && row.typeId !== 3))
      .filter(row => !attendanceMetric || row.homeMatches >= this.minMatches)
      .filter(row => !wageMetric || row.players > 0)
      .sort((a, b) => this.compare(a[this.competitionSort], b[this.competitionSort]) * direction
        || a.competitionName.localeCompare(b.competitionName));
  }

  get clubRows(): ClubEconomyRow[] {
    const q = this.search.trim().toLowerCase();
    const attendanceMetric = this.clubSort === 'averageAttendance' || this.clubSort === 'totalAttendance' || this.clubSort === 'homeMatches';
    const wageMetric = this.clubSort === 'averagePlayerWage' || this.clubSort === 'totalPlayerWages' || this.clubSort === 'highestPlayerWage';
    const direction = this.clubDirection === 'asc' ? 1 : -1;
    return [...(this.data?.clubs || [])]
      .filter(row => !q || row.teamName.toLowerCase().includes(q))
      .filter(row => !attendanceMetric || row.homeMatches >= this.minMatches)
      .filter(row => !wageMetric || row.players > 0)
      .sort((a, b) => this.compare(a[this.clubSort], b[this.clubSort]) * direction
        || a.teamName.localeCompare(b.teamName));
  }

  get playerRows(): PlayerWageRow[] {
    const q = this.search.trim().toLowerCase();
    const direction = this.playerDirection === 'asc' ? 1 : -1;
    return [...(this.data?.players || [])].filter(row => !q || row.playerName.toLowerCase().includes(q)
      || row.teamName.toLowerCase().includes(q))
      .sort((a, b) => this.compare(a[this.playerSort], b[this.playerSort]) * direction
        || a.playerName.localeCompare(b.playerName));
  }

  sortCompetitions(key: CompetitionSort, reset = false): void {
    if (this.competitionSort === key && !reset) this.competitionDirection = this.competitionDirection === 'desc' ? 'asc' : 'desc';
    else { this.competitionSort = key; this.competitionDirection = key === 'competitionName' ? 'asc' : 'desc'; }
    if (this.competitionMetrics.some(item => item.key === key)) this.competitionMetric = key as CompetitionMetric;
  }
  sortClubs(key: ClubSort, reset = false): void {
    if (this.clubSort === key && !reset) this.clubDirection = this.clubDirection === 'desc' ? 'asc' : 'desc';
    else { this.clubSort = key; this.clubDirection = key === 'teamName' ? 'asc' : 'desc'; }
    if (this.clubMetrics.some(item => item.key === key)) this.clubMetric = key as ClubMetric;
  }
  sortPlayers(key: PlayerSort): void {
    if (this.playerSort === key) this.playerDirection = this.playerDirection === 'desc' ? 'asc' : 'desc';
    else { this.playerSort = key; this.playerDirection = key === 'playerName' || key === 'teamName' || key === 'position' ? 'asc' : 'desc'; }
  }
  competitionArrow(key: CompetitionSort): string { return this.competitionSort === key ? this.competitionDirection === 'asc' ? '▲' : '▼' : '↕'; }
  clubArrow(key: ClubSort): string { return this.clubSort === key ? this.clubDirection === 'asc' ? '▲' : '▼' : '↕'; }
  playerArrow(key: PlayerSort): string { return this.playerSort === key ? this.playerDirection === 'asc' ? '▲' : '▼' : '↕'; }
  private compare(a: string | number, b: string | number): number {
    return typeof a === 'number' && typeof b === 'number' ? a - b : String(a || '').localeCompare(String(b || ''));
  }
  competitionLeadValue(row: CompetitionEconomyRow): string {
    if (this.competitionSort === 'competitionName') return `${row.clubs} clubs`;
    const value = row[this.competitionSort];
    return this.isMoney(this.competitionSort) ? this.money(value as number) : this.number(value as number);
  }
  clubLeadValue(row: ClubEconomyRow): string {
    if (this.clubSort === 'teamName') return `${row.players} players`;
    const value = row[this.clubSort];
    return this.isMoney(this.clubSort) ? this.money(value as number) : this.number(value as number);
  }
  playerLeadValue(row: PlayerWageRow): string {
    if (this.playerSort === 'wage') return this.money(row.wage);
    if (this.playerSort === 'age') return String(row.age);
    return String(row[this.playerSort] || '—');
  }

  get featuredCompetition(): CompetitionEconomyRow | undefined { return this.competitionRows[0]; }
  get featuredClub(): ClubEconomyRow | undefined { return this.clubRows[0]; }
  get featuredPlayer(): PlayerWageRow | undefined { return this.playerRows[0]; }
  isMoney(metric: string): boolean { return metric.toLowerCase().includes('wage'); }
  money(value: number): string { return `€${Number(value || 0).toLocaleString('en-US')}`; }
  number(value: number): string { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }); }
}
