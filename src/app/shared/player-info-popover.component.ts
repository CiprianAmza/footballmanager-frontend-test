import { Component, Input } from '@angular/core';

export interface PlayerInfoAttribute { name: string; value: string | number; }
export interface PlayerInfoView {
  id?: number;
  name: string;
  position?: string;
  teamName?: string;
  age?: number;
  estimatedRating?: number;
  rating?: number;
  scoutingAccuracy?: number;
  fitness?: number;
  morale?: number;
  currentStatus?: string;
  wage?: number;
  contractEndSeason?: number;
  seasonAppearances?: number;
  seasonMatchesPlayed?: number;
  seasonGoals?: number;
  seasonAssists?: number;
  importantAttributes?: PlayerInfoAttribute[];
}

@Component({
  selector: 'app-player-info-popover',
  template: `
    <span class="fm-player-popover">
      <button type="button" class="fm-player-popover-trigger" [attr.aria-label]="'Information about ' + player.name"
              aria-haspopup="true">i</button>
      <span class="fm-player-popover-card" role="tooltip">
        <span class="fm-player-popover-head">
          <span><strong>{{ player.name }}</strong><small>{{ player.position || 'Player' }} · {{ player.teamName || 'Free agent' }}</small></span>
          <app-rating-estimate [value]="rating" [accuracy]="player.scoutingAccuracy"></app-rating-estimate>
        </span>
        <span class="fm-player-popover-grid">
          <span><small>Age</small><strong>{{ player.age ?? '—' }}</strong></span>
          <span><small>Condition</small><strong>{{ player.fitness == null ? '—' : (player.fitness | fmPercent) }}</strong></span>
          <span><small>Morale</small><strong>{{ player.morale == null ? '—' : (player.morale | number:'1.0-0') }}</strong></span>
          <span><small>Status</small><strong>{{ player.currentStatus || 'Available' }}</strong></span>
          <span class="wide"><small>Contract</small><strong>{{ contractLabel }}</strong></span>
          <span class="wide"><small>Wage</small><strong><app-money [value]="player.wage || 0"></app-money> / month</strong></span>
        </span>
        <span class="fm-player-popover-season">Season {{ season }}</span>
        <span class="fm-player-popover-stats">
          <span><strong>{{ appearances }}</strong><small>Apps</small></span>
          <span><strong>{{ player.seasonGoals || 0 }}</strong><small>Goals</small></span>
          <span><strong>{{ player.seasonAssists || 0 }}</strong><small>Assists</small></span>
        </span>
        <span class="fm-player-popover-attributes" *ngIf="player.importantAttributes?.length">
          <span *ngFor="let attribute of player.importantAttributes">
            <small>{{ attribute.name }}</small><strong>{{ attribute.value }}</strong>
          </span>
        </span>
      </span>
    </span>
  `,
  styleUrls: ['./player-info-popover.component.css']
})
export class PlayerInfoPopoverComponent {
  @Input() player!: PlayerInfoView;
  @Input() season = 1;

  get rating(): number | undefined { return this.player?.estimatedRating ?? this.player?.rating; }
  get appearances(): number { return this.player?.seasonAppearances ?? this.player?.seasonMatchesPlayed ?? 0; }
  get contractLabel(): string {
    return this.player?.contractEndSeason ? `Through Season ${this.player.contractEndSeason}` : 'Not available';
  }
}
