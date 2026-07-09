// ... (Importurile și interfețele rămân la fel) ...
import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { forkJoin } from 'rxjs';
import { TeamService } from '../services/team.service';
import { RatingTierService } from '../services/rating-tier.service';
import { CoachPermissionsService, CoachLockState } from '../services/coach-permissions.service';

// ... (Interfețele Player, PositionedPlayer, SavedTactic rămân la fel) ...
interface Player {
    id: number;
    name: string;
    age: number;
    position: string;
    rating: number;
    condition?: number;
    sharpness?: number;
}

interface PositionedPlayer {
    positionIndex: number;
    player: Player | null;
    role?: string | null;
    duty?: string | null;
    instructions?: string[];
}

interface InstructionDef {
    name: string;
    category: string;
    description: string;
}

interface RoleDef {
    name: string;
    description: string;
    duties: string[];
    suitability?: number;
    effectiveRating?: number;
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
    // New team-level instruction controls (backend already accepts them).
    dribbling?: string;
    foulFrequency?: string;
    foulHardness?: string;
    tempoFragmentation?: string;
    widePlay?: string;
    transition?: string;
    // Set-piece taker ids (backend persists/returns these).
    penaltyTakerId?: number | null;
    freeKickTakerId?: number | null;
    cornerTakerLeftId?: number | null;
    cornerTakerRightId?: number | null;
    formationDataList: { positionIndex: number; playerId: number; role?: string | null; duty?: string | null; instructions?: string[] | null }[];
}

@Component({
  selector: 'app-tactics1',
  templateUrl: './tactics1.component.html',
  styleUrls: ['./tactics1.component.css']
})
export class Tactics1Component implements OnInit, OnChanges {

  @Input() teamId!: number; // Input pentru reutilizare

  // ... (restul variabilelor de state rămân la fel) ...
  players: Player[] = [];
  selectedPlayers: Set<number> = new Set();
  fieldPositions: PositionedPlayer[] = Array.from({ length: 30 }, (_, i) => ({ positionIndex: i, player: null, role: null, duty: null, instructions: [] }));
  substitutes: PositionedPlayer[] = Array.from({ length: 7 }, (_, i) => ({ positionIndex: 30 + i, player: null, role: null, duty: null, instructions: [] }));

  // ... (restul opțiunilor și configurațiilor) ...
  // Pretty display names for the backend formation KEYS (the engine matches on the key, not the label).
  readonly PRETTY: { [key: string]: string } = {
    '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1', '352': '3-5-2',
    '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1', '4321': '4-3-2-1', '4222': '4-2-2-2',
    '3421': '3-4-2-1', '532': '5-3-2', '5212': '5-2-1-2', '541': '5-4-1', '3511': '3-5-1-1'
  };
  // Populated from the backend (best-fit first). Each entry: { key: backend key, label: pretty name }.
  formationOptions: { key: string, label: string }[] = [];
  selectedTactic: string = "442";
  allowedIndexes: number[] = [];
  activeModal: string | null = null;

  optionsData: { [key: string]: string[] } = {
    mentality: ['Very Defensive', 'Defensive', 'Balanced', 'Attacking', 'Very Attacking'],
    formation: [],
    possession: ['Keep Ball', 'Standard', 'Free Ball Early'],
    passing: ['Short', 'Normal', 'Long'],
    tempo: ['Much Lower', 'Lower', 'Standard', 'Higher', 'Much Higher'],
    timeWasting: ['Never', 'Sometimes', 'Frequently', 'Always'],
    defensiveLine: ['Deep', 'Standard', 'High'],
    pressing: ['Low', 'Standard', 'High'],
    width: ['Narrow', 'Balanced', 'Wide'],
    // New team-level instruction controls.
    dribbling: ['Less', 'Standard', 'More'],
    foulFrequency: ['Rarely', 'Normal', 'Often'],
    foulHardness: ['Soft', 'Medium', 'Hard'],
    tempoFragmentation: ['Flowing', 'Normal', 'Fragment'],
    widePlay: ['Cut Inside', 'Shoot', 'Cross'],
    transition: ['Win Fouls', 'Balanced', 'Fast Counter']
  };

