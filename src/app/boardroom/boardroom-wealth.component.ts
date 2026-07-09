import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

interface OwnedClub { teamId: number; teamName: string; }
interface HumanRow {
  humanId: number;
  name: string;
  wealth: number;
  managerReputation: number;
  teamId: number | null;
  ownedClubs: OwnedClub[];
}

@Component({
  selector: 'app-boardroom-wealth',
  templateUrl: './boardroom-wealth.component.html',
  styleUrls: ['./boardroom.component.css']
})
export class BoardroomWealthComponent implements OnInit {

  humans: HumanRow[] = [];
  loading = true;
  error = '';
  humansOnly = false;
  filterText = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.http.get<HumanRow[]>(urlApp + `/boardroom/humans?humansOnly=${this.humansOnly}`).subscribe({
      next: (rows) => {
        this.humans = (rows || []).sort((a, b) => b.wealth - a.wealth);
        this.loading = false;
      },
      error: () => { this.error = 'Failed to load managers.'; this.loading = false; }
    });
  }

  get filtered(): HumanRow[] {
    const t = this.filterText.trim().toLowerCase();
    if (!t) return this.humans;
    return this.humans.filter(h => (h.name || '').toLowerCase().includes(t));
  }

  money(v: number): string {
    if (v == null) return '-';
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
    return '$' + v;
  }
}
