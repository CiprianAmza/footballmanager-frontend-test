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
  teamId: number;
  teamName: string;
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
  entryStage?: string;
  currentStage?: string;
  stageReached?: string;
  status?: string;
  statusLabel?: string;
  eliminatedByTeamId?: number | null;
  eliminatedByTeamName?: string | null;
}

interface CompetitionFilterOption {
  competitionId: number;
  competitionName: string;
}

interface CompetitionCareerTotal {
  competitionId: number;
  competitionTypeId: number;
  competitionName: string;
  seasons: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  bestResult: string;
  bestSeason: number | null;
}

interface ManagerTrophySummary {
  name: string;
  count: number;
  seasons: number[];
  lastWonSeason: number | null;
}

interface ManagerClubSummary {
  teamId: number;
  teamName: string;
  current: boolean;
  firstSeason: number;
  lastSeason: number;
  seasons: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  trophies: number;
  trophyNames: string[];
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
  trophies?: ManagerTrophySummary[];
  clubs?: ManagerClubSummary[];
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
  filteredCompetitionBreakdown: CompetitionStatLine[] = [];
  competitionOptions: CompetitionFilterOption[] = [];
  competitionCareerTotals: CompetitionCareerTotal[] = [];
  selectedCompetitionId: number | null = null;
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
            this.setCompetitionBreakdown(data.competitionBreakdown);
          } else if (data.currentTeamId && data.currentTeamId > 0) {
            this.fetchCompetitionBreakdown(data.currentTeamId);
          } else {
            this.setCompetitionBreakdown([]);
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
        next: (lines) => { this.setCompetitionBreakdown(lines || []); },
        error: () => { this.setCompetitionBreakdown([]); }
      });
  }

  selectCompetition(competitionId: number | null): void {
    this.selectedCompetitionId = competitionId;
    this.applyCompetitionFilter();
  }

  get visibleCompetitionTotals(): CompetitionCareerTotal[] {
    if (this.selectedCompetitionId == null) return this.competitionCareerTotals;
    return this.competitionCareerTotals.filter(total => total.competitionId === this.selectedCompetitionId);
  }

  private setCompetitionBreakdown(lines: CompetitionStatLine[]): void {
    // Older profile responses could contain the completed season twice: once
    // from ManagerHistory and once from the synthetic live snapshot. Keep one
    // canonical row per team/competition/season.
    const unique = new Map<string, CompetitionStatLine>();
    for (const line of lines || []) {
      const key = `${line.teamId}|${line.competitionId}|${line.seasonNumber}`;
      if (!unique.has(key)) unique.set(key, line);
    }

    this.competitionBreakdown = Array.from(unique.values()).sort((left, right) =>
      right.seasonNumber - left.seasonNumber || left.competitionName.localeCompare(right.competitionName));
    this.competitionOptions = Array.from(new Map(
      this.competitionBreakdown.map(line => [line.competitionId, {
        competitionId: line.competitionId,
        competitionName: line.competitionName
      }])
    ).values()).sort((left, right) => left.competitionName.localeCompare(right.competitionName));

    if (this.selectedCompetitionId != null
        && !this.competitionOptions.some(option => option.competitionId === this.selectedCompetitionId)) {
      this.selectedCompetitionId = null;
    }
    this.competitionCareerTotals = this.buildCompetitionCareerTotals(this.competitionBreakdown);
    this.applyCompetitionFilter();
  }

  private applyCompetitionFilter(): void {
    this.filteredCompetitionBreakdown = this.selectedCompetitionId == null
      ? [...this.competitionBreakdown]
      : this.competitionBreakdown.filter(line => line.competitionId === this.selectedCompetitionId);
  }

  private buildCompetitionCareerTotals(lines: CompetitionStatLine[]): CompetitionCareerTotal[] {
    const grouped = new Map<number, CompetitionStatLine[]>();
    for (const line of lines) {
      const competitionLines = grouped.get(line.competitionId) || [];
      competitionLines.push(line);
      grouped.set(line.competitionId, competitionLines);
    }

    return Array.from(grouped.values()).map(competitionLines => {
      const first = competitionLines[0];
      const best = this.bestCompetitionResult(competitionLines);
      return {
        competitionId: first.competitionId,
        competitionTypeId: first.competitionTypeId,
        competitionName: first.competitionName,
        seasons: new Set(competitionLines.map(line => line.seasonNumber)).size,
        matches: competitionLines.reduce((total, line) => total + line.matches, 0),
        wins: competitionLines.reduce((total, line) => total + line.wins, 0),
        draws: competitionLines.reduce((total, line) => total + line.draws, 0),
        losses: competitionLines.reduce((total, line) => total + line.losses, 0),
        goalsFor: competitionLines.reduce((total, line) => total + line.goalsFor, 0),
        goalsAgainst: competitionLines.reduce((total, line) => total + line.goalsAgainst, 0),
        bestResult: best.label,
        bestSeason: best.season
      };
    }).sort((left, right) => left.competitionName.localeCompare(right.competitionName));
  }

  private bestCompetitionResult(lines: CompetitionStatLine[]): { label: string; season: number | null } {
    const isLeague = lines[0]?.competitionTypeId === 1 || lines[0]?.competitionTypeId === 3;
    if (isLeague) {
      const positions = lines.filter(line => line.leaguePosition != null && line.leaguePosition > 0)
        .sort((left, right) => (left.leaguePosition as number) - (right.leaguePosition as number)
          || right.seasonNumber - left.seasonNumber);
      if (positions.length === 0) return { label: '-', season: null };
      const best = positions[0];
      return {
        label: best.leaguePosition === 1 ? 'Champion' : `Position ${best.leaguePosition}`,
        season: best.seasonNumber
      };
    }

    const ranked = [...lines].sort((left, right) => this.resultRank(right) - this.resultRank(left)
      || right.seasonNumber - left.seasonNumber);
    if (ranked.length === 0) return { label: '-', season: null };
    const best = ranked[0];
    let label = best.status === 'WINNER' ? 'Winner'
      : best.status === 'RUNNER_UP' ? 'Runner-up'
      : best.stageReached || best.currentStage || best.statusLabel || '-';
    if (label.toLowerCase().startsWith('eliminated in ')) {
      label = label.substring('eliminated in '.length).split(' by ')[0];
    }
    return { label, season: best.seasonNumber };
  }

  private resultRank(line: CompetitionStatLine): number {
    if (line.status === 'WINNER') return 10000;
    if (line.status === 'RUNNER_UP') return 9000;
    const stage = `${line.stageReached || ''} ${line.currentStage || ''} ${line.statusLabel || ''}`.toLowerCase();
    if (stage.includes('final') && !stage.includes('semi')) return 8500;
    if (stage.includes('semi-final') || stage.includes('semi final')) return 8000;
    if (stage.includes('quarter-final') || stage.includes('quarter final')) return 7000;
    if (stage.includes('round of 16')) return 6000;
    if (stage.includes('knockout playoff')) return 5500;
    if (stage.includes('group stage') || stage.includes('matchday')) return 5000;
    if (stage.includes('round of 32')) return 4500;
    const qualifyingRound = stage.match(/qualifying round\s*(\d+)/);
    if (qualifyingRound) return 3000 + Number(qualifyingRound[1]);
    if (stage.includes('qualifying')) return 3000;
    if (stage.includes('preliminary')) return 2000;
    return 1000;
  }

  /** Human-readable label for a competition type id. */
  competitionTypeLabel(typeId: number): string {
    switch (typeId) {
      case 1: return 'League';
      case 2: return 'Cup';
      case 3: return 'Second League';
      case 4: return 'League of Champions';
      case 5: return 'Stars Cup';
      case 6: return 'Super Cup';
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
