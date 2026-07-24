// ... (Importurile și interfețele rămân la fel) ...
import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { forkJoin, Subscription } from 'rxjs';
import { TeamService } from '../services/team.service';
import { RatingTierService } from '../services/rating-tier.service';
import { CoachPermissionsService, CoachLockState } from '../services/coach-permissions.service';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';
import { ChairmanClubService } from '../services/chairman-club.service';
import { TacticalMandateSlot, TacticalMandateUpdate, TacticalMandateView } from '../chairman-club/chairman-club.models';

// ... (Interfețele Player, PositionedPlayer, SavedTactic rămân la fel) ...
interface Player {
    id: number;
    name: string;
    age: number;
    position: string;
    rating: number;
    condition?: number;
    sharpness?: number;
    // Face descriptor fields (from PlayerView) — consumed by <app-player-face>.
    baseFaceId?: number;
    skinTone?: number;
    hairStyle?: number;
    hairColor?: number;
    eyeColor?: number;
    faceShape?: number;
    noseShape?: number;
    eyeShape?: number;
    mouthShape?: number;
    browShape?: number;
    nationId?: number;
    species?: string;
}

interface PositionedPlayer {
    positionIndex: number;
    player: Player | null;
    role: string | null;
    duty: string | null;
    instructions: string[];
}

interface RoleDef {
    name: string;
    duties: string[];
    suitability?: number;
    effectiveRating?: number;
}

interface InstructionDef {
    name: string;
    category: string;
    description: string;
}

interface SavedTactic {
    tactic: string;
    mentality: string;
    inPossession: string;
    tempo: string;
    passingType: string;
    timeWasting: string;
    defensiveLine: string;
    pressing: string;
    width: string;
    dribbling: string;
    foulFrequency: string;
    foulHardness: string;
    tempoFragmentation: string;
    widePlay: string;
    transition: string;
    penaltyTakerId?: number | null;
    freeKickTakerId?: number | null;
    cornerTakerLeftId?: number | null;
    cornerTakerRightId?: number | null;
    formationDataList: { positionIndex: number; playerId: number; role?: string | null; duty?: string | null; instructions?: string[] | null }[];
}

interface TeamTacticViewResponse {
    teamId: number;
    teamName: string;
    managerId: number | null;
    managerName: string;
    managerTacticSource: 'SAVED' | 'MANAGER_PREFERENCE';
    managerTactic: SavedTactic;
    bestPossibleTactic: SavedTactic;
}

@Component({
  selector: 'app-tactics4',
  templateUrl: './tactics4.component.html',
  styleUrls: ['./tactics4.component.css']
})
export class Tactics4Component implements OnInit, OnChanges {

  @Input() teamId!: number; // Input pentru reutilizare

  chairmanModeRequested = false;
  chairmanMandate: TacticalMandateView | null = null;
  chairmanRequiredFormation: string | null = null;
  chairmanFormationEnabled = false;
  chairmanLocks: TacticalMandateSlot[] = [];
  chairmanLoading = false;
  chairmanSaving = false;
  chairmanError = '';
  chairmanSuccess = '';
  chairmanReadOnly = false;
  chairmanLoaded = false;
  chairmanControlDenied = false;
  chairmanInvalidLocks: TacticalMandateSlot[] = [];
  private chairmanRequestId = 0;
  private chairmanSubscription?: Subscription;
  private dataSubscription?: Subscription;
  private loadGeneration = 0;
  private formationRequestId = 0;
  private queryModeSubscription?: Subscription;
  playersLoading = false;
  playersError = '';
  formationsLoading = false;
  formationsError = '';
  mandateLoading = false;
  mandateError = '';

  tacticalViewMode: 'manager' | 'best' = 'manager';
  managerName: string = 'Manager';
  managerTacticSource: 'SAVED' | 'MANAGER_PREFERENCE' = 'MANAGER_PREFERENCE';
  managerTacticSnapshot: SavedTactic | null = null;
  bestPossibleTacticSnapshot: SavedTactic | null = null;

  get isExternalTeam(): boolean {
    return !!this.teamId && this.teamId !== this.teamService.teamId;
  }

  get isAdminEditingExternalTeam(): boolean {
    return this.isExternalTeam && this.adminService.isAuthenticated;
  }

  get canEdit(): boolean {
    if (this.isChairmanMode) return !this.chairmanReadOnly && this.authService.isLoggedIn;
    return !!this.teamId && (!this.isExternalTeam || this.adminService.isAuthenticated);
  }

  get isReadOnly(): boolean {
    return !this.canEdit;
  }

  get isChairmanMode(): boolean {
    return this.chairmanModeRequested && this.authService.isLoggedIn
      && this.authService.careerRole === 'CHAIRMAN' && this.authService.chairmanEnabled === true;
  }

  get chairmanFormationOptions(): { key: string; label: string }[] {
    return this.formationOptions.length ? this.formationOptions
      : Object.keys(this.PRETTY).map(key => ({ key, label: this.PRETTY[key] }));
  }

  get chairmanHasRestrictions(): boolean {
    return this.chairmanRequiredFormation !== null || this.chairmanLocks.length > 0;
  }

  // ... (restul variabilelor de state rămân la fel) ...
  players: Player[] = [];
  // Min/max rating across the whole squad — drives the team-relative star scale
  // and the good/bad disc colour on the pitch (best in squad = 5★, worst = ½★).
  teamRatingMin: number = 0;
  teamRatingMax: number = 0;
  selectedPlayers: Set<number> = new Set();
  fieldPositions: PositionedPlayer[] = Array.from({ length: 30 }, (_, i) => ({ positionIndex: i, player: null, role: null, duty: null, instructions: [] }));
  substitutes: PositionedPlayer[] = Array.from({ length: 7 }, (_, i) => ({ positionIndex: 30 + i, player: null, role: null, duty: null, instructions: [] }));

  // ... (restul opțiunilor și configurațiilor) ...
  // Pretty labels for the 15 backend formation KEYS. The KEY is what the engine/AI
  // matches against and what we save; the label is display-only.
  readonly PRETTY: { [key: string]: string } = {
    '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1', '352': '3-5-2',
    '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1', '4321': '4-3-2-1',
    '4222': '4-2-2-2', '3421': '3-4-2-1', '532': '5-3-2', '5212': '5-2-1-2',
    '541': '5-4-1', '3511': '3-5-1-1'
  };
  // Formations available for this team, fetched from the backend (best-fit first).
  formationOptions: { key: string; label: string }[] = [];
  selectedTactic: string = "442";
  allowedIndexes: number[] = [];
  activeModal: string | null = null;
  // Pitch rendering mode: classic rating tokens vs compact face cards.
  pitchView: 'tokens' | 'faces' = 'tokens';

