import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { catchError, map, Observable, of, startWith } from 'rxjs';
import { LeagueCompetitionData, LeagueMatch, MatchSummary } from '../league-competition/league-competition.data';

@Component({
  selector: 'app-competition-recap',
  templateUrl: './competition-recap.component.html',
  styleUrls: ['./competition-details.component.css']
})
export class CompetitionRecapComponent implements OnChanges {
  @Input() id = '';
  @Input() season = 0;
  @Input() matches: LeagueMatch[] = [];
  selected?: LeagueMatch;
  summary?: Observable<{ report?: MatchSummary; state: 'loading' | 'ready' | 'error' }>;

  constructor(private data: LeagueCompetitionData) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['id'] && !changes['season'] && this.selected && this.matches.includes(this.selected)) return;
    this.selected = undefined;
    this.summary = undefined;
  }

  select(match: LeagueMatch): void {
    if (!match.team1Id || !match.team2Id) return;
    this.selected = match;
    this.summary = this.data.matchSummary(this.id, this.season, match.round, match.team1Id, match.team2Id).pipe(
      map(report => ({ report, state: 'ready' as const })),
      startWith({ state: 'loading' as const }), catchError(() => of({ state: 'error' as const }))
    );
  }
}
