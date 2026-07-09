import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

export interface ScorerStats {
  id: number;
  playerId: number;
  name: string;
  teamName: string;
  position: string;
  age: number;
  currentRating: number;
  isActive: boolean;

  // ALL TIME STATS
  goals: number;
  matches: number;
  leagueGoals: number;
  leagueMatches: number;
  cupGoals: number;
  cupMatches: number;
  secondLeagueGoals: number;
  secondLeagueMatches: number;

  // 🔹 CURRENT SEASON STATS (Noile câmpuri)
  currentSeasonGoals: number;
  currentSeasonGames: number;
  
  currentSeasonLeagueGoals: number;
  currentSeasonLeagueGames: number;
  
  currentSeasonCupGoals: number;
  currentSeasonCupGames: number;
  
  currentSeasonSecondLeagueGoals: number;
  currentSeasonSecondLeagueGames: number;

  bestEverRating: number;
  seasonOfBestEverRating: number;
}

type TabType = 'total' | 'league' | 'cup' | 'second';
type ViewMode = 'currentSeason' | 'allTime'; // 🔹 Tip nou pentru switch

@Component({
  selector: 'app-scorer-leaderboard',
  templateUrl: './scorer-leaderboard.component.html',
  styleUrls: ['./scorer-leaderboard.component.css']
})
export class ScorerLeaderboardComponent implements OnInit {

  allPlayers: ScorerStats[] = [];
  displayedPlayers: ScorerStats[] = [];
  
  availablePositions: string[] = [];
  selectedPosition: string = 'All';

  loading: boolean = true;
  activeTab: TabType = 'total';
  
  // 🔹 Definim modul de vizualizare (Default: Sezonul Curent, că e mai relevant)
  viewMode: ViewMode = 'currentSeason'; 

  sortColumn: string = 'goals';
  sortDirection: 'desc' | 'asc' = 'desc';

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.fetchStats();
  }

  fetchStats() {
    this.loading = true;
    this.http.get<any>(`${urlApp}/stats/playerStats/leaderboard`)
      .subscribe(data => {
        this.allPlayers = Object.entries(data).map(([key, value]: [string, any]) => ({
          ...value,
          playerId: Number(key) 
        }));

        const uniquePositions = new Set(this.allPlayers.map(p => p.position).filter(p => p));
        this.availablePositions = ['All', ...Array.from(uniquePositions).sort()];

        this.applySortAndFilter();
        this.loading = false;
      });
  }

  setTab(tab: TabType) {
    this.activeTab = tab;
    this.sortColumn = 'goals'; 
    this.sortDirection = 'desc';
    this.applySortAndFilter();
  }

  // 🔹 Funcție nouă pentru schimbarea modului (Current / All Time)
  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    this.applySortAndFilter();
  }

  filterByPosition(position: string) {
    this.selectedPosition = position;
    this.applySortAndFilter();
  }

  sort(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc'; 
    }
    this.applySortAndFilter();
  }

  applySortAndFilter() {
    let temp = [...this.allPlayers];

    // Dacă suntem pe 'currentSeason', poate vrem să ascundem jucătorii care n-au jucat deloc sezonul ăsta?
    //temp = temp.filter(p => p.currentSeasonGames > 0); 
    // Dar momentan lăsăm așa.

    if (this.selectedPosition !== 'All') {
      temp = temp.filter(player => player.position === this.selectedPosition);
    }

    temp.sort((a, b) => {
      const valA = this.getSortableValue(a, this.sortColumn);
      const valB = this.getSortableValue(b, this.sortColumn);

      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.displayedPlayers = temp;
  }

  // 🔹 LOGICA COMPLEXĂ: Alege câmpul corect în funcție de Tab ȘI ViewMode
  getSortableValue(player: ScorerStats, column: string): number | string | boolean {
    // Câmpuri statice (nu depind de sezon/tab)
    if (column === 'name') return player.name;
    if (column === 'position') return player.position;
    if (column === 'isActive') return player.isActive ? 1 : 0;
    if (column === 'bestRating') return player.bestEverRating;
    if (column === 'age') return player.age;
    if (column === 'currentRating') return player.currentRating;
    if (column === 'ratingDiff') return player.currentRating - player.bestEverRating;
    let goals = 0;
    let matches = 0;

    // Aici selectăm datele corecte
    if (this.viewMode === 'allTime') {
        // --- LOGICA VECHE (ALL TIME) ---
        switch (this.activeTab) {
            case 'league':
                goals = player.leagueGoals; matches = player.leagueMatches; break;
            case 'cup':
                goals = player.cupGoals; matches = player.cupMatches; break;
            case 'second':
                goals = player.secondLeagueGoals; matches = player.secondLeagueMatches; break;
            default: // total
                goals = player.goals; matches = player.matches; break;
        }
    } else {
        // --- LOGICA NOUĂ (CURRENT SEASON) ---
        switch (this.activeTab) {
            case 'league':
                goals = player.currentSeasonLeagueGoals; matches = player.currentSeasonLeagueGames; break;
            case 'cup':
                goals = player.currentSeasonCupGoals; matches = player.currentSeasonCupGames; break;
            case 'second':
                goals = player.currentSeasonSecondLeagueGoals; matches = player.currentSeasonSecondLeagueGames; break;
            default: // total
                goals = player.currentSeasonGoals; matches = player.currentSeasonGames; break;
        }
    }

    if (column === 'goals') return goals;
    if (column === 'matches') return matches;
    if (column === 'ratio') return matches > 0 ? (goals / matches) : 0;

    return 0;
  }

  getDisplayValue(player: ScorerStats, type: 'goals' | 'matches' | 'ratio'): number | string {
    const val = this.getSortableValue(player, type);
    if (type === 'ratio') {
      return (val as number).toFixed(2);
    }
    return val as number;
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '⬍';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }
}