  selectedOptions = {
    mentality: 'Balanced',
    formation: '442',
    possession: 'Standard',
    passing: 'Normal',
    tempo: 'Standard',
    timeWasting: 'Sometimes',
    defensiveLine: 'Standard',
    pressing: 'Low',
    width: 'Balanced',
    // New team-level instruction controls.
    dribbling: 'Standard',
    foulFrequency: 'Normal',
    foulHardness: 'Medium',
    tempoFragmentation: 'Normal',
    widePlay: 'Shoot',
    transition: 'Balanced'
  };

  // ---- Per-player Roles + Instructions popup state ----
  activeRoleSlot: PositionedPlayer | null = null;
  availableRoles: RoleDef[] = [];
  loadingRoles: boolean = false;
  roleCache: Map<string, RoleDef[]> = new Map();

  activeInstructionsSlot: PositionedPlayer | null = null;
  availableInstructions: InstructionDef[] = [];
  loadingInstructions: boolean = false;
  instructionsCache: Map<string, InstructionDef[]> = new Map();

  // ---- Set-piece takers ----
  penaltyTakerId: number | null = null;
  freeKickTakerId: number | null = null;
  cornerTakerLeftId: number | null = null;
  cornerTakerRightId: number | null = null;
  suggestedSetPieces: any = null;

  // Boardroom XI-lock state: 🔒 + drag-disable for locked slots / revoked XI rights.
  lockState: CoachLockState = new CoachLockState(true, new Set<number>(), new Set<string>());

  constructor(private route: ActivatedRoute, private http: HttpClient,
              private teamService: TeamService, public ratingTiers: RatingTierService,
              private coachPermissions: CoachPermissionsService) {}

  /** A pitch cell is locked when the owner revoked XI picking or pinned this slot. */
  isSlotLocked(positionIndex: number, position?: string): boolean {
    return this.lockState.isSlotLocked(positionIndex, position);
  }

