import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: `
    <div class="fm-skeleton" role="status" [attr.aria-label]="label" [style.--fm-skeleton-cols]="columns">
      <span *ngFor="let row of rows" [class]="'fm-skeleton-row ' + variant"
            [style.grid-template-columns]="variant === 'table' ? 'repeat(' + columns + ', minmax(0, 1fr))' : null">
        <i *ngFor="let cell of cells"></i>
      </span>
      <span class="fm-visually-hidden">{{ label }}</span>
    </div>
  `,
  styleUrls: ['./skeleton.component.css']
})
export class SkeletonComponent {
  @Input() count = 5;
  @Input() columns = 5;
  @Input() variant: 'text' | 'table' | 'card' = 'text';
  @Input() label = 'Loading content';

  get rows(): number[] { return Array.from({ length: Math.max(1, this.count) }, (_, index) => index); }
  get cells(): number[] { return Array.from({ length: Math.max(1, this.columns) }, (_, index) => index); }
}
