import { Component, HostListener, OnInit } from '@angular/core';
import { CompetitionIntelligenceService, CoefficientWorkspace } from '../services/competition-intelligence.service';
import { TeamService } from '../services/team.service';
import { Router } from '@angular/router';

@Component({ selector: 'app-coefficients2', templateUrl: './coefficients2.component.html', styleUrls: ['../coefficients-lab.css'] })
export class Coefficients2Component implements OnInit {
  data?: CoefficientWorkspace;
  mode: 'countries' | 'clubs' = 'countries';
  search = '';
  selected = 0;
  loading = true;
  error = '';

  constructor(private intelligence: CompetitionIntelligenceService, private team: TeamService, private router: Router) {}

  ngOnInit(): void {
    this.intelligence.loadWorkspace(this.team.currentSeason || 1).subscribe({
      next: data => { this.data = data; this.loading = false; },
      error: () => { this.error = 'Coefficient intelligence could not be loaded.'; this.loading = false; }
    });
  }

  get rows(): any[] {
    const rows: any[] = this.mode === 'countries' ? (this.data?.countries || []) : (this.data?.clubs || []);
    const term = this.search.trim().toLowerCase();
    return term ? rows.filter(row => `${row.leagueName} ${row.teamName || ''}`.toLowerCase().includes(term)) : rows;
  }

  get active(): any { return this.rows[Math.min(this.selected, Math.max(this.rows.length - 1, 0))]; }
  get leader(): any { return (this.mode === 'countries' ? this.data?.countries : this.data?.clubs)?.[0]; }

  seasonKeys(row: any): number[] { return Object.keys(row?.perSeason || {}).map(Number).sort((a, b) => a - b); }
  momentum(row: any): number {
    const keys = this.seasonKeys(row); if (keys.length < 2) return 0;
    return (row.perSeason[keys[keys.length - 1]] || 0) - (row.perSeason[keys[keys.length - 2]] || 0);
  }
  trendWidth(row: any, season: number): number {
    const values = this.seasonKeys(row).map(key => row.perSeason[key] || 0);
    return Math.max(5, (row.perSeason[season] || 0) / Math.max(...values, 1) * 100);
  }

  setMode(mode: 'countries' | 'clubs'): void { this.mode = mode; this.selected = 0; }
  select(index: number): void { this.selected = index; }

  @HostListener('window:keydown', ['$event'])
  shortcut(event: KeyboardEvent): void {
    if ((event.target as HTMLElement)?.tagName === 'INPUT') return;
    if (event.key.toLowerCase() === 'c') this.setMode('countries');
    if (event.key.toLowerCase() === 't') this.setMode('clubs');
    if (event.key.toLowerCase() === 'm') this.router.navigateByUrl('/competition-money');
    if (event.key === 'j' || event.key === 'ArrowDown') this.selected = Math.min(this.selected + 1, this.rows.length - 1);
    if (event.key === 'k' || event.key === 'ArrowUp') this.selected = Math.max(this.selected - 1, 0);
  }
}
