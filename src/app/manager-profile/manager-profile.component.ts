import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { CareerService } from '../services/career.service';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

interface ManagerHistoryEntry {
  id: number;
  managerId: number;
  managerName: string;
  teamId: number;
  teamName: string;
  seasonNumber: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leaguePosition: number;
  trophiesWon: string;
  promoted: boolean;
  relegated: boolean;
  // True for the synthetic "current season" row computed live from TeamCompetitionDetail.
  // Persisted ManagerHistory rows leave it undefined / false.
  inProgress?: boolean;
}

// One row of the current-season per-competition breakdown.
// leaguePosition is non-null ONLY on league lines (competitionTypeId 1 or 3).
interface CompetitionStatLine {
  competitionId: number;
  competitionTypeId: number;
  competitionName: string;
  seasonNumber: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leaguePosition: number | null;
}

interface ManagerProfile {
  managerId: number;
  managerName: string;
  reputation: number;
  retired: boolean;
  currentTeamId: number;
  currentTeamName: string;
  totalGames: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  winPercentage: number;
  totalTrophies: number;
  teamsManaged: number;
  seasonsManaged: number;
  history: ManagerHistoryEntry[];
  // New financial fields (longs from the backend).
  monthlySalary?: number;
  careerEarnings?: number;
  // Per-competition breakdown of the in-progress season (may also be fetched separately).
  competitionBreakdown?: CompetitionStatLine[];
}

@Component({
  selector: 'app-manager-profile',
  templateUrl: './manager-profile.component.html',
  styleUrls: ['./manager-profile.component.css']
})
export class ManagerProfileComponent implements OnInit, OnDestroy {

  private sub = new Subscription();

  profile: ManagerProfile | null = null;
  // Current-season per-competition breakdown (one row per competition the team plays in).
  competitionBreakdown: CompetitionStatLine[] = [];
  loading: boolean = true;
  managerId: number = 0;
  // True when the profile being viewed belongs to the logged-in user — unlocks the Resign button.
  isOwnManager: boolean = false;
  resigning: boolean = false;
  resignMessage: string = '';
  showResignConfirm: boolean = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public careerService: CareerService,
    public teamService: TeamService,
    private gameEvents: GameEventsService
  ) {}

  ngOnInit(): void {
    this.managerId = Number(this.route.snapshot.paramMap.get('managerId'));
    this.fetchProfile();
    this.careerService.me().subscribe({
      next: (me) => {
        this.isOwnManager = me && Number(me.managerId) === this.managerId;
      },
      error: () => { this.isOwnManager = false; }
    });
    // Reputation / record / trophies / current job change on game advance —
    // reflects overall game state, so use the catch-all channel (no single domain).
    this.sub.add(this.gameEvents.gameAdvanced$.subscribe(() => this.fetchProfile()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  confirmResign(): void { this.showResignConfirm = true; }
  cancelResign(): void { this.showResignConfirm = false; }

  doResign(): void {
    if (this.resigning) return;
    this.resigning = true;
    this.resignMessage = '';
    this.careerService.resign().subscribe({
      next: (res) => {
        this.resigning = false;
        this.showResignConfirm = false;
        if (res && res.success) {
          this.resignMessage = 'You have resigned. Redirecting to the job search...';
          this.teamService.setManagerFired(true);
          setTimeout(() => this.router.navigate(['/job-search']), 1200);
        } else {
          this.resignMessage = (res && res.message) || 'Could not resign.';
        }
      },
      error: () => {
        this.resigning = false;
        this.resignMessage = 'Failed to submit resignation.';
      }
    });
  }

  fetchProfile(): void {
    this.loading = true;
    this.http.get<ManagerProfile>(`${urlApp}/managers/profile/${this.managerId}`)
      .subscribe({
        next: (data) => {
          this.profile = data;
          if (this.profile.history) {
            this.profile.history.sort((a, b) => a.seasonNumber - b.seasonNumber);
          }
          // Prefer the breakdown embedded on the snapshot; fall back to the
          // dedicated endpoint when the manager currently has a team.
          if (data.competitionBreakdown && data.competitionBreakdown.length > 0) {
            this.competitionBreakdown = data.competitionBreakdown;
          } else if (data.currentTeamId && data.currentTeamId > 0) {
            this.fetchCompetitionBreakdown(data.currentTeamId);
          } else {
            this.competitionBreakdown = [];
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading manager profile:', err);
          this.loading = false;
        }
      });
  }

  /** Pull the current-season per-competition breakdown for a team. */
  fetchCompetitionBreakdown(teamId: number): void {
    this.http.get<CompetitionStatLine[]>(`${urlApp}/stats/team/${teamId}/competitionBreakdown`)
      .subscribe({
        next: (lines) => { this.competitionBreakdown = lines || []; },
        error: () => { this.competitionBreakdown = []; }
      });
  }

  /** Human-readable label for a competition type id. */
  competitionTypeLabel(typeId: number): string {
    switch (typeId) {
      case 1: return 'League';
      case 2: return 'Cup';
      case 3: return 'Second League';
      case 4: return 'League of Champions';
      case 5: return 'Stars Cup';
      default: return 'Competition';
    }
  }

  /** Format a raw money amount into "12.5M", "850K" etc. */
  formatMoney(v: number | null | undefined): string {
    if (v == null) return '€0';
    const n = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (n >= 1_000_000_000) return `${sign}€${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000)     return `${sign}€${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)         return `${sign}€${(n / 1_000).toFixed(0)}K`;
    return `${sign}€${n}`;
  }

  getTrophiesList(trophiesWon: string): string[] {
    if (!trophiesWon || trophiesWon.trim() === '') return [];
    return trophiesWon.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  getReputationClass(reputation: number): string {
    if (reputation >= 150) return 'rep-elite';
    if (reputation >= 100) return 'rep-high';
    if (reputation >= 50) return 'rep-medium';
    return 'rep-low';
  }
}
