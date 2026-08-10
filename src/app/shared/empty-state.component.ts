import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  template: `
    <section class="fm-empty-state" role="status">
      <app-fm-icon [name]="icon" [size]="28"></app-fm-icon>
      <h2>{{ title }}</h2>
      <p *ngIf="message">{{ message }}</p>
      <button *ngIf="actionLabel" type="button" (click)="action.emit()">{{ actionLabel }}</button>
    </section>
  `,
  styleUrls: ['./empty-state.component.css']
})
export class EmptyStateComponent {
  @Input() title = 'Nothing to show yet';
  @Input() message = '';
  @Input() icon = 'search';
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();
}
