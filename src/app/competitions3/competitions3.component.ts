import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompetitionHubService, TeamCompetition } from '../services/competition-hub.service';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';

interface CompetitionMoment { competition: TeamCompetition; day: number; date: string; title: string; detail: string; tone: string; }

@Component({ selector: 'app-competitions3', templateUrl: './competitions3.component.html', styleUrls: ['./competitions3.component.css'] })
export class Competitions3Component implements OnInit, OnDestroy {
  @ViewChild('timelineSearch') timelineSearch?: ElementRef<HTMLInputElement>;
  teamId = 0; teamName = ''; competitions: TeamCompetition[] = []; search = ''; sort = 'next'; loading = true; error = '';
  selected?: TeamCompetition;
  private readonly sub = new Subscription();
  constructor(private route: ActivatedRoute, private router: Router, public teamService: TeamService,
              private hub: CompetitionHubService, private gameEvents: GameEventsService) {}
  ngOnInit(): void {
    this.teamId = Number(this.route.snapshot.paramMap.get('teamId')) || this.teamService.teamId;
    if (this.teamId) this.load(); else this.sub.add(this.teamService.teamId$.subscribe(id => { if (id > 0) { this.teamId = id; this.load(); } }));
    this.sub.add(this.gameEvents.on('standings').subscribe(() => this.load(false)));
  }
  ngOnDestroy(): void { this.sub.unsubscribe(); }
  load(spinner = true): void {
    if (!this.teamId) return; if (spinner) this.loading = true;
    this.hub.teamCompetitions(this.teamId).subscribe({ next: data => { this.teamName = data.teamName; this.competitions = data.competitions; this.selected = this.rows[0]; this.loading = false; this.error = ''; }, error: () => { this.loading = false; this.error = 'The season timeline could not be loaded.'; } });
  }
  get rows(): TeamCompetition[] {
    const q = this.search.trim().toLowerCase();
    return [...this.competitions].filter(c => !q || c.name.toLowerCase().includes(q) || (c.currentStage || '').toLowerCase().includes(q)).sort((a, b) => {
      if (this.sort === 'name') return a.name.localeCompare(b.name);
      if (this.sort === 'position') return Number(a.position || 999) - Number(b.position || 999);
      if (this.sort === 'progress') return Number(b.games || 0) - Number(a.games || 0);
      return Number(a.nextMatch?.day || 9999) - Number(b.nextMatch?.day || 9999);
    });
  }
  get moments(): CompetitionMoment[] {
    const moments: CompetitionMoment[] = [];
    this.competitions.forEach(c => {
      if (c.nextMatch) moments.push({ competition: c, day: Number(c.nextMatch.day || 9999), date: c.nextMatch.date || 'Date pending', title: `${c.nextMatch.venue === 'HOME' ? 'vs' : 'at'} ${c.nextMatch.opponentTeamName}`, detail: c.nextMatch.stage, tone: 'next' });
      else if (c.elimination) moments.push({ competition: c, day: 10000, date: c.elimination.date || 'Campaign complete', title: `Exited at ${c.elimination.stage}`, detail: c.elimination.byTeamName ? `Against ${c.elimination.byTeamName}` : 'Competition journey complete', tone: 'out' });
      else moments.push({ competition: c, day: 9998, date: 'Schedule pending', title: c.currentStage || c.statusLabel || 'Awaiting stage', detail: c.entryStage || c.formatLabel, tone: 'pending' });
    });
    return moments.sort((a, b) => a.day - b.day).slice(0, 8);
  }
  get formStrength(): number { const results = this.competitions.flatMap(c => (c.form || '').split('').slice(-5)); return results.length ? Math.round(results.filter(r => r === 'W').length / results.length * 100) : 0; }
  select(c: TeamCompetition): void { this.selected = c; }
  open(c = this.selected): void { if (!c) return; this.router.navigate(c.kind === 'MULTI_STAGE' ? ['/european-rounds', c.competitionId, this.teamService.currentSeason] : ['/competition', c.competitionId]); }
  @HostListener('window:keydown', ['$event']) keyboard(event: KeyboardEvent): void {
    const el = event.target as HTMLElement | null; const typing = !!el && ['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
    if (!typing && event.key === '/') { event.preventDefault(); this.timelineSearch?.nativeElement.focus(); return; } if (typing) return;
    if (event.key === 'j' || event.key === 'k') { const list = this.rows; if (!list.length) return; const i = Math.max(0, list.findIndex(c => c.competitionId === this.selected?.competitionId)); this.selected = list[event.key === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)]; }
    if (event.key === 'Enter') this.open(); if (event.key.toLowerCase() === 'm') this.router.navigate(['/competitions2', this.teamId]); if (event.key.toLowerCase() === 'w') this.router.navigate(['/competitions-world']);
  }
}
