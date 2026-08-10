import { Component, Input } from '@angular/core';
import { formatMoney } from './ui-formatters';

@Component({
  selector: 'app-money',
  template: `<span class="fm-money" [class.positive]="tone === 'positive'" [class.negative]="tone === 'negative'"
                   [attr.aria-label]="ariaLabel || formatted">{{ formatted }}</span>`,
  styles: [':host{display:inline}.fm-money{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}.fm-money.positive{color:#48d396}.fm-money.negative{color:#ff7c88}']
})
export class MoneyComponent {
  @Input() value: unknown;
  @Input() compact = false;
  @Input() expense = false;
  @Input() tone: 'neutral' | 'positive' | 'negative' = 'neutral';
  @Input() ariaLabel = '';

  get formatted(): string { return formatMoney(this.value, this.compact, this.expense); }
}
