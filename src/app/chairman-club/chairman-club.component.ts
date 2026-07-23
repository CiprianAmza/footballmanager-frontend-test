import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ChairmanClubService } from '../services/chairman-club.service';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ClubCashTransferDirection,
  TakeoverQuoteView
} from './chairman-club.models';

@Component({
  selector: 'app-chairman-club',
  templateUrl: './chairman-club.component.html',
  styleUrls: ['./chairman-club.component.css']
})
export class ChairmanClubComponent implements OnInit, OnDestroy {
  clubs: ChairmanClubSummary[] = [];
  selectedTeamId: number | null = null;
  dashboard: ChairmanClubDashboard | null = null;
  quote: TakeoverQuoteView | null = null;
  direction: ClubCashTransferDirection = 'INJECTION';
  amount: number | null = null;
  clubsLoading = true;
  loading = false;
  inFlight: 'quote' | 'execute' | 'transfer' | null = null;
  clubsError = '';
  dashboardError = '';
  error = '';
  message = '';
  private retryKeys = new Map<string, string>();
  private requestedTeamId: number | null = null;
  private clubsLoaded = false;
  private clubsRequestId = 0;
  private dashboardRequestId = 0;
  private actionRequestId = 0;
  private routeSubscription?: Subscription;
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
    this.loadClubs();
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.clubsSubscription?.unsubscribe();
    this.dashboardSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
  }

  retryClubs(): void {
    this.loadClubs();
  }

  retryDashboard(): void {
    if (this.selectedTeamId !== null) this.loadDashboard(this.selectedTeamId);
  }

  selectClub(teamId: number, updateRoute = true): void {
    const targetTeamId = Number(teamId);
    if (!Number.isSafeInteger(targetTeamId)
      || !this.clubs.some(club => club.teamId === targetTeamId)) return;

    const changed = this.selectedTeamId !== targetTeamId;
    if (changed) {
      this.invalidateSelectionRequests();
      this.selectedTeamId = targetTeamId;
      this.dashboard = null;
      this.quote = null;
      this.dashboardError = '';
      this.error = '';
      this.message = '';
    }

    if (updateRoute) this.router.navigate(['/chairman/clubs', targetTeamId]);
    if (changed || (!this.loading && !this.dashboard)) this.loadDashboard(targetTeamId);
  }

  requestQuote(): void {
    if (!this.selectedTeamId || this.inFlight) return;
    const teamId = this.selectedTeamId;
    const action = `quote:${teamId}`;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'quote';
    this.error = '';
    this.actionSubscription = this.clubsApi.quote(teamId, this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId) {
          this.quote = null;
          this.error = 'Takeover quote did not match the selected club.';
          return;
        }
        this.quote = value;
        this.retryKeys.delete(action);
        this.message = 'Takeover quote ready.';
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error);
      }
    });
  }

  executeTakeover(): void {
    if (!this.selectedTeamId || !this.quote || this.inFlight || this.quote.status !== 'OPEN') return;
    const teamId = this.selectedTeamId;
    const takeoverQuote = this.quote;
    if (takeoverQuote.teamId !== teamId) {
      this.quote = null;
      this.error = 'The takeover quote belongs to a different club. Request a new quote.';
      return;
    }
    const action = `execute:${takeoverQuote.quoteId}`;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'execute';
    this.error = '';
    this.actionSubscription = this.clubsApi.execute(teamId, takeoverQuote.quoteId,
      this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId) {
          this.error = 'Takeover response did not match the selected club.';
          return;
        }
        this.retryKeys.delete(action);
        this.message = 'Takeover completed atomically.';
        this.quote = null;
        this.loadDashboard(teamId);
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error);
      }
    });
  }

  transfer(): void {
    const amount = Number(this.amount);
    if (!this.selectedTeamId || !Number.isSafeInteger(amount) || amount <= 0 || this.inFlight) return;
    const teamId = this.selectedTeamId;
    const direction = this.direction;
    const action = `transfer:${teamId}:${direction}:${amount}`;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'transfer';
    this.error = '';
    this.actionSubscription = this.clubsApi.transfer(teamId, direction, amount,
      this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId) {
          this.error = 'Treasury response did not match the selected club.';
          return;
        }
        this.retryKeys.delete(action);
        this.message = `${value.direction === 'INJECTION' ? 'Injection' : 'Withdrawal'} completed.`;
        this.amount = null;
        this.loadDashboard(teamId);
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error);
      }
    });
  }

  money(amount: number): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR',
      maximumFractionDigits: 0 }).format(amount || 0);
  }

  percent(bps: number): string { return `${(bps / 100).toFixed(2)}%`; }

  trackClub(_: number, club: ChairmanClubSummary): number { return club.teamId; }
  trackHolding(_: number, holding: { profileId: number }): number { return holding.profileId; }

  private key(action: string): string {
    let value = this.retryKeys.get(action);
    if (!value) {
      value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.retryKeys.set(action, value);
    }
    return value;
  }

  private loadClubs(): void {
    const requestId = ++this.clubsRequestId;
    this.clubsSubscription?.unsubscribe();
    this.clubsLoading = true;
    this.clubsError = '';
    this.clubsSubscription = this.clubsApi.clubs().subscribe({
      next: clubs => {
        if (requestId !== this.clubsRequestId) return;
        this.clubs = clubs;
        this.clubsLoaded = true;
        this.clubsLoading = false;
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
        this.loading = false;
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
    if (this.selectedTeamId !== preferred) this.selectClub(preferred, false);
  }

  private loadDashboard(teamId: number): void {
    const requestId = ++this.dashboardRequestId;
    this.dashboardSubscription?.unsubscribe();
    this.loading = true;
    this.dashboardError = '';
    this.dashboardSubscription = this.clubsApi.dashboard(teamId).subscribe({
      next: value => {
        if (requestId !== this.dashboardRequestId || this.selectedTeamId !== teamId) return;
        if (value.teamId !== teamId) {
          this.dashboard = null;
          this.loading = false;
          this.dashboardError = 'Dashboard response did not match the selected club.';
          return;
        }
        this.dashboard = value;
        this.loading = false;
      },
      error: error => {
        if (requestId !== this.dashboardRequestId || this.selectedTeamId !== teamId) return;
        this.dashboard = null;
        this.loading = false;
        this.dashboardError = this.errorMessage(error);
      }
    });
  }

  private invalidateSelectionRequests(): void {
    ++this.dashboardRequestId;
    this.dashboardSubscription?.unsubscribe();
    ++this.actionRequestId;
    this.actionSubscription?.unsubscribe();
    this.inFlight = null;
  }

  private clearSelection(): void {
    this.invalidateSelectionRequests();
    this.selectedTeamId = null;
    this.dashboard = null;
    this.quote = null;
    this.loading = false;
    this.dashboardError = '';
    this.error = '';
    this.message = '';
  }

  private isCurrentAction(requestId: number, teamId: number): boolean {
    return requestId === this.actionRequestId && this.selectedTeamId === teamId;
  }

  private finishAction(requestId: number, teamId: number): void {
    if (this.isCurrentAction(requestId, teamId)) this.inFlight = null;
  }

  private fail(error: any): void {
    this.error = this.errorMessage(error);
  }

  private errorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Club operation failed.';
  }
}
