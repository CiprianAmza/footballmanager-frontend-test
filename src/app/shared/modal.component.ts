import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-modal',
  template: `
    <div class="fm-modal-backdrop" *ngIf="open" (mousedown)="backdropClose && close()">
      <section class="fm-modal" role="dialog" aria-modal="true" [attr.aria-labelledby]="modalId + '-title'"
               [style.max-width.px]="maxWidth" (mousedown)="$event.stopPropagation()">
        <header>
          <div><span *ngIf="eyebrow">{{ eyebrow }}</span><h2 [id]="modalId + '-title'">{{ title }}</h2></div>
          <app-icon-button icon="close" label="Close dialog" (pressed)="close()"></app-icon-button>
        </header>
        <div class="fm-modal-body"><ng-content></ng-content></div>
        <footer><ng-content select="[modal-footer]"></ng-content></footer>
      </section>
    </div>
  `,
  styleUrls: ['./modal.component.css']
})
export class ModalComponent {
  private static nextId = 1;
  readonly modalId = `fm-modal-${ModalComponent.nextId++}`;
  @Input() open = false;
  @Input() title = '';
  @Input() eyebrow = '';
  @Input() maxWidth = 560;
  @Input() backdropClose = true;
  @Output() openChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  escape(): void { if (this.open) this.close(); }

  close(): void {
    this.openChange.emit(false);
    this.closed.emit();
  }
}
