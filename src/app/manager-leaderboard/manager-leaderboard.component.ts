import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

interface ManagerLeaderboardEntry {
  managerId: number;
  managerName: string;
  currentTeamName: string;
  totalGames: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  winPercentage: number;
  totalTrophies: number;
  teamsManaged: number;
  seasonsManaged: number;
  reputation: number;
  compositeScore: number;
  retired: boolean;
}

@Component({
  selector: 'app-manager-leaderboard',
  templateUrl: './manager-leaderboard.component.html',
  styleUrls: ['./manager-leaderboard.component.css']
})
export class ManagerLeaderboardComponent implements OnInit {

  allManagers: ManagerLeaderboardEntry[] = [];
  displayedManagers: ManagerLeaderboardEntry[] = [];
  loading: boolean = true;
  showOnlyActive: boolean = false;

  sortColumn: string = 'compositeScore';
  sortDirection: 'asc' | 'desc' = 'desc';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchLeaderboard();
  }

  fetchLeaderboard(): void {
    this.loading = true;
    this.http.get<ManagerLeaderboardEntry[]>(`${urlApp}/managers/leaderboard`)
      .subscribe({
        next: (data) => {
          this.allManagers = data;
          this.applyFiltersAndSort();
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading manager leaderboard:', err);
          this.loading = false;
        }
      });
  }

  sort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applyFiltersAndSort();
  }

  toggleActiveFilter(): void {
    this.showOnlyActive = !this.showOnlyActive;
    this.applyFiltersAndSort();
  }

  applyFiltersAndSort(): void {
    let temp = [...this.allManagers];

    if (this.showOnlyActive) {
      temp = temp.filter(m => !m.retired);
    }

    temp.sort((a, b) => {
      const valA = (a as any)[this.sortColumn];
      const valB = (b as any)[this.sortColumn];
      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.displayedManagers = temp;
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  getReputationClass(reputation: number): string {
    if (reputation >= 150) return 'rep-elite';
    if (reputation >= 100) return 'rep-high';
    if (reputation >= 50) return 'rep-medium';
    return 'rep-low';
  }
}
