import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { urlApp } from '../app.component';
import { PlayerComponent } from '../player/player.component';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';
import { TeamService } from '../services/team.service';
import { SharedModule } from '../shared/shared.module';

interface AttributeRow {
  name: string;
  value: number;
}

const PLAYER_WORKSPACE_TABS = ['overview', 'analysis', 'recent-form', 'happiness', 'reports', 'training'] as const;
type PlayerWorkspaceTab = typeof PLAYER_WORKSPACE_TABS[number];
type PlayerPrimaryTab = 'overview' | 'stats' | 'contract' | 'history' | 'analytics' | 'trophies';

@Component({
  selector: 'app-player2',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './player2.component.html',
  styleUrls: ['./player2.component.css']
})
export class Player2Component extends PlayerComponent implements OnInit, OnDestroy {
  private readonly classicSubscriptions = new Subscription();
  workspaceTab: PlayerWorkspaceTab = 'overview';
  scoutCard: any = null;
  squadPlayers: any[] = [];
  supplementaryLoading = false;
  careerHistory: any[] = [];
  competitionBreakdown: any[] = [];
  performanceLab: any = null;
  goalkeeperHub: any = null;
  extendedDataLoading = false;
  extendedDataError = '';
  individualTraining: any = null;
  individualTrainingOptions: any = null;
  trainingFocus: string | null = null;
  trainingAttribute: string | null = null;
  trainingRole: string | null = null;
  trainingSaving = false;
  trainingMessage = '';

  constructor(
    private readonly classicHttp: HttpClient,
    private readonly classicRoute: ActivatedRoute,
    private readonly classicRouter: Router,
    private readonly classicTeamService: TeamService,
    classicAuthService: AuthService,
    classicAdminService: AdminService
  ) {
    super(classicHttp, classicRoute, classicRouter, classicTeamService, classicAuthService, classicAdminService);
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.classicSubscriptions.add(this.classicRoute.queryParamMap.subscribe(params => {
      const view = params.get('view') as PlayerWorkspaceTab | null;
      this.workspaceTab = view && PLAYER_WORKSPACE_TABS.includes(view) ? view : 'overview';
    }));
    this.classicSubscriptions.add(this.classicRoute.params.subscribe(params => {
      const playerId = Number(params['playerId']);
      if (!Number.isSafeInteger(playerId) || playerId <= 0) return;
      this.selectedSeason = this.classicTeamService.currentSeason || 1;
      this.maxSeason = this.selectedSeason;
      this.fetchSeasonStats();
      this.loadSupplementary(playerId);
      this.loadExtendedData(playerId);
    }));
  }

  override ngOnDestroy(): void {
    this.classicSubscriptions.unsubscribe();
    super.ngOnDestroy();
  }

  retryClassic(): void {
    this.retry();
    this.fetchSeasonStats();
    this.loadSupplementary(this.playerId);
    this.loadExtendedData(this.playerId);
  }

  selectPrimaryTab(tab: PlayerPrimaryTab): void {
    void this.classicRouter.navigate([], {
      relativeTo: this.classicRoute,
      queryParams: { tab: tab === 'overview' ? null : tab, view: null },
      queryParamsHandling: 'merge'
    });
  }

  setWorkspaceTab(tab: PlayerWorkspaceTab): void {
    void this.classicRouter.navigate([], {
      relativeTo: this.classicRoute,
      queryParams: { tab: null, view: tab === 'overview' ? null : tab },
      queryParamsHandling: 'merge'
    });
  }

