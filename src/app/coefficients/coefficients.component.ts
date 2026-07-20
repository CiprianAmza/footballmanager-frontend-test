import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface CountryCoefficient {
  leagueId: number;
  leagueName: string;
  coefficient: number;
  rank: number;
  locSpots: number;
  locEntry: string;
  starsCupSpots: number;
  perSeason: { [key: number]: number };
}

interface ClubCoefficient {
  teamId: number;
  teamName: string;
  leagueName: string;
  coefficient: number;
  rank: number;
  perSeason: { [key: number]: number };
}

interface LeagueStrengthTier {
  maximumRank: number;
  multiplier: number;
}

interface TeamStrength {
  teamId: number;
  teamName: string;
  topElevenRating: number;
  ratedPlayerCount: number;
}

interface LeagueStrengthEntry {
  rank: number;
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
  averageTopElevenRating: number;
  multiplier: number;
  teamCount: number;
  completeTeamCount: number;
  teams: TeamStrength[];
}

interface LeagueStrengthTable {
  season: number;
  topPlayersPerTeam: number;
  defaultMultiplier: number;
  tiers: LeagueStrengthTier[];
  ranking: LeagueStrengthEntry[];
}

type CoefficientsTab = 'country' | 'club' | 'rankings';

@Component({
  selector: 'app-coefficients',
  templateUrl: './coefficients.component.html',
  styleUrls: ['./coefficients.component.css']
})
export class CoefficientsComponent implements OnInit, OnDestroy {

  activeTab: CoefficientsTab = 'country';

  countries: CountryCoefficient[] = [];
  clubs: ClubCoefficient[] = [];

  seasonKeys: number[] = [];

  // Dynamic summary from backend
  locSummary: any = {};
  scSummary: any = {};
  locPoints: { [key: string]: string } = {};
  scPoints: { [key: string]: string } = {};

  leagueStrength: LeagueStrengthTable | null = null;
  rankingsLoading = false;
  rankingsError = '';
  expandedLeagueId: number | null = null;
  private seasonSubscription?: Subscription;
  private rankingRequestId = 0;

  constructor(
    private http: HttpClient,
    private teamService: TeamService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'club' || requestedTab === 'rankings') {
      this.activeTab = requestedTab;
    }

    this.loadCountryCoefficients();
    this.loadClubCoefficients();
    this.loadEuropeanSummary();

    this.seasonSubscription = this.teamService.currentSeason$.subscribe(season => {
      if (this.activeTab === 'rankings' && this.leagueStrength?.season !== season) {
        this.loadLeagueRankings(season);
      }
    });
  }

  ngOnDestroy(): void {
    this.seasonSubscription?.unsubscribe();
  }

  setActiveTab(tab: CoefficientsTab): void {
    this.activeTab = tab;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'country' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });

    if (tab === 'rankings' && this.leagueStrength?.season !== this.teamService.currentSeason) {
      this.loadLeagueRankings();
    }
  }

  loadCountryCoefficients(): void {
    this.http.get<CountryCoefficient[]>(urlApp + '/competition/getCountryCoefficients').subscribe(
      (data) => {
        this.countries = data;
        if (data.length > 0 && data[0].perSeason) {
          this.seasonKeys = Object.keys(data[0].perSeason).map(Number).sort((a, b) => a - b);
        }
      },
      (error) => console.error('Error loading country coefficients:', error)
    );
  }

  loadClubCoefficients(): void {
    this.http.get<ClubCoefficient[]>(urlApp + '/competition/getClubCoefficients').subscribe(
      (data) => { this.clubs = data; },
      (error) => console.error('Error loading club coefficients:', error)
    );
  }

  loadEuropeanSummary(): void {
    this.http.get<any>(urlApp + '/competition/getEuropeanSummary').subscribe(
      (data) => {
        this.locSummary = data.loc || {};
        this.scSummary = data.starsCup || {};
        this.locPoints = data.locPoints || {};
        this.scPoints = data.starsCupPoints || {};
      },
      (error) => console.error('Error loading European summary:', error)
    );
  }

  loadLeagueRankings(season = this.teamService.currentSeason || 1): void {
    const requestId = ++this.rankingRequestId;
    this.rankingsLoading = true;
    this.rankingsError = '';

    this.http.get<LeagueStrengthTable>(`${urlApp}/stats/league-strength/${season}`).subscribe({
      next: data => {
        if (requestId !== this.rankingRequestId) return;
        this.leagueStrength = data;
        this.rankingsLoading = false;
      },
      error: error => {
        if (requestId !== this.rankingRequestId) return;
        console.error('Error loading league strength rankings:', error);
        this.rankingsError = 'League rankings could not be loaded.';
        this.rankingsLoading = false;
      }
    });
  }

  toggleLeagueDetails(competitionId: number): void {
    this.expandedLeagueId = this.expandedLeagueId === competitionId ? null : competitionId;
  }

  getPointsEntries(points: { [key: string]: string }): { key: string; value: string }[] {
    return Object.entries(points).map(([key, value]) => ({ key, value }));
  }

  getSeasonValue(perSeason: { [key: number]: number }, season: number): string {
    const val = perSeason?.[season];
    if (val === undefined || val === 0) return '-';
    return val.toFixed(1);
  }
}
