import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';
import {
  ScoutService, ScoutingEmphasis, ScoutingFocus, ScoutingFocusCatalog,
  ScoutingFocusRequest, ScoutingFocusResult, ScoutingTarget, ScoutingTargetType, TeamScout
} from '../services/scout.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';

export interface PlayerView {
  id: number;
  name: string;
  teamName: string;
  position: string;
  rating: number;
  age: number;
  salary: number;
  transferValue?: number; // Poate nu vine din Java, dar e util
  contractEndDate: string;
  fitness: number;
  morale: number;
  nationality?: string; // Adăugăm dacă vine pe viitor
  teamId?: number;
  wage?: number;
  contractEndSeason?: number;
  currentStatus?: string;
  releaseClause?: number;
  seasonAppearances?: number;
  seasonGoals?: number;
  seasonAssists?: number;
  importantAttributes?: { name: string; value: number }[];
  marketStatus?: 'AVAILABLE' | 'TRANSFERRED_THIS_SEASON' | 'LOANED';
  transferredThisSeason?: boolean;
  loanedThisSeason?: boolean;
  loaned?: boolean;
  parentTeamId?: number;
  parentTeamName?: string;
  loanTeamId?: number;
  loanTeamName?: string;
}

@Component({
  selector: 'app-scouting',
  templateUrl: './scouting.component.html',
  styleUrls: ['./scouting.component.css']
})
export class ScoutingComponent implements OnInit, OnDestroy {

  private sub = new Subscription();

  allPlayers: PlayerView[] = [];      // Lista originală (cache)
  displayedPlayers: PlayerView[] = []; // Lista filtrată (ce se vede)
  loading: boolean = true;
  errorMessage = '';
  activeView: 'database' | 'focuses' | 'reports' = 'database';

  focusCatalog: ScoutingFocusCatalog | null = null;
  teamScouts: TeamScout[] = [];
  focuses: ScoutingFocus[] = [];
  focusLoading = false;
  focusSaving = false;
  focusMessage = '';
  focusError = '';
  selectedFocus: ScoutingFocus | null = null;
  focusResults: ScoutingFocusResult[] = [];
  resultsLoading = false;
  focusForm: ScoutingFocusRequest = this.defaultFocusForm();

  shortlistedIds: Set<number> = new Set();

  // Obiectul de filtrare
  filters = {
    name: '',
    team: '',
    position: 'All',
    minAge: 15,
    maxAge: 45,
    minSalary: 0,
    maxSalary: 100000000, // Un maxim mare default
    minValue: 0,
    maxValue: 1000000000,
    minRating: 0,
    maxRating: 300,
    marketStatus: 'AVAILABLE' as 'ALL' | 'AVAILABLE' | 'TRANSFERRED' | 'LOANED'
  };

  // Dropdown-uri
  positions: string[] = ['All'];

  // Sortare
  sortColumn: string = 'rating';
  sortDirection: 'asc' | 'desc' = 'desc';

  constructor(
    private http: HttpClient,
    private gameEvents: GameEventsService,
    public teamService: TeamService,
    private scoutService: ScoutService,
    private feedback: UiFeedbackService
  ) { }