  ngOnInit(): void {
    if (this.teamId) {
        this.loadData();
    } else {
        // Fallback la ruta dacă nu e pasat ca input
        this.route.params.subscribe(params => {
            this.teamId = Number(params['teamId']) || this.teamService.teamId;
            this.loadData();
        });
    }
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
    // Boardroom permissions: which XI slots are locked (or whether the coach
    // may pick the XI at all). Drives lock icons + drag-disable on the pitch.
    this.coachPermissions.getLockState(this.teamId).subscribe(state => this.lockState = state);

    // Team metadata for branding the shirts
    this.http.get<any>(urlApp + `/teams/info/${this.teamId}`).subscribe({
      next: (info) => {
        if (info?.color1) this.teamColor1 = this.normalizeColor(info.color1);
        if (info?.color2) this.teamColor2 = this.normalizeColor(info.color2);
      }
    });

    forkJoin({
      players: this.http.get<Player[]>(urlApp + `/tactic/getPlayers/${this.teamId}`),
      savedTactic: this.http.get<SavedTactic>(urlApp + `/tactic/getFormation/${this.teamId}`),
      tactics: this.http.get<{ tacticName: string, totalRating: number }[]>(urlApp + `/tactic/getAllPossibleTactics/${this.teamId}`)
    }).subscribe({
      next: (response) => {
         // ... logica existentă ...
         this.players = response.players.map(p => ({...p, condition: 95, sharpness: 88})).sort((a, b) => b.rating - a.rating);

         // Drive the formation dropdown from the backend (already sorted best-fit first).
         this.formationOptions = (response.tactics || []).map(t => ({
             key: t.tacticName,
             label: this.PRETTY[t.tacticName] || t.tacticName
         }));
         this.optionsData['formation'] = this.formationOptions.map(o => o.key);
         const firstKey = this.formationOptions.length ? this.formationOptions[0].key : '442';

         if (response.savedTactic) {
             const data = response.savedTactic;
             this.selectedTactic = data.tactic || firstKey;
             this.selectedOptions.mentality = data.mentality || "Balanced";
             this.selectedOptions.possession = data.inPossession || "Standard";
             this.selectedOptions.tempo = data.tempo || "Standard";
             this.selectedOptions.passing = data.passingType || "Normal";
             this.selectedOptions.timeWasting = data.timeWasting || "Sometimes";
             this.selectedOptions.defensiveLine = data.defensiveLine || "Standard";
             this.selectedOptions.pressing = data.pressing || "Low";
             this.selectedOptions.width = data.width || "Balanced";
             this.selectedOptions.dribbling = data.dribbling || "Standard";
             this.selectedOptions.foulFrequency = data.foulFrequency || "Normal";
             this.selectedOptions.foulHardness = data.foulHardness || "Medium";
             this.selectedOptions.tempoFragmentation = data.tempoFragmentation || "Normal";
             this.selectedOptions.widePlay = data.widePlay || "Shoot";
             this.selectedOptions.transition = data.transition || "Balanced";
             this.penaltyTakerId = data.penaltyTakerId ?? null;
             this.freeKickTakerId = data.freeKickTakerId ?? null;
             this.cornerTakerLeftId = data.cornerTakerLeftId ?? null;
             this.cornerTakerRightId = data.cornerTakerRightId ?? null;
             this.setFormationIndices(this.selectedTactic);
             if (data.formationDataList) {
                this.mapSavedPlayersToField(data.formationDataList);
             }
         } else {
             this.selectedTactic = firstKey;
             this.setFormationIndices(this.selectedTactic);
         }
      },
      error: (err) => console.error("Error loading tactic data", err)
    });
  }

