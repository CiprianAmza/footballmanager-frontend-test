import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface OwnedClub { teamId: number; teamName: string; }
interface WealthData {
  humanId: number; name: string; wealth: number; ownedClubs: OwnedClub[];
}

@Component({
  selector: 'app-boardroom-ownership',
  templateUrl: './boardroom-ownership.component.html',
  styleUrls: ['./boardroom.component.css']
})
export class BoardroomOwnershipComponent implements OnInit {

  humanId!: number;
  data?: WealthData;
  loading = true;
  error = '';
  message = '';

  // per-club amount inputs keyed by teamId
  amounts: { [teamId: number]: number } = {};

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.humanId = Number(this.route.snapshot.paramMap.get('humanId'));
    this.load();
  }

  load(): void {
    this.loading = true;
    this.http.get<WealthData>(urlApp + `/boardroom/wealth/${this.humanId}`).subscribe({
      next: (d) => { this.data = d; this.loading = false; },
      error: () => { this.error = 'Failed to load.'; this.loading = false; }
    });
  }

  invest(teamId: number): void { this.move(teamId, 'invest'); }
  withdraw(teamId: number): void { this.move(teamId, 'withdraw'); }

  private move(teamId: number, action: 'invest' | 'withdraw'): void {
    this.message = '';
    const amount = this.amounts[teamId];
    if (!amount || amount <= 0) { this.message = 'Enter a positive amount.'; return; }
    const body = { humanId: this.humanId, teamId, amount };
    this.http.post<any>(urlApp + `/boardroom/club/${action}`, body).subscribe({
      next: (r) => {
        if (r && r.success === false) { this.message = r.message || 'Action failed.'; return; }
        this.message = (action === 'invest' ? 'Invested ' : 'Withdrew ') + this.money(amount) + '.';
        this.amounts[teamId] = 0;
        this.load();
      },
      error: (e) => this.message = e?.error?.message || 'Action failed.'
    });
  }

  money(v: number): string {
    if (v == null) return '-';
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
    return '$' + v;
  }
}
