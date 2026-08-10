import { Component, EventEmitter, Input, Output } from '@angular/core';
import { UiToast } from './ui-feedback.service';

@Component({
  selector: 'app-toast',
  template: `
    <div [class]="'fm-toast ' + toast.tone" [attr.role]="toast.tone === 'error' ? 'alert' : 'status'">
      <app-fm-icon [name]="icon" [size]="19"></app-fm-icon>
      <span>{{ toast.message }}</span>
      <app-icon-button icon="close" label="Dismiss notification" (pressed)="dismiss.emit()"></app-icon-button>
    </div>
  `,
  styleUrls: ['./toast.component.css']
})
export class ToastComponent {
  @Input() toast!: UiToast;
  @Output() dismiss = new EventEmitter<void>();

  get icon(): string {
    return this.toast?.tone === 'success' ? 'check' : this.toast?.tone === 'error' ? 'alert' : 'info';
  }
}
