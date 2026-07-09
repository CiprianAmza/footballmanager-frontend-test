import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component'; // Sau calea corectă către urlApp
import { forkJoin, map } from 'rxjs';

interface LeaderboardEntry {
  playerId: number;
  teamId: number;
  competitionWins: number;
  championships: number;
  cups: number;
  totalPoints: number;
  isActive: boolean;
  playerName?: string; // Câmp opțional, îl populăm noi
}

@Component({
  selector: 'app-player-leaderboard',
  templateUrl: './player-leaderboard.component.html',
  styleUrls: ['./player-leaderboard.component.css']
})
export class PlayerLeaderboardComponent implements OnInit {

  allPlayers: LeaderboardEntry[] = []; // Lista completă originală
  displayedPlayers: LeaderboardEntry[] = []; // Lista filtrată și sortată afișată
  
  loading: boolean = true;
  showOnlyActive: boolean = false; // Filtru implicit

  // Configurare sortare
  sortColumn: string = 'totalPoints'; // Coloana implicită
  sortDirection: 'asc' | 'desc' = 'desc'; // Direcția implicită

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.fetchLeaderboard();
  }

  fetchLeaderboard() {
    this.loading = true;
    this.http.get<any>(`${urlApp}/history/playerCompetitionWins/leaderboard`)
      .subscribe(data => {
        // 1. Convertim Map-ul (Object) primit de la Java într-un Array
        // Cheia este playerId, Valoarea este obiectul
        const rawList: LeaderboardEntry[] = Object.entries(data).map(([key, value]: [string, any]) => ({
          ...value,
          playerId: Number(key) // Setăm manual ID-ul din cheia Map-ului
        }));

        // 2. Optimizare: Preluăm numele doar pentru primii 50-100 sau toți (depinde de mărimea bazei de date)
        // Aici preluăm pentru toți, dar asincron.
        if (rawList.length === 0) {
            this.loading = false;
            return;
        }

        const nameRequests = rawList.map(player => 
          this.http.get(`${urlApp}/humans/${player.playerId}`).pipe(
            map((humanData: any) => {
              player.playerName = humanData.name; // Presupunem că endpoint-ul /humans/{id} returnează un obiect cu 'name'
              return player;
            })
          )
        );

        // Așteptăm să se încarce numele
        forkJoin(nameRequests).subscribe(playersWithNames => {
          this.allPlayers = playersWithNames;
          this.applyFiltersAndSort(); // Inițializăm tabelul
          this.loading = false;
        });
      });
  }

  // Funcția de sortare apelată din HTML
  sort(column: string) {
    if (this.sortColumn === column) {
      // Dacă apăsăm pe aceeași coloană, schimbăm direcția
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc'; // Reset la descrescător pentru coloane noi (de obicei vrem să vedem cine are cele mai multe)
    }
    this.applyFiltersAndSort();
  }

  // Funcția de filtrare (Active / All)
  toggleActiveFilter() {
    this.showOnlyActive = !this.showOnlyActive;
    this.applyFiltersAndSort();
  }

  // Logica centrală de procesare a listei
  applyFiltersAndSort() {
    let temp = [...this.allPlayers];

    // 1. Filtrare
    if (this.showOnlyActive) {
      temp = temp.filter(p => p.isActive);
    }

    // 2. Sortare
    temp.sort((a, b) => {
      // @ts-ignore - ignorăm verificarea strictă de tip pentru acces dinamic
      const valA = a[this.sortColumn];
      // @ts-ignore
      const valB = b[this.sortColumn];

      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.displayedPlayers = temp;
  }
  
  // Helper pentru a pune iconița de sortare
  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '⬍'; // Simbol neutru
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }
}