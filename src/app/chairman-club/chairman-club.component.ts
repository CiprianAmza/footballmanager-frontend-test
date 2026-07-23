import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
export class ChairmanClubComponent implements OnInit {
  clubs: ChairmanClubSummary[] = [];
  selectedTeamId: number | null = null;
  dashboard: ChairmanClubDashboard | null = null;
  quote: TakeoverQuoteView | null = null;
  direction: ClubCashTransferDirection = 'INJECTION';
  amount: number | null = null;
  loading = true;
  inFlight: 'quote' | 'execute' | 'transfer' | null = null;
  error = '';
  message = '';
  private retryKeys = new Map<string, string>();

  constructor(private clubsApi: ChairmanClubService,
              private route: ActivatedRoute,
              private router: Router) {}

  ngOnInit(): void {
    this.clubsApi.clubs().subscribe({
      next: clubs => {
        this.clubs = clubs;
        const requested = Number(this.route.snapshot.paramMap.get('teamId'));
        const preferred = Number.isFinite(requested) && clubs.some(value => value.teamId === requested)
          ? requested : (clubs.find(value => value.controlledByPrincipal)?.teamId || clubs[0]?.teamId);
        if (preferred) this.selectClub(preferred, false);
        else this.loading = false;
      },
      error: error => this.fail(error)
    });
  }

  selectClub(teamId: number, updateRoute = true): void {
    this.selectedTeamId = Number(teamId);
    this.dashboard = null;
    this.quote = null;
    this.loading = true;
    this.error = '';
    this.message = '';
    if (updateRoute) this.router.navigate(['/chairman/clubs', this.selectedTeamId]);
    this.clubsApi.dashboard(this.selectedTeamId).subscribe({
      next: value => { this.dashboard = value; this.loading = false; },
      error: error => this.fail(error)
    });
  }

  requestQuote(): void {
    if (!this.selectedTeamId || this.inFlight) return;
    const action = `quote:${this.selectedTeamId}`;
    this.inFlight = 'quote';
    this.error = '';
    this.clubsApi.quote(this.selectedTeamId, this.key(action)).pipe(
      finalize(() => this.inFlight = null)
    ).subscribe({
      next: value => { this.quote = value; this.retryKeys.delete(action); this.message = 'Takeover quote ready.'; },
      error: error => this.fail(error, false)
    });
  }

  executeTakeover(): void {
    if (!this.selectedTeamId || !this.quote || this.inFlight || this.quote.status !== 'OPEN') return;
    const action = `execute:${this.quote.quoteId}`;
    this.inFlight = 'execute';
    this.error = '';
    this.clubsApi.execute(this.selectedTeamId, this.quote.quoteId, this.key(action)).pipe(
      finalize(() => this.inFlight = null)
    ).subscribe({
      next: () => {
        this.retryKeys.delete(action);
        this.message = 'Takeover completed atomically.';
        this.quote = null;
        this.selectClub(this.selectedTeamId!, false);
      },
      error: error => this.fail(error, false)
    });
  }

  transfer(): void {
    const amount = Number(this.amount);
    if (!this.selectedTeamId || !Number.isSafeInteger(amount) || amount <= 0 || this.inFlight) return;
    const action = `transfer:${this.selectedTeamId}:${this.direction}:${amount}`;
    this.inFlight = 'transfer';
    this.error = '';
    this.clubsApi.transfer(this.selectedTeamId, this.direction, amount, this.key(action)).pipe(
      finalize(() => this.inFlight = null)
    ).subscribe({
      next: value => {
        this.retryKeys.delete(action);
        this.message = `${value.direction === 'INJECTION' ? 'Injection' : 'Withdrawal'} completed.`;
        this.amount = null;
        this.selectClub(this.selectedTeamId!, false);
      },
      error: error => this.fail(error, false)
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

  private fail(error: any, stopLoading = true): void {
    this.error = error?.error?.message || error?.message || 'Club operation failed.';
    if (stopLoading) this.loading = false;
  }
}
