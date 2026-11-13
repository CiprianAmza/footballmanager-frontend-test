import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

/** The first press conference at a new club (design DESIGN_START_CARIERA §6.4). */
@Component({
  selector: 'app-first-press-conference',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="press-page">
      <h1>First press conference · season {{ conference?.season }}</h1>
      <div class="error" *ngIf="error">{{ error }}</div>

      <ng-container *ngIf="conference && conference.status === 'PENDING'">
        <div class="question" *ngIf="conference.pundit">
          <h2>About your appointment</h2>
          <p>A reporter reads out what {{ conference.pundit.analystName }} said about you:</p>
          <blockquote>{{ conference.pundit.quote }}</blockquote>
          <label *ngFor="let a of answers" class="answer">
            <input type="radio" name="articleAnswer" [value]="a.value" [(ngModel)]="articleAnswer"> {{ a.label }}
          </label>
        </div>

        <div class="question" *ngFor="let q of conference.targets">
          <h2>{{ q.league ? 'Your target in the league' : 'And in ' + q.competitionName + '?' }}</h2>
          <p class="hint">What you say here is a public promise: kept, it lifts your reputation
            ({{ q.league ? '+150' : '+75' }}); missed, it costs you ({{ q.league ? '-150' : '-75' }}).</p>
          <select [(ngModel)]="targets[q.competitionId]">
            <option [ngValue]="null">I won't promise anything</option>
            <option *ngFor="let step of q.ladder" [ngValue]="step">{{ label(step) }}</option>
          </select>
        </div>

        <div class="question" *ngIf="conference.puppetQuestion">
          <h2>"Are you just the chairman's puppet?"</h2>
          <p class="hint">Whatever you say here is public: the chairman and the director will both hear it.</p>
          <label *ngFor="let a of puppetAnswers" class="answer">
            <input type="radio" name="puppetAnswer" [value]="a.value" [(ngModel)]="puppetAnswer"> {{ a.label }}
          </label>
        </div>

        <button type="button" (click)="hold()" [disabled]="saving">Face the press</button>
        <button type="button" class="refuse" (click)="refuse()" [disabled]="saving">Refuse the conference</button>
      </ng-container>

      <ng-container *ngIf="conference && conference.status === 'HELD'">
        <p>You faced the press this season.</p>
        <ul>
          <li *ngFor="let q of conference.targets">{{ q.competitionName }}:
            {{ q.promised ? 'you promised ' + label(q.promised) : 'no promise' }}</li>
        </ul>
      </ng-container>
      <p *ngIf="conference && conference.status === 'REFUSED'">You refused the press this season:
        your reputation suffered and the pundits have not forgotten.</p>
    </section>
  `,
  styles: [`
    .press-page { padding: 16px; max-width: 820px; }
    .question { margin: 16px 0; }
    blockquote { margin: 8px 0 12px; padding: 8px 12px; border-left: 3px solid rgba(255,255,255,.35); font-style: italic; }
    .answer { display: block; margin: 4px 0; cursor: pointer; }
    .hint { opacity: .75; font-size: 13px; }
    .error { color: #ff8a80; }
    button { padding: 8px 16px; cursor: pointer; margin-right: 8px; }
    .refuse { opacity: .8; }
  `]
})
export class FirstPressConferenceComponent implements OnInit {
  conference: any = null;
  articleAnswer = 'NO_COMMENT';
  puppetAnswer = 'NO_COMMENT';

  readonly puppetAnswers = [
    { value: 'FOR_THE_CLUB', label: '"I work for the club, and the chairman put his faith in me."' },
    { value: 'WITH_THE_DIRECTOR', label: '"The director and I work well together."' },
    { value: 'MY_DRESSING_ROOM', label: '"I make the decisions in the dressing room."' },
    { value: 'NO_COMMENT', label: '"No comment."' }
  ];
  targets: Record<number, string | null> = {};
  saving = false;
  error = '';

  readonly answers = [
    { value: 'PROVE_WRONG', label: '"I will prove him wrong."' },
    { value: 'FAIR_POINT', label: '"It is a fair point. I have work to do."' },
    { value: 'NO_COMMENT', label: '"No comment."' },
    { value: 'ATTACK', label: '"He does not know what he is talking about."' }
  ];

  private static readonly LABELS: Record<string, string> = {
    TITLE: 'Win the title', TOP_3: 'Top 3', TOP_HALF: 'Top half', AVOID_RELEGATION: 'Avoid relegation',
    WIN: 'Win it', FINAL: 'Reach the final', SEMI_FINAL: 'Reach the semi-finals',
    QUARTER_FINAL: 'Reach the quarter-finals', TAKE_PART: 'Just take part'
  };

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.http.get<any>(`${urlApp}/press-conference/first/${this.teamService.teamId}`).subscribe({
      next: c => this.apply(c),
      error: () => this.error = 'Could not load the press conference.'
    });
  }

  label(step: string): string {
    return FirstPressConferenceComponent.LABELS[step] || step;
  }

  hold(): void {
    const targets: Record<number, string> = {};
    for (const [id, step] of Object.entries(this.targets)) if (step) targets[Number(id)] = step;
    this.post('', { teamId: this.teamService.teamId, articleAnswer: this.articleAnswer, targets,
      puppetAnswer: this.conference?.puppetQuestion ? this.puppetAnswer : null });
  }

  refuse(): void {
    this.post('/refuse', { teamId: this.teamService.teamId });
  }

  private post(path: string, body: any): void {
    this.saving = true;
    this.error = '';
    this.http.post<any>(`${urlApp}/press-conference/first${path}`, body).subscribe({
      next: c => { this.apply(c); this.saving = false; },
      error: err => { this.saving = false; this.error = err?.error?.error || 'Could not complete the press conference.'; }
    });
  }

  private apply(conference: any): void {
    this.conference = conference;
    this.targets = {};
    for (const q of conference.targets || []) this.targets[q.competitionId] = q.promised || null;
  }
}
