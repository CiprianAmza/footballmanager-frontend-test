import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { DataHubIntelligenceService, DataHubWorkspace, HubMatch } from '../services/data-hub-intelligence.service';
import { TeamService } from '../services/team.service';

@Component({ selector: 'app-data-hub3', templateUrl: './data-hub3.component.html', styleUrls: ['../data-hub-lab.css'] })
export class DataHub3Component implements OnInit, OnDestroy {
  data?: DataHubWorkspace; loading = true; filter: 'ALL' | 'HOME' | 'AWAY' | 'W' | 'D' | 'L' = 'ALL'; selected?: HubMatch;
  private subscription?: Subscription; private loadedKey = ''; private requestId = 0;
  constructor(private hub: DataHubIntelligenceService, public team: TeamService) {}
  ngOnInit(): void { this.subscription = this.team.currentSeason$.subscribe(season => { const key = `${this.team.teamId}:${season}`; if (this.team.teamId && season && key !== this.loadedKey) this.load(this.team.teamId, season); }); }
  ngOnDestroy(): void { this.subscription?.unsubscribe(); }
  load(teamId: number, season: number): void { const id = ++this.requestId; this.loadedKey = `${teamId}:${season}`; this.hub.load(teamId, season).subscribe({ next: data => { if (id !== this.requestId) return; this.data = data; this.selected = data.intelligence.matches[0]; this.loading = false; }, error: () => this.loading = false }); }
  get matches(): HubMatch[] { const rows = this.data?.intelligence.matches || []; if (this.filter === 'HOME') return rows.filter(row => row.home); if (this.filter === 'AWAY') return rows.filter(row => !row.home); if (['W','D','L'].includes(this.filter)) return rows.filter(row => row.result === this.filter); return rows; }
  setFilter(value: any): void { this.filter = value; this.selected = this.matches[0]; }
  basis(value: string): string { return value.replace(/_/g, ' ').toLowerCase(); }
  @HostListener('window:keydown', ['$event']) shortcut(event: KeyboardEvent): void { if (event.key === '1') this.setFilter('ALL'); if (event.key === '2') this.setFilter('HOME'); if (event.key === '3') this.setFilter('AWAY'); }
}
