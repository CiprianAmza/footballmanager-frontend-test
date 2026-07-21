import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

interface RatingImpactRow {
  rank: number;
  playerId: number;
  playerName: string;
  position: string;
  teamId: number;
  teamName: string;
  playerRating: number;
  teamRating: number;
  difference: number;
  appearances: number;
  teamMatches: number;
  requiredAppearances: number;
  appearancePercentage: number;
}

interface RatingImpactData {
  minimumAppearancePercentage: number;
  teamAverageMethod: string;
  rows: RatingImpactRow[];
}

@Component({
  selector: 'app-competition-rating-impact',
  templateUrl: './competition-rating-impact.component.html',
  styleUrls: ['./competition-rating-impact.component.css']
})
export class CompetitionRatingImpactComponent implements OnChanges {
  @Input() competitionId?: number | string;
  @Input() season?: number | string;
  @Input() data?: RatingImpactData;

  rows: RatingImpactRow[] = [];
  minimumAppearancePercentage = 55;
  teamAverageMethod = '';
  loading = false;
  failed = false;
  sortKey: keyof RatingImpactRow = 'difference';
  sortDirection: 1 | -1 = -1;

  constructor(private http: HttpClient) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.applyData(this.data);
      return;
    }
    if (this.data) {
      this.applyData(this.data);
    } else if (this.competitionId != null && this.season != null) {
      this.load();
    }
  }

  sortBy(key: keyof RatingImpactRow): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === -1 ? 1 : -1;
    } else {
      this.sortKey = key;
      this.sortDirection = key === 'playerName' || key === 'teamName' || key === 'position' ? 1 : -1;
    }
    this.sortRows();
  }

  sortMarker(key: keyof RatingImpactRow): string {
    if (this.sortKey !== key) return '↕';
    return this.sortDirection === -1 ? '▼' : '▲';
  }

  impactStyle(value: number): { [key: string]: string } {
    const intensity = Math.min(0.34, 0.08 + Math.abs(value) * 0.14);
    return {
      color: value >= 0 ? '#87e6ad' : '#ff9d9d',
      background: value >= 0
        ? `rgba(46, 204, 113, ${intensity})`
        : `rgba(231, 76, 60, ${intensity})`
    };
  }

  private load(): void {
    this.loading = true;
    this.failed = false;
    this.http.get<RatingImpactData>(
      urlApp + `/stats/competition/${this.competitionId}/${this.season}/rating-impact`
    ).subscribe({
      next: data => {
        this.applyData(data);
        this.loading = false;
      },
      error: () => {
        this.rows = [];
        this.failed = true;
        this.loading = false;
      }
    });
  }

  private applyData(data: RatingImpactData): void {
    this.minimumAppearancePercentage = data?.minimumAppearancePercentage ?? 55;
    this.teamAverageMethod = data?.teamAverageMethod ?? '';
    this.rows = [...(data?.rows ?? [])];
    this.failed = false;
    this.sortRows();
  }

  private sortRows(): void {
    const key = this.sortKey;
    const direction = this.sortDirection;
    this.rows.sort((left, right) => {
      const a = left[key];
      const b = right[key];
      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * direction;
      }
      return String(a ?? '').localeCompare(String(b ?? '')) * direction;
    });
  }
}