  private loadSupplementary(playerId: number): void {
    this.supplementaryLoading = true;
    this.scoutCard = null;
    this.squadPlayers = [];

    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/tactic/playerCard/${playerId}`).subscribe({
      next: card => this.scoutCard = card,
      error: () => this.scoutCard = null
    }));

    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/humans/${playerId}`).subscribe({
      next: player => {
        if (!this.individualTrainingOptions) this.loadTrainingOptions(player?.position || '');
        const teamId = Number(player?.teamId);
        if (!Number.isSafeInteger(teamId) || teamId <= 0) {
          this.supplementaryLoading = false;
          return;
        }
        this.classicSubscriptions.add(this.classicHttp.get<any[]>(`${urlApp}/tactic/getPlayers/${teamId}`).subscribe({
          next: players => {
            this.squadPlayers = players || [];
            this.supplementaryLoading = false;
          },
          error: () => {
            this.squadPlayers = [];
            this.supplementaryLoading = false;
          }
        }));
      },
      error: () => this.supplementaryLoading = false
    }));
  }

  private loadExtendedData(playerId: number): void {
    this.extendedDataLoading = true;
    this.extendedDataError = '';
    this.careerHistory = [];
    this.competitionBreakdown = [];
    this.performanceLab = null;
    this.goalkeeperHub = null;
    this.individualTraining = null;
    this.individualTrainingOptions = null;

    let pending = 5;
    const done = () => {
      pending--;
      if (pending <= 0) this.extendedDataLoading = false;
    };

    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/stats/getStats/${playerId}`).subscribe({
      next: data => {
        const rows = Array.isArray(data) ? data : Object.values(data || {});
        this.careerHistory = rows.sort((a: any, b: any) => Number(b.seasonNumber || 0) - Number(a.seasonNumber || 0));
        done();
      },
      error: () => done()
    }));

    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/stats/player/${playerId}/competitionBreakdown`).subscribe({
      next: data => {
        const rows = data?.byCompetition;
        this.competitionBreakdown = Array.isArray(rows) ? rows : Object.values(rows || {});
        done();
      },
      error: () => done()
    }));

    const season = Number(this.classicTeamService.currentSeason || 1);
    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/stats/player/${playerId}/season/${season}/performance-lab`).subscribe({
      next: data => { this.performanceLab = data; done(); },
      error: () => { this.extendedDataError = 'Some performance-lab data is unavailable.'; done(); }
    }));

    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/stats/player/${playerId}/season/${season}/goalkeeper-hub`).subscribe({
      next: data => { this.goalkeeperHub = data; done(); },
      error: () => done()
    }));

    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/training/individual/${playerId}`).subscribe({
      next: data => {
        this.individualTraining = data;
        this.trainingFocus = data?.individualFocus || null;
        this.trainingAttribute = data?.individualAttribute || null;
        this.trainingRole = data?.individualRole || null;
        this.loadTrainingOptions(this.playerView?.position || '');
        done();
      },
      error: () => done()
    }));
  }

  private loadTrainingOptions(position: string): void {
    if (!position) return;
    this.classicSubscriptions.add(this.classicHttp.get<any>(`${urlApp}/training/individual/options/${encodeURIComponent(position)}`).subscribe({
      next: data => this.individualTrainingOptions = data,
      error: () => this.individualTrainingOptions = null
    }));
  }

  saveIndividualTraining(): void {
    if (!this.isOwnPlayer() || this.trainingSaving) return;
    this.trainingSaving = true;
    this.trainingMessage = '';
    this.classicSubscriptions.add(this.classicHttp.post<any>(`${urlApp}/training/individual/${this.playerId}`, {
      focus: this.trainingFocus || null,
      attribute: this.trainingAttribute || null,
      role: this.trainingRole || null
    }).subscribe({
      next: data => {
        this.individualTraining = data;
        this.trainingSaving = false;
        this.trainingMessage = 'Individual training updated.';
      },
      error: () => {
        this.trainingSaving = false;
        this.trainingMessage = 'Individual training could not be updated.';
      }
    }));
  }

  clearIndividualTraining(): void {
    if (!this.isOwnPlayer() || this.trainingSaving) return;
    this.trainingSaving = true;
    this.classicSubscriptions.add(this.classicHttp.delete<any>(`${urlApp}/training/individual/${this.playerId}`).subscribe({
      next: data => {
        this.individualTraining = data;
        this.trainingFocus = null;
        this.trainingAttribute = null;
        this.trainingRole = null;
        this.trainingSaving = false;
        this.trainingMessage = 'Individual training cleared.';
      },
      error: () => {
        this.trainingSaving = false;
        this.trainingMessage = 'Individual training could not be cleared.';
      }
    }));
  }

  metricWidth(value: unknown): number {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  moraleLabel(): string {
    const morale = Number(this.playerView?.morale || 0);
    if (morale >= 85) return 'Superb';
    if (morale >= 70) return 'Good';
    if (morale >= 50) return 'Okay';
    if (morale >= 30) return 'Low';
    return 'Very low';
  }

  fitnessLabel(): string {
    const fitness = Number(this.playerView?.fitness || 0);
    if (fitness >= 90) return 'Match ready';
    if (fitness >= 75) return 'Available';
    if (fitness >= 55) return 'Needs conditioning';
    return 'High injury risk';
  }

  careerSeasonTotals(row: any): { apps: number; subApps: number; goals: number; assists: number } {
    return (row?.competitionEntries || []).reduce((totals: any, competition: any) => ({
      apps: totals.apps + Number(competition.games || 0),
      subApps: totals.subApps + Number(competition.gamesAsSubstitute || 0),
      goals: totals.goals + Number(competition.goals || 0),
      assists: totals.assists + Number(competition.assists || 0)
    }), { apps: 0, subApps: 0, goals: 0, assists: 0 });
  }

  get profileQueryParams(): Record<string, number> | null {
    return this.actingTeamId > 0 ? { actingTeamId: this.actingTeamId } : null;
  }

  tabQuery(tab: string): Record<string, string | number> {
    return this.actingTeamId > 0 ? { actingTeamId: this.actingTeamId, tab } : { tab };
  }

  get identitySubtitle(): string {
    return [this.positionLabel, this.playerView?.nationName, this.teamLabel].filter(Boolean).join(' · ');
  }

  get attributeGroupsClassic(): { title: string; attrs: AttributeRow[] }[] {
    return this.getAttributeGroups();
  }

  get strongestAttributes(): AttributeRow[] {
    return [...this.allAttributes].sort((a, b) => b.value - a.value).slice(0, 5);
  }

  get developmentAreas(): AttributeRow[] {
    return [...this.allAttributes].sort((a, b) => a.value - b.value).slice(0, 5);
  }

  private get allAttributes(): AttributeRow[] {
    return this.attributeGroupsClassic.reduce((rows, group) => rows.concat(group.attrs), [] as AttributeRow[]);
  }

  get rolesClassic(): any[] {
    return [...(this.roleSuitabilities || [])]
      .sort((a, b) => Number(b.suitability || b.score || 0) - Number(a.suitability || a.score || 0))
      .slice(0, 8);
  }

  roleScore(role: any): number {
    return Math.max(0, Math.min(100, Number(role?.suitability ?? role?.score ?? role?.percentage ?? 0)));
  }

  roleName(role: any): string {
    return role?.roleName || role?.name || role?.role || 'Role';
  }

  get currentAbility(): number {
    return Number(this.playerView?.currentAbility ?? this.scoutCard?.currentAbility ?? this.playerView?.rating ?? 0);
  }

  get potentialAbility(): number {
    return Number(this.playerView?.potentialAbility ?? this.scoutCard?.potentialAbility ?? this.currentAbility);
  }

  abilityWidth(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value > 100 ? value / 2 : value));
  }

  abilityStars(value: number): string {
    const normalized = value > 100 ? value / 20 : value > 20 ? value / 10 : value;
    const filled = Math.max(0, Math.min(5, Math.round(normalized / 2)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }

  get seasonTotals(): any {
    return this.seasonStats?.totals || {
      games: this.playerView?.seasonAppearances || 0,
      subApps: this.playerView?.seasonSubAppearances || 0,
      goals: this.playerView?.seasonGoals || 0,
      assists: this.playerView?.seasonAssists || 0,
      avgRating: this.playerView?.seasonAverageRating || null
    };
  }

  get squadComparison(): any[] {
    const sorted = [...this.squadPlayers].sort((a, b) => this.playerAbility(b) - this.playerAbility(a));
    const playerIndex = sorted.findIndex(row => Number(row.id) === Number(this.playerId));
    if (playerIndex < 0) return sorted.slice(0, 5);
    const start = Math.max(0, Math.min(playerIndex - 2, sorted.length - 5));
    return sorted.slice(start, start + 5);
  }

  playerAbility(player: any): number {
    return Number(player?.currentAbility ?? player?.rating ?? 0);
  }

  money(value: unknown): string {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '—';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1
    }).format(amount);
  }

  attributeWidth(value: number): number {
    return Math.max(5, Math.min(100, Number(value || 0) * 5));
  }

  positionClass(): string {
    const position = String(this.playerView?.position || '').toUpperCase();
    if (position.startsWith('GK')) return 'goalkeeper';
    if (position.startsWith('D')) return 'defender';
    if (position.startsWith('M') || position.startsWith('DM')) return 'midfielder';
    return 'forward';
  }
}
