import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameEventsService } from '../services/game-events.service';
import { SquadInsightOverview, SquadInsightPlayer, SquadInsightsService } from '../services/squad-insights.service';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-squad2',
  templateUrl: './squad2.component.html',
  styleUrls: ['./squad2.component.css']
})
export class Squad2Component implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  teamId = 0;
  overview?: SquadInsightOverview;
  players: SquadInsightPlayer[] = [];
  selectedPlayer?: SquadInsightPlayer;
  matchdayIds = new Set<number>();
  search = '';
  positionFilter = 'ALL';
  statusFilter = 'ALL';
  sortBy = 'readiness';
  loading = true;
  error = '';
  private readonly sub = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teamService: TeamService,
    private insights: SquadInsightsService,
    private gameEvents: GameEventsService) {}

  ngOnInit(): void {
    this.teamId = Number(this.route.snapshot.paramMap.get('teamId')) || this.teamService.teamId;
    if (this.teamId) {
      this.restoreSelection();
      this.load();
    } else {
      this.sub.add(this.teamService.teamId$.subscribe(teamId => {
        if (teamId > 0 && teamId !== this.teamId) {
          this.teamId = teamId;
          this.restoreSelection();
          this.load();
        }
      }));
    }
    this.sub.add(this.gameEvents.on('squad').subscribe(() => this.load(false)));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  load(showSpinner = true): void {
    if (!this.teamId) return;
    if (showSpinner) this.loading = true;
    this.insights.load(this.teamId).subscribe({
      next: overview => {
        this.overview = overview;
        this.players = overview.players;
        const previousId = this.selectedPlayer?.id;
        this.selectedPlayer = this.players.find(player => player.id === previousId)
          || this.filteredPlayers[0];
        this.loading = false;
        this.error = '';
      },
      error: error => {
        this.loading = false;
        this.error = error.status === 403
          ? 'Private squad insights are available only for your own club.'
          : 'The squad overview could not be loaded.';
      }
    });
  }

  get positions(): string[] {
    return [...new Set(this.players.map(player => player.position))].sort();
  }

  get filteredPlayers(): SquadInsightPlayer[] {
    const query = this.search.trim().toLowerCase();
    return this.players
      .filter(player => !query || player.name.toLowerCase().includes(query) || player.position.toLowerCase().includes(query))
      .filter(player => this.positionFilter === 'ALL' || player.position === this.positionFilter)
      .filter(player => {
        if (this.statusFilter === 'AVAILABLE') return player.availability.length === 0;
        if (this.statusFilter === 'UNAVAILABLE') return player.availability.length > 0;
        if (this.statusFilter === 'AT_RISK') return player.transferRisk !== 'LOW';
        if (this.statusFilter === 'LOW_FITNESS') return player.fitness < 80;
        return true;
      })
      .sort((a, b) => {
        if (this.sortBy === 'name') return a.name.localeCompare(b.name);
        if (this.sortBy === 'age') return a.age - b.age;
        if (this.sortBy === 'rating') return b.rating - a.rating;
        if (this.sortBy === 'fitness') return b.fitness - a.fitness;
        return b.readiness - a.readiness;
      });
  }

  get availableCount(): number { return this.players.filter(player => !player.availability.length).length; }
  get selectedCount(): number { return this.matchdayIds.size; }
  get averageFitness(): number {
    return this.players.length ? Math.round(this.players.reduce((sum, player) => sum + player.fitness, 0) / this.players.length) : 0;
  }
  get riskCount(): number { return this.players.filter(player => player.transferRisk !== 'LOW').length; }

  selectPlayer(player: SquadInsightPlayer): void { this.selectedPlayer = player; }

  toggleMatchday(player: SquadInsightPlayer, event?: MouseEvent): void {
    event?.stopPropagation();
    if (player.availability.length) return;
    this.matchdayIds.has(player.id) ? this.matchdayIds.delete(player.id) : this.matchdayIds.add(player.id);
    this.matchdayIds = new Set(this.matchdayIds);
    localStorage.setItem(this.selectionKey, JSON.stringify([...this.matchdayIds]));
  }

  availabilityLabel(player: SquadInsightPlayer): string {
    if (!player.availability.length) return 'Available';
    return player.availability.map(reason => reason.type === 'INJURY' ? 'Injured' : 'Suspended').join(' · ');
  }

  openPlayer(player = this.selectedPlayer): void {
    if (player) this.router.navigate(['/player', player.id], { queryParams: { actingTeamId: this.teamId } });
  }

  readinessTone(value: number): string {
    return value >= 85 ? 'good' : value >= 70 ? 'okay' : 'poor';
  }

  formatMoney(value: number): string {
    if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `€${Math.round(value / 1_000)}K`;
    return `€${value || 0}`;
  }

  @HostListener('window:keydown', ['$event'])
  handleShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!typing && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
      return;
    }
    if (typing) return;
    if (event.key === 'j' || event.key === 'k') {
      const list = this.filteredPlayers;
      if (!list.length) return;
      const current = Math.max(0, list.findIndex(player => player.id === this.selectedPlayer?.id));
      const next = event.key === 'j' ? Math.min(list.length - 1, current + 1) : Math.max(0, current - 1);
      this.selectedPlayer = list[next];
    }
    if (event.code === 'Space' && this.selectedPlayer) {
      event.preventDefault();
      this.toggleMatchday(this.selectedPlayer);
    }
    if (event.key.toLowerCase() === 'p') this.openPlayer();
    if (event.key.toLowerCase() === 't') this.router.navigate(['/tactics', this.teamId]);
    if (event.key.toLowerCase() === 'm') this.router.navigate(['/medical']);
  }

  private get selectionKey(): string { return `matchday-selection-${this.teamId}`; }
  private restoreSelection(): void {
    try {
      this.matchdayIds = new Set(JSON.parse(localStorage.getItem(this.selectionKey) || '[]'));
    } catch {
      this.matchdayIds = new Set();
    }
  }
}
