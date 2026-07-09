import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

interface Player {
  id: number;
  name: string;
  age: number;
  position: string;
  rating: number;
}

interface PositionedPlayer {
  positionIndex: number;
  player: Player | null;
  role: string | null;
  duty: string | null;
  instructions: string[];
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

@Component({
  selector: 'app-tactic',
  templateUrl: './tactic.component.html',
  styleUrls: ['./tactic.component.css']
})
export class TacticComponent implements OnInit {
  teamId!: number;
  players: Player[] = [];
  selectedPlayers: Set<number> = new Set();
  // Pretty display names for the backend formation KEYS (the engine matches on the key, not the label).
  readonly PRETTY: { [key: string]: string } = {
    '442': '4-4-2', '433': '4-3-3', '343': '3-4-3', '451': '4-5-1', '352': '3-5-2',
    '4231': '4-2-3-1', '4141': '4-1-4-1', '4411': '4-4-1-1', '4321': '4-3-2-1', '4222': '4-2-2-2',
    '3421': '3-4-2-1', '532': '5-3-2', '5212': '5-2-1-2', '541': '5-4-1', '3511': '3-5-1-1'
  };
  // Populated from the backend (best-fit first). Each entry: { key: backend key, label: pretty name }.
  formationOptions: { key: string, label: string }[] = [];
  selectedTactic: string = '442';
  allowedIndexes: number[] = [];
  fieldPositions: PositionedPlayer[] = Array.from({ length: 30 }, (_, i) => ({ positionIndex: i, player: null, role: null, duty: null, instructions: [] }));
  substitutes: PositionedPlayer[] = Array.from({ length: 5 }, (_, i) => ({ positionIndex: 30 + i, player: null, role: null, duty: null, instructions: [] }));

  showDropdown = false;

  // Role assignment
  activeRoleSlot: PositionedPlayer | null = null;
  availableRoles: RoleDef[] = [];
  loadingRoles: boolean = false;
  // Cache: position -> roles with suitability per player
  roleCache: Map<string, RoleDef[]> = new Map();

  // Instructions
  activeInstructionsSlot: PositionedPlayer | null = null;
  availableInstructions: InstructionDef[] = [];
  loadingInstructions: boolean = false;
  instructionsCache: Map<string, InstructionDef[]> = new Map();

  // Set Piece Takers
  penaltyTakerId: number | null = null;
  freeKickTakerId: number | null = null;
  cornerTakerLeftId: number | null = null;
  cornerTakerRightId: number | null = null;
  suggestedSetPieces: any = null;

  // All values are the exact backend tokens TacticalScoreService recognises — any other string is
  // resolved to 0 (neutral) by the engine, which is why the old 'Normal'/'Very Slow'/'Yes' labels
  // silently did nothing.
  mentalityOptions = ['Very Defensive', 'Defensive', 'Balanced', 'Attacking', 'Very Attacking'];
  timeWastingOptions = ['Never', 'Sometimes', 'Frequently', 'Always'];
  possessionOptions = ['Standard', 'Keep Ball', 'Free Ball Early'];
  passingOptions = ['Short', 'Normal', 'Long'];
  tempoOptions = ['Much Lower', 'Lower', 'Standard', 'Higher', 'Much Higher'];
  defensiveLineOptions = ['Deep', 'Standard', 'High'];
  pressingOptions = ['Low', 'Standard', 'High'];
  widthOptions = ['Narrow', 'Balanced', 'Wide'];

