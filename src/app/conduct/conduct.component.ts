import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface ConductLine {
  offence: string;
  label: string;
  standardWeeks: number;
  fineWeeks: number;
  active: boolean;
}

/** The club's code of conduct (design DESIGN_START_CARIERA §6.4): fines in weeks of wages per offence. */
@Component({
  selector: 'app-conduct',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="conduct-page">
      <h1>Code of conduct</h1>
      <p class="intro">Fines are taken from the player's wages and paid to the club. The code starts at the standard;
        players only take offence if you set a fine above it.</p>
      <div class="error" *ngIf="error">{{ error }}</div>
      <table *ngIf="lines.length">
        <thead><tr><th>Offence</th><th>Standard</th><th>Your fine</th></tr></thead>
        <tbody>
          <tr *ngFor="let line of lines">
            <td>{{ line.label }}<small *ngIf="!line.active"> (not tracked yet)</small></td>
            <td>{{ weeksLabel(line.standardWeeks) }}</td>
            <td>
              <select [(ngModel)]="fines[line.offence]">
                <option *ngFor="let w of allowedWeeks" [ngValue]="w">{{ weeksLabel(w) }}</option>
              </select>
              <span class="above" *ngIf="fines[line.offence] > line.standardWeeks">above standard</span>
            </td>
          </tr>
        </tbody>
      </table>
      <button type="button" (click)="save()" [disabled]="saving || !lines.length">Save code</button>
      <p class="result" *ngIf="message">{{ message }}</p>
    </section>
  `,
  styles: [`
    .conduct-page { padding: 16px; max-width: 760px; }
    .intro { opacity: .8; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,.12); }
    small { opacity: .65; }
    .above { margin-left: 8px; font-size: 12px; color: #f0b35a; }
    .error { color: #ff8a80; }
    .result { margin-top: 10px; }
    button { padding: 8px 16px; cursor: pointer; }
  `]
})
export class ConductComponent implements OnInit {
  lines: ConductLine[] = [];
  allowedWeeks: number[] = [];
  fines: Record<string, number> = {};
  saving = false;
  message = '';
  error = '';

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.http.get<any>(`${urlApp}/conduct/${this.teamService.teamId}`).subscribe({
      next: data => this.apply(data),
      error: () => this.error = 'Could not load the code of conduct.'
    });
  }

  weeksLabel(weeks: number): string {
    if (weeks === 0) return 'Nothing';
    if (weeks === 0.5) return 'Half a week';
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }

  save(): void {
    this.saving = true;
    this.message = '';
    this.error = '';
    this.http.put<any>(`${urlApp}/conduct`, { teamId: this.teamService.teamId, fines: this.fines }).subscribe({
      next: data => {
        this.apply(data);
        this.saving = false;
        this.message = data.moraleDrop > 0
          ? `Saved. The squad did not like the harsher fines: morale -${data.moraleDrop}.`
          : 'Saved.';
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.error || 'Could not save the code.';
      }
    });
  }

  private apply(data: any): void {
    this.lines = data.code || [];
    this.allowedWeeks = data.allowedWeeks || [];
    this.fines = {};
    for (const line of this.lines) this.fines[line.offence] = line.fineWeeks;
  }
}
