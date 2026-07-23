import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

export interface TrainingSession {
  type: 'Physical' | 'General' | 'Match' | 'Extra' | 'Rest' | 'Tactical';
  name: string;
  unit: string;
  icon: string;
  intensity: number;
}

interface DaySchedule {
  date: Date;
  dayName: string;
  sessions: TrainingSession[];
  overallIntensity: number;
}

// Backend entity shape
interface TrainingScheduleEntry {
  id?: number;
  teamId: number;
  dayOfWeek: number;
  sessionSlot: number;
  sessionType: string;
  sessionName: string;
  intensity: number;
}

interface SessionOption {
  name: string;
  icon: string;
  intensity: number;
}

interface SessionMap {
  [key: string]: SessionOption[];
}

@Component({
  selector: 'app-training',
  templateUrl: './training.component.html',
  styleUrls: ['./training.component.css']
})
export class TrainingComponent implements OnInit, OnDestroy {

  private sub = new Subscription();

  currentWeek: DaySchedule[] = [];
  activeTab: string = 'Overview';
  tabs: string[] = ['Overview', 'Calendar', 'Individual'];

  // Training focus
  trainingFocus: string = 'Balanced';
  focusOptions: string[] = ['Attacking', 'Defensive', 'Fitness', 'Tactical', 'Balanced'];
  focusLoading: boolean = false;
  focusSaving: boolean = false;
  focusMessage: string = '';
  nextSessionInfo: string = '';

  // Modal state
  isModalOpen: boolean = false;
  selectedDayIndex: number = -1;
  selectedSessionIndex: number = -1;

  availableSessions: SessionMap = {
    'Physical': [
        { name: 'Endurance', icon: '\uD83D\uDCAA', intensity: 80 },
        { name: 'Resistance', icon: '\uD83C\uDFCB\uFE0F', intensity: 85 },
        { name: 'Quickness', icon: '\uD83D\uDC5F', intensity: 70 },
        { name: 'Recovery', icon: '\uD83E\uDE79', intensity: 20 }
    ],
    'General': [
        { name: 'Overall', icon: '\u26BD', intensity: 60 },
        { name: 'Attacking', icon: '\u2694\uFE0F', intensity: 60 },
        { name: 'Defending', icon: '\uD83D\uDED1', intensity: 60 },
        { name: 'Possession', icon: '\uD83D\uDD04', intensity: 55 },
        { name: 'Tactical', icon: '\uD83E\uDDE0', intensity: 50 }
    ],
    'Match': [
        { name: 'Match Practice', icon: '\uD83C\uDFDF\uFE0F', intensity: 90 },
        { name: 'Match Tactics', icon: '\uD83D\uDCCB', intensity: 40 },
        { name: 'Teamwork', icon: '\uD83E\uDD1D', intensity: 50 },
        { name: 'Set Pieces', icon: '\u26F3', intensity: 30 }
    ],
    'Extra': [
        { name: 'Team Bonding', icon: '\uD83C\uDF7B', intensity: 10 },
        { name: 'Community', icon: '\u2764\uFE0F', intensity: 10 },
        { name: 'Outreach', icon: '\uD83D\uDCE2', intensity: 10 }
    ],
    'Rest': [
        { name: 'Rest', icon: '\uD83D\uDECC', intensity: 0 }
    ]
  };

  sessionCategories = Object.keys(this.availableSessions);