  // Pretty label for the currently selected backend key (used by the control-box + modal).
  formationLabel(key: string): string {
    return this.PRETTY[key] || key;
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

  /** Vertical position (% from top of pitch) of the visual defensive-line overlay.
   *  The pitch is drawn with the own goal/GK at the BOTTOM and strikers at the TOP,
   *  so "Deep" sits low near our goal and "High" pushes up the pitch.
   *  Presentation-only; does not touch the saved tactic. */
  get defLineTopPercent(): number {
    return this.selectedOptions.defensiveLine === 'High' ? 56
         : this.selectedOptions.defensiveLine === 'Deep' ? 76
         : 68; // Standard sits at the back line (~68% from top)
  }

  // ... (Restul clasei e la fel) ...
  mapSavedPlayersToField(savedPositions: { positionIndex: number; playerId: number; role?: string | null; duty?: string | null; instructions?: string[] | null }[]) {
      this.removeAll();
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
  openModal(type: string): void { this.activeModal = type; }
  closeModal(): void { this.activeModal = null; }
  get currentOptions(): string[] { return this.activeModal ? this.optionsData[this.activeModal] || [] : []; }
  selectOption(option: string): void {
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
          this.selectedTactic = option;
          this.setFormationIndices(option);
      }
      this.closeModal();
  }
  setFormationIndices(tactic: string) {
      this.removeAll();
      if (!tactic) { this.allowedIndexes = []; return; }
      // The pitch layout (which cells are active) comes from the backend, keyed by the formation KEY.
      this.http.get<{ index: number, position: string }[]>(urlApp + `/tactic/formationLayout/${tactic}`).subscribe({
          next: (cells) => { this.allowedIndexes = (cells || []).map(c => c.index); },
          error: () => { this.allowedIndexes = []; }
      });
  }
  allowDrop(event: DragEvent): void { event.preventDefault(); }
  drag(event: DragEvent, player: Player): void { if (event.dataTransfer) event.dataTransfer.setData('player', JSON.stringify(player)); }
  drop(event: DragEvent, positionIndex: number): void {
      if (!this.allowedIndexes.includes(positionIndex)) return;
      // Owner locked this slot (or revoked XI picking): refuse the drop.
      if (this.isSlotLocked(positionIndex, this.fieldPositions[positionIndex]?.player?.position)) return;
      const playerData = event.dataTransfer?.getData('player');
      if (playerData) {
          const player = JSON.parse(playerData) as Player;
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
      const playerData = event.dataTransfer?.getData('player');
      if (playerData) {
          const player = JSON.parse(playerData) as Player;
          this.removePlayerFromCurrentPosition(player.id);
          const targetSpot = this.substitutes[subIndex];
          if (targetSpot.player) this.selectedPlayers.delete(targetSpot.player.id);
          this.substitutes[subIndex].player = player;
          this.selectedPlayers.add(player.id);
      }
  }
  removePlayerFromCurrentPosition(playerId: number) {
      const existingFieldIndex = this.fieldPositions.findIndex(p => p.player?.id === playerId);
      if (existingFieldIndex !== -1) {
          const c = this.fieldPositions[existingFieldIndex];
          c.player = null; c.role = null; c.duty = null; c.instructions = [];
      }
      const existingSubIndex = this.substitutes.findIndex(p => p.player?.id === playerId);
      if (existingSubIndex !== -1) this.substitutes[existingSubIndex].player = null;
  }
  onRightClick(positionIndex: number, event: MouseEvent): void {
      event.preventDefault();
      // Locked slots are read-only — don't allow removing the pinned player.
      if (this.isSlotLocked(positionIndex, this.fieldPositions[positionIndex]?.player?.position)) return;
      const pos = this.fieldPositions[positionIndex];
      if (pos.player) {
          this.selectedPlayers.delete(pos.player.id);
          pos.player = null;
          pos.role = null; pos.duty = null; pos.instructions = [];
          if (this.activeRoleSlot === pos) this.activeRoleSlot = null;
          if (this.activeInstructionsSlot === pos) this.activeInstructionsSlot = null;
      }
  }
  removeAll(): void {
      this.fieldPositions.forEach(p => { p.player = null; p.role = null; p.duty = null; p.instructions = []; });
      this.substitutes.forEach(p => p.player = null);
      this.selectedPlayers.clear();
      this.activeRoleSlot = null;
      this.activeInstructionsSlot = null;
  }

  // ---- Per-player Roles popup ----
  openRoleSelector(slot: PositionedPlayer): void {
      if (!slot.player) return;
      if (this.activeRoleSlot === slot) { this.activeRoleSlot = null; return; }
      this.activeRoleSlot = slot;
      this.activeInstructionsSlot = null;
      this.loadRolesForPlayer(slot.player);
  }
  closeRoleSelector(): void { this.activeRoleSlot = null; }
  loadRolesForPlayer(player: Player): void {
      const cacheKey = `${player.id}_${player.position}`;
      if (this.roleCache.has(cacheKey)) { this.availableRoles = this.roleCache.get(cacheKey)!; return; }
      this.loadingRoles = true;
      // allRoleSuitabilities returns role names + duties + suitability in one shot.
      this.http.get<any[]>(urlApp + `/tactic/allRoleSuitabilities/${player.id}`).subscribe({
          next: (data) => {
              this.availableRoles = (data || []).map(d => ({
                  name: d.roleName,
                  description: '',
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
      slot.role = role.name;
      slot.duty = duty;
      // Keep the popup open after picking a role/duty — the user closes it via × or backdrop click.
  }
  clearRole(slot: PositionedPlayer): void { slot.role = null; slot.duty = null; }
  getSuitabilityClass(suitability: number): string {
      if (suitability >= 80) return 'suit-excellent';
      if (suitability >= 60) return 'suit-good';
      if (suitability >= 40) return 'suit-average';
      return 'suit-poor';
  }

  // ---- Per-player Instructions popup ----
  openInstructionsPanel(slot: PositionedPlayer): void {
      if (!slot.player) return;
      if (this.activeInstructionsSlot === slot) { this.activeInstructionsSlot = null; return; }
      this.activeInstructionsSlot = slot;
      this.activeRoleSlot = null;
      this.loadInstructionsForPosition(slot.player.position);
  }
  closeInstructionsPanel(): void { this.activeInstructionsSlot = null; }
  loadInstructionsForPosition(position: string): void {
      if (this.instructionsCache.has(position)) { this.availableInstructions = this.instructionsCache.get(position)!; return; }
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
      if (!slot.instructions) slot.instructions = [];
      const idx = slot.instructions.indexOf(instructionName);
      if (idx >= 0) slot.instructions.splice(idx, 1);
      else slot.instructions.push(instructionName);
  }
  hasInstruction(slot: PositionedPlayer, instructionName: string): boolean {
      return !!slot.instructions && slot.instructions.includes(instructionName);
  }
  getInstructionsByCategory(category: string): InstructionDef[] {
      return this.availableInstructions.filter(i => i.category === category);
  }
  getInstructionCategories(): string[] {
      return Array.from(new Set(this.availableInstructions.map(i => i.category)));
  }

  /** Short label under a player: duty + abbreviated instructions. e.g. "Support · Shoot+ · Pass+". */
  playerShortLabel(cell: PositionedPlayer): string {
      const parts: string[] = [];
      if (cell.duty) parts.push(cell.duty);
      (cell.instructions || []).forEach(i => parts.push(this.abbreviateInstruction(i)));
      return parts.join(' · ');
  }
  abbreviateInstruction(name: string): string {
      if (!name) return '';
      const n = name.toLowerCase();
      if (n.includes('more often') || n.includes('more')) {
          return name.split(' ')[0] + '+';
      }
      if (n.includes('less often') || n.includes('fewer') || n.includes('less')) {
          return name.split(' ')[0] + '−'; // minus sign
      }
      if (n.includes('shorter')) return name.split(' ')[0] + '−';
      if (n.includes('longer') || n.includes('direct')) return name.split(' ')[0] + '+';
      return name.split(' ')[0];
  }
  isPlayerSelected(playerId: number): boolean { return this.selectedPlayers.has(playerId); }
  askAssistant(): void {
      this.http.get<{ positionIndex: number; playerId: number }[]>(
          urlApp + `/tactic/askAssistant/${this.teamId}/${encodeURIComponent(this.selectedTactic)}`
      ).subscribe({
          next: (positions) => {
              this.mapSavedPlayersToField(positions);
          },
          error: (err) => console.error('Error asking assistant:', err)
      });
  }

  /** Pull backend-suggested set-piece takers and pre-fill the four selectors. */
  suggestSetPieceTakers(): void {
      this.http.get<any>(urlApp + `/tactic/suggestSetPieceTakers/${this.teamId}`).subscribe({
          next: (data) => {
              this.suggestedSetPieces = data;
              if (data?.penaltyTakerId) this.penaltyTakerId = data.penaltyTakerId;
              if (data?.freeKickTakerId) this.freeKickTakerId = data.freeKickTakerId;
              if (data?.cornerTakerLeftId) this.cornerTakerLeftId = data.cornerTakerLeftId;
              if (data?.cornerTakerRightId) this.cornerTakerRightId = data.cornerTakerRightId;
          },
          error: (err) => console.error('Error suggesting set-piece takers:', err)
      });
  }

  saveData() {
      const formationData = this.fieldPositions.filter(p => p.player).map(p => ({
          positionIndex: p.positionIndex,
          playerId: p.player!.id,
          role: p.role || null,
          duty: p.duty || null,
          instructions: (p.instructions && p.instructions.length > 0) ? p.instructions : null
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
      this.http.post(urlApp + '/tactic/saveFormation', payload).subscribe(
          () => alert('Tactics saved successfully!'),
          (error) => console.error('Error saving tactics:', error)
      );
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
}