  optionsData: { [key: string]: string[] } = {
    mentality: ['Very Defensive', 'Defensive', 'Balanced', 'Attacking', 'Very Attacking'],
    possession: ['Keep Ball', 'Standard', 'Free Ball Early'],
    passing: ['Short', 'Normal', 'Long'],
    tempo: ['Much Lower', 'Lower', 'Standard', 'Higher', 'Much Higher'],
    timeWasting: ['Never', 'Sometimes', 'Frequently', 'Always'],
    defensiveLine: ['Deep', 'Standard', 'High'],
    pressing: ['Low', 'Standard', 'High'],
    width: ['Narrow', 'Balanced', 'Wide'],
    dribbling: ['Less', 'Standard', 'More'],
    foulFrequency: ['Rarely', 'Normal', 'Often'],
    foulHardness: ['Soft', 'Medium', 'Hard'],
    tempoFragmentation: ['Flowing', 'Normal', 'Fragment'],
    widePlay: ['Cut Inside', 'Shoot', 'Cross'],
    transition: ['Win Fouls', 'Balanced', 'Fast Counter']
  };

  selectedOptions = {
    mentality: 'Balanced',
    possession: 'Standard',
    passing: 'Normal',
    tempo: 'Standard',
    timeWasting: 'Sometimes',
    defensiveLine: 'Standard',
    pressing: 'Low',
    width: 'Balanced',
    dribbling: 'Standard',
    foulFrequency: 'Normal',
    foulHardness: 'Medium',
    tempoFragmentation: 'Normal',
    widePlay: 'Shoot',
    transition: 'Balanced'
  };

  // ===== Per-player Roles + Instructions popup state =====
  activeRoleSlot: PositionedPlayer | null = null;
  activeInstructionsSlot: PositionedPlayer | null = null;
  availableRoles: RoleDef[] = [];
  availableInstructions: InstructionDef[] = [];
  loadingRoles: boolean = false;
  loadingInstructions: boolean = false;
  private roleCache: Map<string, RoleDef[]> = new Map();
  private instructionsCache: Map<string, InstructionDef[]> = new Map();

  // ===== Set Piece Takers =====
  penaltyTakerId: number | null = null;
  freeKickTakerId: number | null = null;
  cornerTakerLeftId: number | null = null;
  cornerTakerRightId: number | null = null;
  suggestedSetPieces: any = null;

  // Boardroom XI-lock state: 🔒 + drag-disable for locked slots / revoked XI rights.
  lockState: CoachLockState = new CoachLockState(true, new Set<number>(), new Set<string>());

  constructor(private route: ActivatedRoute, private http: HttpClient,
              private teamService: TeamService, public ratingTiers: RatingTierService,
              private coachPermissions: CoachPermissionsService,
              private adminService: AdminService,
              private authService: AuthService,
              private chairmanApi: ChairmanClubService) {}

  /** A pitch cell is locked when the owner revoked XI picking or pinned this slot. */
  isSlotLocked(positionIndex: number, position?: string): boolean {
    return !this.isAdminEditingExternalTeam && this.lockState.isSlotLocked(positionIndex, position);
  }

  ngOnInit(): void {
    this.queryModeSubscription = this.route.queryParamMap.subscribe(params => {
        this.chairmanModeRequested = params.get('mode') === 'chairman-mandate';
        if (this.teamId) this.loadData();
    });
    if (this.teamId) {
        if (!this.queryModeSubscription) this.loadData();
    } else {
        // Fallback la ruta dacă nu e pasat ca input
        this.route.params.subscribe(params => {
            this.teamId = Number(params['teamId']) || this.teamService.teamId;
            this.loadData();
        });
    }
  }

  ngOnDestroy(): void {
    this.queryModeSubscription?.unsubscribe();
    this.chairmanSubscription?.unsubscribe();
    this.dataSubscription?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
      if (changes['teamId'] && !changes['teamId'].firstChange) {
          this.loadData();
      }
  }

  // ... (Restul metodelor: loadData, drag&drop, save, modal rămân NESCHIMBATE) ...
  // Team colors fetched from /teams/info/{teamId} so the shirt isn't a hardcoded red
  teamColor1: string = '#d63031';
  teamColor2: string = '#ffffff';

  // FIFA-style player card shown when clicking a player on the pitch
  selectedCard: any = null;
  cardLoading: boolean = false;

  openPlayerCard(playerId: number): void {
    if (!playerId) return;
    this.cardLoading = true;
    this.selectedCard = null;
    this.http.get<any>(urlApp + `/tactic/playerCard/${playerId}`).subscribe({
      next: (card) => {
        this.selectedCard = card;
        this.cardLoading = false;
      },
      error: () => { this.cardLoading = false; }
    });
  }

  closePlayerCard(): void {
    this.selectedCard = null;
  }

  // Doar asigură-te că loadData folosește this.teamId
  loadData(): void {
    const generation = ++this.loadGeneration;
    this.chairmanRequestId++;
    this.dataSubscription?.unsubscribe();
    this.chairmanSubscription?.unsubscribe();
    this.resetLoadContext();
    if (this.isChairmanMode) {
      this.loadChairmanMandateData(generation);
      return;
    }
    // Boardroom permissions: which XI slots are locked (or whether the coach
    // may pick the XI at all). Drives lock icons + drag-disable on the pitch.
    this.coachPermissions.getLockState(this.teamId).subscribe(state => {
      if (generation === this.loadGeneration) this.lockState = state;
    });

    // Team metadata for branding the shirts
    this.http.get<any>(urlApp + `/teams/info/${this.teamId}`).subscribe({
      next: (info) => {
        if (generation !== this.loadGeneration) return;
        if (info?.color1) this.teamColor1 = this.normalizeColor(info.color1);
        if (info?.color2) this.teamColor2 = this.normalizeColor(info.color2);
      }
    });

    this.dataSubscription = forkJoin({
      players: this.http.get<Player[]>(urlApp + `/tactic/getPlayers/${this.teamId}`),
      teamView: this.http.get<TeamTacticViewResponse>(urlApp + `/tactic/teamView/${this.teamId}`),
      tactics: this.http.get<{ tacticName: string; totalRating: number }[]>(urlApp + `/tactic/getAllPossibleTactics/${this.teamId}`)
    }).subscribe({
      next: (response) => {
         if (generation !== this.loadGeneration) return;
         // ... logica existentă ...
         this.players = response.players.map(p => ({...p, condition: 95, sharpness: 88})).sort((a, b) => b.rating - a.rating);
         this.computeTeamRatingRange();
         // Drive the formation list from the backend (best-fit first). KEY is saved/sent,
         // pretty label is display-only.
         this.formationOptions = (response.tactics || []).map(t => ({
             key: t.tacticName,
             label: this.PRETTY[t.tacticName] || t.tacticName
         }));
         this.managerName = response.teamView?.managerName || 'No appointed manager';
         this.managerTacticSource = response.teamView?.managerTacticSource || 'MANAGER_PREFERENCE';
         this.managerTacticSnapshot = response.teamView?.managerTactic || null;
         this.bestPossibleTacticSnapshot = response.teamView?.bestPossibleTactic || null;
         this.tacticalViewMode = 'manager';
         const initial = this.managerTacticSnapshot || this.bestPossibleTacticSnapshot;
         if (initial) this.applyTacticSnapshot(initial);
      },
      error: (err) => {
        if (generation === this.loadGeneration) console.error("Error loading tactic data", err);
      }
    });
  }

