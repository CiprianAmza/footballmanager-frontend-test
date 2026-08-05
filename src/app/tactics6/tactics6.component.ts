import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';
import { ChairmanClubService } from '../services/chairman-club.service';
import { CoachPermissionsService } from '../services/coach-permissions.service';
import { RatingTierService } from '../services/rating-tier.service';
import { TeamService } from '../services/team.service';
import { SharedModule } from '../shared/shared.module';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { Tactics4Component } from '../tactics4/tactics4.component';

@Component({
  selector: 'app-tactics6',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './tactics6.component.html',
  styleUrls: ['./tactics6.component.css']
})
export class Tactics6Component extends Tactics4Component {
  rosterQuery = '';
  rosterPosition = 'ALL';
  rosterSort: 'POSITION' | 'RATING' | 'CONDITION' | 'NAME' = 'POSITION';
  savedNotice = '';

  constructor(
    route: ActivatedRoute,
    http: HttpClient,
    public currentTeam: TeamService,
    ratingTiers: RatingTierService,
    coachPermissions: CoachPermissionsService,
    adminService: AdminService,
    authService: AuthService,
    chairmanApi: ChairmanClubService,
    feedback: UiFeedbackService) {
    super(route, http, currentTeam, ratingTiers, coachPermissions, adminService, authService, chairmanApi, feedback);
  }

  get rosterPositions(): string[] {
    return [...new Set(this.players.map(player => player.position))].sort();
  }

  get visibleRoster(): any[] {
    const query = this.rosterQuery.trim().toLowerCase();
    const rows = this.players.filter(player => (!query || `${player.name} ${player.position}`.toLowerCase().includes(query))
      && (this.rosterPosition === 'ALL' || player.position === this.rosterPosition));
    return [...rows].sort((left, right) => {
      if (this.rosterSort === 'RATING') return right.rating - left.rating;
      if (this.rosterSort === 'CONDITION') return this.condition(right) - this.condition(left);
      if (this.rosterSort === 'NAME') return left.name.localeCompare(right.name);
      return left.position.localeCompare(right.position) || right.rating - left.rating;
    });
  }

  changeFormation(): void { this.setFormationIndices(this.selectedTactic); }
  condition(player: any): number { return Number(player.condition ?? 95); }
  sharpness(player: any): number { return Number(player.sharpness ?? 88); }
  bar(value: number): number { return Math.max(3, Math.min(100, Number(value) || 0)); }
  formationLabel(): string { return this.PRETTY[this.selectedTactic] || this.selectedTactic; }
  assignedRole(cell: any): string { return [cell.role, cell.duty].filter(Boolean).join(' · ') || cell.player?.position || 'Position'; }
  saveStudio(): void { this.savedNotice = 'Saving tactic…'; this.saveData(); window.setTimeout(() => this.savedNotice = 'Tactic submitted to the server.', 350); }
}
