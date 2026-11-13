import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-game-setup',
  templateUrl: './game-setup.component.html',
  styleUrls: ['./game-setup.component.css']
})
export class GameSetupComponent implements OnInit {

  @Output() setupComplete = new EventEmitter<{ teamId: number | null; managerName: string; freeAgent?: boolean }>();
  /** Open a club or league page while choosing; the choice so far is kept. */
  @Output() browse = new EventEmitter<any[]>();

  managerName = '';
  managerAge = 35;
  // The manager's story (design: DESIGN_START_CARIERA §2.2). All optional.
  birthDay: number | null = null;
  birthMonth: number | null = null;
  birthNationId: number | null = null;
  favoriteTeamId: number | null = null;
  preferredTactic = '';
  playingCareer = 'NONE';
  coachingLicence = 'NONE';
  playingSeasons: { teamName: string; goals: number; assists: number }[] = [];
  options: any = { nations: [], tactics: [], playingCareers: [], coachingLicences: [], faceParts: {}, speciesByNation: {} };
  /** The face being built in the editor: the same indices players' faces use. */
  face: Record<string, number> = {};
  readonly faceEditorParts: { key: string; label: string }[] = [
    { key: 'skinTone', label: 'Skin' },
    { key: 'faceShape', label: 'Head' },
    { key: 'hairStyle', label: 'Hair' },
    { key: 'hairColor', label: 'Hair colour' },
    { key: 'browShape', label: 'Brows' },
    { key: 'eyeShape', label: 'Eyes' },
    { key: 'eyeColor', label: 'Eye colour' },
    { key: 'noseShape', label: 'Nose' },
    { key: 'mouthShape', label: 'Mouth' },
    { key: 'baseFaceId', label: 'Features' }
  ];
  readonly days = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  selectedTeamId: number | null = null;
  leagues: any[] = [];
  loading = true;
  submitting = false;
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<any>(urlApp + '/api/career/manager/options').subscribe({
      next: (options) => {
        this.options = options;
        this.randomFace();
      },
      error: (err) => console.error('Error loading manager options:', err)
    });
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

  openPage(commands: any[], event: Event): void {
    event.stopPropagation();
    this.browse.emit(commands);
  }

  get startingReputation(): number | null {
    return this.options.playingCareers.find((c: any) => c.value === this.playingCareer)?.reputation ?? null;
  }

  /** The species follows the nation of birth, as for players. */
  get faceSpecies(): string {
    return (this.birthNationId != null && this.options.speciesByNation?.[this.birthNationId]) || 'human';
  }

  partCount(key: string): number {
    return this.options.faceParts?.[key] || 1;
  }

  stepPart(key: string, delta: number): void {
    const count = this.partCount(key);
    this.face[key] = (((this.face[key] ?? 0) + delta) % count + count) % count;
  }

  randomFace(): void {
    const face: Record<string, number> = {};
    for (const part of this.faceEditorParts) {
      face[part.key] = Math.floor(Math.random() * this.partCount(part.key));
    }
    this.face = face;
  }

  addSeason(): void {
    if (this.playingSeasons.length < 30) this.playingSeasons.push({ teamName: '', goals: 0, assists: 0 });
  }

  removeSeason(index: number): void {
    this.playingSeasons.splice(index, 1);
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

    this.http.post<any>(urlApp + '/api/career/manager/setup', {
      managerName: this.managerName.trim(),
      managerAge: this.managerAge,
      teamId: body.teamId,
      freeAgent: body.freeAgent,
      birthDay: this.birthDay && this.birthMonth ? this.birthDay : null,
      birthMonth: this.birthDay && this.birthMonth ? this.birthMonth : null,
      birthNationId: this.birthNationId,
      favoriteTeamId: this.favoriteTeamId,
      preferredTactic: this.preferredTactic || null,
      playingCareer: this.playingCareer,
      coachingLicence: this.coachingLicence,
      face: Object.keys(this.face).length ? this.face : null,
      playingSeasons: this.playingSeasons
        .filter(s => s.teamName.trim())
        .map(s => ({ teamName: s.teamName.trim(), goals: Number(s.goals) || 0, assists: Number(s.assists) || 0 }))
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
        this.error = this.setupErrorMessage(err);
        this.submitting = false;
      }
    });
  }

  private setupErrorMessage(err: any): string {
    const backendError = err?.error?.error;
    if (typeof backendError === 'string' && backendError.trim()) {
      return backendError.trim();
    }
    if (typeof err?.error === 'string' && err.error.trim()) {
      return err.error.trim();
    }
    if (err?.status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    return 'Failed to save setup. Please try again.';
  }
}