  private dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  // Icon mapping for session names coming from the backend
  private sessionIconMap: { [key: string]: string } = {
    'Endurance': '\uD83D\uDCAA',
    'Resistance': '\uD83C\uDFCB\uFE0F',
    'Quickness': '\uD83D\uDC5F',
    'Recovery': '\uD83E\uDE79',
    'Overall': '\u26BD',
    'Attacking': '\u2694\uFE0F',
    'Defending': '\uD83D\uDED1',
    'Possession': '\uD83D\uDD04',
    'Tactical': '\uD83E\uDDE0',
    'Match Practice': '\uD83C\uDFDF\uFE0F',
    'Match Tactics': '\uD83D\uDCCB',
    'Teamwork': '\uD83E\uDD1D',
    'Set Pieces': '\u26F3',
    'Team Bonding': '\uD83C\uDF7B',
    'Community': '\u2764\uFE0F',
    'Outreach': '\uD83D\uDCE2',
    'Rest': '\uD83D\uDECC',
    'Def. Shadow': '\uD83D\uDEE1\uFE0F',
    'Att. Movement': '\u26A1',
    'MATCH DAY': '\uD83D\uDD25',
    'Match Prev.': '\uD83D\uDCFA'
  };

  // Individual Training
  individualPlayers: any[] = [];
  loadingIndividualPlayers: boolean = false;
  selectedIndividualPlayer: any = null;
  individualTrainingOptions: any = null;
  loadingIndividualOptions: boolean = false;
  individualSaving: boolean = false;
  individualMessage: string = '';

  // Individual training form
  indFocus: string | null = null;
  indAttribute: string | null = null;
  indRole: string | null = null;

  constructor(private http: HttpClient, private teamService: TeamService,
              private gameEvents: GameEventsService) { }

