import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, of, Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';

interface CompetitionHistory {
  id: number;
  teamId: number;
  competitionId: number;
  competitionTypeId: number;
  competitionName: string;
  seasonNumber: number;
  games: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  lastPosition: number;
}

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

interface CompetitionFilterOption {
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
}

export interface ClubCompetition {
  competitionId: number;
  name: string;
  typeId: number;
}

interface Trophy {
  name: string;
  count: number;
  lastWon: number;
  level: 'Continental' | 'National' | 'Cup';
  competitionId: number;
  competitionTypeId: number;
}

interface ClubView {
  id: number;
  name: string;
  color1: string | null;
  color2: string | null;
  trophies: Trophy[];
}

interface TeamBranding {
  id: number;
  name: string;
  color1: string | null;
  color2: string | null;
}

interface CurrentManagerSummary {
  found: boolean;
  managerId?: number;
  managerName?: string;
  reputation?: number;
  retired?: boolean;
  humanControlled?: boolean;
}

interface ManagerLoadResult {
  manager: CurrentManagerSummary | null;
  unavailable: boolean;
}

@Component({
  selector: 'app-club-info',
  templateUrl: './club-info.component.html',
  styleUrls: ['./club-info.component.css']
})
export class ClubInfoComponent implements OnInit, OnDestroy {
  private sub = new Subscription();

  teamId!: number;
  club: ClubView | null = null;
  currentManager: CurrentManagerSummary | null = null;
  managerLoading = false;
  managerUnavailable = false;
  loading = true;
  errorMessage = '';
  emptyMessage = '';
  currentSeason = '1';

  domesticLeagues: ClubCompetition[] = [];
  domesticCups: ClubCompetition[] = [];
  europeanCompetitions: ClubCompetition[] = [];
  otherCompetitions: ClubCompetition[] = [];

  stadiumData: any = null;
  stadiumEffectiveCapacity: number | null = null;
  stadiumRevenueMultiplier: number | null = null;

