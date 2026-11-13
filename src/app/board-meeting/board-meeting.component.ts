import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

/** The first-day meeting with the chairman and the general director (design DESIGN_START_CARIERA §6.2). */
@Component({
  selector: 'app-board-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="board-page">
      <h1>Meeting with the board</h1>
      <div class="error" *ngIf="error">{{ error }}</div>
      <p *ngIf="meeting?.status === 'NONE'">There is no meeting with the board this season.</p>

      <ng-container *ngIf="meeting && meeting.status !== 'NONE'">
        <div class="speaker">
          <h2>{{ meeting.chairmanName }}, chairman</h2>
          <blockquote>{{ meeting.chairmanWords }}</blockquote>
        </div>
        <div class="speaker" *ngIf="meeting.directorName">
          <h2>{{ meeting.directorName }}, general director</h2>
          <blockquote>{{ meeting.directorWords }}</blockquote>
        </div>

        <div class="question" *ngIf="meeting.directorAsks && meeting.status === 'PENDING'">
          <p class="hint">A private word: the chairman will not hear your answer. Leave it unanswered
            and by the end of the month he takes it as "we'll see".</p>
          <label *ngFor="let a of answers" class="answer">
            <input type="radio" name="answer" [value]="a.value" [(ngModel)]="answer"> {{ a.label }}
          </label>
          <button type="button" (click)="reply()" [disabled]="saving || !answer">Answer</button>
        </div>
        <button type="button" *ngIf="!meeting.directorAsks && meeting.status === 'PENDING'" (click)="close()" [disabled]="saving">
          Thank them and leave</button>
        <p *ngIf="meeting.status === 'HELD' && !meeting.directorAsks">You met the board.</p>
        <p *ngIf="meeting.answeredWith">Your answer to the director: <em>{{ meeting.answeredWith }}</em></p>
      </ng-container>
    </section>
  `,
  styles: [`
    .board-page { padding: 16px; max-width: 820px; }
    .speaker, .question { margin: 16px 0; }
    blockquote { margin: 8px 0 12px; padding: 8px 12px; border-left: 3px solid rgba(255,255,255,.35); font-style: italic; }
    .answer { display: block; margin: 4px 0; cursor: pointer; }
    .hint { opacity: .75; font-size: 13px; }
    .error { color: #ff8a80; }
    button { padding: 8px 16px; cursor: pointer; margin-top: 8px; }
  `]
})
export class BoardMeetingComponent implements OnInit {
  meeting: any = null;
  answer: string | null = null;
  saving = false;
  error = '';

  readonly answers = [
    { value: 'WITH_YOU', label: '"Yes, I\'m with you."' },
    { value: 'DEPENDS', label: '"Depends on what you propose."' },
    { value: 'WAIT_AND_SEE', label: '"We\'ll see, I\'ve only just arrived."' },
    { value: 'FOR_THE_CLUB', label: '"I work for the club and the chairman."' }
  ];

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<any>(urlApp + `/board-meeting/${this.teamService.teamId}`).subscribe({
      next: m => this.meeting = m,
      error: () => this.error = 'The board is unavailable.'
    });
  }

  close(): void {
    this.saving = true;
    this.http.post<any>(urlApp + '/board-meeting/close', { teamId: this.teamService.teamId }).subscribe({
      next: m => { this.meeting = m; this.saving = false; },
      error: e => { this.error = e?.error?.error || 'The meeting could not be closed.'; this.saving = false; }
    });
  }

  reply(): void {
    this.saving = true;
    this.http.post<any>(urlApp + '/board-meeting/answer', { teamId: this.teamService.teamId, answer: this.answer }).subscribe({
      next: m => { this.meeting = m; this.saving = false; },
      error: e => { this.error = e?.error?.error || 'The answer could not be given.'; this.saving = false; }
    });
  }
}
