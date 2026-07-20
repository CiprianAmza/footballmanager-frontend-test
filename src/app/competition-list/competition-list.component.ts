import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface CompetitionData {
  competitionId: number;
  name: string;
  typeId: number;
  games?: number;
  wins?: number;
  draws?: number;
  loses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  points?: number;
  form?: string;
  position?: number;
  totalTeams?: number;
  cupRound?: number;
  status?: string;
  statusLabel?: string;
  entryStage?: string;
  currentStage?: string;
  stageReached?: string;
  start?: {
    round: number;
    stage: string;
    started: boolean;
  };
  nextMatch?: {
    round: number;
    stage: string;
    day?: number;
    date?: string;
    legNumber?: number;
    opponentTeamId: number;
    opponentTeamName: string;
    venue: 'HOME' | 'AWAY';
  };
  elimination?: {
    round: number;
    stage: string;
    day?: number;
    date?: string;
    byTeamId: number;
    byTeamName: string;
    reason?: 'GROUP_TABLE' | 'KNOCKOUT_LOSS';
    score?: string;
    decidedBy?: string;
  };
}

@Component({
  selector: 'app-competition-list',
  templateUrl: './competition-list.component.html',
  styleUrls: ['./competition-list.component.css']
})
export class CompetitionsListComponent implements OnInit {

  competitions: CompetitionData[] = [];

  constructor(private http: HttpClient, private teamService: TeamService, private router: Router) {}

  openCompetition(comp: CompetitionData): void {
    if (comp.typeId === 4 || comp.typeId === 5) {
      this.router.navigate(['/european-rounds', comp.competitionId, this.teamService.currentSeason]);
    } else {
      this.router.navigate(['/comp', comp.competitionId]);
    }
  }

  ngOnInit(): void {
    this.loadCompetitions();
  }

  loadCompetitions(): void {
    const teamId = this.teamService.teamId;
    this.http.get<CompetitionData[]>(urlApp + `/competition/getTeamCompetitions/${teamId}`).subscribe(
      (data) => { this.competitions = this.dedupe(data || []); },
      (error) => console.error('Error loading competitions:', error)
    );
  }

  /**
   * Backend now returns one entry per competition. Defensive guard: collapse any
   * duplicate competitionId (e.g. a European comp listed once per qualification
   * round) so the grid never shows duplicate cards.
   */
  trackByCompId(_index: number, comp: CompetitionData): number {
    return comp.competitionId;
  }

  private dedupe(data: CompetitionData[]): CompetitionData[] {
    const seen = new Map<number, CompetitionData>();
    for (const comp of data) {
      if (!seen.has(comp.competitionId)) {
        seen.set(comp.competitionId, comp);
      }
    }
    return Array.from(seen.values());
  }

  isLeague(comp: CompetitionData): boolean {
    return comp.typeId === 1 || comp.typeId === 3;
  }

  isCup(comp: CompetitionData): boolean {
    return comp.typeId === 2 || comp.typeId === 6;
  }

  isEuropean(comp: CompetitionData): boolean {
    return comp.typeId === 4 || comp.typeId === 5;
  }

  getFormArray(form: string | undefined): string[] {
    if (!form) return [];
    return form.split('');
  }

  getCompetitionColor(comp: CompetitionData): string {
    switch (comp.typeId) {
      case 1: return '#38003c'; // League purple
      case 2: return '#e74c3c'; // Cup red
      case 3: return '#2c3e50'; // Second league dark
      case 4: return '#2e3192'; // Champions blue
      case 5: return '#009460'; // Stars Cup green
      case 6: return '#d5a500'; // Super Cup gold
      default: return '#95a5a6';
    }
  }

  getTypeLabel(comp: CompetitionData): string {
    switch (comp.typeId) {
      case 1: return 'First League';
      case 2: return 'Cup';
      case 3: return 'Second League';
      case 4: return 'European';
      case 5: return 'European';
      case 6: return 'Super Cup';
      default: return '';
    }
  }

}
