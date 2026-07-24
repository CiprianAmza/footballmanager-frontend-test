import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ChairmanClubService } from '../services/chairman-club.service';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ClubCatalogScope, ClubCashTransferDirection,
  TakeoverQuoteView
} from './chairman-club.models';

@Component({
  selector: 'app-chairman-club',
  templateUrl: './chairman-club.component.html',
  styleUrls: ['./chairman-club.component.css']
})
export class ChairmanClubComponent implements OnInit, OnDestroy {
  readonly scopes: { value: ClubCatalogScope; label: string }[] = [
    { value: 'ALL', label: 'Club Market' },
    { value: 'HELD', label: 'My Holdings' },
    { value: 'CONTROLLED', label: 'My Clubs' }
  ];

  clubs: ChairmanClubSummary[] = [];
  scope: ClubCatalogScope = 'ALL';
  selectedTeamId: number | null = null;
  selectedClub: ChairmanClubSummary | null = null;
  dashboard: ChairmanClubDashboard | null = null;
  quote: TakeoverQuoteView | null = null;
  direction: ClubCashTransferDirection = 'INJECTION';
  amount: number | null = null;

  clubsLoading = true;
  dashboardLoading = false;
  clubsError = '';
  dashboardError = '';
  actionError = '';
  message = '';
  inFlight: 'quote' | 'execute' | 'transfer' | null = null;

  private requestedTeamId: number | null = null;
  private clubsLoaded = false;
  private clubsRequestId = 0;
  private dashboardRequestId = 0;
  private actionRequestId = 0;
  private retryKeys = new Map<string, string>();
  private routeSubscription?: Subscription;
  private querySubscription?: Subscription;
  private clubsSubscription?: Subscription;
  private dashboardSubscription?: Subscription;
  private actionSubscription?: Subscription;

