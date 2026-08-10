import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type UiFeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface UiConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: UiFeedbackTone;
  resolve: (confirmed: boolean) => void;
}

export interface UiToast {
  id: number;
  message: string;
  tone: UiFeedbackTone;
}

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private nextToastId = 1;
  private readonly dialogSubject = new BehaviorSubject<UiConfirmDialog | null>(null);
  private readonly toastSubject = new BehaviorSubject<UiToast[]>([]);

  readonly dialog$ = this.dialogSubject.asObservable();
  readonly toasts$ = this.toastSubject.asObservable();

  confirm(message: string, options: Partial<Omit<UiConfirmDialog, 'message' | 'resolve'>> = {}): Promise<boolean> {
    this.resolveDialog(false);
    return new Promise<boolean>(resolve => {
      this.dialogSubject.next({
        title: options.title || 'Confirm action',
        message,
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        tone: options.tone || 'warning',
        resolve
      });
    });
  }

  notify(message: string, tone: UiFeedbackTone = 'info', durationMs = 4500): void {
    const toast: UiToast = { id: this.nextToastId++, message, tone };
    this.toastSubject.next([...this.toastSubject.value, toast]);
    window.setTimeout(() => this.dismissToast(toast.id), durationMs);
  }

  success(message: string): void { this.notify(message, 'success'); }
  error(message: string): void { this.notify(message, 'error', 6500); }

  resolveDialog(confirmed: boolean): void {
    const dialog = this.dialogSubject.value;
    if (!dialog) return;
    this.dialogSubject.next(null);
    dialog.resolve(confirmed);
  }

  dismissToast(id: number): void {
    this.toastSubject.next(this.toastSubject.value.filter(toast => toast.id !== id));
  }
}
