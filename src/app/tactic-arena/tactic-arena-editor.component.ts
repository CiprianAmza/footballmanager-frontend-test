import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
import { ArenaSetup, ArenaTactic } from './tactic-arena.service';

/**
 * The game's tactics page (Tactics4Component: same template, same styles) bound to Tactic
 * Arena data instead of the career:
 * - the squad, formation catalogue and starting tactic come from `setup` (any club in the
 *   world, from `GET /tactic-arena/clubs/{teamId}/setup`), or from a finished run when used
 *   read-only to draw the tactic screenshot;
 * - SAVE never posts to `/tactic/saveFormation`: it only emits the tactic for the test;
 * - career-only restrictions (boardroom locks, chairman mandate) do not apply.
 */
@Component({
  selector: 'app-tactic-arena-editor',
  standalone: true,
  imports: [SharedModule],
  templateUrl: '../tactics4/tactics4.component.html',
  styleUrls: ['../tactics4/tactics4.component.css']
})
export class TacticArenaEditorComponent extends Tactics4Component implements OnChanges {
  @Input() setup: ArenaSetup | null = null;
  @Input() arenaReadOnly = false;
  @Output() tacticSaved = new EventEmitter<ArenaTactic>();

  constructor(
    route: ActivatedRoute,
    private arenaHttp: HttpClient,
    teamService: TeamService,
    ratingTiers: RatingTierService,
    coachPermissions: CoachPermissionsService,
    adminService: AdminService,
    authService: AuthService,
    chairmanApi: ChairmanClubService,
    private arenaFeedback: UiFeedbackService) {
    super(route, arenaHttp, teamService, ratingTiers, coachPermissions, adminService, authService, chairmanApi, arenaFeedback);
  }

  override get canEdit(): boolean { return !this.arenaReadOnly && !!this.setup; }
  override get isExternalTeam(): boolean { return false; }
  override get isChairmanMode(): boolean { return false; }
  override isSlotLocked(_positionIndex: number, _position?: string): boolean { return false; }
  override isManagerChairmanPlayerLocked(_playerId: number): boolean { return false; }

  override ngOnChanges(changes: SimpleChanges): void {
    if (changes['setup'] && !changes['setup'].firstChange) this.loadData();
  }

  override loadData(): void {
    const self = this as any;
    self.resetLoadContext();
    const setup = this.setup;
    if (!setup) return;
    this.teamId = setup.team.teamId;
    if (setup.team.color1) this.teamColor1 = self.normalizeColor(setup.team.color1);
    if (setup.team.color2) this.teamColor2 = self.normalizeColor(setup.team.color2);
    if (!setup.team.color1) {
      this.arenaHttp.get<any>(urlApp + `/teams/info/${setup.team.teamId}`).subscribe({
        next: info => {
          if (this.setup !== setup) return;
          if (info?.color1) this.teamColor1 = self.normalizeColor(info.color1);
          if (info?.color2) this.teamColor2 = self.normalizeColor(info.color2);
        }
      });
    }
    this.players = (setup.players || [])
      .map(player => ({ ...player, condition: player.condition ?? 95, sharpness: player.sharpness ?? 88 }))
      .sort((left, right) => right.rating - left.rating);
    self.computeTeamRatingRange();
    this.formationOptions = (setup.formationCatalog || []).map(entry => ({
      key: entry.tacticName,
      label: this.PRETTY[entry.tacticName] || entry.tacticName
    }));
    if (!this.formationOptions.length) self.useFallbackFormationCatalog();
    const teamView = setup.teamView || null;
    this.managerName = teamView?.managerName || setup.team.name;
    this.managerTacticSource = setup.savedTactic ? 'SAVED' : 'MANAGER_PREFERENCE';
    this.managerTacticSnapshot = (setup.savedTactic || teamView?.managerTactic || null) as any;
    this.bestPossibleTacticSnapshot = (teamView?.bestPossibleTactic || null) as any;
    self.applyManagerTacticWhenReady();
  }

  /** Same payload as the tactics page's save, kept for the test instead of the career. */
  override saveData(): void {
    const tactic = this.buildTactic();
    if (!tactic) return;
    this.managerTacticSnapshot = tactic as any;
    this.managerTacticSource = 'SAVED';
    this.tacticalViewMode = 'manager';
    this.tacticSaved.emit(tactic);
    this.arenaFeedback.success('Tactic kept for the test (your career is not changed).');
  }

  /** The tactic as currently set on the page, or null (with a message) when the XI is incomplete. */
  buildTactic(): ArenaTactic | null {
    if (!this.canEdit) return null;
    const starters = this.fieldPositions.filter(slot => slot.player).map(slot => ({
      positionIndex: slot.positionIndex,
      playerId: slot.player!.id,
      role: slot.role,
      duty: slot.duty,
      instructions: slot.instructions.length > 0 ? slot.instructions : null,
      specialRole: slot.specialRole || null,
      shadow: this.isShadowActive(slot)
    }));
    if (starters.length !== 11) {
      this.arenaFeedback.error(`Pick exactly 11 starters (now ${starters.length}).`);
      return null;
    }
    const bench = this.substitutes.filter(slot => slot.player).map(slot => ({
      positionIndex: slot.positionIndex,
      playerId: slot.player!.id,
      role: null,
      duty: null,
      instructions: null,
      specialRole: null,
      shadow: false
    }));
    return {
      formationDataList: [...starters, ...bench],
      teamId: this.teamId,
      tactic: this.selectedTactic,
      mentality: this.selectedOptions.mentality,
      inPossession: this.selectedOptions.possession,
      passingType: this.selectedOptions.passing,
      tempo: this.selectedOptions.tempo,
      timeWasting: this.selectedOptions.timeWasting,
      defensiveLine: this.selectedOptions.defensiveLine,
      pressing: this.selectedOptions.pressing,
      width: this.selectedOptions.width,
      dribbling: this.selectedOptions.dribbling,
      foulFrequency: this.selectedOptions.foulFrequency,
      foulHardness: this.selectedOptions.foulHardness,
      tempoFragmentation: this.selectedOptions.tempoFragmentation,
      widePlay: this.selectedOptions.widePlay,
      transition: this.selectedOptions.transition,
      recovery: this.selectedOptions.recovery,
      penaltyTakerId: this.penaltyTakerId,
      freeKickTakerId: this.freeKickTakerId,
      cornerTakerLeftId: this.cornerTakerLeftId,
      cornerTakerRightId: this.cornerTakerRightId
    };
  }
}