  activeTab: 'overview' | 'squad' | 'tactics' | 'matches' | 'stats' = 'overview';
  competitionBreakdown: CompetitionStatLine[] = [];
  competitionBreakdownLoading = false;
  competitionBreakdownUnavailable = false;
  competitionOptions: CompetitionFilterOption[] = [];
  selectedCompetitionIds = new Set<number>();

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router,
    private gameEvents: GameEventsService,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.sub.add(this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']);
      this.activeTab = 'overview';
      this.setCompetitionBreakdown([]);
      this.loadData();
    }));
    this.sub.add(this.gameEvents.on('stadium').subscribe(() => this.loadStadiumData()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  switchTab(tab: 'overview' | 'squad' | 'tactics' | 'matches' | 'stats'): void {
    this.activeTab = tab;
  }

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

  competitionLink(competition: Pick<ClubCompetition, 'competitionId' | 'typeId'>): any[] {
    return competition.typeId === 4 || competition.typeId === 5
      ? ['/european-rounds', competition.competitionId, this.currentSeason]
      : ['/comp', competition.competitionId];
  }

  competitionStatLink(line: { competitionId: number; competitionTypeId: number }): any[] {
    return this.competitionLink({
      competitionId: line.competitionId,
      typeId: line.competitionTypeId
    });
  }

  get hasActiveMemberships(): boolean {
    return this.domesticLeagues.length + this.domesticCups.length
      + this.europeanCompetitions.length + this.otherCompetitions.length > 0;
  }

  get isControlledClub(): boolean {
    return this.teamId > 0 && this.teamId === Number(this.teamService.teamId);
  }

  goToTransfers(): void {
    this.router.navigate(['/transfers', this.teamId, this.currentSeason]);
  }

  retry(): void {
    this.loadData();
  }

  loadData(): void {
    if (!Number.isFinite(this.teamId) || this.teamId <= 0) {
      this.loading = false;
      this.errorMessage = 'This club link is invalid.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.emptyMessage = '';
    this.club = null;
    this.currentManager = null;
    this.managerLoading = false;
    this.managerUnavailable = false;
    this.competitionBreakdownLoading = false;
    this.competitionBreakdownUnavailable = false;
    this.setMemberships([]);
    this.stadiumData = null;
    this.stadiumEffectiveCapacity = null;
    this.stadiumRevenueMultiplier = null;

    const seasonReq = this.http.get<any>(urlApp + '/competition/getCurrentSeason');
    const teamInfoReq = this.http.get<TeamBranding>(urlApp + `/teams/info/${this.teamId}`);
    const historyReq = this.http.get<CompetitionHistory[]>(urlApp + `/history/teamCompetitionWins/${this.teamId}`);
    const managerReq = this.http.get<CurrentManagerSummary>(urlApp + `/managers/current/team/${this.teamId}`)
      .pipe(
        map(manager => ({ manager, unavailable: false } as ManagerLoadResult)),
        catchError(() => of({ manager: null, unavailable: true } as ManagerLoadResult))
      );
    const membershipsReq = this.teamService.getTeamCompetitions(this.teamId);

    forkJoin({ seasonReq, teamInfoReq, historyReq, managerReq, membershipsReq }).subscribe({
      next: ({ seasonReq: season, teamInfoReq: team, historyReq: history,
        managerReq: manager, membershipsReq: memberships }) => {
        this.currentSeason = String(season);
        if (!team || (!team.id && !team.name)) {
          this.loading = false;
          this.emptyMessage = 'No club data is available for this team.';
          return;
        }
        this.club = {
          id: team?.id ?? this.teamId,
          name: team?.name || 'Unknown Club',
          color1: team?.color1 ?? null,
          color2: team?.color2 ?? null,
          trophies: this.processTrophies(history || [])
        };
        this.applyManagerResult(manager);
        this.setMemberships((memberships || []) as ClubCompetition[]);
        this.loading = false;
        this.loadStadiumData();
        this.loadCompetitionBreakdown();
      },
      error: () => {
        this.loading = false;
        this.managerLoading = false;
        this.emptyMessage = '';
        this.errorMessage = 'Club data could not be loaded. Check the connection and try again.';
      }
    });
  }

  retryManager(): void {
    this.managerLoading = true;
    this.managerUnavailable = false;
    this.http.get<CurrentManagerSummary>(urlApp + `/managers/current/team/${this.teamId}`).subscribe({
      next: manager => {
        this.managerLoading = false;
        this.applyManagerResult({ manager, unavailable: false });
      },
      error: () => {
        this.managerLoading = false;
        this.applyManagerResult({ manager: null, unavailable: true });
      }
    });
  }

  private applyManagerResult(result: ManagerLoadResult): void {
    this.managerUnavailable = result.unavailable;
    this.currentManager = !result.unavailable && result.manager?.found ? result.manager : null;
  }

  private setMemberships(memberships: ClubCompetition[]): void {
    const valid = memberships.filter(item => Number.isFinite(item.competitionId) && item.competitionId > 0);
    this.domesticLeagues = valid.filter(item => item.typeId === 1 || item.typeId === 3);
    this.domesticCups = valid.filter(item => item.typeId === 2 || item.typeId === 6);
    this.europeanCompetitions = valid.filter(item => item.typeId === 4 || item.typeId === 5);
    this.otherCompetitions = valid.filter(item => ![1, 2, 3, 4, 5, 6].includes(item.typeId));
  }

  loadCompetitionBreakdown(): void {
    this.competitionBreakdownLoading = true;
    this.competitionBreakdownUnavailable = false;
    this.http.get<CompetitionStatLine[]>(urlApp + `/stats/team/${this.teamId}/competitionBreakdown`)
      .subscribe({
        next: lines => {
          this.setCompetitionBreakdown(lines || []);
          this.competitionBreakdownLoading = false;
        },
        error: () => {
          this.setCompetitionBreakdown([]);
          this.competitionBreakdownLoading = false;
          this.competitionBreakdownUnavailable = true;
        }
      });
  }

  get filteredCompetitionBreakdown(): CompetitionStatLine[] {
    if (this.selectedCompetitionIds.size === 0) return [];
    return this.competitionBreakdown.filter(line => this.selectedCompetitionIds.has(line.competitionId));
  }

  get allCompetitionsSelected(): boolean {
    return this.competitionOptions.length > 0
      && this.selectedCompetitionIds.size === this.competitionOptions.length;
  }

  isCompetitionSelected(competitionId: number): boolean {
    return this.selectedCompetitionIds.has(competitionId);
  }

  toggleCompetition(competitionId: number): void {
    const nextSelection = new Set(this.selectedCompetitionIds);
    nextSelection.has(competitionId)
      ? nextSelection.delete(competitionId)
      : nextSelection.add(competitionId);
    this.selectedCompetitionIds = nextSelection;
  }

  selectAllCompetitions(): void {
    this.selectedCompetitionIds = new Set(this.competitionOptions.map(option => option.competitionId));
  }

  clearCompetitionSelection(): void {
    this.selectedCompetitionIds = new Set<number>();
  }

  private setCompetitionBreakdown(lines: CompetitionStatLine[]): void {
    this.competitionBreakdown = [...lines].sort((left, right) =>
      right.seasonNumber - left.seasonNumber
      || left.competitionName.localeCompare(right.competitionName));

    const uniqueOptions = new Map<number, CompetitionFilterOption>();
    for (const line of this.competitionBreakdown) {
      if (!uniqueOptions.has(line.competitionId)) {
        uniqueOptions.set(line.competitionId, {
          competitionId: line.competitionId,
          competitionName: line.competitionName,
          competitionTypeId: line.competitionTypeId
        });
      }
    }
    this.competitionOptions = Array.from(uniqueOptions.values()).sort((left, right) =>
      left.competitionName.localeCompare(right.competitionName));
    this.selectAllCompetitions();
  }

  loadStadiumData(): void {
    if (!this.teamId) return;
    this.http.get<any>(urlApp + `/game/facilities/${this.teamId}`).subscribe({
      next: data => {
        this.stadiumData = data?.stadium ?? null;
        this.stadiumEffectiveCapacity = data?.effectiveCapacity ?? null;
        this.stadiumRevenueMultiplier = data?.revenueMultiplier ?? null;
      },
      error: () => {
        this.stadiumData = null;
        this.stadiumEffectiveCapacity = null;
        this.stadiumRevenueMultiplier = null;
      }
    });
  }

  processTrophies(historyList: CompetitionHistory[]): Trophy[] {
    const trophyMap = new Map<number, Trophy>();
    for (const record of historyList) {
      if (record.lastPosition !== 1) continue;
      if (!trophyMap.has(record.competitionId)) {
        const level: Trophy['level'] = [4, 5].includes(record.competitionTypeId)
          ? 'Continental' : [2, 6].includes(record.competitionTypeId) ? 'Cup' : 'National';
        trophyMap.set(record.competitionId, {
          name: record.competitionName,
          count: 0,
          lastWon: 0,
          level,
          competitionId: record.competitionId,
          competitionTypeId: record.competitionTypeId
        });
      }
      const trophy = trophyMap.get(record.competitionId)!;
      trophy.count++;
      trophy.lastWon = Math.max(trophy.lastWon, record.seasonNumber);
    }
    return Array.from(trophyMap.values());
  }
}
