import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ArenaCompetition, ArenaRunResult, ArenaTableRow } from './tactic-arena.service';

/**
 * "Competition overview" of one run: one card per competition (the game's club competitions
 * cards) and the final league table (the season summary standings table).
 */
@Component({
  selector: 'app-arena-competitions-panel',
  standalone: true,
  imports: [CommonModule],
  styleUrls: [
    '../competition-list/competition-list.component.css',
    '../season-summary/season-summary.component.css',
    './arena-panels.css'
  ],
  template: `
    <main class="comps-container arena-panel">
      <div class="page-header">
        <div><h1>COMPETITION OVERVIEW</h1>
          <span class="subtitle">{{ result.teamName }} · Season {{ result.season }}</span>
        </div>
        <div class="arena-trophies" *ngIf="trophies.length">🏆 {{ trophies.join(' · ') }}</div>
      </div>

      <div class="cards-grid">
        <article class="comp-card" *ngFor="let comp of competitions">
          <div class="card-header" [style.--competition-color]="color(comp)">
            <div class="logo-box" aria-hidden="true"><span>{{ comp.name | slice:0:1 }}</span></div>
            <h2 class="comp-title">{{ comp.name }}<span *ngIf="comp.trophy"> 🏆</span></h2>
          </div>

          <div class="card-section" *ngIf="isLeague(comp)">
            <div class="league-info">
              <div class="info-block">
                <span class="label">POSITION</span>
                <div class="position-box">
                  <span class="pos-val">{{ comp.position ?? '—' }}</span>
                  <span class="pos-total" *ngIf="comp.totalTeams || result.leagueTable.length">/{{ comp.totalTeams || result.leagueTable.length }}</span>
                </div>
              </div>
              <div class="info-block right">
                <span class="label">POINTS</span>
                <div class="position-box"><span class="pos-val">{{ comp.points ?? '—' }}</span></div>
              </div>
            </div>
            <div class="journey-grid">
              <div class="journey-row">
                <span>RECORD</span>
                <strong>{{ comp.wins ?? 0 }}W {{ comp.draws ?? 0 }}D {{ comp.loses ?? 0 }}L</strong>
                <small>Goals {{ comp.goalsFor ?? 0 }}–{{ comp.goalsAgainst ?? 0 }} · {{ comp.games ?? 0 }} played</small>
              </div>
            </div>
          </div>

          <div class="card-section lifecycle" *ngIf="!isLeague(comp)">
            <div class="info-block">
              <span class="label">STAGE REACHED</span>
              <div class="position-box">
                <span class="pos-val lifecycle-status">{{ comp.stageReached || comp.statusLabel || comp.currentStage || '—' }}</span>
              </div>
            </div>
            <div class="journey-grid">
              <div class="journey-row" *ngIf="comp.entryStage">
                <span>ENTRY</span><strong>{{ comp.entryStage }}</strong>
              </div>
              <div class="journey-row" [class.eliminated]="comp.status === 'ELIMINATED' || comp.status === 'RUNNER_UP'">
                <span>OUTCOME</span>
                <strong>{{ comp.trophy ? 'Winner' : (comp.statusLabel || comp.status || '—') }}</strong>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div class="standings-group arena-table" *ngIf="result.leagueTable.length">
        <h2>{{ result.leagueName }} · final table</h2>
        <table class="standings-table">
          <thead>
            <tr>
              <th class="pos">#</th><th class="team-col">Team</th>
              <th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th class="pts">Pts</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of table; let i = index" [class.human-team]="row.teamId === result.teamId">
              <td class="pos">{{ row.position || i + 1 }}</td>
              <td class="team-col">{{ row.name || row.teamName }}</td>
              <td>{{ row.games }}</td><td>{{ row.wins }}</td><td>{{ row.draws }}</td><td>{{ row.loses }}</td>
              <td>{{ row.goalsFor }}</td><td>{{ row.goalsAgainst }}</td>
              <td>{{ gd(row) }}</td>
              <td class="pts">{{ row.points }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  `
})
export class ArenaCompetitionsPanelComponent {
  @Input() result!: ArenaRunResult;

  get competitions(): ArenaCompetition[] {
    return [...(this.result.competitions || [])]
      .sort((left, right) => Number(this.isLeague(right)) - Number(this.isLeague(left)));
  }

  get trophies(): string[] {
    return (this.result.competitions || []).filter(comp => comp.trophy).map(comp => comp.name);
  }

  get table(): ArenaTableRow[] {
    return [...(this.result.leagueTable || [])].sort((left, right) =>
      (Number(left.position) || 0) - (Number(right.position) || 0)
      || (Number(right.points) || 0) - (Number(left.points) || 0));
  }

  isLeague(comp: ArenaCompetition): boolean {
    return comp.kind === 'LEAGUE' || comp.typeId === 1 || comp.typeId === 3;
  }

  gd(row: ArenaTableRow): string {
    const value = (Number(row.goalsFor) || 0) - (Number(row.goalsAgainst) || 0);
    return value > 0 ? `+${value}` : `${value}`;
  }

  color(comp: ArenaCompetition): string {
    switch (comp.typeId) {
      case 1: return '#38003c';
      case 2: return '#e74c3c';
      case 3: return '#2c3e50';
      case 4: return '#2e3192';
      case 5: return '#009460';
      default: return '#34495e';
    }
  }
}
