import { Component, OnInit } from '@angular/core';
import { EconomyService } from '../services/economy.service';
import { RankingEntry } from './economy.models';

@Component({ selector: 'app-wealth-rankings', templateUrl: './wealth-rankings.component.html', styleUrls: ['./economy.component.css'] })
export class WealthRankingsComponent implements OnInit {
  role = 'ALL'; control = 'ALL'; sort = 'NET_WORTH'; rows: RankingEntry[] = [];
  loading = false; error = '';
  constructor(private economy: EconomyService) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true; this.error = '';
    this.economy.rankings(this.role, this.control, this.sort).subscribe({
      next: page => { this.rows = page.content; this.loading = false; },
      error: error => { this.error = error?.error?.message || 'Rankings could not be loaded.'; this.loading = false; }
    });
  }
  money(value: number): string { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value); }
}
