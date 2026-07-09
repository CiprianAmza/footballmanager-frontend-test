import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-game-setup',
  templateUrl: './game-setup.component.html',
  styleUrls: ['./game-setup.component.css']
})
export class GameSetupComponent implements OnInit {

  @Output() setupComplete = new EventEmitter<{ teamId: number | null; managerName: string; freeAgent?: boolean }>();

  managerName = '';
  managerAge = 35;
  selectedTeamId: number | null = null;
  leagues: any[] = [];
  loading = true;
  submitting = false;
  error = '';

  constructor(private http: HttpClient, private authService: AuthService) {}

  ngOnInit(): void {
    this.http.get<any[]>(urlApp + '/game/availableTeams').subscribe({
      next: (data) => {
        this.leagues = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading teams:', err);
        this.error = 'Failed to load teams. Is the backend running?';
        this.loading = false;
      }
    });
  }

  selectTeam(teamId: number): void {
    this.selectedTeamId = teamId;
  }

  getSelectedTeamName(): string {
    for (const league of this.leagues) {
      const team = league.teams?.find((t: any) => t.teamId === this.selectedTeamId);
      if (team) return team.teamName;
    }
    return '';
  }

  submit(): void {
    if (!this.managerName.trim()) {
      this.error = 'Please enter your manager name.';
      return;
    }
    if (!this.selectedTeamId) {
      this.error = 'Please select a team (or click "Start as Free Agent" to begin without one).';
      return;
    }
    this.postSetup({ teamId: this.selectedTeamId, freeAgent: false });
  }

  /**
   * Start as a free agent — no team selected. The backend creates a manager
   * Human attached to no club, seeds the inbox with welcome job offers, and
   * the FE drops the user straight into the job-search view.
   */
  startAsFreeAgent(): void {
    if (!this.managerName.trim()) {
      this.error = 'Please enter your manager name.';
      return;
    }
    this.error = '';
    this.postSetup({ teamId: null, freeAgent: true });
  }

  private postSetup(body: { teamId: number | null; freeAgent: boolean }): void {
    this.error = '';
    this.submitting = true;

    this.http.post<any>(urlApp + '/game/setup', {
      managerName: this.managerName.trim(),
      managerAge: this.managerAge,
      teamId: body.teamId,
      freeAgent: body.freeAgent,
      userId: this.authService.currentUserId
    }).subscribe({
      next: (result) => {
        if (result.success) {
          this.setupComplete.emit({
            teamId: result.humanTeamId ?? null,
            managerName: result.managerName,
            freeAgent: !!result.freeAgent
          });
        } else {
          this.error = result.error || 'Setup failed.';
          this.submitting = false;
        }
      },
      error: (err) => {
        console.error('Setup error:', err);
        this.error = 'Failed to save setup. Please try again.';
        this.submitting = false;
      }
    });
  }
}
