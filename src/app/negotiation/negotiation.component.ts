import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { urlApp } from '../app.component';

export interface ContractTerms {
  wage: number;
  years: number;
  signingBonus: number;
  releaseClause: number;
}

export interface Negotiation {
  id: number;
  kind: 'RENEWAL' | 'TRANSFER';
  playerId: number;
  playerName: string;
  agentId: number;
  agentName: string;
  personality: 'STABILITY' | 'PERSONAL_GAIN' | 'TURNOVER' | null;
  relation: number;
  status: 'OPEN' | 'FINAL_OFFER' | 'AGREED' | 'WALKED_AWAY' | 'FINAL_REJECTED' | 'CANCELLED' | 'REFUSED';
  refusalMessage?: string;
  fireAgentOutcome?: 'FIRED' | 'KEPT' | null;
  round: number;
  rounds: number;
  transferFee: number;
  agentOffer: ContractTerms;
  lastOffer?: ContractTerms;
}

/** Round-based talks with a player's agent (renewal or personal terms after an agreed transfer fee). */
@Component({
  selector: 'app-negotiation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './negotiation.component.html',
  styleUrls: ['./negotiation.component.css']
})
export class NegotiationComponent implements OnInit {
  negotiation: Negotiation | null = null;
  offer: ContractTerms = { wage: 0, years: 2, signingBonus: 0, releaseClause: 0 };
  loading = true;
  sending = false;
  error = '';
  /** Shown after an offer the agent turned down without leaving. */
  feedback = '';

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.http.get<Negotiation>(`${urlApp}/contract/negotiation/${id}`).subscribe({
      next: n => { this.show(n); this.loading = false; },
      error: () => { this.error = 'This negotiation could not be found.'; this.loading = false; }
    });
  }

  get isOpen(): boolean {
    return this.negotiation?.status === 'OPEN' || this.negotiation?.status === 'FINAL_OFFER';
  }

  get personalityLabel(): string {
    switch (this.negotiation?.personality) {
      case 'STABILITY': return 'Stability';
      case 'PERSONAL_GAIN': return 'Personal gain';
      case 'TURNOVER': return 'Turnover';
      default: return 'No agent';
    }
  }

  get personalityHint(): string {
    switch (this.negotiation?.personality) {
      case 'STABILITY': return 'Values long contracts.';
      case 'PERSONAL_GAIN': return 'Values a big signing bonus.';
      case 'TURNOVER': return 'Values a low release clause.';
      default: return 'The player negotiates for himself.';
    }
  }

  get outcome(): string {
    switch (this.negotiation?.status) {
      case 'AGREED': return this.negotiation.kind === 'TRANSFER'
        ? 'Agreement reached. The transfer is complete.' : 'Agreement reached. The new contract is signed.';
      case 'WALKED_AWAY': return 'The agent found your offer too far from his demands and walked away.';
      case 'FINAL_REJECTED': return 'You refused the final offer. The talks are over.';
      case 'CANCELLED': return this.negotiation.fireAgentOutcome === 'FIRED'
        ? 'The talks ended: the player fired his agent.' : 'The deal is no longer possible. The talks were cancelled.';
      case 'REFUSED': return `“${this.negotiation.refusalMessage}” The agent will not negotiate, so the transfer collapsed.`;
      default: return '';
    }
  }

  makeOffer(): void {
    if (!this.negotiation || this.sending) return;
    const before = this.negotiation.round;
    this.post(`${this.negotiation.id}/offer`, this.offer, n => {
      this.feedback = n.status === 'OPEN' && n.round > before
        ? 'The agent turned your offer down. His demand stands.' : '';
    });
  }

  answerFinal(accept: boolean): void {
    if (!this.negotiation || this.sending) return;
    this.post(`${this.negotiation.id}/final`, { accept }, () => this.feedback = '');
  }

  /** Renewal with my own player only: the agent takes it badly whatever the player decides. */
  get canAskToFireAgent(): boolean {
    const n = this.negotiation;
    return !!n && n.kind === 'RENEWAL' && n.status === 'OPEN' && n.agentId > 0 && !n.fireAgentOutcome;
  }

  askToFireAgent(): void {
    if (!this.negotiation || this.sending) return;
    this.post(`${this.negotiation.id}/fireAgent`, {}, () => this.feedback = '');
  }

  get fireAgentMessage(): string {
    switch (this.negotiation?.fireAgentOutcome) {
      case 'FIRED': return `${this.negotiation.playerName} fired his agent and will take another one. Open a new renewal to talk to his new agent.`;
      case 'KEPT': return `${this.negotiation.playerName} refused to fire his agent. The agent knows you asked and now demands more.`;
      default: return '';
    }
  }

  useAgentDemand(): void {
    if (this.negotiation) this.offer = { ...this.negotiation.agentOffer };
  }

  private post(path: string, body: any, after: (n: Negotiation) => void): void {
    this.sending = true;
    this.error = '';
    this.http.post<Negotiation>(`${urlApp}/contract/negotiation/${path}`, body).subscribe({
      next: n => { this.show(n); after(n); this.sending = false; },
      error: err => {
        this.error = err?.error?.code === 'INVALID_OFFER'
          ? 'Check the offer: 1 to 5 years and no negative amounts.' : 'The offer could not be sent.';
        this.sending = false;
      }
    });
  }

  private show(n: Negotiation): void {
    this.negotiation = n;
    if (n.lastOffer) this.offer = { ...n.lastOffer };
    else if (this.offer.wage === 0) this.offer = { ...n.agentOffer, signingBonus: 0, releaseClause: 0 };
  }
}
