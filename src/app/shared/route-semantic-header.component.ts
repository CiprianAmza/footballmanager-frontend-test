import { AfterViewInit, Component, ElementRef, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

const ROUTE_LABELS: Record<string, string> = {
  home: 'Home', inbox: 'Inbox', 'social-feed': 'Social Feed', team: 'Club', tactics: 'Tactics', transfers: 'Transfers',
  scouting: 'Scouting', finances: 'Finances', stadium: 'Stadium and facilities', staff: 'Staff',
  training: 'Training', medical: 'Medical centre', academy: 'Youth academy', 'youth-academy': 'Youth academy',
  'data-hub': 'Data Hub', fixtures: 'Schedule', friendlies: 'Friendlies', overview: 'World overview',
  'competition-list': 'Competitions', competition: 'Competition', coefficients: 'Coefficients',
  assistant: 'Assistant manager', simulate: 'Match simulator', shortlist: 'Shortlist', admin: 'Administration'
};

@Component({
  selector: 'app-route-semantic-header',
  template: `<h1 *ngIf="showFallback" class="fm-visually-hidden">{{ pageTitle }}</h1>
             <span class="fm-visually-hidden" aria-live="polite">{{ announcement }}</span>`,
  styles: [`.fm-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}`]
})
export class RouteSemanticHeaderComponent implements AfterViewInit, OnDestroy {
  pageTitle = 'Argus Football World';
  announcement = '';
  showFallback = false;
  private readonly sub = new Subscription();
  private checkTimer?: number;

  constructor(private router: Router, private element: ElementRef<HTMLElement>) {
    this.sub.add(this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => this.scheduleCheck()));
  }

  ngAfterViewInit(): void { this.scheduleCheck(); }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.checkTimer !== undefined) window.clearTimeout(this.checkTimer);
  }

  private scheduleCheck(): void {
    if (this.checkTimer !== undefined) window.clearTimeout(this.checkTimer);
    this.showFallback = false;
    this.pageTitle = this.resolveTitle();
    this.announcement = `${this.pageTitle} loaded`;
    this.checkTimer = window.setTimeout(() => {
      const container = this.element.nativeElement.parentElement;
      const routedHeading = container?.querySelector('router-outlet + * h1');
      this.showFallback = !routedHeading;
    }, 80);
  }

  private resolveTitle(): string {
    const segment = this.router.url.split('?')[0].split('/').filter(Boolean)[0] || 'home';
    if (ROUTE_LABELS[segment]) return ROUTE_LABELS[segment];
    return segment.replace(/\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) || 'Argus Football World';
  }
}
