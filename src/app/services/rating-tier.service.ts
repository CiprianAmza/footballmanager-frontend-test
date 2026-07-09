import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, of } from 'rxjs';
import { urlApp } from '../app.component';

interface TierThresholds {
  legendary: number;
  worldClass: number;
  veryGood: number;
  good: number;
  average: number;
  colors: { [tier: string]: string };
  totalPlayers: number;
}

/**
 * Global rating-tier color helper.
 *
 * Backend exposes the rating values at the percentile cutoffs (top 2%, 10%, 25%, 50%,
 * 80%) — we load them once and cache, then any component can ask for the tier / color /
 * CSS class of a given rating without firing extra HTTP calls per player.
 */
@Injectable({ providedIn: 'root' })
export class RatingTierService {

  private cached?: TierThresholds;
  private readonly ready$ = new ReplaySubject<TierThresholds>(1);

  constructor(private http: HttpClient) {
    this.refresh();
  }

  refresh(): void {
    this.http.get<TierThresholds>(urlApp + '/tactic/ratingTiers').subscribe({
      next: (t) => {
        this.cached = t;
        this.ready$.next(t);
      },
      error: () => {
        // Sensible defaults if the backend hasn't started yet
        const fallback: TierThresholds = {
          legendary: 100, worldClass: 90, veryGood: 75, good: 60, average: 40,
          colors: {
            legendary: '#f1c40f', worldClass: '#9b59b6', veryGood: '#3498db',
            good: '#27ae60', average: '#7f8c8d', weak: '#8d6e63'
          },
          totalPlayers: 0
        };
        this.cached = fallback;
        this.ready$.next(fallback);
      }
    });
  }

  /** Resolves once thresholds are loaded; useful if you need them in a guard. */
  whenReady(): Observable<TierThresholds> {
    return this.cached ? of(this.cached) : this.ready$.asObservable();
  }

  /** "LEGENDARY" | "WORLD CLASS" | "VERY GOOD" | "GOOD" | "AVERAGE" | "WEAK" */
  tierName(rating: number): string {
    const t = this.cached;
    if (!t) return 'AVERAGE';
    if (rating >= t.legendary)  return 'LEGENDARY';
    if (rating >= t.worldClass) return 'WORLD CLASS';
    if (rating >= t.veryGood)   return 'VERY GOOD';
    if (rating >= t.good)       return 'GOOD';
    if (rating >= t.average)    return 'AVERAGE';
    return 'WEAK';
  }

  /** Hex color for this rating's tier. */
  tierColor(rating: number): string {
    const t = this.cached;
    if (!t) return '#7f8c8d';
    if (rating >= t.legendary)  return t.colors['legendary'];
    if (rating >= t.worldClass) return t.colors['worldClass'];
    if (rating >= t.veryGood)   return t.colors['veryGood'];
    if (rating >= t.good)       return t.colors['good'];
    if (rating >= t.average)    return t.colors['average'];
    return t.colors['weak'];
  }

  /** CSS class — for use with [ngClass] when you'd rather style via stylesheet. */
  tierClass(rating: number): string {
    const t = this.cached;
    if (!t) return 'rating-average';
    if (rating >= t.legendary)  return 'rating-legendary';
    if (rating >= t.worldClass) return 'rating-world-class';
    if (rating >= t.veryGood)   return 'rating-very-good';
    if (rating >= t.good)       return 'rating-good';
    if (rating >= t.average)    return 'rating-average';
    return 'rating-weak';
  }
}
