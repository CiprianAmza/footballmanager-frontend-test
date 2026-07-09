import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-assistant-manager',
  templateUrl: './assistant-manager.component.html',
  styleUrls: ['./assistant-manager.component.css']
})
export class AssistantManagerComponent implements OnInit {

  teamId!: number;
  activeTab: string = 'briefing';

  // Pre-match briefing
  briefing: any = null;
  loadingBriefing: boolean = false;
  opponentTeamId: number | null = null;

  // Formation suggestion
  formationSuggestion: any = null;
  loadingFormation: boolean = false;

  // Lineup concerns
  lineupConcerns: any = null;
  loadingConcerns: boolean = false;

  // Opponent analysis
  opponentAnalysis: any = null;
  loadingOpponent: boolean = false;
  opponentIdForAnalysis: number | null = null;

  // Transfer needs
  transferNeeds: any = null;
  loadingTransferNeeds: boolean = false;

  // Next opponent (from fixtures)
  nextOpponentId: number | null = null;
  nextOpponentName: string = '';

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.teamId = this.teamService.teamId;
    this.loadNextOpponent();
    this.loadFormationSuggestion();
    this.loadLineupConcerns();
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'briefing' && !this.briefing && this.nextOpponentId) {
      this.loadPreMatchBriefing();
    }
    if (tab === 'formation' && !this.formationSuggestion) {
      this.loadFormationSuggestion();
    }
    if (tab === 'concerns' && !this.lineupConcerns) {
      this.loadLineupConcerns();
    }
    if (tab === 'transfers' && !this.transferNeeds) {
      this.loadTransferNeeds();
    }
  }

  loadNextOpponent(): void {
    const season = this.teamService.currentSeason;
    this.http.get<any[]>(urlApp + `/match/calendar/${this.teamId}/${season}`).subscribe({
      next: (entries) => {
        const upcoming = entries.find(e => e.status === 'upcoming');
        if (upcoming) {
          this.nextOpponentId = upcoming.opponentTeamId;
          this.nextOpponentName = upcoming.opponentTeamName;
          this.opponentIdForAnalysis = upcoming.opponentTeamId;
          this.loadPreMatchBriefing();
        }
      },
      error: () => {}
    });
  }

  loadPreMatchBriefing(): void {
    if (!this.nextOpponentId) return;
    this.loadingBriefing = true;
    this.http.get<any>(urlApp + `/assistant/preMatchBriefing/${this.teamId}/${this.nextOpponentId}`).subscribe({
      next: (data) => { this.briefing = data; this.loadingBriefing = false; },
      error: () => { this.briefing = null; this.loadingBriefing = false; }
    });
  }

  loadFormationSuggestion(): void {
    this.loadingFormation = true;
    this.http.get<any>(urlApp + `/assistant/suggestFormation/${this.teamId}`).subscribe({
      next: (data) => { this.formationSuggestion = data; this.loadingFormation = false; },
      error: () => { this.formationSuggestion = null; this.loadingFormation = false; }
    });
  }

  loadLineupConcerns(): void {
    this.loadingConcerns = true;
    this.http.get<any>(urlApp + `/assistant/lineupConcerns/${this.teamId}`).subscribe({
      next: (data) => { this.lineupConcerns = data; this.loadingConcerns = false; },
      error: () => { this.lineupConcerns = null; this.loadingConcerns = false; }
    });
  }

  loadOpponentAnalysis(): void {
    if (!this.opponentIdForAnalysis) return;
    this.loadingOpponent = true;
    this.http.get<any>(urlApp + `/assistant/analyzeOpponent/${this.teamId}/${this.opponentIdForAnalysis}`).subscribe({
      next: (data) => { this.opponentAnalysis = data; this.loadingOpponent = false; },
      error: () => { this.opponentAnalysis = null; this.loadingOpponent = false; }
    });
  }

  loadTransferNeeds(): void {
    this.loadingTransferNeeds = true;
    this.http.get<any>(urlApp + `/assistant/transferNeeds/${this.teamId}`).subscribe({
      next: (data) => { this.transferNeeds = data; this.loadingTransferNeeds = false; },
      error: () => { this.transferNeeds = null; this.loadingTransferNeeds = false; }
    });
  }

  getStrengthClass(strength: string): string {
    switch (strength) {
      case 'VERY_STRONG': return 'str-very-strong';
      case 'STRONG': return 'str-strong';
      case 'AVERAGE': return 'str-average';
      case 'WEAK': return 'str-weak';
      default: return '';
    }
  }

  getConcernIcon(type: string): string {
    switch (type) {
      case 'injury': return '\uD83C\uDFE5';
      case 'morale': return '\uD83D\uDE1E';
      case 'fitness': return '\uD83C\uDFCB\uFE0F';
      case 'contract': return '\uD83D\uDCDD';
      case 'transfer_request': return '\uD83D\uDCE4';
      default: return '\u26A0\uFE0F';
    }
  }

  getConcernSeverityClass(severity: string): string {
    switch (severity) {
      case 'HIGH': return 'severity-high';
      case 'MEDIUM': return 'severity-medium';
      case 'LOW': return 'severity-low';
      default: return '';
    }
  }
}
