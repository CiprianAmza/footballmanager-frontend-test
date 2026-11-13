import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

/** The first staff meeting of a season (design DESIGN_START_CARIERA §6.4). */
@Component({
  selector: 'app-staff-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="staff-meeting-page">
      <h1>Staff meeting · season {{ meeting?.season }}</h1>
      <div class="error" *ngIf="error">{{ error }}</div>

      <ng-container *ngIf="meeting?.status === 'PENDING'">
        <p class="hint">Tell your staff what you expect. How far it is from the way they work decides how they take it.</p>
        <div class="question">
          <h2>Training emphasis</h2>
          <select [(ngModel)]="emphasis">
            <option *ngFor="let e of emphases" [ngValue]="e.value">{{ e.label }}</option>
          </select>
        </div>
        <div class="question">
          <h2>Philosophy</h2>
          <label class="answer"><input type="radio" name="philosophy" value="YOUTH" [(ngModel)]="philosophy"> Bring through young players</label>
          <label class="answer"><input type="radio" name="philosophy" value="RESULTS" [(ngModel)]="philosophy"> Results first</label>
        </div>
        <button type="button" (click)="hold()" [disabled]="saving">Meet the staff</button>
        <button type="button" class="refuse" (click)="refuse()" [disabled]="saving">Refuse the meeting</button>
      </ng-container>

      <ng-container *ngIf="meeting?.status === 'HELD'">
        <p>You asked for {{ label(meeting.emphasis) }} training and {{ meeting.philosophy === 'YOUTH' ? 'young players' : 'results first' }}.</p>
        <ul>
          <li *ngFor="let r of meeting.replies"><strong>{{ r.name }}</strong> ({{ r.role }}): <em>"{{ r.reply }}"</em></li>
        </ul>
        <p>Decide who stays and who goes on the <a routerLink="/staff">Staff</a> page.</p>
      </ng-container>
      <p *ngIf="meeting?.status === 'REFUSED'">You refused to meet your staff this season. They noticed.</p>
    </section>
  `,
  styles: [`
    .staff-meeting-page { padding: 16px; max-width: 820px; }
    .question { margin: 16px 0; }
    .answer { display: block; margin: 4px 0; cursor: pointer; }
    .hint { opacity: .75; font-size: 13px; }
    .error { color: #ff8a80; }
    button { padding: 8px 16px; cursor: pointer; margin-right: 8px; }
    .refuse { opacity: .8; }
  `]
})
export class StaffMeetingComponent implements OnInit {
  meeting: any = null;
  emphasis = 'TACTICAL';
  philosophy = 'RESULTS';
  saving = false;
  error = '';

  readonly emphases = [
    { value: 'ATTACKING', label: 'Attacking' }, { value: 'DEFENDING', label: 'Defending' },
    { value: 'TACTICAL', label: 'Tactical' }, { value: 'TECHNICAL', label: 'Technical' },
    { value: 'PHYSICAL', label: 'Physical' }
  ];

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.http.get<any>(urlApp + `/staff-meeting/${this.teamService.teamId}`).subscribe({
      next: m => this.meeting = m,
      error: () => this.error = 'The staff meeting is unavailable.'
    });
  }

  label(value: string): string {
    return (this.emphases.find(e => e.value === value)?.label || value).toLowerCase();
  }

  hold(): void {
    this.send('/staff-meeting', { teamId: this.teamService.teamId, emphasis: this.emphasis, philosophy: this.philosophy });
  }

  refuse(): void {
    this.send('/staff-meeting/refuse', { teamId: this.teamService.teamId });
  }

  private send(path: string, body: any): void {
    this.saving = true;
    this.http.post<any>(urlApp + path, body).subscribe({
      next: m => { this.meeting = m; this.saving = false; },
      error: e => { this.error = e?.error?.error || 'The meeting could not be held.'; this.saving = false; }
    });
  }
}
