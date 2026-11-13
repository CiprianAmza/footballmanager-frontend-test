import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface AgendaItem {
  competitionId: number;
  competitionName: string;
  league: boolean;
  ladder: string[];
  playersWish: string;
  managerTarget: string | null;
  relationDelta: number | null;
  bonusLevel: string | null;
  bonusPaid: number | null;
}

/** The meeting with the squad: a target per competition (design DESIGN_START_CARIERA §6.4). */
@Component({
  selector: 'app-squad-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <section class="meeting-page">
      <h1>Squad meeting · season {{ season }}</h1>
      <p class="intro">Tell the players what you aim for in each competition. They say what they expect;
        aiming a little higher inspires them, aiming far higher or lower costs their trust.
        A generous bonus lifts their morale now, a stingy one lowers it; it is paid at the end of the season
        only where your target is reached.
        Your <a routerLink="/conduct">code of conduct</a> is presented here too.</p>
      <div class="error" *ngIf="error">{{ error }}</div>
      <table *ngIf="items.length">
        <thead><tr><th>Competition</th><th>The players expect</th><th>Your target</th><th>Bonus if reached</th><th *ngIf="held">Trust</th></tr></thead>
        <tbody>
          <tr *ngFor="let item of items">
            <td>{{ item.competitionName }}</td>
            <td>{{ label(item.playersWish) }}</td>
            <td>
              <select *ngIf="!held" [(ngModel)]="targets[item.competitionId]">
                <option *ngFor="let step of item.ladder" [value]="step">{{ label(step) }}</option>
              </select>
              <span *ngIf="held">{{ label(item.managerTarget || '') }}</span>
            </td>
            <td>
              <select *ngIf="!held" [(ngModel)]="bonuses[item.competitionId]">
                <option value="MIN">Minimum (25% of a month's wages)</option>
                <option value="MID">Medium (50%)</option>
                <option value="MAX">Maximum (a full month)</option>
              </select>
              <span *ngIf="held">{{ bonusLabel(item.bonusLevel) }}<span *ngIf="item.bonusPaid !== null"> · paid {{ item.bonusPaid | number }}</span></span>
            </td>
            <td *ngIf="held" [class.up]="(item.relationDelta || 0) > 0" [class.down]="(item.relationDelta || 0) < 0">
              {{ (item.relationDelta || 0) > 0 ? '+' : '' }}{{ item.relationDelta }}
            </td>
          </tr>
        </tbody>
      </table>
      <p *ngIf="!items.length && !error">No competitions this season.</p>
      <button type="button" *ngIf="!held && items.length" (click)="hold()" [disabled]="saving">Hold the meeting</button>
      <button type="button" class="refuse" *ngIf="!held" (click)="refuse()" [disabled]="saving">Refuse the meeting</button>
      <p class="result" *ngIf="held && !refused">The meeting has been held this season.</p>
      <p class="result" *ngIf="refused">You refused the meeting this season: no targets, no bonuses, and the players
        took it badly (trust and morale -5).</p>
    </section>
  `,
  styles: [`
    .meeting-page { padding: 16px; max-width: 820px; }
    .intro { opacity: .8; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,.12); }
    .up { color: #7fd68f; } .down { color: #ff8a80; }
    .error { color: #ff8a80; }
    button { padding: 8px 16px; cursor: pointer; margin-right: 8px; }
    .refuse { opacity: .8; }
  `]
})
export class SquadMeetingComponent implements OnInit {
  season = 0;
  held = false;
  refused = false;
  items: AgendaItem[] = [];
  targets: Record<number, string> = {};
  bonuses: Record<number, string> = {};
  saving = false;
  error = '';

  private static readonly LABELS: Record<string, string> = {
    TITLE: 'Win the title', TOP_3: 'Top 3', TOP_HALF: 'Top half', AVOID_RELEGATION: 'Avoid relegation',
    WIN: 'Win it', FINAL: 'Reach the final', SEMI_FINAL: 'Reach the semi-finals',
    QUARTER_FINAL: 'Reach the quarter-finals', TAKE_PART: 'Just take part'
  };

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.http.get<any>(`${urlApp}/squad-meeting/${this.teamService.teamId}`).subscribe({
      next: agenda => this.apply(agenda),
      error: () => this.error = 'Could not load the meeting.'
    });
  }

  bonusLabel(level: string | null): string {
    return level === 'MIN' ? 'Minimum' : level === 'MAX' ? 'Maximum' : 'Medium';
  }

  label(step: string): string {
    return SquadMeetingComponent.LABELS[step] || step;
  }

  refuse(): void {
    this.saving = true;
    this.error = '';
    this.http.post<any>(`${urlApp}/squad-meeting/refuse`, { teamId: this.teamService.teamId }).subscribe({
      next: agenda => { this.apply(agenda); this.saving = false; },
      error: err => { this.saving = false; this.error = err?.error?.error || 'Could not refuse the meeting.'; }
    });
  }

  hold(): void {
    this.saving = true;
    this.error = '';
    this.http.post<any>(`${urlApp}/squad-meeting`, { teamId: this.teamService.teamId, targets: this.targets, bonuses: this.bonuses }).subscribe({
      next: agenda => { this.apply(agenda); this.saving = false; },
      error: err => { this.saving = false; this.error = err?.error?.error || 'Could not hold the meeting.'; }
    });
  }

  private apply(agenda: any): void {
    this.season = agenda.season;
    this.held = agenda.held;
    this.refused = agenda.refused;
    this.items = agenda.items || [];
    this.targets = {};
    this.bonuses = {};
    for (const item of this.items) {
      this.targets[item.competitionId] = item.managerTarget || item.playersWish;
      this.bonuses[item.competitionId] = item.bonusLevel || 'MID';
    }
  }
}
