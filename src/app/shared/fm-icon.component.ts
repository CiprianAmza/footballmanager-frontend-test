import { Component, Input } from '@angular/core';

const ICON_PATHS: Record<string, string> = {
  stadium: 'M3 21h18M5 21V9l7-4 7 4v12M8 21v-8h8v8M10 13h4M4 9h16',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  trophy: 'M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4',
  chart: 'M4 19V9M10 19V5M16 19v-8M22 19H2',
  construction: 'M3 21h18M5 21v-5h14v5M7 16l2-8h6l2 8M10 8V3h4v5',
  building: 'M4 21V3h12v18M16 9h4v12M8 7h4M8 11h4M8 15h4',
  check: 'm5 12 4 4L19 6',
  info: 'M12 17v-6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'm21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.1 18h19.8L13.7 3.9a2 2 0 0 0-3.4 0Z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  play: 'M8 5v14l11-7Z',
  calendar: 'M6 2v4M18 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  ball: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9 9l3-2 3 2-1 4h-4L9 9ZM4 13l6 1M14 14l6-1M8 20l2-6M16 20l-2-6M7 5l2 4M17 5l-2 4',
  save: 'M5 3h12l2 2v16H5V3Zm3 0v6h8V3M8 21v-8h8v8',
  upload: 'M12 16V4M7 9l5-5 5 5M5 14v6h14v-6'
};

@Component({
  selector: 'app-fm-icon',
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round" [style.width.px]="size" [style.height.px]="size"
                    [attr.role]="label ? 'img' : null" [attr.aria-label]="label || null" [attr.aria-hidden]="label ? null : true">
               <path [attr.d]="path"></path>
             </svg>`,
  styles: [':host{display:inline-flex;line-height:0}svg{display:block}']
})
export class FmIconComponent {
  @Input() name = 'info';
  @Input() label = '';
  @Input() size = 20;

  get path(): string { return ICON_PATHS[this.name] || ICON_PATHS['info']; }
}
