import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ChairmanClubService } from '../services/chairman-club.service';
import { AuthService } from '../services/auth.service';
import {
  ChairmanClubDashboard, ChairmanClubSummary, ChairmanCommandCentreView, ClubCatalogScope,
  ClubCashTransferDirection, TakeoverQuoteView
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
  commandCentre: ChairmanCommandCentreView | null = null;
  quote: TakeoverQuoteView | null = null;
  direction: ClubCashTransferDirection = 'INJECTION';
  amount: number | null = null;
  transferBudgetAmount: number | null = null;
  managerTransfersAllowed = true;
  managerContractsAllowed = true;

  clubsLoading = true;
  dashboardLoading = false;
  clubsError = '';
  dashboardError = '';
  actionError = '';
  message = '';
  pendingTransferConfirmation = '';
  inFlight: 'quote' | 'execute' | 'transfer' | 'budget' | 'authority' | null = null;

  private requestedTeamId: number | null = null;
  private clubsLoaded = false;
  private clubsRequestId = 0;
  private privateDataRequestId = 0;
  private actionRequestId = 0;
  private retryKeys = new Map<string, string>();
  private routeSubscription?: Subscription;
  private querySubscription?: Subscription;
  private clubsSubscription?: Subscription;
  private privateDataSubscription?: Subscription;
  private actionSubscription?: Subscription;
  private canonicalizedRouteKey = '';

  constructor(private clubsApi: ChairmanClubService,
              private route: ActivatedRoute,
              private router: Router,
              private authService: AuthService) {}

  get canOpenTacticalMandate(): boolean {
    return this.authService.isLoggedIn && this.authService.careerRole === 'CHAIRMAN'
      && this.authService.chairmanEnabled === true && this.selectedClub?.controlledByPrincipal === true;
  }

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const requested = Number(params.get('teamId'));
      this.requestedTeamId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
      if (this.requestedTeamId === null || this.clubs.some(club => club.teamId === this.requestedTeamId)) {
        this.canonicalizedRouteKey = '';
      }
      if (this.clubsLoaded) this.applyRouteSelection();
    });
    this.querySubscription = this.route.queryParamMap.subscribe(params => {
      const value = params.get('scope');
      const nextScope = this.isScope(value) ? value : 'ALL';
      if (value !== null && !this.isScope(value)) {
        this.normalizeScopeUrl();
      }
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
    this.privateDataSubscription?.unsubscribe();
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
      this.loadPrivateData(this.selectedTeamId);
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
      this.commandCentre = null;
      this.transferBudgetAmount = null;
      this.quote = null;
      this.dashboardError = '';
      this.dashboardLoading = false;
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
    if (club.controlledByPrincipal && !this.dashboardLoading
      && (changed || !this.dashboard || !this.commandCentre)) {
      this.loadPrivateData(targetTeamId);
    } else if (!club.controlledByPrincipal) {
      this.dashboard = null;
      this.commandCentre = null;
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
    if (takeoverQuote.teamId !== teamId) {
      this.quote = null;
      this.actionError = 'The takeover quote belongs to a different club. Request a new quote.';
      return;
    }
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
        if (value.teamId !== teamId || value.quoteId !== takeoverQuote.quoteId) {
          this.actionError = 'Takeover response did not match the submitted club or quote.';
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
    const submittedDirection = this.direction;
    const submittedAmount = amount;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'transfer';
    this.actionError = '';
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = this.clubsApi.transfer(teamId, this.direction, amount, this.key(action)).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId || value.direction !== submittedDirection
          || value.amount?.amount !== submittedAmount) {
          this.actionError = 'Treasury response did not match the submitted club, direction or amount.';
          return;
        }
        this.retryKeys.delete(action);
        this.amount = null;
        this.message = `${submittedDirection === 'INJECTION' ? 'Injection' : 'Withdrawal'} completed.`;
        this.loadPrivateData(teamId);
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error, action);
      }
    });
  }

  confirmTransfer(): void {
    const amount = Number(this.amount);
    if (!this.selectedClub || !this.dashboard || !Number.isSafeInteger(amount) || amount <= 0) return;
    this.pendingTransferConfirmation = this.direction === 'INJECTION'
      ? `Source: personal available cash. Destination: ${this.selectedClub.name}. Inject ${this.money(amount)}?`
      : `Source: ${this.selectedClub.name} distributable treasury. Destination: personal account. Withdraw ${this.money(amount)}?`;
    if (typeof window !== 'undefined' && window.confirm(this.pendingTransferConfirmation)) {
      this.pendingTransferConfirmation = '';
      this.transfer();
    }
  }

  saveTransferBudget(): void {
    const amount = Number(this.transferBudgetAmount);
    if (!this.selectedClub?.controlledByPrincipal || !this.commandCentre
      || !Number.isSafeInteger(amount) || amount < 0 || this.inFlight) return;
    const teamId = this.selectedClub.teamId;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'budget';
    this.actionError = '';
    this.message = '';
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = this.clubsApi.setTransferBudget(teamId, amount).pipe(
      finalize(() => this.finishAction(requestId, teamId))
    ).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId || value.transferBudget !== amount) {
          this.actionError = 'Transfer-budget response did not match the selected club or amount.';
          return;
        }
        this.transferBudgetAmount = value.transferBudget;
        this.commandCentre = {
          ...this.commandCentre!,
          finances: { ...this.commandCentre!.finances, transferBudget: value.transferBudget }
        };
        this.message = `Transfer budget saved: ${this.money(value.transferBudget)}.`;
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error, `budget:${teamId}`);
      }
    });
  }

  saveCoachAuthority(): void {
    if (!this.selectedClub?.controlledByPrincipal || this.inFlight) return;
    const teamId = this.selectedClub.teamId;
    const transfersAllowed = this.managerTransfersAllowed;
    const contractsAllowed = this.managerContractsAllowed;
    const requestId = ++this.actionRequestId;
    this.inFlight = 'authority';
    this.actionError = '';
    this.message = '';
    this.actionSubscription?.unsubscribe();
    this.actionSubscription = this.clubsApi.saveCoachAuthority(
      teamId, transfersAllowed, contractsAllowed
    ).pipe(finalize(() => this.finishAction(requestId, teamId))).subscribe({
      next: value => {
        if (!this.isCurrentAction(requestId, teamId)) return;
        if (value.teamId !== teamId) {
          this.actionError = 'Coach-authority response did not match the selected club.';
          return;
        }
        this.managerTransfersAllowed = value.managerTransfersAllowed;
        this.managerContractsAllowed = value.managerContractsAllowed;
        this.message = 'Manager responsibilities saved.';
      },
      error: error => {
        if (this.isCurrentAction(requestId, teamId)) this.fail(error, `authority:${teamId}`);
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
            this.commandCentre = null;
            return;
          }
          this.selectedTeamId = afterTakeoverTeamId;
          this.selectedClub = confirmed;
          this.dashboard = null;
          this.commandCentre = null;
          this.transferBudgetAmount = null;
          this.router.navigate(['/chairman/clubs', afterTakeoverTeamId], {
            queryParams: { scope: this.scope }
          });
          this.loadPrivateData(afterTakeoverTeamId);
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
    const requestedClub = requested === null ? undefined
      : this.clubs.find(club => club.teamId === requested);
    const preferred = requestedClub?.teamId
      || this.clubs.find(club => club.controlledByPrincipal)?.teamId
      || this.clubs[0].teamId;
    const current = this.clubs.find(club => club.teamId === preferred);
    if (!current) return;
    if (requestedClub || requested === null) this.canonicalizedRouteKey = '';
    const changedTeam = this.selectedTeamId !== preferred;
    if (changedTeam) {
      this.dashboard = null;
      this.commandCentre = null;
      this.quote = null;
      this.dashboardError = '';
      this.dashboardLoading = false;
    }
    this.selectedTeamId = preferred;
    this.selectedClub = current;
    if (!requestedClub && requested !== null) {
      const key = `${this.scope}:${requested}:${preferred}`;
      if (this.canonicalizedRouteKey !== key) {
        this.canonicalizedRouteKey = key;
        this.router.navigate(['/chairman/clubs', preferred], {
          queryParams: { scope: this.scope }, replaceUrl: true
        });
      }
    }
    if (!current.controlledByPrincipal) {
      if (changedTeam) this.invalidateSelectionRequests();
      else {
        ++this.privateDataRequestId;
        ++this.actionRequestId;
        this.privateDataSubscription?.unsubscribe();
        this.actionSubscription?.unsubscribe();
        this.inFlight = null;
      }
      this.dashboard = null;
      this.commandCentre = null;
      this.quote = null;
      this.dashboardLoading = false;
      this.dashboardError = '';
      return;
    }
    if (changedTeam) this.invalidateSelectionRequests();
    if ((!this.dashboard || !this.commandCentre) && !this.dashboardLoading) {
      this.loadPrivateData(preferred);
    }
  }

  private loadPrivateData(teamId: number): void {
    const club = this.clubs.find(value => value.teamId === teamId);
    if (!club?.controlledByPrincipal) return;
    const requestId = ++this.privateDataRequestId;
    this.privateDataSubscription?.unsubscribe();
    this.dashboardLoading = true;
    this.dashboardError = '';
    this.privateDataSubscription = forkJoin({
      dashboard: this.clubsApi.dashboard(teamId),
      commandCentre: this.clubsApi.commandCentre(teamId),
      coachAuthority: this.clubsApi.coachAuthority(teamId)
    }).subscribe({
      next: value => {
        if (requestId !== this.privateDataRequestId || this.selectedTeamId !== teamId) return;
        if (value.dashboard.teamId !== teamId || value.commandCentre.teamId !== teamId
          || value.coachAuthority.teamId !== teamId
          || !value.commandCentre.ownership?.controlled) {
          this.dashboard = null;
          this.commandCentre = null;
          this.transferBudgetAmount = null;
          this.dashboardLoading = false;
          this.dashboardError = !value.commandCentre.ownership?.controlled
            ? 'Command centre ownership did not confirm canonical control.'
            : 'Private club data did not match the selected club.';
          return;
        }
        this.dashboard = value.dashboard;
        this.commandCentre = value.commandCentre;
        this.transferBudgetAmount = value.commandCentre.finances.transferBudget;
        this.managerTransfersAllowed = value.coachAuthority.managerTransfersAllowed;
        this.managerContractsAllowed = value.coachAuthority.managerContractsAllowed;
        this.dashboardLoading = false;
      },
      error: error => {
        if (requestId !== this.privateDataRequestId || this.selectedTeamId !== teamId) return;
        this.dashboard = null;
        this.commandCentre = null;
        this.transferBudgetAmount = null;
        this.dashboardLoading = false;
        this.dashboardError = this.privateErrorMessage(error);
        if (this.errorCode(error) === 'CLUB_CONTROL_REQUIRED') this.loadClubs();
      }
    });
  }

  private invalidateForScopeChange(): void {
    ++this.privateDataRequestId;
    ++this.actionRequestId;
    this.privateDataSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
    this.inFlight = null;
    this.dashboard = null;
    this.commandCentre = null;
    this.transferBudgetAmount = null;
    this.quote = null;
    this.selectedTeamId = null;
    this.selectedClub = null;
    this.dashboardError = '';
    this.actionError = '';
  }

  private invalidateSelectionRequests(): void {
    ++this.privateDataRequestId;
    ++this.actionRequestId;
    this.privateDataSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
    this.inFlight = null;
  }

  private clearSelection(): void {
    this.invalidateSelectionRequests();
    this.selectedTeamId = null;
    this.selectedClub = null;
    this.dashboard = null;
    this.commandCentre = null;
    this.transferBudgetAmount = null;
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
    this.actionError = this.typedActionError(error);
    if (code === 'TAKEOVER_QUOTE_STALE' || code === 'TAKEOVER_QUOTE_EXPIRED'
      || code === 'TAKEOVER_QUOTE_USED' || code === 'TAKEOVER_QUOTE_NOT_FOUND'
      || code === 'TAKEOVER_QUOTE_TEAM_MISMATCH' || code === 'PROTECTED_MINORITY'
      || code === 'ALREADY_FULL_OWNER') {
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

  private typedActionError(error: any): string {
    const code = this.errorCode(error);
    const messages: { [key: string]: string } = {
      INSUFFICIENT_FUNDS: this.inFlight === 'transfer'
        ? (this.direction === 'INJECTION' ? 'Insufficient personal cash to inject this amount.' : 'The club does not have enough distributable funds.')
        : 'Insufficient personal cash for this takeover.',
      TAKEOVER_QUOTE_STALE: 'The club valuation or ownership changed. Request a new quote.',
      TAKEOVER_QUOTE_EXPIRED: 'The takeover quote expired. Request a new quote.',
      TAKEOVER_QUOTE_USED: 'This takeover quote has already been used. Request a new quote.',
      TAKEOVER_QUOTE_NOT_FOUND: 'This takeover quote is no longer available. Request a new quote.',
      TAKEOVER_QUOTE_TEAM_MISMATCH: 'This takeover quote belongs to another club. Request a new quote.',
      PROTECTED_MINORITY: 'This takeover cannot proceed while another user owns protected shares.',
      ALREADY_FULL_OWNER: 'You already own all issued shares in this club.',
      IDEMPOTENCY_KEY_REUSED: 'The previous operation key no longer matches this request. Retry safely.',
      CLUB_CONTROL_REQUIRED: 'Control of this club is no longer available. Refresh the club list.',
      WITHDRAWAL_RESTRICTED: 'This club withdrawal is currently restricted.',
      INSUFFICIENT_DISTRIBUTABLE_CASH: 'The club does not have enough distributable funds.',
      TRANSFER_BUDGET_INVALID: 'Transfer budget must be zero or a positive whole amount.',
      TRANSFER_BUDGET_EXCEEDS_CLUB_FUNDS: 'Transfer budget cannot exceed the club treasury.',
      CHAIRMAN_REQUIRED: 'A Chairman career is required for this action.',
      CLUB_NOT_FOUND: 'The selected club no longer exists.'
    };
    return messages[code] || this.errorMessage(error);
  }

  private errorMessage(error: any): string {
    return error?.error?.message || error?.message || 'Club operation failed.';
  }

  private privateErrorMessage(error: any): string {
    const messages: { [key: string]: string } = {
      GAME_STATE_UNAVAILABLE: 'The game calendar is not available yet. Retry after world initialization completes.',
      CAP_TABLE_INVALID: 'The club ownership state is inconsistent and cannot be displayed.',
      CHAIRMAN_REQUIRED: 'A Chairman career is required to view this private club data.',
      CLUB_CONTROL_REQUIRED: 'Control of this club is no longer available. Refresh the club list.',
      CLUB_NOT_FOUND: 'The selected club no longer exists.'
    };
    return messages[this.errorCode(error)] || this.errorMessage(error);
  }

  private isScope(value: string | null | undefined): value is ClubCatalogScope {
    return value === 'ALL' || value === 'HELD' || value === 'CONTROLLED';
  }

  private normalizeScopeUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { scope: 'ALL' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}
