import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <header class="fm-page-header">
      <div class="fm-page-copy">
        <span class="fm-page-eyebrow" *ngIf="eyebrow">{{ eyebrow }}</span>
        <h1>{{ title }}</h1>
        <p *ngIf="subtitle">{{ subtitle }}</p>
        <span *ngIf="status" class="fm-page-status" [class]="'fm-page-status ' + statusTone">{{ status }}</span>
      </div>
      <div class="fm-page-actions"><ng-content></ng-content></div>
    </header>
  `,
  styleUrls: ['./page-header.component.css']
})
export class PageHeaderComponent {
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() status = '';
  @Input() statusTone: 'neutral' | 'success' | 'warning' | 'error' = 'neutral';
}
