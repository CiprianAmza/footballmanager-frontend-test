import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';
import { SquadComponent } from '../squad/squad.component';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';
import { SharedModule } from '../shared/shared.module';

type SquadFilter = 'ALL' | 'AVAILABLE' | 'UNAVAILABLE' | 'FIRST_TEAM' | 'YOUTH' | 'INTERNATIONAL' | 'LEAVE';

@Component({
  selector: 'app-squad4',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './squad4.component.html',
  styleUrls: ['./squad4.component.css']
})
export class Squad4Component extends SquadComponent {
  search = '';
  positionFilter = 'ALL';
  squadFilter: SquadFilter = 'ALL';
  positionBand = 'ALL';
  compact = true;
  registerView: 'PLAYERS' | 'LOANS' = 'PLAYERS';
  activeLoans: { loansIn: any[]; loansOut: any[] } = { loansIn: [], loansOut: [] };
  currentSelection: any = null;
  matchPreview: any = null;

  constructor(private registerHttp: HttpClient, private currentRoute: ActivatedRoute, public currentTeam: TeamService, events: GameEventsService) {
    super(registerHttp, currentRoute, currentTeam, events);
  }

  override ngOnInit(): void {
    this.teamId = Number(this.currentRoute.snapshot.paramMap.get('teamId')) || this.currentTeam.teamId;
    super.ngOnInit();
  }

  override loadPlayers(): void {
    super.loadPlayers();
    if (!this.teamId) return;
    this.registerHttp.get<any>(urlApp + `/loans/active/${this.teamId}`).subscribe({
      next: value => this.activeLoans = { loansIn: value?.loansIn || [], loansOut: value?.loansOut || [] },
      error: () => this.activeLoans = { loansIn: [], loansOut: [] }
    });
    this.registerHttp.get<any>(urlApp + `/tactic/getFormation/${this.teamId}`).subscribe({
      next: value => this.currentSelection = value,
      error: () => this.currentSelection = null
    });
    this.registerHttp.get<any>(urlApp + `/match/preview/${this.teamId}`).subscribe({
      next: value => this.matchPreview = value,
      error: () => this.matchPreview = null
    });
  }

  get positions(): string[] {
    return [...new Set(this.players.map(player => String(player.position || '—')))].sort();
  }

  get visiblePlayers(): any[] {
    const query = this.search.trim().toLowerCase();
    return this.players.filter(player => {
      if (query && !`${player.name} ${player.position} ${player.nationName || ''}`.toLowerCase().includes(query)) return false;
      if (this.positionFilter !== 'ALL' && player.position !== this.positionFilter) return false;
      if (this.positionBand !== 'ALL' && !this.inPositionBand(player.position, this.positionBand)) return false;
      if (this.squadFilter === 'AVAILABLE' && this.isUnavailable(player.id)) return false;
      if (this.squadFilter === 'UNAVAILABLE' && !this.isUnavailable(player.id)) return false;
      if (this.squadFilter === 'FIRST_TEAM' && !['Star Player', 'Important Player', 'Regular Starter', 'First Team'].includes(player.agreedPlayingTime)) return false;
      if (this.squadFilter === 'YOUTH' && Number(player.age) > 21) return false;
      if (this.squadFilter === 'INTERNATIONAL' && !String(player.currentStatus || '').toLowerCase().includes('international')) return false;
      if (this.squadFilter === 'LEAVE' && !String(player.currentStatus || '').toLowerCase().includes('leave')) return false;
      return true;
    });
  }

  setSquadFilter(filter: SquadFilter): void { this.squadFilter = filter; }
  resetFilters(): void { this.search = ''; this.positionFilter = 'ALL'; this.positionBand = 'ALL'; this.squadFilter = 'ALL'; }
  condition(player: any): number { return Number(player.condition ?? player.fitness ?? 0); }
  morale(player: any): number { return Number(player.morale ?? 0); }
  ability(player: any): number { return Number(player.currentAbility || player.CA || player.rating || 0); }
  potential(player: any): number { return Number(player.potentialAbility || player.PA || player.rating || 0); }
  ratingWidth(value: number): number { return Math.max(3, Math.min(100, (Number(value) || 0) / 2)); }
  money(value: number): string { return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) + ' EUR'; }

  get unavailableCount(): number { return new Set(this.availability.map(reason => Number(reason.playerId))).size; }
  get availableCount(): number { return Math.max(0, this.players.length - this.unavailableCount); }

  setPositionBand(band: string): void { this.positionBand = this.positionBand === band ? 'ALL' : band; this.positionFilter = 'ALL'; }

  selectionStatus(playerId: number): string {
    const row = (this.currentSelection?.formationDataList || []).find((entry: any) => Number(entry.playerId) === Number(playerId));
    if (!row) return 'OUT';
    return Number(row.positionIndex) < 30 ? 'XI' : `S${Number(row.positionIndex) - 29}`;
  }

  get nextOpponentName(): string {
    if (!this.matchPreview) return '';
    return Number(this.matchPreview.homeTeamId) === Number(this.teamId)
      ? this.matchPreview.awayTeamName : this.matchPreview.homeTeamName;
  }

  private inPositionBand(position: string, band: string): boolean {
    const value = String(position || '').toUpperCase();
    if (band === 'GK') return value.startsWith('GK');
    if (band === 'DEF') return value.startsWith('D') || value.startsWith('WB');
    if (band === 'MID') return value.startsWith('M') || value.startsWith('DM');
    if (band === 'ATT') return value.startsWith('A') || value.startsWith('S');
    return true;
  }
}
