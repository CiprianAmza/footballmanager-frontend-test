import { HttpClient } from '@angular/common/http';
import { Component, HostListener, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { ActivatedRoute } from '@angular/router';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

@Component({
  selector: 'app-squad', // Asigură-te că selectorul e 'app-squad'
  templateUrl: './squad.component.html',
  styleUrls: ['./squad.component.css']
})
export class SquadComponent implements OnInit, OnDestroy, OnChanges {

  @Input() teamId!: number; // Primim ID-ul de la părinte (Club Info)

  selectedOption: string = 'General Info';
  players: any[] = [];
  expiringContracts: any[] = [];

  // Unhappy players (GET /contract/unhappy/{teamId}) + promise-playing-time action
  unhappyPlayers: any[] = [];
  promiseLoading: { [key: number]: boolean } = {};
  promiseMessage: string = '';
  promiseSuccess: boolean = false;

  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  showOptions: boolean = false;
  activeIndex: number = -1;

  private sub = new Subscription();

  constructor(private http: HttpClient, private route: ActivatedRoute,
              private teamService: TeamService, private gameEvents: GameEventsService) {}

  ngOnInit() {
    // Dacă nu primim input (suntem pe ruta directă /squad), încercăm să luăm din URL sau default
    if (!this.teamId) {
        this.teamId = this.teamService.teamId;
    }
    if (this.teamId) {
        this.loadPlayers();
        this.loadExpiringContracts();
        this.loadUnhappyPlayers();
    }
    // Reload live whenever the squad changes (transfer, training, injury, game
    // advance) — no manual page refresh needed.
    this.sub.add(this.gameEvents.on('squad').subscribe(() => {
      if (this.teamId) {
        this.loadPlayers();
        this.loadExpiringContracts();
        this.loadUnhappyPlayers();
      }
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teamId'] && !changes['teamId'].firstChange) {
        this.loadPlayers();
    }
  }

  loadPlayers() {
    this.http.get<any>(urlApp + `/tactic/getPlayers/${this.teamId}`).subscribe(
      (response) => {
        this.players = response;
      },
      (error) => {
        console.error('Error fetching players:', error);
      }
    );
  }

  loadExpiringContracts() {
    this.http.get<any[]>(urlApp + `/contract/expiring/${this.teamId}`).subscribe(
      (response) => {
        this.expiringContracts = response;
      },
      (error) => {
        console.error('Error fetching expiring contracts:', error);
      }
    );
  }

  loadUnhappyPlayers() {
    this.http.get<any[]>(urlApp + `/contract/unhappy/${this.teamId}`).subscribe(
      (response) => {
        this.unhappyPlayers = response || [];
      },
      (error) => {
        console.error('Error fetching unhappy players:', error);
      }
    );
  }

  /** Only the user's own squad may be managed (backend resolves the human team). */
  get isOwnTeam(): boolean {
    return this.teamId === this.teamService.teamId;
  }

  promisePlayingTime(player: any) {
    this.promiseLoading[player.id] = true;
    this.promiseMessage = '';
    this.http.post<any>(urlApp + `/contract/promisePlayingTime`, { playerId: player.id }).subscribe(
      (res) => {
        this.promiseLoading[player.id] = false;
        this.promiseMessage = (res && res.message) || '';
        this.promiseSuccess = !!(res && res.success);
        this.loadUnhappyPlayers();
        this.loadPlayers();
      },
      (error) => {
        this.promiseLoading[player.id] = false;
        this.promiseSuccess = false;
        this.promiseMessage = (typeof error.error === 'string' ? error.error : error.error?.message) || 'Could not promise playing time.';
      }
    );
  }

  updateContent() {
    this.sortColumn = '';
  }

  sort(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc'; 
    }

    this.players.sort((a, b) => {
      let valA = a[column];
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

  onRightClick(event: MouseEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    this.activeIndex = index;
    this.showOptions = true;
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    this.showOptions = false;
    this.activeIndex = -1;
  }

  getMoraleClass(morale: number): string {
    if (morale >= 100) return 'morale-excellent';
    if (morale >= 80) return 'morale-good';
    if (morale >= 60) return 'morale-average';
    if (morale >= 40) return 'morale-poor';
    return 'morale-very-poor';
  }

  getMoraleLabel(morale: number): string {
    if (morale >= 100) return 'Excellent';
    if (morale >= 80) return 'Good';
    if (morale >= 60) return 'Average';
    if (morale >= 40) return 'Poor';
    return 'Very Poor';
  }
}