import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';

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
    minRating: 0
  };

  // Dropdown-uri
  positions: string[] = ['All', 'GK', 'DL', 'DC', 'DR', 'DM', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];

  // Sortare
  sortColumn: string = 'rating';
  sortDirection: 'asc' | 'desc' = 'desc';

  constructor(private http: HttpClient, private gameEvents: GameEventsService) { }

  ngOnInit(): void {
    this.loadPlayers();
    this.loadShortlist();
    // Player ratings/ages change each game advance — refresh the pool live.
    this.sub.add(this.gameEvents.gameAdvanced$.subscribe(() => {
      this.loadPlayers();
      this.loadShortlist();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  loadPlayers() {
    this.loading = true;
    this.http.get<PlayerView[]>(urlApp + '/humans/allPlayers').subscribe(
      (data) => {
        this.allPlayers = data;
        this.applyFilters(); // Aplicăm filtrele inițiale (adică niciunul)
        this.loading = false;
      },
      (error) => {
        console.error("Error loading players", error);
        this.loading = false;
      }
    );
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

      // 6. Filter Rating
      const ratingMatch = player.rating >= this.filters.minRating;

      return nameMatch && teamMatch && posMatch && ageMatch && salaryMatch && ratingMatch;
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
      minRating: 0
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
}