import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { urlApp } from '../app.component';

export interface FeeTalks {
  id: number;
  playerId: number;
  playerName: string;
  toTeamId: number;
  toTeamName: string;
  offerAmount: number;
  askingPrice: number;
  status: string;
  round: number;
  rounds: number;
  retryAfterDays?: number;
  installmentCount?: number;
  installmentAmount?: number;
  sellOnPercent?: number;
  buyBackPrice?: number;
  goalsBonusTarget?: number;
  goalsBonusAmount?: number;
  titleBonusAmount?: number;
}

/** Round-based fee talks with the selling club. Reached (and re-entered) from "Make transfer offer". */
@Component({
  selector: 'app-club-negotiation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './club-negotiation.component.html',
  styleUrls: ['../negotiation/negotiation.component.css']
})
export class ClubNegotiationComponent implements OnInit {
  talks: FeeTalks | null = null;
  amount = 0;
  /** Extras: equal instalments at the start of the next seasons, a sell-on %, a buy-back price (0 = none). */
  installmentCount = 0;
  installmentAmount = 0;
  sellOnPercent = 0;
  buyBackPrice = 0;
  goalsBonusTarget = 20;
  goalsBonusAmount = 0;
  titleBonusAmount = 0;
  loading = true;
  sending = false;
  error = '';
  feedback = '';

  constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.http.get<FeeTalks>(`${urlApp}/transferOffer/talks/${id}`).subscribe({
      next: t => { this.show(t); this.loading = false; },
      error: () => { this.error = 'These talks could not be found.'; this.loading = false; }
    });
  }

  get isOpen(): boolean {
    return this.talks?.status === 'talks' || this.talks?.status === 'final_offer';
  }

  get feeAgreed(): boolean {
    return this.talks?.status === 'fee_agreed' || this.talks?.status === 'accepted';
  }

  get outcome(): string {
    switch (this.talks?.status) {
      case 'fee_agreed': return 'Fee agreed. Now agree personal terms with the player.';
      case 'accepted': return 'The transfer is complete.';
      case 'terms_failed': return 'The fee was agreed, but personal terms failed. The transfer collapsed.';
      case 'rejected': return this.talks.retryAfterDays
        ? `The talks ended without a deal. ${this.talks.toTeamName} will not discuss this player with you for ${this.talks.retryAfterDays} more ${this.talks.retryAfterDays === 1 ? 'day' : 'days'}.`
        : 'The talks ended without a deal.';
      default: return '';
    }
  }

  makeOffer(): void {
    if (!this.talks || this.sending) return;
    const before = this.talks.round;
    this.post(`${this.talks.id}/offer`, {
      offerAmount: this.amount,
      installmentCount: this.installmentCount,
      installmentAmount: this.installmentCount > 0 ? this.installmentAmount : 0,
      sellOnPercent: this.sellOnPercent,
      buyBackPrice: this.buyBackPrice,
      goalsBonusTarget: this.goalsBonusAmount > 0 ? this.goalsBonusTarget : 0,
      goalsBonusAmount: this.goalsBonusAmount || 0,
      titleBonusAmount: this.titleBonusAmount || 0
    }, t => {
      this.feedback = t.status === 'talks' && t.round > before
        ? `${t.toTeamName} turned your offer down and now asks ${t.askingPrice.toLocaleString()}.` : '';
    });
  }

  answerFinal(accept: boolean): void {
    if (!this.talks || this.sending) return;
    this.post(`${this.talks.id}/final`, { accept }, () => this.feedback = '');
  }

  openPersonalTerms(): void {
    if (!this.talks) return;
    this.http.post<any>(`${urlApp}/contract/negotiation/startTransfer`, { transferOfferId: this.talks.id }).subscribe({
      next: n => this.router.navigate(['/negotiation', n.id]),
      error: err => this.error = err?.error?.code === 'AGENT_REFUSES'
        ? 'The agent refuses to negotiate with you.' : 'Personal terms could not be opened.'
    });
  }

  private post(path: string, body: any, after: (t: FeeTalks) => void): void {
    this.sending = true;
    this.error = '';
    this.http.post<FeeTalks>(`${urlApp}/transferOffer/talks/${path}`, body).subscribe({
      next: t => { this.show(t); after(t); this.sending = false; },
      error: err => {
        this.error = err?.error?.message || 'The offer could not be sent.';
        this.sending = false;
        if (['PLAYER_GONE', 'WINDOW_CLOSED'].includes(err?.error?.code) && this.talks) this.talks = { ...this.talks, status: 'rejected' };
      }
    });
  }

  get offerTotal(): number {
    return (this.amount || 0) + (this.installmentCount > 0 ? this.installmentCount * (this.installmentAmount || 0) : 0);
  }

  private show(t: FeeTalks): void {
    this.talks = t;
    if (!this.amount) this.amount = t.offerAmount || Math.round(t.askingPrice * 0.9);
  }
}
