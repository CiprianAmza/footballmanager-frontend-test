import { Component, Input } from '@angular/core';
import { formatPercentage, formatRating } from './ui-formatters';

@Component({
  selector: 'app-rating-estimate',
  template: `
    <span class="fm-rating-estimate" [attr.aria-label]="ariaLabel">
      <strong>{{ estimated ? '~' : '' }}{{ formattedRating }}</strong>
      <small *ngIf="accuracy !== null && accuracy !== undefined">{{ formattedAccuracy }} scouted</small>
    </span>
  `,
  styles: [':host{display:inline-flex}.fm-rating-estimate{display:inline-flex;flex-direction:column;gap:3px}.fm-rating-estimate strong{display:inline-flex;align-items:center;justify-content:center;width:max-content;min-width:44px;padding:4px 8px;border-radius:5px;background:#2b3152;color:#f0c94d;font-variant-numeric:tabular-nums}.fm-rating-estimate small{color:#7f899d;font-size:10px;white-space:nowrap}']
})
export class RatingEstimateComponent {
  @Input() value: unknown;
  @Input() accuracy: unknown = null;
  @Input() estimated = true;
  @Input() digits = 1;

  get formattedRating(): string { return formatRating(this.value, this.digits); }
  get formattedAccuracy(): string { return formatPercentage(this.accuracy); }
  get ariaLabel(): string {
    return `${this.estimated ? 'Estimated ' : ''}rating ${this.formattedRating}` +
      (this.accuracy === null || this.accuracy === undefined ? '' : `, ${this.formattedAccuracy} scouted`);
  }
}