  private loadChairmanMandateData(generation = this.loadGeneration, preserveError = ''): void {
    const requestId = ++this.chairmanRequestId;
    this.chairmanSubscription?.unsubscribe();
    this.chairmanSubscription = new Subscription();
    const current = () => generation === this.loadGeneration && requestId === this.chairmanRequestId;
    this.playersLoading = true;
    this.formationsLoading = true;
    this.mandateLoading = true;
    this.playersError = '';
    this.formationsError = '';
    this.mandateError = '';
    this.chairmanLoading = true;
    this.chairmanError = preserveError;
    this.chairmanSuccess = '';
    this.chairmanReadOnly = true;
    this.chairmanLoaded = false;
    this.chairmanControlDenied = false;
    this.chairmanMandate = null;
    this.chairmanRequiredFormation = null;
    this.chairmanFormationEnabled = false;
    this.chairmanLocks = [];
    this.chairmanInvalidLocks = [];
    this.chairmanSubscription.add(this.http.get<Player[]>(urlApp + `/tactic/getPlayers/${this.teamId}`).subscribe({
      next: players => { if (current()) { this.players = (players || []).map(p => ({ ...p, condition: p.condition ?? 95, sharpness: p.sharpness ?? 88 })).sort((a, b) => b.rating - a.rating); this.computeTeamRatingRange(); this.playersLoading = false; } },
      error: () => { if (current()) { this.playersLoading = false; this.playersError = 'Players could not be loaded.'; } }
    }));
    this.chairmanSubscription.add(this.http.get<{ tacticName: string; totalRating: number }[]>(urlApp + `/tactic/getAllPossibleTactics/${this.teamId}`).subscribe({
      next: tactics => { if (current()) { this.formationOptions = (tactics || []).map(t => ({ key: t.tacticName, label: this.PRETTY[t.tacticName] || t.tacticName })); this.formationsLoading = false; } },
      error: () => { if (current()) { this.formationsLoading = false; this.formationsError = 'Formations could not be loaded.'; } }
    }));
    this.chairmanSubscription.add(this.chairmanApi.tacticalMandate(this.teamId).subscribe({
      next: mandate => {
        if (!current()) return;
        this.chairmanMandate = mandate;
        this.chairmanRequiredFormation = mandate.requiredFormation;
        this.chairmanFormationEnabled = mandate.requiredFormation !== null;
        this.chairmanLocks = this.copyLocks(mandate.lockedSlots || []);
        this.selectedTactic = this.chairmanRequiredFormation || this.formationOptions[0]?.key || '442';
        this.setFormationIndices(this.selectedTactic);
        this.applyChairmanLocksToField();
        this.mandateLoading = false;
        this.chairmanLoading = false;
        this.chairmanReadOnly = false;
        this.chairmanLoaded = true;
        this.chairmanControlDenied = false;
        this.chairmanError = preserveError;
      },
      error: error => { if (current()) { this.mandateLoading = false; this.chairmanLoading = false; this.chairmanReadOnly = true; this.chairmanLoaded = false; this.chairmanError = this.mapChairmanError(error); this.mandateError = this.chairmanError; this.chairmanControlDenied = this.isControlError(error); } }
    }));
  }

  switchTacticalView(mode: 'manager' | 'best'): void {
    const snapshot = mode === 'manager' ? this.managerTacticSnapshot : this.bestPossibleTacticSnapshot;
    if (!snapshot) return;
    this.tacticalViewMode = mode;
    this.applyTacticSnapshot(snapshot);
  }

  private applyTacticSnapshot(data: SavedTactic): void {
    this.selectedTactic = data.tactic || this.formationOptions[0]?.key || '442';
    this.selectedOptions.mentality = data.mentality || 'Balanced';
    this.selectedOptions.possession = data.inPossession || 'Standard';
    this.selectedOptions.tempo = data.tempo || 'Standard';
    this.selectedOptions.passing = data.passingType || 'Normal';
    this.selectedOptions.timeWasting = data.timeWasting || 'Sometimes';
    this.selectedOptions.defensiveLine = data.defensiveLine || 'Standard';
    this.selectedOptions.pressing = data.pressing || 'Low';
    this.selectedOptions.width = data.width || 'Balanced';
    this.selectedOptions.dribbling = data.dribbling || 'Standard';
    this.selectedOptions.foulFrequency = data.foulFrequency || 'Normal';
    this.selectedOptions.foulHardness = data.foulHardness || 'Medium';
    this.selectedOptions.tempoFragmentation = data.tempoFragmentation || 'Normal';
    this.selectedOptions.widePlay = data.widePlay || 'Shoot';
    this.selectedOptions.transition = data.transition || 'Balanced';
    this.penaltyTakerId = data.penaltyTakerId ?? null;
    this.freeKickTakerId = data.freeKickTakerId ?? null;
    this.cornerTakerLeftId = data.cornerTakerLeftId ?? null;
    this.cornerTakerRightId = data.cornerTakerRightId ?? null;
    this.setFormationIndices(this.selectedTactic);
    this.mapSavedPlayersToField(data.formationDataList || []);
  }

