import { Injectable } from '@angular/core';
import { RatingTierService } from '../services/rating-tier.service';
import { ARENA_API } from './tactic-arena.service';

/**
 * RatingTierService for the Arena editor: same thresholds/colours logic, but read from the
 * public `/tactic-arena/ratingTiers` (the base world), not `/tactic/ratingTiers` (the career,
 * login only). Falls back to the base service's defaults when the route fails.
 */
@Injectable()
export class ArenaRatingTierService extends RatingTierService {
  override refresh(): void {
    const self = this as any;
    self.http.get(ARENA_API + '/ratingTiers').subscribe({
      next: (tiers: any) => {
        self.cached = tiers;
        self.ready$.next(tiers);
      },
      error: () => {
        const fallback = {
          legendary: 100, worldClass: 90, veryGood: 75, good: 60, average: 40,
          colors: {
            legendary: '#f1c40f', worldClass: '#9b59b6', veryGood: '#3498db',
            good: '#27ae60', average: '#7f8c8d', weak: '#8d6e63'
          },
          totalPlayers: 0
        };
        self.cached = fallback;
        self.ready$.next(fallback);
      }
    });
  }
}
