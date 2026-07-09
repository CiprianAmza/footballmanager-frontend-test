import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { InjuryService } from '../services/injury.service';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

interface MedicalRiskPlayer {
  id: number;
  name: string;
  position: string;
  rating: number;
  matchLoad: string;
  matchLoadInfo: string;
  injurySusceptibility: string;
  injuryInfo: string;
  fatigue: string;
  overallRisk: string;
  riskLabel: string;
  currentlyInjured: boolean;
  currentInjuryType?: string;
  currentDaysRemaining?: number;
}

interface ActiveInjury {
  id: number;
  playerId: number;
  playerName: string;
  position: string;
  rating: number;
  injuryType: string;
  severity: string;
  daysRemaining: number;
  seasonNumber: number;
}

interface InjuryHistoryEntry {
  id: number;
  playerId: number;
  playerName: string;
  position: string;
  injuryType: string;
  severity: string;
  daysRemaining: number;
  seasonNumber: number;
  recovered: boolean;
}

@Component({
  selector: 'app-medical-centre',
  templateUrl: './medical-centre.component.html',
  styleUrls: ['./medical-centre.component.css']
})
export class MedicalCentreComponent implements OnInit, OnDestroy {

  private sub = new Subscription();

  activeTab: string = 'Risk Assessment';
  tabs: string[] = ['Risk Assessment', 'Current Injuries', 'Injury History'];

  riskPlayers: MedicalRiskPlayer[] = [];
  activeInjuries: ActiveInjury[] = [];
  injuryHistory: InjuryHistoryEntry[] = [];

  teamId: number = 1;

  // Injury summary counts
  seriousCount: number = 0;
  moderateCount: number = 0;
  minorCount: number = 0;

  // Game injuries from new endpoint
  gameInjuries: any[] = [];

  constructor(
    private http: HttpClient,
    private injuryService: InjuryService,
    private teamService: TeamService,
    private gameEvents: GameEventsService
  ) {}

  ngOnInit(): void {
    this.teamId = this.teamService.teamId;
    this.loadAll();
    // Injuries change after matches/training (game advance) and squad moves.
    this.sub.add(this.gameEvents.on('injuries').subscribe(() => this.loadAll()));
    this.sub.add(this.gameEvents.on('squad').subscribe(() => this.loadAll()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private loadAll(): void {
    this.loadRiskAssessment();
    this.loadActiveInjuries();
    this.loadInjuryHistory();
    this.loadGameInjuries();
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  loadRiskAssessment() {
    this.injuryService.getRiskAssessment(this.teamId).subscribe({
      next: (data) => {
        this.riskPlayers = data;
      },
      error: (err) => console.error('Error loading risk assessment:', err)
    });
  }

  loadActiveInjuries() {
    this.injuryService.getActiveInjuries(this.teamId).subscribe({
      next: (data) => {
        this.activeInjuries = data;
        this.seriousCount = data.filter(i => i.severity === 'Serious').length;
        this.moderateCount = data.filter(i => i.severity === 'Moderate').length;
        this.minorCount = data.filter(i => i.severity === 'Minor').length;
      },
      error: (err) => console.error('Error loading active injuries:', err)
    });
  }

  loadInjuryHistory() {
    this.injuryService.getInjuryHistory(this.teamId).subscribe({
      next: (data) => {
        this.injuryHistory = data;
      },
      error: (err) => console.error('Error loading injury history:', err)
    });
  }

  loadGameInjuries() {
    this.http.get<any[]>(urlApp + `/game/injuries/${this.teamId}`).subscribe({
      next: (data) => {
        this.gameInjuries = data || [];
        // Merge game injuries into active injuries if they have new data
        if (this.gameInjuries.length > 0 && this.activeInjuries.length === 0) {
          this.activeInjuries = this.gameInjuries.map(gi => ({
            id: gi.id,
            playerId: gi.playerId,
            playerName: gi.playerName || gi.name || 'Unknown',
            position: gi.position || '',
            rating: gi.rating || 0,
            injuryType: gi.injuryType || gi.type || 'Unknown',
            severity: gi.severity || 'Minor',
            daysRemaining: gi.daysRemaining || gi.daysLeft || 0,
            seasonNumber: gi.seasonNumber || gi.season || 0
          }));
          this.seriousCount = this.activeInjuries.filter(i => i.severity === 'Serious').length;
          this.moderateCount = this.activeInjuries.filter(i => i.severity === 'Moderate').length;
          this.minorCount = this.activeInjuries.filter(i => i.severity === 'Minor').length;
        }
      },
      error: (err) => console.error('Error loading game injuries:', err)
    });
  }

  // Helpers for CSS color classes
  getLevelClass(level: string): string {
    switch(level) {
      case 'Light': case 'Low': case 'Fresh': case 'Below Average': return 'good';
      case 'Medium': case 'Average': case 'Above Average': case 'Increased': return 'medium';
      case 'Heavy': case 'High': case 'Very High': return 'bad';
      default: return '';
    }
  }

  getRiskBoxClass(risk: string): string {
    switch(risk) {
      case 'High': return 'risk-high';
      case 'Increased': return 'risk-increased';
      case 'Low': return 'risk-low';
      default: return '';
    }
  }

  getSeverityClass(severity: string): string {
    switch(severity) {
      case 'Serious': return 'bad';
      case 'Moderate': return 'medium';
      case 'Minor': return 'good';
      default: return '';
    }
  }
}
