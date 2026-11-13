import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';
import { TitleRacePoint } from './title-race-chart.component';

type Section = 'overview' | 'standings' | 'stats' | 'analysis' | 'chances';

@Component({
  selector: 'app-competition-view',
  templateUrl: './competition-view.component.html',
  styleUrls: ['./competition-view.component.css']
})
export class CompetitionViewComponent implements OnInit, OnDestroy {
  private subscriptions = new Subscription();
  private requestVersion = 0;
  competitionId = '';
  competitionName = 'Competition';
  competitionType: 'League' | 'Cup' | 'Europe' = 'League';
  section: Section = 'overview';
  currentSeason = '';
  selectedSeason = '';
  seasons: string[] = [];
  loading = true;
  error = '';
  teams: any[] = [];
  qualification: any = null;
  playerStats: any = null;
  teamStats: any = null;
  underlying: any = null;
  /** League or cup chances (design DESIGN_MEDIA_SI_COMPETITII §4); current season only. */
  leagueOdds: any = null;
  cupOdds: any = null;
  raceHistory: TitleRacePoint[] = [];
  raceTeamIds: number[] = [];
  expandedTeamId: number | null = null;
  playerTab = 'topScorers';
  expandedCategory: string | null = 'possession';
  readonly playerTabs = [
    { key: 'topScorers', label: 'Goals', value: 'goals', secondary: 'assists' },
    { key: 'topAssisters', label: 'Assists', value: 'assists', secondary: 'goals' },
    { key: 'topRated', label: 'Rating', value: 'avgRating', secondary: 'matches' },
    { key: 'cleanSheets', label: 'Clean sheets', value: 'cleanSheets', secondary: 'matches' },
    { key: 'disciplinary', label: 'Cards', value: 'yellowCards', secondary: 'redCards' }
  ];
  readonly categories = [
    { key: 'possession', label: 'Possession', group: 'Performance' },
    { key: 'passAccuracy', label: 'Pass accuracy', group: 'Performance' },
    { key: 'shots', label: 'Shots', group: 'Performance' },
    { key: 'shotsOnTarget', label: 'Shots on target', group: 'Performance' },
    { key: 'xg', label: 'Expected goals', group: 'Performance' },
    { key: 'bigChances', label: 'Big chances', group: 'Performance' },
    { key: 'goalsScored', label: 'Goals scored', group: 'Performance' },
    { key: 'goalsConceded', label: 'Best defence', group: 'Performance' },
    { key: 'corners', label: 'Corners', group: 'Performance' },
    { key: 'yellowCards', label: 'Yellow cards', group: 'Discipline' },
    { key: 'redCards', label: 'Red cards', group: 'Discipline' },
    { key: 'fouls', label: 'Fouls', group: 'Discipline' },
    { key: 'offsides', label: 'Offsides', group: 'Discipline' },
    { key: 'tackles', label: 'Tackles', group: 'Defensive work' },
    { key: 'interceptions', label: 'Interceptions', group: 'Defensive work' },
    { key: 'clearances', label: 'Clearances', group: 'Defensive work' },
    { key: 'duelsWon', label: 'Duels won', group: 'Defensive work' },
    { key: 'aerialDuels', label: 'Aerial duels', group: 'Defensive work' },
    { key: 'totalFinances', label: 'Club finances', group: 'Finances', money: true },
    { key: 'transferBudget', label: 'Transfer budget', group: 'Finances', money: true },
    { key: 'monthlyWages', label: 'Monthly wages', group: 'Finances', money: true },
    { key: 'annualWages', label: 'Annual wages', group: 'Finances', money: true },
    { key: 'transferSpent', label: 'Transfer spending', group: 'Finances', money: true },
    { key: 'transferEarned', label: 'Transfer income', group: 'Finances', money: true },
    { key: 'transferProfit', label: 'Transfer profit', group: 'Finances', money: true }
  ];

  constructor(private http: HttpClient, private route: ActivatedRoute,
              private router: Router, private events: GameEventsService) {}

