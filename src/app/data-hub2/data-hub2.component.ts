import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataHubIntelligenceService, DataHubWorkspace, HubMatch, HubMetrics } from '../services/data-hub-intelligence.service';
import { TeamService } from '../services/team.service';

@Component({ selector: 'app-data-hub2', templateUrl: './data-hub2.component.html', styleUrls: ['../data-hub-lab.css'] })
export class DataHub2Component implements OnInit, OnDestroy {
  data?: DataHubWorkspace; loading = true; error = ''; period: 'season' | 'recent' = 'season';
  private subscription?: Subscription; private requestId = 0; private loadedKey = '';
  constructor(private hub: DataHubIntelligenceService, public team: TeamService, private router: Router) {}
  ngOnInit(): void { this.subscription = this.team.currentSeason$.subscribe(season => { const key = `${this.team.teamId}:${season}`; if (this.team.teamId && season && key !== this.loadedKey) this.load(this.team.teamId, season); }); }
  ngOnDestroy(): void { this.subscription?.unsubscribe(); }
  load(teamId: number, season: number): void { const id = ++this.requestId; this.loadedKey = `${teamId}:${season}`; this.loading = true; this.hub.load(teamId, season).subscribe({ next: data => { if (id !== this.requestId) return; this.data = data; this.loading = false; }, error: () => { if (id !== this.requestId) return; this.error = 'Analyst briefing could not be loaded.'; this.loading = false; } }); }
  get metrics(): HubMetrics | undefined { return this.period === 'recent' ? this.data?.intelligence.recentMetrics : this.data?.intelligence.seasonMetrics; }
  get chartMatches(): HubMatch[] { return [...(this.data?.intelligence.matches || [])].reverse().slice(-10); }
  bar(value: number): number { return Math.min(100, Math.max(4, value / 3 * 100)); }
  signed(value: number): string { return `${value > 0 ? '+' : ''}${value.toFixed(2)}`; }
  insightClass(type: string): string { return type.toLowerCase(); }
  @HostListener('window:keydown', ['$event']) shortcut(event: KeyboardEvent): void { if ((event.target as HTMLElement)?.tagName === 'INPUT') return; const key = event.key.toLowerCase(); if (key === 'r') this.period = 'recent'; if (key === 's') this.period = 'season'; if (key === 't') this.router.navigateByUrl('/tactics4'); if (key === 'm') this.router.navigateByUrl('/fixtures'); if (key === 'p') this.router.navigateByUrl('/squad2'); if (key === 'l') this.router.navigateByUrl('/data-hub3'); }
}