  // ... (Restul clasei e la fel) ...
  mapSavedPlayersToField(savedPositions: { positionIndex: number; playerId: number; role?: string | null; duty?: string | null; instructions?: string[] | null }[]) {
      this.clearLineupState();
      savedPositions.forEach(pos => {
          const playerObj = this.players.find(p => p.id === pos.playerId);
          if (playerObj) {
              this.selectedPlayers.add(playerObj.id);
              if (pos.positionIndex < 30) {
                  const cell = this.fieldPositions[pos.positionIndex];
                  cell.player = playerObj;
                  cell.role = pos.role ?? null;
                  cell.duty = pos.duty ?? null;
                  cell.instructions = pos.instructions ? [...pos.instructions] : [];
              } else {
                  const subIndex = pos.positionIndex - 30;
                  if (this.substitutes[subIndex]) this.substitutes[subIndex].player = playerObj;
              }
          }
      });
  }
  openModal(type: string): void {
    if (!this.canEdit || this.isChairmanMode) return;
    this.activeModal = type;
  }
  closeModal(): void { this.activeModal = null; }
  // For the formation modal we show pretty labels (mapped back to KEY on select);
  // every other modal keeps its plain string options.
  get currentOptions(): string[] {
      if (!this.activeModal) return [];
      if (this.activeModal === 'formation') return this.formationOptions.map(o => o.label);
      return this.optionsData[this.activeModal] || [];
  }
  selectOption(option: string): void {
      if (!this.canEdit || this.isChairmanMode) return;
      if (this.activeModal === 'mentality') this.selectedOptions.mentality = option;
      if (this.activeModal === 'possession') this.selectedOptions.possession = option;
      if (this.activeModal === 'passing') this.selectedOptions.passing = option;
      if (this.activeModal === 'tempo') this.selectedOptions.tempo = option;
      if (this.activeModal === 'timeWasting') this.selectedOptions.timeWasting = option;
      if (this.activeModal === 'defensiveLine') this.selectedOptions.defensiveLine = option;
      if (this.activeModal === 'pressing') this.selectedOptions.pressing = option;
      if (this.activeModal === 'width') this.selectedOptions.width = option;
      if (this.activeModal === 'dribbling') this.selectedOptions.dribbling = option;
      if (this.activeModal === 'foulFrequency') this.selectedOptions.foulFrequency = option;
      if (this.activeModal === 'foulHardness') this.selectedOptions.foulHardness = option;
      if (this.activeModal === 'tempoFragmentation') this.selectedOptions.tempoFragmentation = option;
      if (this.activeModal === 'widePlay') this.selectedOptions.widePlay = option;
      if (this.activeModal === 'transition') this.selectedOptions.transition = option;
      if (this.activeModal === 'formation') {
          // `option` is the pretty label; resolve it back to the backend KEY.
          const match = this.formationOptions.find(o => o.label === option);
          const key = match ? match.key : option;
          this.selectedTactic = key;
          this.setFormationIndices(key);
      }
      this.closeModal();
  }
  /** Fetch the active pitch cells for a formation KEY from the backend. */
  setFormationIndices(tactic: string) {
      const requestId = ++this.formationRequestId;
      if (!this.isChairmanMode) this.clearLineupState();
      this.allowedIndexes = [];
      if (!tactic) return;
      this.http.get<{ index: number; position: string }[]>(urlApp + `/tactic/formationLayout/${tactic}`).subscribe({
          next: (cells) => {
            if (requestId !== this.formationRequestId) return;
            this.allowedIndexes = (cells || []).map(c => c.index);
            if (this.isChairmanMode) this.applyChairmanLocksToField();
          },
          error: (err) => console.error('Error loading formation layout', err)
      });
  }

  onChairmanFormationChanged(): void {
    if (!this.isChairmanMode || !this.canEdit) return;
    this.chairmanRequiredFormation = this.chairmanFormationEnabled ? this.selectedTactic : null;
    this.setFormationIndices(this.selectedTactic);
    this.updateChairmanInvalidLocks();
  }

  retryChairmanMandate(): void {
    if (!this.isChairmanMode || this.mandateLoading) return;
    const generation = this.loadGeneration;
    const requestId = ++this.chairmanRequestId;
    this.mandateLoading = true;
    this.chairmanLoading = true;
    this.mandateError = '';
    this.chairmanApi.tacticalMandate(this.teamId).subscribe({
      next: mandate => {
        if (generation !== this.loadGeneration || requestId !== this.chairmanRequestId) return;
        this.chairmanMandate = mandate;
        this.chairmanRequiredFormation = mandate.requiredFormation;
        this.chairmanFormationEnabled = mandate.requiredFormation !== null;
        this.chairmanLocks = this.copyLocks(mandate.lockedSlots || []);
        this.selectedTactic = mandate.requiredFormation || this.formationOptions[0]?.key || '442';
        this.mandateLoading = false;
        this.chairmanLoading = false;
        this.chairmanReadOnly = false;
        this.chairmanLoaded = true;
        this.chairmanError = '';
      },
      error: error => {
        if (generation !== this.loadGeneration || requestId !== this.chairmanRequestId) return;
        this.mandateLoading = false;
        this.chairmanLoading = false;
        this.chairmanReadOnly = true;
        this.chairmanError = this.mandateError = this.mapChairmanError(error);
      }
    });
  }

  retryFormations(): void {
    if (!this.isChairmanMode) return;
    this.formationsLoading = true;
    this.formationsError = '';
    const generation = this.loadGeneration;
    const requestId = ++this.formationRequestId;
    this.http.get<{ tacticName: string; totalRating: number }[]>(urlApp + `/tactic/getAllPossibleTactics/${this.teamId}`).subscribe({
      next: tactics => {
        if (generation !== this.loadGeneration || requestId !== this.formationRequestId) return;
        this.formationOptions = (tactics || []).map(t => ({ key: t.tacticName, label: this.PRETTY[t.tacticName] || t.tacticName }));
        this.formationsLoading = false;
      },
      error: () => { if (generation === this.loadGeneration && requestId === this.formationRequestId) { this.formationsLoading = false; this.formationsError = 'Formations could not be loaded.'; } }
    });
  }

  toggleChairmanFormation(): void {
    if (!this.isChairmanMode || !this.canEdit) return;
    this.chairmanRequiredFormation = this.chairmanFormationEnabled ? this.selectedTactic : null;
    this.setFormationIndices(this.selectedTactic);
    this.updateChairmanInvalidLocks();
  }

