import { formatMoney } from '../shared/ui-formatters';
import { ActivatedRoute } from '@angular/router';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { catchError, map, Observable, of, startWith } from 'rxjs';
import { ClubStats, LEADER_CATEGORIES, Leader, PlayerStats } from '../league-competition/league-competition.data';
import { CompetitionDetailsData, Details, DetailsView } from './competition-details.data';

@Component({
  selector: 'app-competition-details',
  templateUrl: './competition-details.component.html',
  styleUrls: ['./competition-details.component.css']
})
export class CompetitionDetailsComponent implements OnChanges {
  @Input() id = '';
  @Input() season = 0;
  @Input() view: DetailsView = 'teams';
  @Input() metric = '';
  @Input() metricQuery: Record<string, string> = {};
  readonly leaderCategories = LEADER_CATEGORIES;
  sortColumn = '';
  sortOrder: 'ascending' | 'descending' = 'ascending';
  private readonly collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  readonly labels: Record<DetailsView, string> = {
    teams: 'Participating clubs', rules: 'Competition rules', stadiums: 'Stadiums', managers: 'Managers',
    tickets: 'Season tickets', news: 'Headlines', winners: 'Past winners', 'team-stats': 'Club statistics',
    'team-overview': 'Team stats overview', 'player-overview': 'Player stats overview', 'player-stats': 'Player statistics',
    'record-results': 'Result records', 'record-sequences': 'Longest unbeaten runs', 'record-clubs': 'Club records',
    'record-attendance': 'Average attendance', 'record-overview': 'Records overview', 'round-history': 'Past cup progress', injuries: 'Injury table', suspensions: 'Suspensions', referees: 'Referees'
  };
  details?: Observable<{ value: Details | null; loading: boolean; failed: boolean }>;

  constructor(private data: CompetitionDetailsData, private route: ActivatedRoute) {}

  metricKeys(categories: Record<string, unknown>): string[] {
    return Object.keys(categories);
  }

  metricLabel(key: string): string {
    if (key === 'xg') return 'Expected goals';
    if (key === 'possession') return 'Average possession';
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, first => first.toUpperCase());
  }

  hasCoefficients(clubs: { coefficient?: number }[]): boolean {
    return clubs.some(club => club.coefficient != null);
  }

  sortBy(column: string, numeric = false): void {
    this.sortOrder = this.sortColumn === column ? (this.sortOrder === 'ascending' ? 'descending' : 'ascending')
      : numeric ? 'descending' : 'ascending';
    this.sortColumn = column;
  }

  sorted<T extends object>(rows: T[]): T[] {
    if (!this.sortColumn) return rows;
    if (this.sortColumn === 'rank') return this.sortOrder === 'ascending' ? rows : [...rows].reverse();
    const value = (row: T) => this.sortColumn.split('.').reduce<unknown>(
      (parent, key) => (parent as Record<string, unknown> | undefined)?.[key], row
    );
    return [...rows].sort((a, b) => {
      const left = value(a), right = value(b);
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right : this.collator.compare(String(left), String(right));
      return this.sortOrder === 'ascending' ? comparison : -comparison;
    });
  }

  readonly clubGroups = [
    { label: 'General', keys: ['possession', 'passAccuracy', 'duelsWon', 'aerialDuels'] },
    { label: 'Attacking', keys: ['goalsScored', 'xg', 'shots', 'shotsOnTarget', 'bigChances', 'corners', 'offsides'] },
    { label: 'Defending', keys: ['goalsConceded', 'tackles', 'interceptions', 'clearances'] },
    { label: 'Discipline', keys: ['yellowCards', 'redCards', 'fouls'] },
    { label: 'Finances', keys: ['transferBudget', 'totalFinances', 'monthlyWages', 'annualWages', 'transferSpent', 'transferEarned', 'transferProfit'] }
  ];
  readonly teamOverviewKeys = ['goalsScored', 'goalsConceded', 'shots', 'shotsOnTarget', 'passAccuracy',
    'possession', 'tackles', 'xg', 'corners', 'bigChances'];
  readonly playerGroups = [
    { label: 'General', keys: ['topRated', 'disciplinary'] },
    { label: 'Attacking', keys: ['topScorers', 'topAssisters'] },
    { label: 'Defending', keys: ['cleanSheets'] }
  ];

  formatClubStat(value: number, unit: string): string {
    if (unit.startsWith('€')) return formatMoney(value, true);
    const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
    return unit.startsWith('%') ? number + '%' : unit === 'total' ? number : number + ' ' + unit;
  }

  clubMetric(stats: ClubStats): string {
    const requested = this.metric || this.route.snapshot.queryParamMap.get('metric') || '';
    return stats.categories[requested] ? requested : stats.categories['goalsScored'] ? 'goalsScored' : this.metricKeys(stats.categories)[0];
  }

  playerMetric() {
    return this.leaderCategories.find(category => category.key === this.metric) || this.leaderCategories[0];
  }

  playerCategory(key: string) {
    return this.leaderCategories.find(category => category.key === key);
  }

  playerRows(stats: PlayerStats, key: string): Leader[] {
    const category = this.playerCategory(key);
    return category ? stats[category.key] || [] : [];
  }

  metricParams(metric: string) {
    return { ...this.metricQuery, metric };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.id || !this.season) return;
    if (!changes['id'] && !changes['season'] && !changes['view'] && !changes['metric']) return;
    this.sortColumn = '';
    if (!changes['id'] && !changes['season'] && !changes['view']) return;
    this.details = this.data.load(this.id, this.season, this.view).pipe(
      map(value => ({ value, loading: false, failed: false })),
      startWith({ value: null, loading: true, failed: false }),
      catchError(() => of({ value: null, loading: false, failed: true }))
    );
  }
}
