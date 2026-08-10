import { Component, EventEmitter, Input, Output } from '@angular/core';

export type UiStateKind = 'loading' | 'error' | 'empty';

@Component({
  selector: 'app-ui-state',
  template: `
    <section class="fm-state" [class]="'fm-state ' + kind" [attr.role]="kind === 'error' ? 'alert' : 'status'"
             [attr.aria-live]="kind === 'loading' ? 'polite' : null">
      <span class="fm-state-spinner" *ngIf="kind === 'loading'" aria-hidden="true"></span>
      <span class="fm-state-symbol" *ngIf="kind !== 'loading'" aria-hidden="true">{{ kind === 'error' ? '!' : '—' }}</span>
      <h2>{{ title || defaultTitle }}</h2>
      <p *ngIf="message">{{ message }}</p>
      <button *ngIf="showRetry && kind === 'error'" type="button" (click)="retry.emit()">{{ retryLabel }}</button>
    </section>
  `,
  styleUrls: ['./ui-state.component.css']
})
export class UiStateComponent {
  @Input() kind: UiStateKind = 'empty';
  @Input() title = '';
  @Input() message = '';
  @Input() retryLabel = 'Try again';
  @Input() showRetry = true;
  @Output() retry = new EventEmitter<void>();

  get defaultTitle(): string {
    if (this.kind === 'loading') return 'Loading…';
    if (this.kind === 'error') return 'Something went wrong';
    return 'Nothing to show yet';
  }
}