  toggleChairmanLock(positionIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.isChairmanMode || !this.canEdit || positionIndex >= 30) return;
    const existing = this.chairmanLocks.findIndex(lock => lock.positionIndex === positionIndex);
    if (existing >= 0) {
      this.chairmanLocks = this.chairmanLocks.filter((_, index) => index !== existing);
      return;
    }
    const player = this.fieldPositions[positionIndex]?.player;
    if (!player) {
      this.chairmanError = 'Place a player in this exact starting slot before locking it.';
      return;
    }
    if (this.chairmanLocks.some(lock => lock.playerId === player.id)) {
      this.chairmanError = 'A player may only be locked once.';
      return;
    }
    if (this.chairmanLocks.length >= 11) {
      this.chairmanError = 'A Chairman mandate may contain at most 11 locked players.';
      return;
    }
    this.chairmanLocks = [...this.chairmanLocks, { positionIndex, playerId: player.id }]
      .sort((a, b) => a.positionIndex - b.positionIndex || a.playerId - b.playerId);
    this.chairmanError = '';
  }

  isChairmanSlotLocked(positionIndex: number): boolean {
    return this.chairmanLocks.some(lock => lock.positionIndex === positionIndex);
  }

  isChairmanPlayerLocked(playerId: number): boolean {
    return this.chairmanLocks.some(lock => lock.playerId === playerId);
  }

  unlockChairmanLock(positionIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (!this.isChairmanMode || !this.canEdit) return;
    this.chairmanLocks = this.chairmanLocks.filter(lock => lock.positionIndex !== positionIndex);
    this.updateChairmanInvalidLocks();
    this.chairmanError = '';
  }

  isChairmanDragLocked(positionIndex: number, playerId?: number): boolean {
    return this.isChairmanSlotLocked(positionIndex) || (!!playerId && this.isChairmanPlayerLocked(playerId));
  }

  chairmanLockLabel(lock: TacticalMandateSlot): string {
    const player = this.players.find(value => value.id === lock.playerId);
    return `Slot ${lock.positionIndex} · ${player?.name || `Player ${lock.playerId}`}`;
  }

  saveChairmanMandate(): void {
    if (!this.isChairmanMode || !this.canEdit || this.chairmanSaving) return;
    this.updateChairmanInvalidLocks();
    if (this.chairmanInvalidLocks.length) {
      this.chairmanError = `These locked positions are not in ${this.selectedTactic}: ${this.chairmanInvalidLocks.map(lock => lock.positionIndex).join(', ')}.`;
      return;
    }
    if (this.chairmanLocks.some(lock => lock.positionIndex < 0 || lock.positionIndex >= 30)
      || this.chairmanLocks.length > 11
      || new Set(this.chairmanLocks.map(lock => lock.positionIndex)).size !== this.chairmanLocks.length
      || new Set(this.chairmanLocks.map(lock => lock.playerId)).size !== this.chairmanLocks.length) {
      this.chairmanError = 'Locked slots must use unique starting positions and players.';
      return;
    }
    const body: TacticalMandateUpdate = {
      requiredFormation: this.chairmanFormationEnabled ? this.selectedTactic : null,
      lockedSlots: this.copyLocks(this.chairmanLocks),
      expectedVersion: this.chairmanMandate?.version ?? 0
    };
    this.chairmanSaving = true;
    this.chairmanError = '';
    this.chairmanSuccess = '';
    const requestId = ++this.chairmanRequestId;
    this.chairmanApi.saveTacticalMandate(this.teamId, body).subscribe({
      next: value => {
        if (requestId !== this.chairmanRequestId) return;
        this.chairmanMandate = value;
        this.chairmanRequiredFormation = value.requiredFormation;
        this.chairmanFormationEnabled = value.requiredFormation !== null;
        this.chairmanLocks = this.copyLocks(value.lockedSlots || []);
        this.selectedTactic = value.requiredFormation || this.selectedTactic;
        this.chairmanSaving = false;
        this.chairmanSuccess = 'Chairman mandate saved.';
      },
      error: error => {
        if (requestId !== this.chairmanRequestId) return;
        this.chairmanSaving = false;
        this.chairmanError = this.mapChairmanError(error);
        if (this.errorCode(error) === 'TACTICAL_MANDATE_STALE') {
          this.loadChairmanMandateData(this.loadGeneration, this.mapChairmanError(error));
        }
        if (this.isControlError(error)) {
          this.chairmanReadOnly = true;
          this.chairmanControlDenied = true;
        }
      }
    });
  }

  private applyChairmanLocksToField(): void {
    if (!this.isChairmanMode) return;
    this.chairmanLocks.forEach(lock => {
      const player = this.players.find(value => value.id === lock.playerId);
      const target = this.fieldPositions[lock.positionIndex];
      if (!player || !target) return;
      this.removePlayerFromCurrentPosition(player.id);
      if (target.player) this.selectedPlayers.delete(target.player.id);
      target.player = player;
      target.role = null;
      target.duty = null;
      target.instructions = [];
      this.selectedPlayers.add(player.id);
    });
  }

  private updateChairmanInvalidLocks(): void {
    this.chairmanInvalidLocks = this.chairmanLocks.filter(lock =>
      lock.positionIndex >= 30 || (this.allowedIndexes.length > 0 && !this.allowedIndexes.includes(lock.positionIndex)));
  }

  private copyLocks(locks: TacticalMandateSlot[]): TacticalMandateSlot[] {
    return (locks || []).map(lock => ({ positionIndex: lock.positionIndex, playerId: lock.playerId }));
  }

  private errorCode(error: any): string {
    return error?.error?.code || error?.code || '';
  }

  private isControlError(error: any): boolean {
    return ['CHAIRMAN_REQUIRED', 'CLUB_CONTROL_REQUIRED', 'CHAIRMAN_FEATURE_DISABLED', 'CLUB_NOT_FOUND']
      .includes(this.errorCode(error));
  }

  private mapChairmanError(error: any): string {
    const code = this.errorCode(error);
    const messages: { [code: string]: string } = {
      CHAIRMAN_FEATURE_DISABLED: 'Chairman mode is currently disabled.',
      CHAIRMAN_REQUIRED: 'A Chairman career is required for this mandate.',
      CLUB_CONTROL_REQUIRED: 'You no longer control this club. The mandate is read-only.',
      CLUB_NOT_FOUND: 'The club could not be found.',
      FORMATION_NOT_FOUND: 'The selected formation is not available.',
      INVALID_MANDATE_SLOT: 'The mandate contains an invalid position.',
      TACTICAL_MANDATE_INVALID: 'The tactical mandate is invalid.',
      DUPLICATE_MANDATE_SLOT: 'A position is locked more than once.',
      DUPLICATE_MANDATE_PLAYER: 'A player is locked more than once.',
      MANDATED_PLAYER_NOT_FOUND: 'A mandated player could not be found.',
      MANDATED_PLAYER_NOT_ELIGIBLE: 'A mandated player is not eligible.',
      TACTICAL_MANDATE_STALE: 'The mandate changed elsewhere. Your editor was refreshed; reapply your changes manually.'
    };
    return messages[code] || error?.error?.message || error?.message || 'The tactical mandate could not be loaded or saved.';
  }
  allowDrop(event: DragEvent): void { if (this.canEdit) event.preventDefault(); }
  drag(event: DragEvent, player: Player): void {
      if (!this.canEdit) return;
      if (this.isChairmanMode && this.isChairmanPlayerLocked(player.id)) return;
      if (event.dataTransfer) event.dataTransfer.setData('player', JSON.stringify(player));
  }
  drop(event: DragEvent, positionIndex: number): void {
      if (!this.canEdit) return;
      if (!this.allowedIndexes.includes(positionIndex)) return;
      // Owner locked this slot (or revoked XI picking): refuse the drop.
      if (this.isSlotLocked(positionIndex, this.fieldPositions[positionIndex]?.player?.position)
        || (this.isChairmanMode && this.isChairmanSlotLocked(positionIndex))) return;
      const playerData = event.dataTransfer?.getData('player');
      if (playerData) {
          const player = JSON.parse(playerData) as Player;
          if (this.isChairmanMode && this.isChairmanPlayerLocked(player.id)) return;
          this.removePlayerFromCurrentPosition(player.id);
          const targetSpot = this.fieldPositions[positionIndex];
          if (targetSpot.player) this.selectedPlayers.delete(targetSpot.player.id);
          this.fieldPositions[positionIndex].player = player;
          this.fieldPositions[positionIndex].role = null;
          this.fieldPositions[positionIndex].duty = null;
          this.fieldPositions[positionIndex].instructions = [];
          this.selectedPlayers.add(player.id);
      }
  }
  dropSubstitute(event: DragEvent, subIndex: number): void {
      if (!this.canEdit) return;
      const playerData = event.dataTransfer?.getData('player');
      if (playerData) {
          const player = JSON.parse(playerData) as Player;
          if (this.isChairmanMode && this.isChairmanPlayerLocked(player.id)) return;
          this.removePlayerFromCurrentPosition(player.id);
          const targetSpot = this.substitutes[subIndex];
          if (targetSpot.player) this.selectedPlayers.delete(targetSpot.player.id);
          this.substitutes[subIndex].player = player;
          this.selectedPlayers.add(player.id);
      }
  }
  removePlayerFromCurrentPosition(playerId: number) {
      const existingFieldIndex = this.fieldPositions.findIndex(p => p.player?.id === playerId);
      if (existingFieldIndex !== -1) this.fieldPositions[existingFieldIndex].player = null;
      const existingSubIndex = this.substitutes.findIndex(p => p.player?.id === playerId);
      if (existingSubIndex !== -1) this.substitutes[existingSubIndex].player = null;
  }
  onRightClick(positionIndex: number, event: MouseEvent): void {
      event.preventDefault();
      if (!this.canEdit) return;
      // Locked slots are read-only — don't allow removing the pinned player.
      if (this.isSlotLocked(positionIndex, this.fieldPositions[positionIndex]?.player?.position)
        || (this.isChairmanMode && this.isChairmanSlotLocked(positionIndex))) return;
      const pos = this.fieldPositions[positionIndex];
      if (pos.player) {
          this.selectedPlayers.delete(pos.player.id);
          pos.player = null;
          pos.role = null;
          pos.duty = null;
          pos.instructions = [];
          if (this.activeRoleSlot === pos) this.activeRoleSlot = null;
          if (this.activeInstructionsSlot === pos) this.activeInstructionsSlot = null;
      }
  }
  removeAll(): void {
      if (!this.canEdit) return;
      this.clearLineupState();
  }

  private clearLineupState(): void {
      this.fieldPositions.forEach(p => { p.player = null; p.role = null; p.duty = null; p.instructions = []; });
      this.substitutes.forEach(p => { p.player = null; p.role = null; p.duty = null; p.instructions = []; });
      this.selectedPlayers.clear();
      this.activeRoleSlot = null;
      this.activeInstructionsSlot = null;
  }

  private resetLoadContext(): void {
      this.clearLineupState();
      this.fieldPositions = Array.from({ length: 30 }, (_, i) => ({ positionIndex: i, player: null, role: null, duty: null, instructions: [] }));
      this.substitutes = Array.from({ length: 7 }, (_, i) => ({ positionIndex: 30 + i, player: null, role: null, duty: null, instructions: [] }));
      this.players = [];
      this.formationOptions = [];
      this.allowedIndexes = [];
      this.formationRequestId++;
      this.lockState = new CoachLockState(true, new Set<number>(), new Set<string>());
      this.chairmanMandate = null;
      this.chairmanRequiredFormation = null;
      this.chairmanFormationEnabled = false;
      this.chairmanLocks = [];
      this.chairmanInvalidLocks = [];
      this.chairmanSaving = false;
      this.chairmanError = '';
      this.chairmanSuccess = '';
      this.chairmanReadOnly = this.isChairmanMode;
      this.chairmanLoaded = false;
      this.chairmanControlDenied = false;
      this.managerTacticSnapshot = null;
      this.bestPossibleTacticSnapshot = null;
      this.managerName = 'Manager';
      this.managerTacticSource = 'MANAGER_PREFERENCE';
      this.tacticalViewMode = 'manager';
      this.selectedTactic = '442';
      this.selectedOptions = {
        mentality: 'Balanced', possession: 'Standard', passing: 'Normal', tempo: 'Standard',
        timeWasting: 'Sometimes', defensiveLine: 'Standard', pressing: 'Low', width: 'Balanced',
        dribbling: 'Standard', foulFrequency: 'Normal', foulHardness: 'Medium',
        tempoFragmentation: 'Normal', widePlay: 'Shoot', transition: 'Balanced'
      };
      this.teamColor1 = '#d63031';
      this.teamColor2 = '#ffffff';
      this.teamRatingMin = 0;
      this.teamRatingMax = 0;
      this.penaltyTakerId = null;
      this.freeKickTakerId = null;
      this.cornerTakerLeftId = null;
      this.cornerTakerRightId = null;
      this.suggestedSetPieces = null;
      this.activeModal = null;
      this.selectedCard = null;
      this.cardLoading = false;
  }
  isPlayerSelected(playerId: number): boolean { return this.selectedPlayers.has(playerId); }
  askAssistant(): void {
      if (!this.canEdit || this.isChairmanMode) return;
      this.http.get<{ positionIndex: number; playerId: number }[]>(
          urlApp + `/tactic/askAssistant/${this.teamId}/${encodeURIComponent(this.selectedTactic)}`
      ).subscribe({
          next: (positions) => {
              this.mapSavedPlayersToField(positions);
          },
          error: (err) => console.error('Error asking assistant:', err)
      });
  }

  saveData() {
      if (!this.canEdit || this.isChairmanMode) return;
      const formationData = this.fieldPositions.filter(p => p.player).map(p => ({
          positionIndex: p.positionIndex,
          playerId: p.player!.id,
          role: p.role,
          duty: p.duty,
          instructions: p.instructions.length > 0 ? p.instructions : null
      }));
      const substitutesData = this.substitutes.filter(p => p.player).map(p => ({
          positionIndex: p.positionIndex,
          playerId: p.player!.id,
          role: null,
          duty: null,
          instructions: null
      }));
      const payload = {
          formationDataList: [...formationData, ...substitutesData],
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
          penaltyTakerId: this.penaltyTakerId,
          freeKickTakerId: this.freeKickTakerId,
          cornerTakerLeftId: this.cornerTakerLeftId,
          cornerTakerRightId: this.cornerTakerRightId
      };
      const request$ = this.isAdminEditingExternalTeam
          ? this.adminService.saveTeamTactic(payload)
          : this.http.post(urlApp + '/tactic/saveFormation', payload);
      request$.subscribe({
          next: () => {
              this.managerTacticSnapshot = payload as SavedTactic;
              this.managerTacticSource = 'SAVED';
              this.tacticalViewMode = 'manager';
              alert(this.isAdminEditingExternalTeam
                  ? `Tactics saved for ${this.managerName}'s team.`
                  : 'Tactics saved successfully!');
          },
          error: (error) => {
              console.error('Error saving tactics:', error);
              alert(error?.error?.error || 'The tactic could not be saved.');
          }
      });
  }

  // ===== Set Piece Takers =====
  /** Ask the backend for the best takers and apply them to the four slots. */
  suggestSetPieceTakers(): void {
    if (!this.canEdit || this.isChairmanMode) return;
    this.http.get<any>(urlApp + `/tactic/suggestSetPieceTakers/${this.teamId}`).subscribe({
      next: (data) => {
        this.suggestedSetPieces = data;
        if (data?.penaltyTakerId) this.penaltyTakerId = data.penaltyTakerId;
        if (data?.freeKickTakerId) this.freeKickTakerId = data.freeKickTakerId;
        if (data?.cornerTakerLeftId) this.cornerTakerLeftId = data.cornerTakerLeftId;
        if (data?.cornerTakerRightId) this.cornerTakerRightId = data.cornerTakerRightId;
      },
      error: (err) => console.error('Error suggesting set piece takers:', err)
    });
  }

  /**
   * Team color values in the DB are CSS color words ("red", "blue", "darkgreen")
   * or hex codes. Pass them through as-is — the browser handles both natively
   * when used in a `style.background-color` binding. Returns a safe default if
   * the value is missing or unrecognized.
   */
  private normalizeColor(value: string): string {
    if (!value) return '#d63031';
    const v = value.trim().toLowerCase();
    // Already hex? keep it.
    if (v.startsWith('#')) return v;
    // Map a few common CSS color-words to slightly punchier hex so they look
    // saturated against the dark pitch background.
    const palette: { [k: string]: string } = {
      'red': '#e74c3c', 'darkred': '#c0392b',
      'blue': '#2980b9', 'darkblue': '#1a3d6e', 'lightblue': '#5dade2',
      'green': '#27ae60', 'darkgreen': '#196f3d',
      'yellow': '#f1c40f', 'orange': '#e67e22',
      'black': '#1a1a1a', 'white': '#ecf0f1', 'grey': '#7f8c8d', 'gray': '#7f8c8d',
      'purple': '#8e44ad', 'lila': '#8e44ad', 'pink': '#e91e63',
      'brown': '#795548'
    };
    return palette[v] || v;  // unknown word: let the browser try anyway
  }

  // ============================================================
  // ANALYTICS DERIVED DISPLAY VALUES (presentation-only, no HTTP)
  // All getters map existing selectedOptions strings to numeric
  // 0..100 scales / labels that the dashboard widgets render.
  // ============================================================

  /** 0..100 index from a value's position within an ordered scale. */
  private scaleIndex(type: string, value: string): number {
    const list = this.optionsData[type] || [];
    if (list.length <= 1) return 50;
    const i = list.indexOf(value);
    if (i < 0) return 50;
    return Math.round((i / (list.length - 1)) * 100);
  }

  /** Mentality 0 (Very Defensive) .. 100 (Very Attacking). */
  get mentalityPct(): number { return this.scaleIndex('mentality', this.selectedOptions.mentality); }

  /** Pressing intensity gauge 0..100. */
  get pressingPct(): number { return this.scaleIndex('pressing', this.selectedOptions.pressing); }

  /** Tempo 0..100. */
  get tempoPct(): number { return this.scaleIndex('tempo', this.selectedOptions.tempo); }

  /** Width occupancy 0..100 (Narrow..Wide). */
  get widthPct(): number { return this.scaleIndex('width', this.selectedOptions.width); }

  /** Time-wasting 0..100. */
  get timeWastingPct(): number { return this.scaleIndex('timeWasting', this.selectedOptions.timeWasting); }

  /** Passing directness 0..100. */
  get possessionPct(): number { return this.scaleIndex('possession', this.selectedOptions.possession); }

  /** Passing length 0..100 (Short..Long). */
  get passingPct(): number { return this.scaleIndex('passing', this.selectedOptions.passing); }

  /** Defensive line height as a % from the bottom of the pitch where the
   *  marker line is drawn. Deep sits low, High pushes up the field. */
  get defLineHeightPct(): number {
    // % from BOTTOM. Standard sits at the back line (~32% up ≈ 68% from top, where defenders render);
    // High pushes up a band, Deep drops toward our goal.
    switch (this.selectedOptions.defensiveLine) {
      case 'Deep': return 24;
      case 'High': return 44;
      default: return 32; // Standard
    }
  }

  /** Horizontal inset (%) applied to each pitch flank to visualise width.
   *  Narrow squeezes play inward; Wide spreads it to the touchlines. */
  get widthInsetPct(): number {
    switch (this.selectedOptions.width) {
      case 'Narrow': return 18;
      case 'Wide': return 2;
      default: return 9; // Balanced
    }
  }

  /** Attack share of the attack-vs-defence balance bar (0..100). */
  get attackBalance(): number {
    // Blend mentality and tempo, nudged by pressing.
    return Math.round((this.mentalityPct * 0.6) + (this.tempoPct * 0.25) + (this.pressingPct * 0.15));
  }

  /** Defence share — complement of attack. */
  get defenceBalance(): number { return 100 - this.attackBalance; }

  /** Count of outfield + GK currently placed in the XI. */
  get startersPicked(): number { return this.fieldPositions.filter(p => p.player).length; }

  /** Count of subs placed on the bench. */
  get subsPicked(): number { return this.substitutes.filter(p => p.player).length; }

  /** Average rating of the placed starting XI (0 when empty). */
  get xiAvgRating(): number {
    const placed = this.fieldPositions.filter(p => p.player);
    if (!placed.length) return 0;
    const sum = placed.reduce((a, p) => a + (p.player!.rating || 0), 0);
    return sum / placed.length;
  }

  // ============================================================
  // TEAM-RELATIVE RATING (disc colour + 5-star scale on the pitch)
  // ============================================================

  /** Cache the squad's rating spread so the star scale & disc colour are relative to THIS team. */
  private computeTeamRatingRange(): void {
    const ratings = this.players
      .map(p => p.rating)
      .filter(r => r != null && !isNaN(r as number)) as number[];
    if (!ratings.length) { this.teamRatingMin = 0; this.teamRatingMax = 0; return; }
    this.teamRatingMin = Math.min(...ratings);
    this.teamRatingMax = Math.max(...ratings);
  }

  /** Normalised position of a rating within the squad spread (0 = worst, 1 = best). */
  private relPosition(rating: number | null | undefined): number {
    if (rating == null || isNaN(rating as number)) return 0.5;
    if (this.teamRatingMax <= this.teamRatingMin) return 1;
    const t = (rating - this.teamRatingMin) / (this.teamRatingMax - this.teamRatingMin);
    return Math.max(0, Math.min(1, t));
  }

  /** Team-relative star count, 0.5 (weakest) .. 5 (best), snapped to nearest half-star. */
  relStars(rating: number | null | undefined): number {
    const raw = 0.5 + this.relPosition(rating) * 4.5;
    return Math.round(raw * 2) / 2;
  }

  /** Fill fraction (1 / 0.5 / 0) for each of the 5 star slots, given a rating. */
  starFractions(rating: number | null | undefined): number[] {
    const s = this.relStars(rating);
    const out: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (s >= i + 1) out.push(1);
      else if (s >= i + 0.5) out.push(0.5);
      else out.push(0);
    }
    return out;
  }

  /** Good/bad colour relative to the team: red (worst) → amber → green (best). */
  relColor(rating: number | null | undefined): string {
    const hue = Math.round(this.relPosition(rating) * 120); // 0 red .. 120 green
    return `hsl(${hue}, 68%, 47%)`;
  }

  /** Short qualitative label for a 0..100 intensity (used on gauges). */
  intensityLabel(pct: number): string {
    if (pct >= 75) return 'HIGH';
    if (pct >= 45) return 'MED';
    return 'LOW';
  }

  /** SVG dash offset for a circular gauge (circumference ~ 2*PI*r, r=26). */
  gaugeDash(pct: number): number {
    const circumference = 2 * Math.PI * 26;
    return circumference * (1 - pct / 100);
  }

  /** Horizontal shift (% of a cell) applied to a pitch cell so WIDTH visibly spreads/compresses the XI. */
  cellWidthShift(positionIndex: number): number {
    const factor = this.selectedOptions.width === 'Wide' ? 10
                 : this.selectedOptions.width === 'Narrow' ? -14 : 0;
    const col = positionIndex % 5;   // 0=left … 4=right
    return (col - 2) * factor;       // centre column unchanged; edges move most
  }

  /** Vertical shift (% of a cell) so DEF LINE moves the defensive BLOCK up/down with the setting. */
  cellDefLineShift(positionIndex: number): number {
    const row = Math.floor(positionIndex / 5); // 0=ST … 4=DEF … 5=GK
    const weight = [0, 0, 0.35, 0.7, 1.0, 0.3][row] ?? 0;
    const dir = this.selectedOptions.defensiveLine === 'High' ? -1
              : this.selectedOptions.defensiveLine === 'Deep' ? 1 : 0;
    return dir * weight * 35;
  }

  // ============================================================
  // PER-PLAYER ROLES + INSTRUCTIONS
  // ============================================================

  /** Open the per-player panel for a cell; toggles closed if already open. */
  openPlayerPanel(slot: PositionedPlayer, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canEdit) return;
    if (!slot.player) return;
    if (this.activeRoleSlot === slot || this.activeInstructionsSlot === slot) {
      this.closePlayerPanel();
      return;
    }
    this.activeRoleSlot = slot;
    this.activeInstructionsSlot = null;
    this.loadRolesForPlayer(slot.player);
  }

  closePlayerPanel(): void {
    this.activeRoleSlot = null;
    this.activeInstructionsSlot = null;
  }

  /** Tab switch within the open panel for a given slot. */
  showRolesTab(slot: PositionedPlayer): void {
    if (!this.canEdit) return;
    if (!slot.player) return;
    this.activeRoleSlot = slot;
    this.activeInstructionsSlot = null;
    this.loadRolesForPlayer(slot.player);
  }

  showInstructionsTab(slot: PositionedPlayer): void {
    if (!this.canEdit) return;
    if (!slot.player) return;
    this.activeInstructionsSlot = slot;
    this.activeRoleSlot = null;
    this.loadInstructionsForPosition(slot.player.position);
  }

  isPanelOpen(slot: PositionedPlayer): boolean {
    return this.activeRoleSlot === slot || this.activeInstructionsSlot === slot;
  }

  loadRolesForPlayer(player: Player): void {
    const cacheKey = `${player.id}_${player.position}`;
    if (this.roleCache.has(cacheKey)) {
      this.availableRoles = this.roleCache.get(cacheKey)!;
      return;
    }
    this.loadingRoles = true;
    this.http.get<any[]>(urlApp + `/tactic/allRoleSuitabilities/${player.id}`).subscribe({
      next: (data) => {
        this.availableRoles = (data || []).map(d => ({
          name: d.roleName,
          duties: d.duties || [],
          suitability: d.suitability,
          effectiveRating: d.effectiveRating
        }));
        this.roleCache.set(cacheKey, this.availableRoles);
        this.loadingRoles = false;
      },
      error: () => { this.availableRoles = []; this.loadingRoles = false; }
    });
  }

  selectRole(slot: PositionedPlayer, role: RoleDef, duty: string): void {
    if (!this.canEdit) return;
    slot.role = role.name;
    slot.duty = duty;
  }

  clearRole(slot: PositionedPlayer): void {
    if (!this.canEdit) return;
    slot.role = null;
    slot.duty = null;
  }

  loadInstructionsForPosition(position: string): void {
    if (this.instructionsCache.has(position)) {
      this.availableInstructions = this.instructionsCache.get(position)!;
      return;
    }
    this.loadingInstructions = true;
    this.http.get<InstructionDef[]>(urlApp + `/tactic/instructions/${position}`).subscribe({
      next: (data) => {
        this.availableInstructions = data || [];
        this.instructionsCache.set(position, this.availableInstructions);
        this.loadingInstructions = false;
      },
      error: () => { this.availableInstructions = []; this.loadingInstructions = false; }
    });
  }

  toggleInstruction(slot: PositionedPlayer, instructionName: string): void {
    if (!this.canEdit) return;
    const idx = slot.instructions.indexOf(instructionName);
    if (idx >= 0) slot.instructions.splice(idx, 1);
    else slot.instructions.push(instructionName);
  }

  hasInstruction(slot: PositionedPlayer, instructionName: string): boolean {
    return slot.instructions.includes(instructionName);
  }

  getInstructionCategories(): string[] {
    return Array.from(new Set(this.availableInstructions.map(i => i.category)));
  }

  getInstructionsByCategory(category: string): InstructionDef[] {
    return this.availableInstructions.filter(i => i.category === category);
  }

  suitabilityClass(suitability: number): string {
    if (suitability >= 80) return 'suit-excellent';
    if (suitability >= 60) return 'suit-good';
    if (suitability >= 40) return 'suit-average';
    return 'suit-poor';
  }

  /** Abbreviate an instruction name for the compact on-pitch label. */
  abbreviateInstruction(name: string): string {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('shoot') && n.includes('more')) return 'Shoot+';
    if (n.includes('shoot') && n.includes('less')) return 'Shoot−';
    if (n.includes('pass') && n.includes('short')) return 'Pass−';
    if (n.includes('pass') && n.includes('long')) return 'Pass+';
    if (n.includes('more often') || n.includes('more')) {
      return name.split(' ')[0] + '+';
    }
    if (n.includes('less often') || n.includes('less')) {
      return name.split(' ')[0] + '−';
    }
    return name.split(' ')[0];
  }

  /** Short composite label under a pitch token: duty + abbreviated instructions. */
  playerShortLabel(slot: PositionedPlayer): string {
    const parts: string[] = [];
    if (slot.duty) parts.push(slot.duty);
    for (const instr of slot.instructions) parts.push(this.abbreviateInstruction(instr));
    return parts.join(' · ');
  }
}
