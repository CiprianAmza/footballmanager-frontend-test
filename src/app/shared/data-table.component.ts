import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-data-table',
  template: `
    <section class="fm-data-table" [attr.aria-busy]="loading" [attr.aria-label]="ariaLabel || title || null">
      <header *ngIf="title || summary || meta">
        <div><strong *ngIf="title">{{ title }}</strong><span *ngIf="summary">{{ summary }}</span></div>
        <span *ngIf="meta">{{ meta }}</span>
      </header>
      <app-skeleton *ngIf="loading" variant="table" [count]="skeletonRows" [columns]="columns"
                    [label]="loadingLabel"></app-skeleton>
      <app-empty-state *ngIf="!loading && empty" [title]="emptyTitle" [message]="emptyMessage"
                       [icon]="emptyIcon"></app-empty-state>
      <div class="fm-data-table-scroll" *ngIf="!loading && !empty">
        <ng-content></ng-content>
      </div>
      <footer><ng-content select="[table-footer]"></ng-content></footer>
    </section>
  `,
  styleUrls: ['./data-table.component.css']
})
export class DataTableComponent {
  @Input() title = '';
  @Input() summary = '';
  @Input() meta = '';
  @Input() ariaLabel = '';
  @Input() loading = false;
  @Input() loadingLabel = 'Loading table';
  @Input() skeletonRows = 6;
  @Input() columns = 6;
  @Input() empty = false;
  @Input() emptyTitle = 'No records found';
  @Input() emptyMessage = '';
  @Input() emptyIcon = 'search';
}
