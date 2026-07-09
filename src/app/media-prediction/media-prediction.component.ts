import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { ActivatedRoute } from '@angular/router';

export interface ManagerTeamTacticView {
  managerName: string;
  managerId: number;
  teamName: string;
  teamId: number;
  tacticRating: number;
  tactic: string;
}

export interface PlayerView {
  id: number;
  name: string;
  teamName: string;
  position: string;
  rating: number;
  age: number;
  salary: number;
  agreedPlayingTime: string;
  contractEndDate: Date;
  contractStartDate: Date;
  fitness: number;
  morale: string;
  currentStatus: string;
  seasonCreated: number;
  wealth: number;
  skillNames: string[];
  skillValues: number[];
}

export interface MediaPredictionView {
  managerTeamTacticView: ManagerTeamTacticView;
  playerViews: PlayerView[];
}

@Component({
  selector: 'app-media-prediction',
  templateUrl: './media-prediction.component.html',
  styleUrls: ['./media-prediction.component.css']
})
export class MediaPredictionComponent implements OnInit {
  
  selectedCompetitionId: number = 0;
  mediaPredictions: MediaPredictionView[] = [];
  
  selectedTeam: MediaPredictionView | null = null;
  selectedPlayer: PlayerView | null = null;
  
  // Grid-ul terenului (30 celule: 5 coloane x 6 randuri)
  cells: (PlayerView | null)[] = []; 

  // --- MAPARE TACTICI PE GRID 5x6 ---
  // Randuri: 0-4(ST), 5-9(AM), 10-14(MC), 15-19(DM/WB), 20-24(DEF), 25-29(GK)
  
  // 3-5-2 (3 DC, 2 WB, 3 MC, 2 ST)
  indexes352: number[] = [
      27,             // GK
      21, 22, 23,     // 3 DC (Centrali)
      15, 19,         // 2 WB (Stanga/Dreapta pe linia DM)
      11, 12, 13,     // 3 MC (Mijloc)
      1, 3            // 2 ST
  ];

  // 3-4-3 (3 DC, 4 Mid, 3 Att)
  indexes343: number[] = [
      27,             // GK
      21, 22, 23,     // 3 DC
      10, 11, 13, 14, // 4 Mid (ML, MCL, MCR, MR)
      5, 9, 2         // 3 Att (AML, AMR, ST)
  ];

  // 4-3-3 (4 Def, 1 DM, 2 MC, 2 Wing, 1 ST)
  indexes433: number[] = [
      27,             // GK
      20, 21, 23, 24, // 4 Def
      17,             // 1 DM
      11, 13,         // 2 MC
      5, 9,           // 2 Wings (AML, AMR)
      2               // 1 ST
  ];

  // 4-4-2 (4 Def, 4 Mid, 2 ST)
  indexes442: number[] = [
      27,             // GK
      20, 21, 23, 24, // 4 Def
      10, 11, 13, 14, // 4 Mid (ML, MCL, MCR, MR)
      1, 3            // 2 ST
  ];

  // 4-5-1 (4 Def, 1 DM, 2 MC, 2 Wing, 1 ST - Similar 433 dar mai compact)
  indexes451: number[] = [
      27,             // GK
      20, 21, 23, 24, // 4 Def
      17,             // 1 DM
      10, 14,         // 2 Wide Mids (ML, MR)
      11, 13,         // 2 MC
      2               // 1 ST
  ];

  // Backend order (sorted by position index GK→DL→DC→DR→ML→MC→MR→ST):
  // 4-2-3-1 (4 Def, ML, 3 MC, MR, 1 ST). Visual: 4 back, flat 5 mid, lone ST.
  indexes4231: number[] = [
      27,                 // GK
      20, 21, 23, 24,     // 4 Def
      10, 11, 12, 13, 14, // ML, 3 MC, MR (flat mid line)
      2                   // ST
  ];

  // 4-1-4-1 (same backend shape as 4231: 4 Def, ML, 3 MC, MR, 1 ST).
  // Visual: drop one MC down to DM slot to differentiate.
  indexes4141: number[] = [
      27,             // GK
      20, 21, 23, 24, // 4 Def
      10,             // ML
      17,             // DM (the holding MC)
      11, 13,         // 2 MC
      14,             // MR
      2               // ST
  ];

  // 4-4-1-1 (4 Def, ML, 2 MC, MR, 2 ST). Visual: pull one ST back to AM.
  indexes4411: number[] = [
      27,             // GK
      20, 21, 23, 24, // 4 Def
      10, 11, 13, 14, // ML, 2 MC, MR
      7,              // AM (one of the strikers, dropped back)
      2               // ST
  ];

  // 4-3-2-1 (backend: 4 Def, ML, 2 MC, MR, 2 ST). Christmas tree visual.
  indexes4321: number[] = [
      27,             // GK
      20, 21, 23, 24, // 4 Def
      10, 11, 13, 14, // ML, 2 MC, MR
      6, 8            // 2 AM (the strikers pushed up but inside)
  ];

