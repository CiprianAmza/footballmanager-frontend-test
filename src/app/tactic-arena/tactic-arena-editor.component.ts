import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
import { ArenaRatingTierService } from './arena-rating-tier.service';
import { ARENA_API, ArenaSetup, ArenaTactic } from './tactic-arena.service';

/** Copy of TacticService.FORMATION_GRID_INDICES (backend): the 0..29 pitch cells of each formation. */
const FORMATION_GRID_INDICES: Record<string, number[]> = {
  '442': [1, 3, 10, 11, 13, 14, 20, 21, 23, 24, 27],
  '433': [1, 2, 3, 10, 12, 14, 20, 21, 23, 24, 27],
  '343': [1, 2, 3, 10, 11, 13, 14, 20, 22, 24, 27],
  '451': [2, 10, 11, 12, 13, 14, 20, 21, 23, 24, 27],
  '352': [1, 3, 10, 11, 12, 13, 14, 20, 22, 24, 27],
  '4231': [2, 5, 7, 9, 16, 18, 20, 21, 23, 24, 27],
  '4141': [2, 10, 11, 13, 14, 17, 20, 21, 23, 24, 27],
  '4411': [2, 7, 10, 11, 13, 14, 20, 21, 23, 24, 27],
  '4321': [2, 6, 8, 11, 12, 13, 20, 21, 23, 24, 27],
  '4222': [1, 3, 5, 9, 16, 18, 20, 21, 23, 24, 27],
  '3421': [2, 6, 8, 11, 13, 15, 19, 21, 22, 23, 27],
  '532': [1, 3, 11, 12, 13, 20, 21, 22, 23, 24, 27],
  '5212': [1, 3, 7, 12, 17, 20, 21, 22, 23, 24, 27],
  '541': [2, 10, 11, 13, 14, 20, 21, 22, 23, 24, 27],
  '3511': [2, 7, 11, 12, 13, 15, 19, 21, 22, 23, 27],
  '31411': [2, 7, 10, 11, 13, 14, 17, 21, 22, 23, 27]
};

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
  styleUrls: ['../tactics4/tactics4.component.css', './arena-editor.css'],
  // Tier colours of the base world, from the public route (the root service reads the career).
  providers: [{ provide: RatingTierService, useClass: ArenaRatingTierService }]
})
export class TacticArenaEditorComponent extends Tactics4Component implements OnChanges {
  @Input() setup: ArenaSetup | null = null;
  @Input() arenaReadOnly = false;
  @Output() tacticSaved = new EventEmitter<ArenaTactic>();

  /** Read-only (screenshot) mode draws at a fixed size, whatever the window: see arena-editor.css. */
  @HostBinding('class.arena-fixed-size') get arenaFixedSize(): boolean { return this.arenaReadOnly; }

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

  /**
   * Tactic Arena is public and its clubs live in the base world, not in the career. The
   * club-specific `/tactic/...` helpers (player card, assistant, set-piece suggestion, role
   * suitability, team info) read the career, so they are never called here. The static
   * catalogues come from their public copies `/tactic-arena/roles|instructions/{position}`.
   */
  private arenaRoleCache = new Map<string, any[]>();
  private arenaInstructionCache = new Map<string, any[]>();

  /** Pitch cells from the local copy of the engine's formation table: no request needed. */
  override setFormationIndices(tactic: string): void {
    const self = this as any;
    self.formationRequestId++;
    self.clearLineupState();
    this.allowedIndexes = tactic ? [...(FORMATION_GRID_INDICES[tactic] || FORMATION_GRID_INDICES['442'])] : [];
  }

  override openPlayerCard(_playerId: number): void { /* career-only card */ }

  override askAssistant(): void {
    this.arenaFeedback.error('The assistant works on your career squad only; place the players by dragging them.');
  }

  override suggestSetPieceTakers(): void {
    this.arenaFeedback.error('Set-piece suggestions work on your career squad only; pick the takers from the lists.');
  }

  /** Role catalogue for the position (no per-player suitability: that would read the career). */
  override loadRolesForPlayer(player: any): void {
    const position = String(player?.position || '');
    this.availableRoles = [];
    this.loadingRoles = false;
    if (!position) return;
    const cached = this.arenaRoleCache.get(position);
    if (cached) { this.availableRoles = cached; return; }
    this.loadingRoles = true;
    this.arenaHttp.get<any[]>(ARENA_API + `/roles/${encodeURIComponent(position)}`).subscribe({
      next: data => {
        const roles = (data || []).map(role => ({ name: role.name, duties: role.duties || [] }));
        this.arenaRoleCache.set(position, roles);
        if (this.activeRoleSlot?.player?.position === position) this.availableRoles = roles;
        this.loadingRoles = false;
      },
      error: () => { this.availableRoles = []; this.loadingRoles = false; }
    });
  }

  override loadInstructionsForPosition(position: string): void {
    this.availableInstructions = [];
    this.loadingInstructions = false;
    if (!position) return;
    const cached = this.arenaInstructionCache.get(position);
    if (cached) { this.availableInstructions = cached; return; }
    this.loadingInstructions = true;
    this.arenaHttp.get<any[]>(ARENA_API + `/instructions/${encodeURIComponent(position)}`).subscribe({
      next: data => {
        const instructions = data || [];
        this.arenaInstructionCache.set(position, instructions);
        if (this.activeInstructionsSlot?.player?.position === position) this.availableInstructions = instructions;
        this.loadingInstructions = false;
      },
      error: () => { this.availableInstructions = []; this.loadingInstructions = false; }
    });
  }

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
    // A new world's club often has a saved formation and instructions but no eleven: keep its
    // settings and take the eleven (and set-piece takers) from the best possible tactic.
    const best = teamView?.bestPossibleTactic || teamView?.managerTactic || null;
    let start: any = setup.savedTactic || teamView?.managerTactic || null;
    if (start && !(start.formationDataList || []).length && best?.formationDataList?.length) {
      start = {
        ...start,
        tactic: best.tactic || start.tactic,
        formationDataList: best.formationDataList,
        penaltyTakerId: start.penaltyTakerId ?? best.penaltyTakerId ?? null,
        freeKickTakerId: start.freeKickTakerId ?? best.freeKickTakerId ?? null,
        cornerTakerLeftId: start.cornerTakerLeftId ?? best.cornerTakerLeftId ?? null,
        cornerTakerRightId: start.cornerTakerRightId ?? best.cornerTakerRightId ?? null
      };
    }
    this.managerTacticSnapshot = start;
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
