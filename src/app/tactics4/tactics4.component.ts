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

@Component({
  selector: 'app-tactics4',
  templateUrl: './tactics4.component.html',
  styleUrls: ['./tactics4.component.css']
})
export class Tactics4Component implements OnInit, OnChanges {

  @Input() teamId!: number; // Input pentru reutilizare

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
      tactics: this.http.get<{ tacticName: string; totalRating: number }[]>(urlApp + `/tactic/getAllPossibleTactics/${this.teamId}`)
    }).subscribe({
      next: (response) => {
         // ... logica existentă ...
         this.players = response.players.map(p => ({...p, condition: 95, sharpness: 88})).sort((a, b) => b.rating - a.rating);
         this.computeTeamRatingRange();
         // Drive the formation list from the backend (best-fit first). KEY is saved/sent,
         // pretty label is display-only.
         this.formationOptions = (response.tactics || []).map(t => ({
             key: t.tacticName,
             label: this.PRETTY[t.tacticName] || t.tacticName
         }));
         const savedKey = response.savedTactic?.tactic;
         const defaultKey = savedKey || this.formationOptions[0]?.key || "442";
         if (response.savedTactic) {
             const data = response.savedTactic;
             this.selectedTactic = defaultKey;
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
             this.selectedTactic = defaultKey;
             this.setFormationIndices(this.selectedTactic);
         }
      },
      error: (err) => console.error("Error loading tactic data", err)
    });
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
  // For the formation modal we show pretty labels (mapped back to KEY on select);
  // every other modal keeps its plain string options.
  get currentOptions(): string[] {
      if (!this.activeModal) return [];
      if (this.activeModal === 'formation') return this.formationOptions.map(o => o.label);
      return this.optionsData[this.activeModal] || [];
  }
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
      this.removeAll();
      this.allowedIndexes = [];
      if (!tactic) return;
      this.http.get<{ index: number; position: string }[]>(urlApp + `/tactic/formationLayout/${tactic}`).subscribe({
          next: (cells) => { this.allowedIndexes = (cells || []).map(c => c.index); },
          error: (err) => console.error('Error loading formation layout', err)
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
      if (existingFieldIndex !== -1) this.fieldPositions[existingFieldIndex].player = null;
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
          pos.role = null;
          pos.duty = null;
          pos.instructions = [];
          if (this.activeRoleSlot === pos) this.activeRoleSlot = null;
          if (this.activeInstructionsSlot === pos) this.activeInstructionsSlot = null;
      }
  }
  removeAll(): void {
      this.fieldPositions.forEach(p => { p.player = null; p.role = null; p.duty = null; p.instructions = []; });
      this.substitutes.forEach(p => { p.player = null; p.role = null; p.duty = null; p.instructions = []; });
      this.selectedPlayers.clear();
      this.activeRoleSlot = null;
      this.activeInstructionsSlot = null;
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

  saveData() {
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
      this.http.post(urlApp + '/tactic/saveFormation', payload).subscribe(
          () => alert('Tactics saved successfully!'),
          (error) => console.error('Error saving tactics:', error)
      );
  }

  // ===== Set Piece Takers =====
  /** Ask the backend for the best takers and apply them to the four slots. */
  suggestSetPieceTakers(): void {
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
    if (!slot.player) return;
    this.activeRoleSlot = slot;
    this.activeInstructionsSlot = null;
    this.loadRolesForPlayer(slot.player);
  }

  showInstructionsTab(slot: PositionedPlayer): void {
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
    slot.role = role.name;
    slot.duty = duty;
  }

  clearRole(slot: PositionedPlayer): void {
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
