import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface UiTabItem {
  id: string;
  label: string;
  badge?: number | string | null;
  disabled?: boolean;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}

@Component({
  selector: 'app-tabs',
  template: `
    <nav class="fm-tabs" role="tablist" [attr.aria-label]="ariaLabel">
      <button *ngFor="let tab of tabs; trackBy: trackTab" type="button" role="tab"
              [disabled]="tab.disabled" [class.active]="tab.id === activeId"
              [attr.tabindex]="tab.id === activeId ? 0 : -1"
              [attr.aria-selected]="tab.id === activeId" [attr.aria-controls]="tab.id + '-panel'"
              (click)="select(tab)" (keydown)="onKeydown($event, tab)">
        <span>{{ tab.label }}</span>
        <b *ngIf="tab.badge !== null && tab.badge !== undefined && tab.badge !== 0"
           [class]="'fm-tab-badge ' + (tab.tone || 'neutral')">{{ tab.badge }}</b>
      </button>
    </nav>
  `,
  styleUrls: ['./tabs.component.css']
})
export class TabsComponent {
  @Input() tabs: UiTabItem[] = [];
  @Input() activeId = '';
  @Input() ariaLabel = 'Page sections';
  @Output() activeIdChange = new EventEmitter<string>();
  @Output() tabChange = new EventEmitter<UiTabItem>();

  select(tab: UiTabItem): void {
    if (tab.disabled || tab.id === this.activeId) return;
    this.activeIdChange.emit(tab.id);
    this.tabChange.emit(tab);
  }

  onKeydown(event: KeyboardEvent, current: UiTabItem): void {
    const enabled = this.tabs.filter(tab => !tab.disabled);
    const currentIndex = enabled.findIndex(tab => tab.id === current.id);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = enabled.length - 1;
    else return;

    event.preventDefault();
    const next = enabled[nextIndex];
    if (!next) return;
    this.select(next);
    const buttons = (event.currentTarget as HTMLElement)?.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    setTimeout(() => buttons?.[nextIndex]?.focus());
  }

  trackTab(_: number, tab: UiTabItem): string { return tab.id; }
}