  selectedOptions = {
    mentality: 'Balanced',
    timeWasting: 'Sometimes',
    inPossession: 'Standard',
    passingType: 'Normal',
    tempo: 'Standard',
    defensiveLine: 'Standard',
    pressing: 'Low',
    width: 'Balanced'
  };

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']);
      this.loadPlayers();
      this.loadFormationOptions();
    });
  }

  // Drive the formation dropdown from the backend (already sorted best-fit first).
  loadFormationOptions(): void {
    this.http.get<{ tacticName: string, totalRating: number }[]>(urlApp + `/tactic/getAllPossibleTactics/${this.teamId}`).subscribe({
      next: (data) => {
        this.formationOptions = (data || []).map(t => ({ key: t.tacticName, label: this.PRETTY[t.tacticName] || t.tacticName }));
        if (this.formationOptions.length) {
          this.selectedTactic = this.formationOptions[0].key;
        }
        this.setFormationIndices(this.selectedTactic);
      },
      error: () => {
        this.setFormationIndices(this.selectedTactic);
      }
    });
  }

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

  // The pitch layout (which cells are active) comes from the backend, keyed by the formation KEY.
  setFormationIndices(tactic: string): void {
    if (!tactic) { this.allowedIndexes = []; return; }
    this.http.get<{ index: number, position: string }[]>(urlApp + `/tactic/formationLayout/${tactic}`).subscribe({
      next: (cells) => { this.allowedIndexes = (cells || []).map(c => c.index); },
      error: () => { this.allowedIndexes = []; }
    });
  }

  loadPlayers(): void {
    this.http.get<Player[]>(urlApp + `/tactic/getPlayers/${this.teamId}`).subscribe(
      (data) => {
        this.players = data
          .filter(player => !this.selectedPlayers.has(player.id)) // Filtrare
          .sort((x, y) => { // Sortare după încărcare
            let x1 = this.getPositionIndexForSort(x.position);
            let y1 = this.getPositionIndexForSort(y.position);
        
            if (x1 !== y1) {
              return x1 - y1; // Sortare crescătoare după poziție
            }
        
            return y.rating - x.rating; // Sortare descrescătoare după rating
          });
  
        console.log(this.players); // Acum players este sortat corect
      },
      (error) => console.error('Error loading players:', error)
    );
  }
  

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  drag(event: DragEvent, player: Player): void {
    event.dataTransfer?.setData('player', JSON.stringify(player));
  }

  drop(event: DragEvent, positionIndex: number): void {
    const playerData = event.dataTransfer?.getData('player');
    if (playerData) {
      const player = JSON.parse(playerData) as Player;
      const existingIndex = this.fieldPositions.findIndex(p => p.player?.id === player.id);

      let existingPlayer = this.fieldPositions[positionIndex];
      console.log(this.selectedPlayers, existingPlayer);
      if (existingPlayer !== null && existingPlayer.player !== null) {
        if (existingPlayer.player !== null) 
          this.selectedPlayers.delete(existingPlayer.player.id);
      } else if (this.selectedPlayers.size === 11) {
        this.loadPlayers();
        return;
      }
      if (existingIndex !== -1) {
        this.fieldPositions[existingIndex].player = null;
      }
      this.fieldPositions[positionIndex].player = player;
      this.fieldPositions[positionIndex].role = null;
      this.fieldPositions[positionIndex].duty = null;
      this.fieldPositions[positionIndex].instructions = [];
      this.selectedPlayers.add(player.id);
    }
    this.loadPlayers();
  }

  onRightClick(positionIndex: number, event: MouseEvent): void {
    event.preventDefault();

    let existingPlayer = this.fieldPositions[positionIndex];
    if (existingPlayer && existingPlayer.player) {
      this.selectedPlayers.delete(existingPlayer.player.id);
      this.fieldPositions[positionIndex].player = null;
      this.fieldPositions[positionIndex].role = null;
      this.fieldPositions[positionIndex].duty = null;
      this.fieldPositions[positionIndex].instructions = [];
      if (this.activeRoleSlot === existingPlayer) {
        this.activeRoleSlot = null;
      }
      if (this.activeInstructionsSlot === existingPlayer) {
        this.activeInstructionsSlot = null;
      }
    }
    
    this.loadPlayers();
  }

  dropSubstitute(event: DragEvent, positionIndex: number): void {
    const playerData = event.dataTransfer?.getData('player');
    if (playerData) {
      const player = JSON.parse(playerData) as Player;
      const existingIndex = this.substitutes.findIndex(p => p.player?.id === player.id);
  
      let existingPlayer = this.substitutes[positionIndex];
      if (existingPlayer !== null && existingPlayer.player !== null) {
        this.selectedPlayers.delete(existingPlayer.player.id);
      }
  
      if (existingIndex !== -1) {
        this.substitutes[existingIndex].player = null;
      }
      this.substitutes[positionIndex].player = player;
      this.selectedPlayers.add(player.id);
    }
    this.loadPlayers();
  }
  
  onRightClickSub(positionIndex: number, event: MouseEvent): void {
    event.preventDefault();
    let existingPlayer = this.substitutes[positionIndex];
    if (existingPlayer && existingPlayer.player) {
      this.selectedPlayers.delete(existingPlayer.player.id);
      this.substitutes[positionIndex].player = null;
    }
    this.loadPlayers();
  }
  removeAll(): void {
    for (let i = 0; i < this.fieldPositions.length; i++) {
      const player = this.fieldPositions[i].player;
      if (player) { // Verifică dacă player nu este null
        this.selectedPlayers.delete(player.id); // Șterge jucătorul din selectedPlayers
        this.fieldPositions[i].player = null; // Resetează poziția
      }
    }
    this.loadPlayers();
  }

  onTacticChange(selectedTactic: string): void {
    this.removeAll();
    this.setFormationIndices(selectedTactic);
  }

  getPositionIndexForSort(position: string): number { 

    let positions = ["GK", "DL", "DC", "DR", "ML", "MC", "MR", "ST"];

    return positions.indexOf(position);
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  // Funcția pentru a salva opțiunile
  saveData() {
    console.log('Tactic options saved:', this.selectedOptions);
    alert('Tactics saved successfully!');
  }

  // Role assignment methods
  openRoleSelector(slot: PositionedPlayer): void {
    if (!slot.player) return;
    if (this.activeRoleSlot === slot) {
      this.activeRoleSlot = null;
      return;
    }
    this.activeRoleSlot = slot;
    this.loadRolesForPlayer(slot.player);
  }

  closeRoleSelector(): void {
    this.activeRoleSlot = null;
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
        this.availableRoles = data.map(d => ({
          name: d.roleName,
          description: '',
          duties: d.duties || [],
          suitability: d.suitability,
          effectiveRating: d.effectiveRating
        }));
        this.roleCache.set(cacheKey, this.availableRoles);
        this.loadingRoles = false;
      },
      error: () => {
        this.availableRoles = [];
        this.loadingRoles = false;
      }
    });
  }

  selectRole(slot: PositionedPlayer, role: RoleDef, duty: string): void {
    slot.role = role.name;
    slot.duty = duty;
    this.activeRoleSlot = null;
  }

  clearRole(slot: PositionedPlayer): void {
    slot.role = null;
    slot.duty = null;
  }

  // Instruction methods
  openInstructionsPanel(slot: PositionedPlayer): void {
    if (!slot.player) return;
    if (this.activeInstructionsSlot === slot) {
      this.activeInstructionsSlot = null;
      return;
    }
    this.activeInstructionsSlot = slot;
    this.activeRoleSlot = null;
    this.loadInstructionsForPosition(slot.player.position);
  }

  closeInstructionsPanel(): void {
    this.activeInstructionsSlot = null;
  }

  loadInstructionsForPosition(position: string): void {
    if (this.instructionsCache.has(position)) {
      this.availableInstructions = this.instructionsCache.get(position)!;
      return;
    }
    this.loadingInstructions = true;
    this.http.get<InstructionDef[]>(urlApp + `/tactic/instructions/${position}`).subscribe({
      next: (data) => {
        this.availableInstructions = data;
        this.instructionsCache.set(position, data);
        this.loadingInstructions = false;
      },
      error: () => {
        this.availableInstructions = [];
        this.loadingInstructions = false;
      }
    });
  }

  toggleInstruction(slot: PositionedPlayer, instructionName: string): void {
    const idx = slot.instructions.indexOf(instructionName);
    if (idx >= 0) {
      slot.instructions.splice(idx, 1);
    } else {
      slot.instructions.push(instructionName);
    }
  }

  hasInstruction(slot: PositionedPlayer, instructionName: string): boolean {
    return slot.instructions.includes(instructionName);
  }

  getInstructionsByCategory(category: string): InstructionDef[] {
    return this.availableInstructions.filter(i => i.category === category);
  }

  getInstructionCategories(): string[] {
    const cats = new Set(this.availableInstructions.map(i => i.category));
    return Array.from(cats);
  }

  // Set piece taker methods
  getFieldPlayers(): Player[] {
    return this.fieldPositions
      .filter(p => p.player && p.player.position !== 'GK')
      .map(p => p.player!);
  }

  suggestSetPieceTakers(): void {
    this.http.get<any>(urlApp + `/tactic/suggestSetPieceTakers/${this.teamId}`).subscribe({
      next: (data) => {
        this.suggestedSetPieces = data;
        if (data.penaltyTakerId) this.penaltyTakerId = data.penaltyTakerId;
        if (data.freeKickTakerId) this.freeKickTakerId = data.freeKickTakerId;
        if (data.cornerTakerLeftId) this.cornerTakerLeftId = data.cornerTakerLeftId;
        if (data.cornerTakerRightId) this.cornerTakerRightId = data.cornerTakerRightId;
      },
      error: () => {}
    });
  }

  getSuitabilityClass(suitability: number): string {
    if (suitability >= 80) return 'suit-excellent';
    if (suitability >= 60) return 'suit-good';
    if (suitability >= 40) return 'suit-average';
    return 'suit-poor';
  }

  saveFormation(): void {
    const formationData = this.fieldPositions
      .filter(p => p.player)
      .map(p => ({
        positionIndex: p.positionIndex,
        playerId: p.player!.id,
        role: p.role,
        duty: p.duty,
        instructions: p.instructions.length > 0 ? p.instructions : null
      }));

    const substitutesData = this.substitutes
      .filter(p => p.player)
      .map(p => ({ positionIndex: p.positionIndex, playerId: p.player!.id, role: null, duty: null, instructions: null }));

    const payload: any = {
      formationDataList: [...formationData, ...substitutesData],
      teamId: this.teamId,
      tactic: this.selectedTactic,
      mentality: this.selectedOptions.mentality,
      timeWasting: this.selectedOptions.timeWasting,
      inPossession: this.selectedOptions.inPossession,
      passingType: this.selectedOptions.passingType,
      tempo: this.selectedOptions.tempo,
      defensiveLine: this.selectedOptions.defensiveLine,
      pressing: this.selectedOptions.pressing,
      width: this.selectedOptions.width,
      penaltyTakerId: this.penaltyTakerId,
      freeKickTakerId: this.freeKickTakerId,
      cornerTakerLeftId: this.cornerTakerLeftId,
      cornerTakerRightId: this.cornerTakerRightId
    };
  
    console.log("Sending data:", JSON.stringify(payload));
  
    this.http.post(urlApp + '/tactic/saveFormation', payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe(
      () => alert('Formation saved!'),
      (error) => console.error('Error saving formation:', error)
    );
  }
  
}
