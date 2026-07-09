import { Pipe, PipeTransform } from '@angular/core';
import { RatingTierService } from './rating-tier.service';

/**
 * Usage:  [style.color]="player.rating | ratingColor"
 *
 * Returns the hex color for the global percentile tier of a player rating.
 * Backed by RatingTierService (which caches the thresholds from the backend
 * once at startup, so this is essentially free to call per row).
 *
 * Marked `pure: false` so the color updates on its own when RatingTierService
 * receives fresh thresholds (e.g. after a season transition shifts the curve).
 */
@Pipe({ name: 'ratingColor', pure: false })
export class RatingColorPipe implements PipeTransform {
  constructor(private tiers: RatingTierService) {}

  transform(rating: number | null | undefined): string {
    if (rating == null || isNaN(rating as number)) return '#aab';
    return this.tiers.tierColor(rating as number);
  }
}

/**
 * Usage:  <span [ngClass]="player.rating | ratingTierClass">
 *
 * Same as above but returns a CSS class name ("rating-legendary", etc.) so you
 * can style via stylesheet instead of inline color.
 */
@Pipe({ name: 'ratingTierClass', pure: false })
export class RatingTierClassPipe implements PipeTransform {
  constructor(private tiers: RatingTierService) {}

  transform(rating: number | null | undefined): string {
    if (rating == null || isNaN(rating as number)) return 'rating-average';
    return this.tiers.tierClass(rating as number);
  }
}

/**
 * Usage:  {{ player.rating | ratingTierName }}
 *
 * Returns "LEGENDARY" | "WORLD CLASS" | "VERY GOOD" | "GOOD" | "AVERAGE" | "WEAK".
 */
@Pipe({ name: 'ratingTierName', pure: false })
export class RatingTierNamePipe implements PipeTransform {
  constructor(private tiers: RatingTierService) {}

  transform(rating: number | null | undefined): string {
    if (rating == null || isNaN(rating as number)) return 'AVERAGE';
    return this.tiers.tierName(rating as number);
  }
}
