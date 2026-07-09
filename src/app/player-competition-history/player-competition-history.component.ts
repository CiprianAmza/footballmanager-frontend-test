import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

@Component({
  selector: 'player-competition-history',
  templateUrl: './player-competition-history.component.html',
  styleUrls: ['./player-competition-history.component.css']
})
export class PlayerCompetitionHistoryComponent implements OnInit, OnChanges {

  @Input() playerId!: number;
  playerStats: any[] = [];

  // All-competitions breakdown (covers League of Champions / Stars Cup too,
  // which the season table above is league-/cup-centric about).
  // total: aggregate across everything; byComp: one row per competition.
  breakdownTotal: any = null;
  byCompetition: any[] = [];

  // Per (competitionType + season) drill-down — keeps LoC / Stars Cup
  // separated across seasons. Rows: appearances, goals, assists, avgRating,
  // competitionTypeId, competitionTypeName, seasonNumber.
  byTypeAndSeason: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchStats();
    this.fetchBreakdown();
  }

  // 🔹 NOU: Reîmprospătăm datele dacă se schimbă jucătorul selectat
  ngOnChanges(changes: SimpleChanges): void {
      if (changes['playerId'] && !changes['playerId'].firstChange) {
          this.fetchStats();
          this.fetchBreakdown();
      }
  }

  /** All-competitions + per-competition appearances/goals/assists/avgRating. */
  fetchBreakdown(): void {
    if (!this.playerId) return;
    this.http.get<any>(`${urlApp}/stats/player/${this.playerId}/competitionBreakdown`)
      .subscribe({
        next: (data) => {
          this.breakdownTotal = data?.total ?? null;
          // byCompetition may arrive as an array or as a keyed map — normalise to an array.
          const bc = data?.byCompetition;
          if (Array.isArray(bc)) {
            this.byCompetition = bc;
          } else if (bc && typeof bc === 'object') {
            this.byCompetition = Object.values(bc);
          } else {
            this.byCompetition = [];
          }
          const bts = data?.byTypeAndSeason;
          if (Array.isArray(bts)) {
            this.byTypeAndSeason = bts;
          } else if (bts && typeof bts === 'object') {
            this.byTypeAndSeason = Object.values(bts);
          } else {
            this.byTypeAndSeason = [];
          }
        },
        error: () => {
          this.breakdownTotal = null;
          this.byCompetition = [];
          this.byTypeAndSeason = [];
        }
      });
  }

  competitionTypeLabel(typeId: number | undefined | null): string {
    switch (typeId) {
      case 1: return 'League';
      case 2: return 'Cup';
      case 3: return 'Second League';
      case 4: return 'League of Champions';
      case 5: return 'Stars Cup';
      default: return '';
    }
  }

  fetchStats() {
    if (!this.playerId) return;
    
    this.http.get(`${urlApp}/stats/getStats/${this.playerId}`)
      .subscribe((data: any) => {
        this.playerStats = Object.values(data).map((entry: any) => {
          let totalGames = 0;
          let totalGamesAsSubstitute = 0;
          let totalGoals = 0;
          let leagueEntry = { name: "-", games: 0, gamesAsSubstitute: 0, goals: 0 };
          let cupEntry = { name: "-", games: 0, gamesAsSubstitute: 0, goals: 0 };

          entry.competitionEntries.forEach((competition: any) => {
            totalGames += competition.games || 0;
            totalGamesAsSubstitute += competition.gamesAsSubstitute || 0;
            totalGoals += competition.goals || 0;

            if (competition.competitionTypeId === 1) {
              leagueEntry = { 
                name: competition.competitionName, 
                games: competition.games || 0, 
                gamesAsSubstitute: competition.gamesAsSubstitute || 0, 
                goals: competition.goals || 0 
              };
            } else if (competition.competitionTypeId === 2) {
              cupEntry = { 
                name: competition.competitionName, 
                games: competition.games || 0, 
                gamesAsSubstitute: competition.gamesAsSubstitute || 0, 
                goals: competition.goals || 0 
              };
            }
          });

          return {
            ...entry,
            totalGames,
            totalGoals,
            leagueEntry,
            cupEntry
          };
        }).sort((a: any, b: any) => b.seasonNumber - a.seasonNumber); // Sortare descrescătoare (cel mai recent sezon sus)
      });
  }

  // 🔹 NOU: Metodele necesare pentru footer-ul tabelului din HTML
  getTotalApps(): string {
      let total = 0;
      let subs = 0;
      if (!this.playerStats) return "0 (0)";
      
      this.playerStats.forEach(s => {
          total += s.totalGames;
          subs += (s.leagueEntry.gamesAsSubstitute + s.cupEntry.gamesAsSubstitute);
      });
      return `${total} (${subs})`;
  }

  getTotalGoals(): number {
      if (!this.playerStats) return 0;
      return this.playerStats.reduce((acc, curr) => acc + curr.totalGoals, 0);
  }
}