  ngOnInit(): void {
    this.loadSchedule();
    this.loadTrainingFocus();
    this.loadNextSessionInfo();

    // Live-reload training data when it changes (game advance, focus/schedule
    // saved elsewhere). Individual player stats live in the 'squad' domain.
    this.sub.add(this.gameEvents.on('training').subscribe(() => {
      this.loadSchedule();
      this.loadTrainingFocus();
    }));
    this.sub.add(this.gameEvents.on('squad').subscribe(() => {
      if (this.individualPlayers.length > 0) this.loadIndividualPlayers();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'Individual' && this.individualPlayers.length === 0) {
      this.loadIndividualPlayers();
    }
  }

  // --- MODAL LOGIC ---
  openSessionModal(dayIndex: number, sessionIndex: number) {
    this.selectedDayIndex = dayIndex;
    this.selectedSessionIndex = sessionIndex;
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.selectedDayIndex = -1;
    this.selectedSessionIndex = -1;
  }

  selectNewSession(category: string, sessionTemplate: any) {
    if (this.selectedDayIndex === -1 || this.selectedSessionIndex === -1) return;

    const day = this.currentWeek[this.selectedDayIndex];

    day.sessions[this.selectedSessionIndex] = {
        type: category as any,
        name: sessionTemplate.name,
        unit: 'Team',
        icon: sessionTemplate.icon,
        intensity: sessionTemplate.intensity
    };

    // Recalculate day intensity
    day.overallIntensity = day.sessions.reduce((sum, s) => sum + s.intensity, 0) / 3 * 1.2;
    if (day.overallIntensity > 100) day.overallIntensity = 100;

    this.closeModal();
  }

  // --- TRAINING FOCUS ---

  loadTrainingFocus() {
    this.focusLoading = true;
    const teamId = this.teamService.teamId;
    this.http.get<any>(urlApp + `/game/training/schedule/${teamId}`).subscribe({
      next: (data) => {
        if (data && data.focus) {
          this.trainingFocus = data.focus;
        }
        this.focusLoading = false;
      },
      error: (err) => {
        console.error('Error loading training focus:', err);
        this.focusLoading = false;
      }
    });
  }

  setTrainingFocus(focus: string) {
    this.focusSaving = true;
    this.focusMessage = '';
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + '/game/training/setFocus', { teamId, focus }).subscribe({
      next: () => {
        this.trainingFocus = focus;
        this.focusSaving = false;
        this.focusMessage = 'Training focus updated successfully!';
        this.gameEvents.emit('training');
        setTimeout(() => this.focusMessage = '', 3000);
      },
      error: (err) => {
        console.error('Error setting training focus:', err);
        this.focusSaving = false;
        this.focusMessage = 'Failed to update training focus.';
        setTimeout(() => this.focusMessage = '', 3000);
      }
    });
  }

  loadNextSessionInfo() {
    this.teamService.dateDisplay$.subscribe(date => {
      this.nextSessionInfo = date ? `Next session: ${date}` : '';
    });
  }

  getFocusIcon(focus: string): string {
    switch (focus) {
      case 'Attacking': return '\u2694\uFE0F';
      case 'Defensive': return '\uD83D\uDEE1\uFE0F';
      case 'Fitness': return '\uD83C\uDFCB\uFE0F';
      case 'Tactical': return '\uD83E\uDDE0';
      case 'Balanced': return '\u2696\uFE0F';
      default: return '\u26BD';
    }
  }

  getFocusDescription(focus: string): string {
    switch (focus) {
      case 'Attacking': return 'Focus on attacking drills, finishing, and creative movement';
      case 'Defensive': return 'Emphasis on defensive shape, tackling, and positioning';
      case 'Fitness': return 'Physical conditioning, endurance, and stamina building';
      case 'Tactical': return 'Tactical awareness, set pieces, and team strategy';
      case 'Balanced': return 'Equal emphasis across all training areas';
      default: return '';
    }
  }

  // --- API CALLS ---

  loadSchedule() {
    const teamId = this.teamService.teamId;
    this.http.get<TrainingScheduleEntry[]>(urlApp + `/training/schedule/${teamId}`).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.buildWeekFromBackend(data);
        } else {
          // No schedule exists yet, load default
          this.loadDefaultSchedule();
        }
      },
      error: (err) => {
        console.error('Error loading training schedule:', err);
        this.loadDefaultSchedule();
      }
    });
  }

  loadDefaultSchedule() {
    this.http.get<TrainingScheduleEntry[]>(urlApp + '/training/defaultSchedule').subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.buildWeekFromBackend(data);
        } else {
          this.generateFallbackSchedule();
        }
      },
      error: (err) => {
        console.error('Error loading default schedule:', err);
        this.generateFallbackSchedule();
      }
    });
  }

  saveSchedule() {
    const teamId = this.teamService.teamId;
    const entries: TrainingScheduleEntry[] = [];

    for (let dayIndex = 0; dayIndex < this.currentWeek.length; dayIndex++) {
      const day = this.currentWeek[dayIndex];
      for (let slotIndex = 0; slotIndex < day.sessions.length; slotIndex++) {
        const session = day.sessions[slotIndex];
        entries.push({
          teamId: teamId,
          dayOfWeek: dayIndex,
          sessionSlot: slotIndex,
          sessionType: session.type,
          sessionName: session.name,
          intensity: session.intensity
        });
      }
    }

    this.http.post<TrainingScheduleEntry[]>(urlApp + `/training/schedule/${teamId}`, entries).subscribe({
      next: () => {
        this.gameEvents.emit('training');
        alert('Training schedule saved successfully!');
      },
      error: (err) => {
        console.error('Error saving training schedule:', err);
        alert('Error saving training schedule.');
      }
    });
  }

  // --- HELPERS ---

  private buildWeekFromBackend(entries: TrainingScheduleEntry[]) {
    const startDate = new Date('2023-08-09');
    const dayMap: { [day: number]: TrainingScheduleEntry[] } = {};

    for (const entry of entries) {
      if (!dayMap[entry.dayOfWeek]) {
        dayMap[entry.dayOfWeek] = [];
      }
      dayMap[entry.dayOfWeek].push(entry);
    }

    this.currentWeek = [];
    for (let d = 0; d < 7; d++) {
      const dayEntries = (dayMap[d] || []).sort((a, b) => a.sessionSlot - b.sessionSlot);
      const sessions: TrainingSession[] = dayEntries.map(e => ({
        type: e.sessionType as any,
        name: e.sessionName,
        unit: 'Team',
        icon: this.sessionIconMap[e.sessionName] || '\u26BD',
        intensity: e.intensity
      }));

      const overallIntensity = sessions.length > 0
        ? Math.min(100, sessions.reduce((sum, s) => sum + s.intensity, 0) / 3 * 1.2)
        : 0;

      this.currentWeek.push({
        dayName: this.dayNames[d],
        date: this.addDays(startDate, d),
        sessions: sessions,
        overallIntensity: overallIntensity
      });
    }
  }

  private generateFallbackSchedule() {
    const startDate = new Date('2023-08-09');
    this.currentWeek = [
      {
        dayName: 'MON', date: this.addDays(startDate, 0),
        sessions: [
          { type: 'Physical', name: 'Endurance', unit: 'Team', icon: '\uD83D\uDCAA', intensity: 80 },
          { type: 'General', name: 'Possession', unit: 'Team', icon: '\u26BD', intensity: 60 },
          { type: 'Extra', name: 'Team Bonding', unit: 'Team', icon: '\uD83E\uDD1D', intensity: 10 }
        ],
        overallIntensity: 85
      },
      {
        dayName: 'TUE', date: this.addDays(startDate, 1),
        sessions: [
          { type: 'Tactical', name: 'Def. Shadow', unit: 'Def Unit', icon: '\uD83D\uDEE1\uFE0F', intensity: 50 },
          { type: 'Tactical', name: 'Att. Movement', unit: 'Att Unit', icon: '\u26A1', intensity: 50 },
          { type: 'Rest', name: 'Rest', unit: 'Team', icon: '\uD83D\uDECC', intensity: 0 }
        ],
        overallIntensity: 60
      },
      {
        dayName: 'WED', date: this.addDays(startDate, 2),
        sessions: [
          { type: 'Physical', name: 'Quickness', unit: 'Team', icon: '\uD83D\uDC5F', intensity: 70 },
          { type: 'General', name: 'Defending', unit: 'Team', icon: '\uD83D\uDED1', intensity: 65 },
          { type: 'Extra', name: 'Community', unit: 'Team', icon: '\u2764\uFE0F', intensity: 10 }
        ],
        overallIntensity: 80
      },
      {
        dayName: 'THU', date: this.addDays(startDate, 3),
        sessions: [
          { type: 'Match', name: 'Match Tactics', unit: 'Team', icon: '\uD83D\uDCCB', intensity: 40 },
          { type: 'Match', name: 'Set Pieces', unit: 'Team', icon: '\u26F3', intensity: 30 },
          { type: 'Rest', name: 'Rest', unit: 'Team', icon: '\uD83D\uDECC', intensity: 0 }
        ],
        overallIntensity: 45
      },
      {
        dayName: 'FRI', date: this.addDays(startDate, 4),
        sessions: [
          { type: 'Physical', name: 'Recovery', unit: 'Team', icon: '\uD83E\uDE79', intensity: 20 },
          { type: 'Match', name: 'Match Prev.', unit: 'Team', icon: '\uD83D\uDCFA', intensity: 10 },
          { type: 'Rest', name: 'Rest', unit: 'Team', icon: '\uD83D\uDECC', intensity: 0 }
        ],
        overallIntensity: 25
      },
      {
        dayName: 'SAT', date: this.addDays(startDate, 5),
        sessions: [
          { type: 'Match', name: 'MATCH DAY', unit: 'Team', icon: '\uD83D\uDD25', intensity: 100 }
        ],
        overallIntensity: 100
      },
      {
        dayName: 'SUN', date: this.addDays(startDate, 6),
        sessions: [
          { type: 'Physical', name: 'Recovery', unit: 'Team', icon: '\uD83E\uDE79', intensity: 20 },
          { type: 'Rest', name: 'Rest', unit: 'Team', icon: '\uD83D\uDECC', intensity: 0 },
          { type: 'Rest', name: 'Rest', unit: 'Team', icon: '\uD83D\uDECC', intensity: 0 }
        ],
        overallIntensity: 20
      }
    ];
  }

  // --- INDIVIDUAL TRAINING ---

  loadIndividualPlayers(): void {
    this.loadingIndividualPlayers = true;
    const teamId = this.teamService.teamId;
    this.http.get<any[]>(urlApp + `/tactic/getPlayers/${teamId}`).subscribe({
      next: (players) => {
        this.individualPlayers = players;
        this.loadingIndividualPlayers = false;
        // Load individual training for each player
        for (const p of players) {
          this.http.get<any>(urlApp + `/training/individual/${p.id}`).subscribe({
            next: (data) => {
              p.individualFocus = data.individualFocus;
              p.individualAttribute = data.individualAttribute;
              p.individualRole = data.individualRole;
            }
          });
        }
      },
      error: () => {
        this.individualPlayers = [];
        this.loadingIndividualPlayers = false;
      }
    });
  }

  selectIndividualPlayer(player: any): void {
    this.selectedIndividualPlayer = player;
    this.indFocus = player.individualFocus || null;
    this.indAttribute = player.individualAttribute || null;
    this.indRole = player.individualRole || null;
    this.individualMessage = '';
    this.loadIndividualOptions(player.position);
  }

  loadIndividualOptions(position: string): void {
    this.loadingIndividualOptions = true;
    this.http.get<any>(urlApp + `/training/individual/options/${position}`).subscribe({
      next: (data) => {
        this.individualTrainingOptions = data;
        this.loadingIndividualOptions = false;
      },
      error: () => {
        this.individualTrainingOptions = null;
        this.loadingIndividualOptions = false;
      }
    });
  }

  saveIndividualTraining(): void {
    if (!this.selectedIndividualPlayer) return;
    this.individualSaving = true;
    this.individualMessage = '';

    this.http.post<any>(urlApp + `/training/individual/${this.selectedIndividualPlayer.id}`, {
      focus: this.indFocus || null,
      attribute: this.indAttribute || null,
      role: this.indRole || null
    }).subscribe({
      next: (data) => {
        this.individualSaving = false;
        this.individualMessage = 'Individual training updated!';
        this.selectedIndividualPlayer.individualFocus = data.individualFocus;
        this.selectedIndividualPlayer.individualAttribute = data.individualAttribute;
        this.selectedIndividualPlayer.individualRole = data.individualRole;
        setTimeout(() => this.individualMessage = '', 3000);
      },
      error: () => {
        this.individualSaving = false;
        this.individualMessage = 'Failed to update training.';
        setTimeout(() => this.individualMessage = '', 3000);
      }
    });
  }

  clearIndividualTraining(): void {
    if (!this.selectedIndividualPlayer) return;
    this.individualSaving = true;

    this.http.delete<any>(urlApp + `/training/individual/${this.selectedIndividualPlayer.id}`).subscribe({
      next: (data) => {
        this.individualSaving = false;
        this.indFocus = null;
        this.indAttribute = null;
        this.indRole = null;
        this.selectedIndividualPlayer.individualFocus = null;
        this.selectedIndividualPlayer.individualAttribute = null;
        this.selectedIndividualPlayer.individualRole = null;
        this.individualMessage = 'Individual training cleared.';
        setTimeout(() => this.individualMessage = '', 3000);
      },
      error: () => {
        this.individualSaving = false;
        this.individualMessage = 'Failed to clear training.';
        setTimeout(() => this.individualMessage = '', 3000);
      }
    });
  }

  getIndividualTrainingSummary(player: any): string {
    if (player.individualAttribute) return 'Attribute: ' + player.individualAttribute;
    if (player.individualFocus) return 'Focus: ' + player.individualFocus;
    if (player.individualRole) return 'Role: ' + player.individualRole;
    return 'Team Focus';
  }

  getSessionColor(type: string): string {
    switch(type) {
      case 'Physical': return '#e67e22';
      case 'General': return '#3498db';
      case 'Tactical': return '#2ecc71';
      case 'Match': return '#8e44ad';
      case 'Extra': return '#16a085';
      case 'Rest': return '#7f8c8d';
      default: return '#333';
    }
  }

  addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