  ngOnInit(): void {
    this.subscriptions.add(combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, query]) => {
      const id = params.get('competitionId') || '';
      const requestedSection = params.get('section') || 'overview';
      this.section = this.isSection(requestedSection) ? requestedSection : 'overview';
      if (id !== this.competitionId || !this.currentSeason) {
        this.competitionId = id;
        this.loadCompetition(query.get('season'));
      } else {
        this.selectedSeason = this.resolveSeason(query.get('season'));
        this.loadSection();
      }
    }));
    this.subscriptions.add(this.events.on('standings').subscribe(() => {
      if (this.selectedSeason && this.selectedSeason === this.currentSeason) this.loadSection();
    }));
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  private isSection(value: string): value is Section {
    return value === 'overview' || value === 'standings' || value === 'stats' || value === 'analysis'
      || value === 'chances';
  }

  private resolveSeason(requested: string | null): string {
    const candidate = Number(requested);
    return requested && Number.isInteger(candidate) && candidate >= 1 && candidate <= Number(this.currentSeason)
      ? String(candidate) : this.currentSeason;
  }

  private loadCompetition(requestedSeason: string | null): void {
    this.loading = true;
    this.error = '';
    const version = ++this.requestVersion;
    this.http.get<number>(`${urlApp}/competition/getCurrentSeason`).subscribe({
      next: season => {
        if (version !== this.requestVersion) return;
        this.currentSeason = String(season);
        this.seasons = Array.from({ length: Number(season) }, (_, index) => String(index + 1));
        this.selectedSeason = this.resolveSeason(requestedSeason);
        this.http.get<any>(`${urlApp}/competition/getCompetitionInfo/${this.competitionId}`).subscribe({
          next: info => {
            if (version !== this.requestVersion) return;
            this.competitionName = info.name || 'Competition';
            this.competitionType = info.typeId === 4 || info.typeId === 5 ? 'Europe'
              : info.typeId === 2 || info.typeId === 6 ? 'Cup' : 'League';
            this.loadSection();
          },
          error: () => this.showError(version, 'Competition details could not be loaded.')
        });
      },
      error: () => this.showError(version, 'Season information could not be loaded.')
    });
  }

  onSeasonChange(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { season: this.selectedSeason }, queryParamsHandling: 'merge' });
  }

  private loadSection(): void {
    if (!this.competitionId || !this.selectedSeason) return;
    const version = ++this.requestVersion;
    this.loading = true;
    this.error = '';
    this.teams = [];
    this.qualification = null;
    this.playerStats = null;
    this.teamStats = null;
    this.underlying = null;
    this.leagueOdds = null;
    this.cupOdds = null;
    this.raceHistory = [];
    this.raceTeamIds = [];
    if (this.section === 'chances') { this.loadChances(version); return; }
    if (this.section === 'overview' || this.section === 'standings') {
      if (this.competitionType !== 'League') { this.loading = false; return; }
      const url = this.selectedSeason === this.currentSeason
        ? `${urlApp}/competition/getTeams/${this.competitionId}`
        : `${urlApp}/competition/historical/getTeams/${this.selectedSeason}/${this.competitionId}`;
      this.http.get<any[]>(url).subscribe({
        next: rows => {
          if (version !== this.requestVersion) return;
          this.teams = [...rows].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
            .map((team, index) => ({ ...team, position: index + 1 }));
          this.loading = false;
        },
        error: () => this.showError(version, 'The league table could not be loaded.')
      });
      if (this.section === 'standings') {
        this.http.get<any>(`${urlApp}/competition/leagueQualification/${this.competitionId}/${this.selectedSeason}`)
          .subscribe({ next: value => { if (version === this.requestVersion) this.qualification = value; } });
      }
      return;
    }
    if (this.section === 'stats') {
      this.http.get<any>(`${urlApp}/stats/competition/${this.competitionId}/${this.selectedSeason}`).subscribe({
        next: value => { if (version === this.requestVersion) { this.playerStats = value; this.loading = false; } },
        error: () => this.showError(version, 'Player statistics could not be loaded.')
      });
      if (this.competitionType === 'League') {
        this.http.get<any>(`${urlApp}/stats/championshipStats/${this.competitionId}/${this.selectedSeason}`)
          .subscribe({ next: value => { if (version === this.requestVersion) this.teamStats = value; } });
      }
      return;
    }
    this.http.get<any>(`${urlApp}/stats/competition/${this.competitionId}/${this.selectedSeason}/underlying-performance`)
      .subscribe({
        next: value => { if (version === this.requestVersion) { this.underlying = value; this.loading = false; } },
        error: () => this.showError(version, 'Underlying performance is unavailable.')
      });
  }

  /** Chances exist for this season only: they come from the table and the matches still to play. */
  private loadChances(version: number): void {
    if (this.selectedSeason !== this.currentSeason || this.competitionType === 'Europe') { this.loading = false; return; }
    if (this.competitionType === 'Cup') {
      this.http.get<any>(`${urlApp}/odds/cup/${this.competitionId}`).subscribe({
        next: value => { if (version === this.requestVersion) { this.cupOdds = value; this.loading = false; } },
        error: () => this.showError(version, 'Cup chances are unavailable.')
      });
      return;
    }
    this.http.get<any>(`${urlApp}/odds/league/${this.competitionId}`).subscribe({
      next: value => {
        if (version !== this.requestVersion) return;
        this.leagueOdds = value;
        // The race follows the five teams with the best title chance now; each keeps its colour.
        this.raceTeamIds = [...(value.rows || [])]
          .sort((a: any, b: any) => b.title - a.title || a.position - b.position)
          .slice(0, 5).map((row: any) => row.teamId);
        this.loading = false;
      },
      error: () => this.showError(version, 'League chances are unavailable.')
    });
    this.http.get<TitleRacePoint[]>(`${urlApp}/odds/league/${this.competitionId}/history`)
      .subscribe({ next: value => { if (version === this.requestVersion) this.raceHistory = value || []; } });
  }

  /** A chance as a percentage: "<1%" for a sliver, "—" for none. */
  chance(value: number): string {
    if (!value) return '—';
    if (value < 0.005) return '<1%';
    if (value > 0.995 && value < 1) return '>99%';
    return `${Math.round(value * 100)}%`;
  }

  /** Decimal odds with no bookmaker margin (1 / chance); empty when the chance is nil. */
  oddsFor(value: number | null): string {
    return value ? value.toFixed(2) : '';
  }

  private showError(version: number, message: string): void {
    if (version !== this.requestVersion) return;
    this.error = message;
    this.loading = false;
  }

  retry(): void { this.loadSection(); }
  qualificationFor(team: any): string | null {
    const exact = this.qualification?.qualifications?.find((item: any) => Number(item.teamId) === Number(team.teamId));
    if (exact) return exact.route;
    if (this.qualification) return null;
    if (team.position <= Number(this.qualification?.locSpots || 0)) return 'LOC';
    return null;
  }
  isRelegated(team: any): boolean {
    return !!this.qualification?.hasLowerTier && this.qualification.relegationFrom != null
      && team.position >= this.qualification.relegationFrom;
  }
  form(team: any): string[] { return (team.form || '').split('').slice(-5); }
  get activePlayerTab(): any { return this.playerTabs.find(tab => tab.key === this.playerTab); }
  get activePlayerRows(): any[] { return this.playerStats?.[this.playerTab] || []; }
  topCategory(key: string): any[] { return (this.teamStats?.categories?.[key] || []).slice(0, 5); }
  formatValue(value: number, money?: boolean): string {
    if (!money) return String(value ?? '—');
    const abs = Math.abs(value || 0);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}€${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
    return `${sign}€${abs}`;
  }
  signed(value: number): string { return `${value > 0 ? '+' : ''}${Number(value || 0).toFixed(2)}`; }
}
