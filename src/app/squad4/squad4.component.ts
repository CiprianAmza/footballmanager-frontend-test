import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SquadComponent } from '../squad/squad.component';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';
import { SharedModule } from '../shared/shared.module';

type SquadFilter = 'ALL' | 'AVAILABLE' | 'UNAVAILABLE' | 'FIRST_TEAM' | 'YOUTH';

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
  compact = true;

  constructor(http: HttpClient, private currentRoute: ActivatedRoute, public currentTeam: TeamService, events: GameEventsService) {
    super(http, currentRoute, currentTeam, events);
  }

  override ngOnInit(): void {
    this.teamId = Number(this.currentRoute.snapshot.paramMap.get('teamId')) || this.currentTeam.teamId;
    super.ngOnInit();
  }

  get positions(): string[] {
    return [...new Set(this.players.map(player => String(player.position || '—')))].sort();
  }

  get visiblePlayers(): any[] {
    const query = this.search.trim().toLowerCase();
    return this.players.filter(player => {
      if (query && !`${player.name} ${player.position} ${player.nationName || ''}`.toLowerCase().includes(query)) return false;
      if (this.positionFilter !== 'ALL' && player.position !== this.positionFilter) return false;
      if (this.squadFilter === 'AVAILABLE' && this.isUnavailable(player.id)) return false;
      if (this.squadFilter === 'UNAVAILABLE' && !this.isUnavailable(player.id)) return false;
      if (this.squadFilter === 'FIRST_TEAM' && !['Star Player', 'Important Player', 'Regular Starter', 'First Team'].includes(player.agreedPlayingTime)) return false;
      if (this.squadFilter === 'YOUTH' && Number(player.age) > 21) return false;
      return true;
    });
  }

  setSquadFilter(filter: SquadFilter): void { this.squadFilter = filter; }
  resetFilters(): void { this.search = ''; this.positionFilter = 'ALL'; this.squadFilter = 'ALL'; }
  condition(player: any): number { return Number(player.condition ?? player.fitness ?? 0); }
  sharpness(player: any): number { return Number(player.sharpness ?? 0); }
  ability(player: any): number { return Number(player.CA ?? player.rating ?? 0); }
  potential(player: any): number { return Number(player.PA ?? player.rating ?? 0); }
  ratingWidth(value: number): number { return Math.max(3, Math.min(100, (Number(value) || 0) / 2)); }
  money(value: number): string { return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) + ' EUR'; }
}
