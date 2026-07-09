import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { urlApp } from '../app.component'; // Ajusteaza calea daca e nevoie

// Interfata bruta de la Backend
interface CompetitionHistory {
  id: number;
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
  seasonNumber: number;
  lastPosition: number; // 1, 2 sau 3
}

// Interfata procesata pentru UI
interface DetailedStat {
  competitionId: number;
  competitionName: string;
  typeId: number;
  championYears: number[];
  runnerUpYears: number[];
  thirdPlaceYears: number[];
  totalWins: number;
}

@Component({
  selector: 'app-team-history',
  templateUrl: './team-history.component.html',
  styleUrls: ['./team-history.component.css']
})
export class TeamHistoryComponent implements OnInit {

  teamId!: number;
  teamName: string = '';
  historyStats: DetailedStat[] = [];
  loading: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']);
      this.loadHistory();
    });
  }

  loadHistory() {
    this.loading = true;
    
    const nameReq = this.http.get(urlApp + `/teams/getTeamNameById/${this.teamId}`, { responseType: 'text' });
    const historyReq = this.http.get<CompetitionHistory[]>(urlApp + `/history/teamCompetitionWins/${this.teamId}`);

    forkJoin([nameReq, historyReq]).subscribe({
      next: ([name, historyData]) => {
        this.teamName = name;
        this.processHistory(historyData);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  processHistory(data: CompetitionHistory[]) {
    const map = new Map<number, DetailedStat>();

    data.forEach(h => {
      // Ignoram locurile mai jos de 3
      if (h.lastPosition > 3) return;

      if (!map.has(h.competitionId)) {
        map.set(h.competitionId, {
          competitionId: h.competitionId,
          competitionName: h.competitionName,
          typeId: h.competitionTypeId,
          championYears: [],
          runnerUpYears: [],
          thirdPlaceYears: [],
          totalWins: 0
        });
      }

      const stat = map.get(h.competitionId)!;

      if (h.lastPosition === 1) {
        stat.championYears.push(h.seasonNumber);
        stat.totalWins++;
      } else if (h.lastPosition === 2) {
        stat.runnerUpYears.push(h.seasonNumber);
      } else if (h.lastPosition === 3) {
        stat.thirdPlaceYears.push(h.seasonNumber);
      }
    });

    // Sortam anii crescator (cel mai recent ultimul)
    map.forEach(stat => {
      stat.championYears.sort((a, b) => a - b);
      stat.runnerUpYears.sort((a, b) => a - b);
      stat.thirdPlaceYears.sort((a, b) => a - b);
    });

    // Convertim in array si sortam competitiile: cele cu cele mai multe trofee primele
    this.historyStats = Array.from(map.values()).sort((a, b) => b.totalWins - a.totalWins);
  }

  goBack() {
    this.router.navigate(['/team', this.teamId]); // Sau ruta ta principala de echipa
  }
  goToCompetition(competitionId: number) {
    this.router.navigate(['/comp', competitionId]);
  }
}