import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { urlApp } from '../app.component';

interface AgentPlayer {
  id: number;
  name: string;
  position: string;
  age: number;
  rating: number;
  teamId: number | null;
  teamName: string;
}

interface AgentView {
  id: number;
  name: string;
  nationName: string;
  personality: 'STABILITY' | 'PERSONAL_GAIN' | 'TURNOVER' | null;
  patience: number;
  relation: number | null;
  refusesToNegotiate: boolean;
  players: AgentPlayer[];
}

/** A player's agent: personality, patience, how he sees me, and the players he represents. */
@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './agent.component.html',
  styleUrls: ['../negotiation/negotiation.component.css', './agent.component.css']
})
export class AgentComponent implements OnInit {
  agent: AgentView | null = null;
  loading = true;
  error = '';

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.loading = true;
      this.http.get<AgentView>(`${urlApp}/agents/${Number(params.get('id'))}`).subscribe({
        next: a => { this.agent = a; this.loading = false; },
        error: () => { this.error = 'This agent could not be found.'; this.loading = false; }
      });
    });
  }

  get personalityLabel(): string {
    switch (this.agent?.personality) {
      case 'STABILITY': return 'Stability';
      case 'PERSONAL_GAIN': return 'Personal gain';
      case 'TURNOVER': return 'Turnover';
      default: return '–';
    }
  }

  get personalityHint(): string {
    switch (this.agent?.personality) {
      case 'STABILITY': return 'Values long contracts. Walks away from offers under 60% of the player\'s value.';
      case 'PERSONAL_GAIN': return 'Values a big signing bonus. Walks away from offers under 80% of the player\'s value.';
      case 'TURNOVER': return 'Values a low release clause. Walks away from offers under 70% of the player\'s value.';
      default: return '';
    }
  }

  get relationLabel(): string {
    const r = this.agent?.relation;
    if (r == null) return 'You have no club';
    if (this.agent?.refusesToNegotiate) return `${r} / 100 — refuses to negotiate with you`;
    if (r >= 70) return `${r} / 100 — good`;
    if (r >= 40) return `${r} / 100 — neutral`;
    return `${r} / 100 — poor`;
  }
}
