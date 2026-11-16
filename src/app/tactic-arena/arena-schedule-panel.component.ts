import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ArenaMatch, ArenaRunResult } from './tactic-arena.service';

/**
 * The full season schedule of one run, drawn with the game's fixtures calendar
 * (same markup classes and the fixtures page stylesheet).
 */
@Component({
  selector: 'app-arena-schedule-panel',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['../fixtures/fixtures.component.css', './arena-panels.css'],
  template: `
    <div class="fixtures-container arena-panel">
      <div class="page-header">
        <h1>FIXTURES &amp; RESULTS</h1>
        <div class="arena-panel-meta">
          {{ result.teamName }} · Season {{ result.season }} · {{ played }} matches · {{ wins }}W {{ draws }}D {{ losses }}L
        </div>
      </div>
      <div class="calendar-view">
        <div class="calendar-scroll arena-no-scroll">
          <table class="calendar-table">
            <thead>
              <tr>
                <th class="cal-round">Date</th>
                <th class="cal-comp">Competition</th>
                <th class="cal-comp">Stage</th>
                <th class="cal-venue">Match</th>
                <th class="cal-opponent">Opponent</th>
                <th class="cal-result">Result</th>
                <th class="cal-result">xG</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let match of result.matches"
                  [class.played-row]="isPlayed(match)" [class.upcoming-row]="!isPlayed(match)"
                  [class.arena-before-run]="!match.inRun">
                <td class="cal-round">{{ match.date || ('Day ' + match.day) }}</td>
                <td class="cal-comp">
                  <span class="comp-type-badge" [ngClass]="compTypeClass(match.competitionType, match.competitionName)">
                    {{ match.competitionName | slice:0:3 | uppercase }}
                  </span>
                  <span class="comp-full-name">{{ match.competitionName }}</span>
                </td>
                <td class="cal-comp">{{ match.roundLabel || ('Round ' + match.roundNumber) }}</td>
                <td class="cal-venue">
                  <span class="venue-badge" [ngClass]="{'venue-home': match.homeOrAway === 'H', 'venue-away': match.homeOrAway === 'A'}">
                    {{ match.homeTeamAbbr || 'TBD' }} v {{ match.awayTeamAbbr || 'TBD' }}
                  </span>
                </td>
                <td class="cal-opponent">{{ match.opponentTeam || 'TBD' }}</td>
                <td class="cal-result">
                  <span *ngIf="isPlayed(match)" class="cal-score-badge"
                        [ngClass]="{'cal-win': match.resultOutcome === 'W', 'cal-draw': match.resultOutcome === 'D', 'cal-loss': match.resultOutcome === 'L'}">
                    {{ match.resultOutcome }} {{ match.score }}
                  </span>
                  <span *ngIf="!isPlayed(match)" class="cal-upcoming">—</span>
                  <span class="arena-decided" *ngIf="extra(match) as note">{{ note }}</span>
                </td>
                <td class="cal-result arena-xg">
                  <ng-container *ngIf="match.xgFor !== null && match.xgFor !== undefined">
                    {{ match.xgFor | number:'1.2-2' }} – {{ match.xgAgainst | number:'1.2-2' }}
                  </ng-container>
                  <ng-container *ngIf="match.xgFor === null || match.xgFor === undefined">—</ng-container>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="arena-panel-foot" *ngIf="beforeRun > 0">
        Dimmed rows were already played before the test started and are not part of the run.
      </div>
    </div>
  `
})
export class ArenaSchedulePanelComponent {
  @Input() result!: ArenaRunResult;

  isPlayed(match: ArenaMatch): boolean {
    return !!match.resultOutcome && match.resultOutcome !== 'Pending';
  }

  get played(): number { return this.result.matches.filter(match => this.isPlayed(match)).length; }
  get wins(): number { return this.result.matches.filter(match => match.resultOutcome === 'W').length; }
  get draws(): number { return this.result.matches.filter(match => match.resultOutcome === 'D').length; }
  get losses(): number { return this.result.matches.filter(match => match.resultOutcome === 'L').length; }
  get beforeRun(): number { return this.result.matches.filter(match => !match.inRun).length; }

  /** The game reports Diamond League matches as "League": they are told apart by name. */
  compTypeClass(type: string, name?: string): string {
    if (/diamond league/i.test(name || '')) return 'arena-comp-diamond';
    switch (type) {
      case 'Cup': return 'comp-cup';
      case 'European':
      case 'Continental': return 'comp-european';
      default: return 'comp-league';
    }
  }

  extra(match: ArenaMatch): string {
    const parts: string[] = [];
    if (match.penaltyTeam1Score != null && match.penaltyTeam2Score != null) {
      parts.push(`pens ${match.penaltyTeam1Score}-${match.penaltyTeam2Score}`);
    } else if (match.decidedBy && !['NORMAL', 'REGULAR', 'FRIENDLY'].includes(match.decidedBy)) {
      parts.push(match.decidedBy.toLowerCase().replace(/_/g, ' '));
    }
    if (match.aggregateTeam1Score != null && match.aggregateTeam2Score != null) {
      parts.push(`agg ${match.aggregateTeam1Score}-${match.aggregateTeam2Score}`);
    }
    return parts.join(' · ');
  }
}
