import { Component, HostListener } from '@angular/core';
import { UiFeedbackService } from './ui-feedback.service';

@Component({
  selector: 'app-ui-feedback-host',
  template: `
    <div class="fm-toast-region" aria-live="polite" aria-atomic="false">
      <app-toast *ngFor="let toast of (feedback.toasts$ | async)" [toast]="toast"
                 (dismiss)="feedback.dismissToast(toast.id)"></app-toast>
    </div>

    <div class="fm-dialog-backdrop" *ngIf="feedback.dialog$ | async as dialog" (click)="feedback.resolveDialog(false)">
      <section class="fm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="fm-dialog-title"
               aria-describedby="fm-dialog-message" (click)="$event.stopPropagation()">
        <div class="fm-dialog-mark" [class]="'fm-dialog-mark ' + dialog.tone" aria-hidden="true">!</div>
        <h2 id="fm-dialog-title">{{ dialog.title }}</h2>
        <p id="fm-dialog-message">{{ dialog.message }}</p>
        <div class="fm-dialog-actions">
          <button type="button" class="secondary" (click)="feedback.resolveDialog(false)">{{ dialog.cancelLabel }}</button>
          <button type="button" class="primary" [class.danger]="dialog.tone === 'error'"
                  (click)="feedback.resolveDialog(true)">{{ dialog.confirmLabel }}</button>
        </div>
      </section>
    </div>
  `,
  styleUrls: ['./ui-feedback-host.component.css']
})
export class UiFeedbackHostComponent {
  constructor(public feedback: UiFeedbackService) {}

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.feedback.resolveDialog(false);
  }
}
