import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';
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
  matchPreview: any = null;
  lineupConcerns: any = null;
  matchBriefing: any = null;

  constructor(
    route: ActivatedRoute,
    private studioHttp: HttpClient,
    public currentTeam: TeamService,
    ratingTiers: RatingTierService,
    coachPermissions: CoachPermissionsService,
    adminService: AdminService,
    authService: AuthService,
    chairmanApi: ChairmanClubService,
    feedback: UiFeedbackService) {
    super(route, studioHttp, currentTeam, ratingTiers, coachPermissions, adminService, authService, chairmanApi, feedback);
  }

  override loadData(): void {
    super.loadData();
    if (this.teamId) this.loadMatchPreparation();
  }

  private loadMatchPreparation(): void {
    this.studioHttp.get<any>(urlApp + `/match/preview/${this.teamId}`).subscribe({
      next: preview => {
        this.matchPreview = preview;
        const opponentId = Number(preview?.homeTeamId) === Number(this.teamId) ? preview?.awayTeamId : preview?.homeTeamId;
        if (opponentId) this.studioHttp.get<any>(urlApp + `/assistant/preMatchBriefing/${this.teamId}/${opponentId}`).subscribe({
          next: briefing => this.matchBriefing = briefing,
          error: () => this.matchBriefing = null
        });
      },
      error: () => this.matchPreview = null
    });
    this.studioHttp.get<any>(urlApp + `/assistant/lineupConcerns/${this.teamId}`).subscribe({
      next: concerns => this.lineupConcerns = concerns,
      error: () => this.lineupConcerns = null
    });
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
  condition(player: any): number { return Number(player.condition ?? player.fitness ?? 0); }
  morale(player: any): number { return Number(player.morale ?? 0); }
  bar(value: number): number { return Math.max(3, Math.min(100, Number(value) || 0)); }
  formationLabel(): string { return this.PRETTY[this.selectedTactic] || this.selectedTactic; }
  assignedRole(cell: any): string { return [cell.role, cell.duty].filter(Boolean).join(' · ') || cell.player?.position || 'Position'; }
  saveStudio(): void { this.savedNotice = 'Saving tactic…'; this.saveData(); window.setTimeout(() => this.savedNotice = 'Tactic submitted to the server.', 350); }

  get nextOpponentName(): string {
    if (!this.matchPreview) return '';
    return Number(this.matchPreview.homeTeamId) === Number(this.teamId)
      ? this.matchPreview.awayTeamName : this.matchPreview.homeTeamName;
  }

  get instructionSummary(): string[] {
    return [this.selectedOptions.possession, this.selectedOptions.passing, this.selectedOptions.tempo,
      this.selectedOptions.pressing, this.selectedOptions.defensiveLine, this.selectedOptions.transition]
      .filter((value, index, rows) => !!value && rows.indexOf(value) === index);
  }

  get selectionWarnings(): { tone: string; title: string; detail: string }[] {
    const warnings: { tone: string; title: string; detail: string }[] = [];
    if (this.startersPicked < 11) warnings.push({ tone: 'danger', title: `${11 - this.startersPicked} starting places empty`, detail: 'Complete the XI before saving the match squad.' });
    if (this.subsPicked < 7) warnings.push({ tone: 'warning', title: `${7 - this.subsPicked} bench places empty`, detail: 'Add substitutes to cover in-match changes.' });
    for (const concern of (this.lineupConcerns?.concerns || []).slice(0, 3)) {
      warnings.push({ tone: concern.severity === 'HIGH' ? 'danger' : 'warning', title: concern.playerName, detail: concern.message });
    }
    return warnings;
  }

  get matchPreparationCards(): { label: string; value: string; detail: string; route: string }[] {
    return [
      { label: 'Assistant', value: this.lineupConcerns?.assistantName || 'Staff team', detail: this.lineupConcerns?.summary || 'Selection review', route: '/assistant' },
      { label: 'Opposition', value: this.nextOpponentName || 'No opponent', detail: this.matchBriefing?.opponentAnalysis?.advice || 'Awaiting match report', route: '/assistant' },
      { label: 'Recommended shape', value: this.matchBriefing?.formation?.recommended || this.formationLabel(), detail: this.matchBriefing?.formation?.advice || 'Based on current squad', route: '/assistant' },
      { label: 'Selection risks', value: String(this.lineupConcerns?.totalConcerns || 0), detail: 'Fitness, morale and availability', route: '/medical' }
    ];
  }

  playerRole(player: any): string {
    const cell = this.fieldPositions.find(slot => slot.player?.id === player.id);
    return cell ? this.assignedRole(cell) : '—';
  }

  editPlayerRole(player: any, event: MouseEvent): void {
    const cell = this.fieldPositions.find(slot => slot.player?.id === player.id);
    if (cell) this.openPlayerPanel(cell, event);
  }

  playerConcern(player: any): any {
    return (this.lineupConcerns?.concerns || []).find((concern: any) => Number(concern.playerId) === Number(player.id));
  }
}