  constructor(private clubsApi: ChairmanClubService,
              private route: ActivatedRoute,
              private router: Router) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const requested = Number(params.get('teamId'));
      this.requestedTeamId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
      if (this.clubsLoaded) this.applyRouteSelection();
    });
    this.querySubscription = this.route.queryParamMap.subscribe(params => {
      const value = params.get('scope');
      const nextScope = this.isScope(value) ? value : 'ALL';
      if (nextScope !== this.scope || !this.clubsLoaded) {
        this.scope = nextScope;
        this.invalidateForScopeChange();
        this.loadClubs();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.querySubscription?.unsubscribe();
    this.clubsSubscription?.unsubscribe();
    this.dashboardSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
  }

  selectScope(scope: ClubCatalogScope): void {
    if (!this.isScope(scope) || scope === this.scope) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { scope },
      queryParamsHandling: 'merge'
    });
  }

  retryClubs(): void { this.loadClubs(); }

  retryDashboard(): void {
    if (this.selectedClub?.controlledByPrincipal && this.selectedTeamId !== null) {
      this.loadDashboard(this.selectedTeamId);
    }
  }

  selectClub(teamId: number, updateRoute = true): void {
    const targetTeamId = Number(teamId);
    const club = this.clubs.find(value => value.teamId === targetTeamId);
    if (!Number.isSafeInteger(targetTeamId) || !club) return;

    const changed = this.selectedTeamId !== targetTeamId;
    if (changed) {
      this.invalidateSelectionRequests();
      this.dashboard = null;
      this.quote = null;
      this.dashboardError = '';
      this.actionError = '';
      this.message = '';
    }
    this.selectedTeamId = targetTeamId;
    this.selectedClub = club;
    if (updateRoute) {
      this.router.navigate(['/chairman/clubs', targetTeamId], {
        queryParams: { scope: this.scope }
      });
    }
    if (club.controlledByPrincipal && (changed || !this.dashboard)) {
      this.loadDashboard(targetTeamId);
    } else if (!club.controlledByPrincipal) {
      this.dashboard = null;
      this.dashboardLoading = false;
      this.dashboardError = '';
    }
  }

  requestQuote(): void {
    if (!this.selectedClub || this.selectedClub.controlledByPrincipal || this.inFlight) return;
    const teamId = this.selectedClub.teamId;
    const action = `quote:${teamId}`;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'quote';
    this.actionError = '';
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = this.clubsApi.quote(teamId, this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId) {
          this.quote = null;
          this.actionError = 'Takeover quote did not match the selected club.';
          return;
        }
        this.quote = value;
        this.message = 'Takeover quote ready.';
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error, action);
      }
    });
  }

  executeTakeover(): void {
    if (!this.selectedClub || this.selectedClub.controlledByPrincipal || !this.quote || this.inFlight
      || this.quote.status !== 'OPEN') return;
    const teamId = this.selectedClub.teamId;
    const takeoverQuote = this.quote;
    const action = `execute:${takeoverQuote.quoteId}`;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'execute';
    this.actionError = '';
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = this.clubsApi.execute(teamId, takeoverQuote.quoteId, this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId) {
          this.actionError = 'Takeover response did not match the selected club.';
          return;
        }
        this.retryKeys.delete(action);
        this.retryKeys.delete(`quote:${teamId}`);
        this.quote = null;
        this.message = 'Takeover completed. Confirming canonical control…';
        this.loadClubs(teamId);
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error, action);
      }
    });
  }

  transfer(): void {
    const amount = Number(this.amount);
    if (!this.selectedClub?.controlledByPrincipal || !Number.isSafeInteger(amount)
      || amount <= 0 || this.inFlight) return;
    const teamId = this.selectedClub.teamId;
    const action = `transfer:${teamId}:${this.direction}:${amount}`;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'transfer';
    this.actionError = '';
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = this.clubsApi.transfer(teamId, this.direction, amount, this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        this.retryKeys.delete(action);
        this.amount = null;
        this.message = `${value.direction === 'INJECTION' ? 'Injection' : 'Withdrawal'} completed.`;
        this.loadDashboard(teamId);
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error, action);
      }
    });
  }

  money(value: number | undefined): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR',
      maximumFractionDigits: 0 }).format(value || 0);
  }

  percent(bps: number): string { return `${(bps / 100).toFixed(2)}%`; }
  trackClub(_: number, club: ChairmanClubSummary): number { return club.teamId; }
  trackHolding(_: number, holding: { profileId: number }): number { return holding.profileId; }

  private loadClubs(afterTakeoverTeamId?: number): void {
    const requestId = ++this.clubsRequestId;
    this.clubsSubscription?.unsubscribe();
    this.clubsLoading = true;
    this.clubsError = '';
    this.clubsSubscription = this.clubsApi.clubs(this.scope).subscribe({
      next: clubs => {
        if (requestId !== this.clubsRequestId) return;
        this.clubs = clubs;
        this.clubsLoaded = true;
        this.clubsLoading = false;
        if (afterTakeoverTeamId !== undefined) {
          const confirmed = clubs.find(club => club.teamId === afterTakeoverTeamId);
          if (!confirmed?.controlledByPrincipal) {
            this.selectedClub = confirmed || null;
            this.selectedTeamId = confirmed?.teamId || null;
            this.actionError = 'Takeover completed but canonical control was not confirmed.';
            this.dashboard = null;
            return;
          }
          this.selectedTeamId = afterTakeoverTeamId;
          this.selectedClub = confirmed;
          this.dashboard = null;
          this.router.navigate(['/chairman/clubs', afterTakeoverTeamId], {
            queryParams: { scope: this.scope }
          });
          this.loadDashboard(afterTakeoverTeamId);
          return;
        }
        if (!clubs.length) {
          this.clearSelection();
          return;
        }
        this.applyRouteSelection();
      },
      error: error => {
        if (requestId !== this.clubsRequestId) return;
        this.clubs = [];
        this.clubsLoaded = false;
        this.clubsLoading = false;
        this.clearSelection();
        this.clubsError = this.errorMessage(error);
      }
    });
  }

  private applyRouteSelection(): void {
    if (!this.clubs.length) return;
    const requested = this.requestedTeamId;
    const preferred = requested !== null && this.clubs.some(club => club.teamId === requested)
      ? requested
      : (this.clubs.find(club => club.controlledByPrincipal)?.teamId || this.clubs[0].teamId);
    if (this.selectedTeamId !== preferred || !this.selectedClub) this.selectClub(preferred, false);
  }

  private loadDashboard(teamId: number): void {
    const club = this.clubs.find(value => value.teamId === teamId);
    if (!club?.controlledByPrincipal) return;
    const requestId = ++this.dashboardRequestId;
    this.dashboardSubscription?.unsubscribe();
    this.dashboardLoading = true;
    this.dashboardError = '';
    this.dashboardSubscription = this.clubsApi.dashboard(teamId).subscribe({
      next: value => {
        if (requestId !== this.dashboardRequestId || this.selectedTeamId !== teamId) return;
        if (value.teamId !== teamId) {
          this.dashboard = null;
          this.dashboardLoading = false;
          this.dashboardError = 'Dashboard response did not match the selected club.';
          return;
        }
        this.dashboard = value;
        this.dashboardLoading = false;
      },
      error: error => {
        if (requestId !== this.dashboardRequestId || this.selectedTeamId !== teamId) return;
        this.dashboard = null;
        this.dashboardLoading = false;
        this.dashboardError = this.errorMessage(error);
        if (this.errorCode(error) === 'CLUB_CONTROL_REQUIRED') this.loadClubs();
      }
    });
  }

  private invalidateForScopeChange(): void {
    ++this.dashboardRequestId;
    ++this.actionRequestId;
    this.dashboardSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
    this.inFlight = null;
    this.dashboard = null;
    this.quote = null;
    this.selectedTeamId = null;
    this.selectedClub = null;
    this.dashboardError = '';
    this.actionError = '';
  }

  private invalidateSelectionRequests(): void {
    ++this.dashboardRequestId;
    ++this.actionRequestId;
    this.dashboardSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
    this.inFlight = null;
  }

  private clearSelection(): void {
    this.invalidateSelectionRequests();
    this.selectedTeamId = null;
    this.selectedClub = null;
    this.dashboard = null;
    this.quote = null;
    this.dashboardLoading = false;
  }

  private isCurrentAction(requestId: number, teamId: number): boolean {
    return requestId === this.actionRequestId && this.selectedTeamId === teamId;
  }

  private finishAction(requestId: number, teamId: number): void {
    if (this.isCurrentAction(requestId, teamId)) this.inFlight = null;
  }

  private fail(error: any, action: string): void {
    const code = this.errorCode(error);
    this.actionError = this.typedActionError(code);
    if (code === 'TAKEOVER_QUOTE_STALE' || code === 'TAKEOVER_QUOTE_EXPIRED'
      || code === 'PROTECTED_MINORITY') {
      this.quote = null;
      this.retryKeys.delete(`quote:${this.selectedTeamId}`);
      this.retryKeys.delete(action);
    } else if (code === 'IDEMPOTENCY_KEY_REUSED') {
      this.retryKeys.delete(action);
    } else if (code === 'CLUB_CONTROL_REQUIRED') {
      this.quote = null;
      this.loadClubs();
    }
  }

  private key(action: string): string {
    let value = this.retryKeys.get(action);
    if (!value) {
      value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.retryKeys.set(action, value);
    }
    return value;
  }

  private errorCode(error: any): string { return error?.error?.code || ''; }

  private typedActionError(code: string): string {
    const messages: { [key: string]: string } = {
      INSUFFICIENT_FUNDS: 'Insufficient personal cash for this takeover.',
      TAKEOVER_QUOTE_STALE: 'The club valuation or ownership changed. Request a new quote.',
      TAKEOVER_QUOTE_EXPIRED: 'The takeover quote expired. Request a new quote.',
      PROTECTED_MINORITY: 'This takeover cannot proceed while another user owns protected shares.',
      IDEMPOTENCY_KEY_REUSED: 'The previous operation key no longer matches this request. Retry safely.',
      CLUB_CONTROL_REQUIRED: 'Control of this club is no longer available. Refresh the club list.'
    };
    return messages[code] || this.errorMessage({ error: { message: 'Club operation failed.' } });
  }

  private errorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Club operation failed.';
  }

  private isScope(value: string | null | undefined): value is ClubCatalogScope {
    return value === 'ALL' || value === 'HELD' || value === 'CONTROLLED';
  }
}