  ngOnInit(): void {
    this.loadPlayers();
    this.loadPositions();
    this.loadShortlist();
    this.loadFocusCatalog();
    this.loadFocuses();
    this.sub.add(this.teamService.teamId$.subscribe(teamId => {
      if (teamId > 0) this.loadTeamScouts(teamId);
    }));
    // Player ratings/ages change each game advance — refresh the pool live.
    this.sub.add(this.gameEvents.gameAdvanced$.subscribe(() => {
      this.loadPlayers();
      this.loadShortlist();
      this.loadFocuses();
      if (this.teamService.teamId > 0) this.loadTeamScouts(this.teamService.teamId);
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  loadPlayers() {
    this.loading = true;
    this.errorMessage = '';
    this.http.get<PlayerView[]>(urlApp + '/humans/scoutingPlayers').subscribe(
      (data) => {
        this.allPlayers = data;
        this.applyFilters(); // Aplicăm filtrele inițiale (adică niciunul)
        this.loading = false;
        this.errorMessage = '';
      },
      (error) => {
        console.error("Error loading players", error);
        this.loading = false;
        this.errorMessage = 'The scouting database could not be loaded.';
      }
    );
  }

  loadPositions() {
    this.http.get<string[]>(urlApp + '/humans/playerPositions').subscribe({
      next: positions => this.positions = ['All', ...(positions || []).filter(Boolean)],
      error: () => this.positions = ['All']
    });
  }

  contractSummary(player: PlayerView): string {
    return player.contractEndSeason && player.contractEndSeason > 0
      ? `Through Season ${player.contractEndSeason}` : 'Not available';
  }

  // 🔹 LOGICA DE FILTRARE
  applyFilters() {
    this.displayedPlayers = this.allPlayers.filter(player => {
      
      // 1. Filter Name
      const nameMatch = !this.filters.name || 
        player.name.toLowerCase().includes(this.filters.name.toLowerCase());

      // 2. Filter Team
      const teamMatch = !this.filters.team || 
        (player.teamName && player.teamName.toLowerCase().includes(this.filters.team.toLowerCase()));

      // 3. Filter Position
      const posMatch = this.filters.position === 'All' || 
        player.position === this.filters.position;

      // 4. Filter Age
      const ageMatch = player.age >= this.filters.minAge && player.age <= this.filters.maxAge;

      // 5. Filter Salary
      const salaryMatch = player.salary >= this.filters.minSalary && player.salary <= this.filters.maxSalary;

      // 6. Filter market value
      const value = player.transferValue ?? 0;
      const valueMatch = value >= this.filters.minValue && value <= this.filters.maxValue;

      // 7. Filter Rating
      const ratingMatch = player.rating >= this.filters.minRating
        && player.rating <= this.filters.maxRating;

      const marketStatusMatch = this.filters.marketStatus === 'ALL'
        || (this.filters.marketStatus === 'AVAILABLE'
          && player.transferredThisSeason !== true
          && player.loanedThisSeason !== true
          && player.loaned !== true)
        || (this.filters.marketStatus === 'TRANSFERRED' && player.transferredThisSeason === true)
        || (this.filters.marketStatus === 'LOANED' && player.loaned === true);

      return nameMatch && teamMatch && posMatch && ageMatch && salaryMatch && valueMatch && ratingMatch && marketStatusMatch;
    });

    // Re-aplicăm sortarea după filtrare
    this.sort(this.sortColumn, true); 
  }

  // 🔹 LOGICA DE SORTARE (Refolosită)
  sort(column: string, keepDirection: boolean = false) {
    if (!keepDirection) {
      if (this.sortColumn === column) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortColumn = column;
        this.sortDirection = 'desc';
      }
    }

    this.displayedPlayers.sort((a, b) => {
      // @ts-ignore
      let valA = a[column];
      // @ts-ignore
      let valB = b[column];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  resetFilters() {
    this.filters = {
      name: '',
      team: '',
      position: 'All',
      minAge: 15,
      maxAge: 45,
      minSalary: 0,
      maxSalary: 100000000,
      minValue: 0,
      maxValue: 1000000000,
      minRating: 0,
      maxRating: 300,
      marketStatus: 'AVAILABLE'
    };
    this.applyFilters();
  }

  loadShortlist() {
    this.http.get<any[]>(urlApp + '/shortlist/all').subscribe({
      next: (data) => {
        this.shortlistedIds = new Set(data.map((entry: any) => entry.playerId));
      },
      error: () => {}
    });
  }

  toggleShortlist(playerId: number, event: Event) {
    event.stopPropagation();
    if (this.isShortlisted(playerId)) {
      this.http.delete(urlApp + `/shortlist/remove/${playerId}`).subscribe(() => {
        this.shortlistedIds.delete(playerId);
      });
    } else {
      this.http.post(urlApp + `/shortlist/add/${playerId}`, {}).subscribe(() => {
        this.shortlistedIds.add(playerId);
      });
    }
  }

  isShortlisted(playerId: number): boolean {
    return this.shortlistedIds.has(playerId);
  }

  marketStatusLabel(player: PlayerView): string {
    if (player.loaned) return `On loan${player.parentTeamName ? ' from ' + player.parentTeamName : ''}`;
    if (player.transferredThisSeason) return 'Transferred this season';
    if (player.loanedThisSeason) return 'Loaned this season';
    return 'Available';
  }

  setView(view: 'database' | 'focuses' | 'reports'): void {
    this.activeView = view;
    this.focusMessage = '';
    this.focusError = '';
    if (view !== 'database') this.loadFocuses();
  }

  loadFocusCatalog(): void {
    this.scoutService.getFocusCatalog().subscribe({
      next: catalog => this.focusCatalog = catalog,
      error: () => this.focusError = 'Recruitment focus options could not be loaded.'
    });
  }

  loadTeamScouts(teamId: number): void {
    this.scoutService.getTeamScouts(teamId).subscribe({
      next: scouts => this.teamScouts = scouts,
      error: () => this.focusError = 'Your scouting team could not be loaded.'
    });
  }

  loadFocuses(): void {
    this.focusLoading = true;
    this.scoutService.getFocuses().subscribe({
      next: focuses => {
        this.focuses = focuses;
        this.focusLoading = false;
        if (this.selectedFocus) {
          this.selectedFocus = focuses.find(focus => focus.id === this.selectedFocus?.id) || null;
        }
      },
      error: () => {
        this.focusLoading = false;
        this.focusError = 'Recruitment focuses could not be loaded.';
      }
    });
  }

  get activeFocuses(): ScoutingFocus[] {
    return this.focuses.filter(focus => focus.status === 'in_progress');
  }

  get completedFocuses(): ScoutingFocus[] {
    return this.focuses.filter(focus => focus.status === 'completed');
  }

  get availableScouts(): TeamScout[] {
    return this.teamScouts.filter(scout => !scout.onAssignment);
  }

  get targetOptions(): ScoutingTarget[] {
    if (!this.focusCatalog) return [];
    if (this.focusForm.targetType === 'TEAM') return this.focusCatalog.teams;
    if (this.focusForm.targetType === 'COMPETITION') return this.focusCatalog.competitions;
    return this.focusCatalog.nations;
  }

  changeTargetType(type: ScoutingTargetType): void {
    this.focusForm.targetType = type;
    this.focusForm.targetId = 0;
  }

  toggleFocusAttribute(attribute: string): void {
    const attributes = this.focusForm.keyAttributes;
    if (attributes.includes(attribute)) {
      this.focusForm.keyAttributes = attributes.filter(value => value !== attribute);
    } else if (attributes.length < 6) {
      this.focusForm.keyAttributes = [...attributes, attribute];
    }
  }

  createFocus(): void {
    this.focusMessage = '';
    this.focusError = '';
    if (!this.focusForm.scoutId || !this.focusForm.targetId) {
      this.focusError = 'Choose an available scout and a destination.';
      return;
    }
    this.focusSaving = true;
    this.scoutService.createFocus(this.focusForm).subscribe({
      next: response => {
        this.focusSaving = false;
        this.focusMessage = response.message;
        this.focusForm = this.defaultFocusForm();
        this.loadFocuses();
        if (this.teamService.teamId > 0) this.loadTeamScouts(this.teamService.teamId);
        this.gameEvents.emit('scouting', 'staff', 'finances');
      },
      error: error => {
        this.focusSaving = false;
        this.focusError = error.error?.message || 'The recruitment focus could not be started.';
      }
    });
  }

  async cancelFocus(focus: ScoutingFocus): Promise<void> {
    const confirmed = await this.feedback.confirm(
      `Cancel ${focus.scoutName}'s search in ${focus.targetName}? The scouting cost is not refunded.`,
      { title: 'Cancel recruitment focus', confirmLabel: 'Cancel focus', tone: 'error' }
    );
    if (!confirmed) return;
    this.scoutService.cancelFocus(focus.id).subscribe({
      next: response => {
        this.focusMessage = response.message;
        this.loadFocuses();
        if (this.teamService.teamId > 0) this.loadTeamScouts(this.teamService.teamId);
        this.gameEvents.emit('scouting', 'staff');
      },
      error: error => this.focusError = error.error?.message || 'The focus could not be cancelled.'
    });
  }

  openReport(focus: ScoutingFocus): void {
    this.selectedFocus = focus;
    this.focusResults = [];
    this.resultsLoading = true;
    this.scoutService.getFocusResults(focus.id).subscribe({
      next: results => {
        this.focusResults = results;
        this.resultsLoading = false;
      },
      error: () => {
        this.resultsLoading = false;
        this.focusError = 'The scouting report could not be loaded.';
      }
    });
  }

  emphasisLabel(value: ScoutingEmphasis): string {
    const labels: Record<ScoutingEmphasis, string> = {
      BALANCED: 'Balanced profile', CURRENT_ABILITY: 'Ready now', POTENTIAL: 'Future potential',
      KEY_ATTRIBUTES: 'Key attributes', VALUE: 'Value for money'
    };
    return labels[value];
  }

  recommendationLabel(value: string): string {
    return value.split('_').map(part => part.charAt(0) + part.slice(1).toLowerCase()).join(' ');
  }

  resultAttributes(value: string): string[] {
    return value ? value.split(',').filter(Boolean) : [];
  }

  private defaultFocusForm(): ScoutingFocusRequest {
    return {
      scoutId: 0, targetType: 'TEAM', targetId: 0, position: 'ANY', minRating: 0,
      maxRating: 300, minAge: 15, maxAge: 32, keyAttributes: [], minimumAttribute: 12,
      emphasis: 'BALANCED'
    };
  }
}