  // 4-2-2-2 (4 Def, 4 MC, 2 ST). Diamond/box midfield.
  indexes4222: number[] = [
      27,                 // GK
      20, 21, 23, 24,     // 4 Def
      16, 18,             // 2 DM
      6, 8,               // 2 AM
      1, 3                // 2 ST
  ];

  // 3-4-2-1 (3 Def, ML, 4 MC, MR, 1 ST). Visual: wing-backs wide, narrow mids, AM/ST.
  indexes3421: number[] = [
      27,             // GK
      21, 22, 23,     // 3 DC
      15,             // ML (left wing-back)
      11, 12, 13,     // 3 MC
      7,              // 1 MC pushed to AM
      19,             // MR (right wing-back)
      2               // ST
  ];

  // 5-3-2 (5 Def, 3 MC, 2 ST). Five at the back, narrow midfield.
  indexes532: number[] = [
      27,                     // GK
      20, 21, 22, 23, 24,     // 5 Def (full back line)
      11, 12, 13,             // 3 MC
      1, 3                    // 2 ST
  ];

  // 5-2-1-2 (same backend: 5 Def, 3 MC, 2 ST). Push one MC to AM for the "1".
  indexes5212: number[] = [
      27,                     // GK
      20, 21, 22, 23, 24,     // 5 Def
      16, 18,                 // 2 DM
      7,                      // 1 AM
      1, 3                    // 2 ST
  ];

  // 5-4-1 (5 Def, ML, 2 MC, MR, 1 ST).
  indexes541: number[] = [
      27,                     // GK
      20, 21, 22, 23, 24,     // 5 Def
      10, 11, 13, 14,         // ML, 2 MC, MR
      2                       // 1 ST
  ];

  // 3-5-1-1 (backend same as 3-5-2: 3 DC, ML, 3 MC, MR, 2 ST). Pull one ST back to AM.
  indexes3511: number[] = [
      27,             // GK
      21, 22, 23,     // 3 DC
      15,             // ML (wing-back left)
      11, 12, 13,     // 3 MC
      19,             // MR (wing-back right)
      7,              // 1 AM (the "1" between mid and attack)
      2               // 1 ST
  ];

  tacticMap: { [key: string]: number[] } = {
    "352": this.indexes352,
    "343": this.indexes343,
    "433": this.indexes433,
    "442": this.indexes442,
    "451": this.indexes451,
    "4231": this.indexes4231,
    "4141": this.indexes4141,
    "4411": this.indexes4411,
    "4321": this.indexes4321,
    "4222": this.indexes4222,
    "3421": this.indexes3421,
    "532": this.indexes532,
    "5212": this.indexes5212,
    "541": this.indexes541,
    "3511": this.indexes3511
  };

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.selectedCompetitionId = Number(params['competitionId']);
    });
    
    this.http.get<MediaPredictionView[]>(urlApp + '/media/mediaPrediction/' + this.selectedCompetitionId)
      .subscribe(data => {
        this.mediaPredictions = data.sort((a, b) => b.managerTeamTacticView.tacticRating - a.managerTeamTacticView.tacticRating);
        
        if (this.mediaPredictions.length > 0) {
            this.selectTeam(this.mediaPredictions[0]);
        }
      });
  }

  selectTeam(team: MediaPredictionView) {
    this.selectedPlayer = null;
    this.selectedTeam = team;
    this.initializeFootballField(team);
  }

  initializeFootballField(team: MediaPredictionView) {
    this.cells = Array(30).fill(null); 
  
    const rawTactic = team.managerTeamTacticView.tactic;
    const cleanTactic = rawTactic.replace(/-/g, '');
    
    // Fallback la 442 dacă tactica nu există
    const tacticKey = this.tacticMap[cleanTactic] ? cleanTactic : "442";
    const tacticIndexes = this.tacticMap[tacticKey];
  
    // Aici presupunem că lista 'playerViews' vine deja sortată (GK, Def, Mid, Att)
    // Sau cel puțin că primii 11 sunt titularii.
    // Atribuim jucătorii pe pozițiile din grid.
    let playerIndex = 0;
    
    // Sortăm jucătorii din API ca să fim siguri că GK e primul, etc. (Opțional, dar recomandat)
    // Altfel riști să pui portarul atacant.
    // Dacă API-ul nu trimite poziția specifică, e greu de sortat perfect, așa că ne bazăm pe ordine.
    
    for (let cellIndex of tacticIndexes) {
        if (playerIndex < team.playerViews.length) {
            this.cells[cellIndex] = team.playerViews[playerIndex];
        }
        playerIndex++;
    }
  }

  selectPlayer(player: PlayerView | null) {
    this.selectedPlayer = player;
  }
  
  getRatingColor(rating: number): string {
    if (rating >= 160) return '#2ecc71';
    if (rating >= 140) return '#27ae60'; 
    if (rating >= 120) return '#f1c40f'; 
    return '#95a5a6';
  }

  formatTacticName(tactic: string): string {
      if (!tactic) return '';
      if (tactic.includes('-')) return tactic;
      return tactic.split('').join('-');
  }
}