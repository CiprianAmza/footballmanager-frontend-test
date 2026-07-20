import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

type CompetitionSortKey =
  | 'teamName'
  | 'entryStage'
  | 'topElevenRating'
  | 'squadValue'
  | 'monthlyPayroll'
  | 'reputation'
  | 'status';

type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-competition-insights',
  templateUrl: './competition-insights.component.html',
  styleUrls: ['./competition-insights.component.css', './competition-insights.sorting.css']
})
export class CompetitionInsightsComponent implements OnChanges {
  @Input() competitionId: string | number = '';
  @Input() season: string | number = '';
  data: any = null;
  loading = false;
  sortKey: CompetitionSortKey | null = null;
  sortDirection: SortDirection = 'asc';

  constructor(private http: HttpClient, public teamService: TeamService) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.competitionId || !this.season) return;
    this.loading = true;
    this.sortKey = null;
    this.sortDirection = 'asc';
    const teamId = this.teamService.teamId || 0;
    this.http.get<any>(`${urlApp}/competition/${this.competitionId}/${this.season}/overview?teamId=${teamId}`)
      .subscribe({
        next: data => { this.data = data; this.loading = false; },
        error: () => { this.data = null; this.loading = false; }
      });
  }

  get sortedTeams(): any[] {
    const teams = this.data?.teams || [];
    if (!this.sortKey) return teams;

    const key = this.sortKey;
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...teams].sort((left, right) => {
      const leftValue = this.sortValue(left, key);
      const rightValue = this.sortValue(right, key);
      const leftEmpty = leftValue === null || leftValue === undefined || leftValue === '';
      const rightEmpty = rightValue === null || rightValue === undefined || rightValue === '';

      // Missing competition data stays at the bottom in either direction.
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;

      let comparison = 0;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        comparison = leftValue - rightValue;
      } else {
        comparison = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      }

      if (comparison !== 0) return comparison * direction;
      return String(left.teamName || '').localeCompare(String(right.teamName || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  setSort(key: CompetitionSortKey): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    this.sortKey = key;
    this.sortDirection = this.isNumericSort(key) ? 'desc' : 'asc';
  }

  sortIndicator(key: CompetitionSortKey): string {
    if (this.sortKey !== key) return '↕';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  sortAriaLabel(key: CompetitionSortKey, label: string): string {
    if (this.sortKey !== key) return `Sort by ${label}`;
    const nextDirection = this.sortDirection === 'asc' ? 'descending' : 'ascending';
    return `Sort by ${label}, ${nextDirection}`;
  }

  money(value: number): string {
    const n = value || 0;
    if (Math.abs(n) >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
    return `€${n}`;
  }

  qualificationLabel(route: string | null): string {
    switch (route) {
      case 'DIRECT': return 'Direct';
      case 'PLAYOFF': return 'Playoff';
      case 'DROPPED_TO_STARS_CUP': return 'Stars Cup';
      case 'ELIMINATED': return 'Eliminated';
      default: return '';
    }
  }

  decisionLabel(decidedBy: string | null): string {
    switch (decidedBy) {
      case 'PENALTIES': return 'decided on penalties';
      case 'EXTRA_TIME': return 'after extra time';
      case 'AGGREGATE': return 'on aggregate';
      default: return '';
    }
  }

  private sortValue(team: any, key: CompetitionSortKey): string | number | null {
    if (key === 'status') return team.progress?.statusLabel || null;
    return team[key] ?? null;
  }

  private isNumericSort(key: CompetitionSortKey): boolean {
    return ['topElevenRating', 'squadValue', 'monthlyPayroll', 'reputation'].includes(key);
  }
}
