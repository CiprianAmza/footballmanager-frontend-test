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

@Component({
  selector: 'app-player2',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './player2.component.html',
  styleUrls: ['./player2.component.css']
})
export class Player2Component extends PlayerComponent implements OnInit, OnDestroy {
  private readonly classicSubscriptions = new Subscription();
  scoutCard: any = null;
  squadPlayers: any[] = [];
  supplementaryLoading = false;

  constructor(
    private readonly classicHttp: HttpClient,
    private readonly classicRoute: ActivatedRoute,
    classicRouter: Router,
    private readonly classicTeamService: TeamService,
    classicAuthService: AuthService,
    classicAdminService: AdminService
  ) {
    super(classicHttp, classicRoute, classicRouter, classicTeamService, classicAuthService, classicAdminService);
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.classicSubscriptions.add(this.classicRoute.params.subscribe(params => {
      const playerId = Number(params['playerId']);
      if (!Number.isSafeInteger(playerId) || playerId <= 0) return;
      this.selectedSeason = this.classicTeamService.currentSeason || 1;
      this.maxSeason = this.selectedSeason;
      this.fetchSeasonStats();
      this.loadSupplementary(playerId);
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
