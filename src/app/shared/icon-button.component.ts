import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-icon-button',
  template: `
    <button type="button" [class]="'fm-icon-button ' + tone" [disabled]="disabled"
            [attr.aria-label]="label" [attr.aria-expanded]="expanded" [attr.title]="tooltip || label"
            (click)="pressed.emit($event)">
      <app-fm-icon [name]="icon" [size]="size"></app-fm-icon>
      <span *ngIf="showLabel">{{ label }}</span>
    </button>
  `,
  styleUrls: ['./icon-button.component.css']
})
export class IconButtonComponent {
  @Input() icon = 'more';
  @Input() label = 'More actions';
  @Input() tooltip = '';
  @Input() tone: 'neutral' | 'primary' | 'danger' = 'neutral';
  @Input() size = 18;
  @Input() disabled = false;
  @Input() expanded: boolean | null = null;
  @Input() showLabel = false;
  @Output() pressed = new EventEmitter<MouseEvent>();
}
