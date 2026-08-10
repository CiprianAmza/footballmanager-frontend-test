import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompetitionHubService, TeamCompetition } from '../services/competition-hub.service';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-competitions2',
  templateUrl: './competitions2.component.html',
  styleUrls: ['./competitions2.component.css']
})
export class Competitions2Component implements OnInit, OnDestroy {
  @ViewChild('missionSearch') missionSearch?: ElementRef<HTMLInputElement>;
  teamId = 0;
  teamName = '';
  competitions: TeamCompetition[] = [];
  selected?: TeamCompetition;
  search = '';
  filter: 'ALL' | 'NEXT' | 'ACTIVE' | 'ATTENTION' = 'ALL';
  loading = true;
  error = '';
  private readonly sub = new Subscription();

  constructor(private route: ActivatedRoute, private router: Router,
              private teamService: TeamService, private hub: CompetitionHubService,
              private gameEvents: GameEventsService) {}

  ngOnInit(): void {
    this.teamId = Number(this.route.snapshot.paramMap.get('teamId')) || this.teamService.teamId;
    if (this.teamId) this.load();
    else this.sub.add(this.teamService.teamId$.subscribe(id => {
      if (id > 0 && id !== this.teamId) { this.teamId = id; this.load(); }
    }));
    this.sub.add(this.gameEvents.on('standings').subscribe(() => this.load(false)));
  }
  ngOnDestroy(): void { this.sub.unsubscribe(); }

  load(spinner = true): void {
    if (!this.teamId) return;
    if (spinner) this.loading = true;
    this.hub.teamCompetitions(this.teamId).subscribe({
      next: data => {
        this.teamName = data.teamName;
        this.competitions = data.competitions;
        this.selected = this.competitions.find(c => c.competitionId === this.selected?.competitionId) || this.visible[0];
        this.loading = false; this.error = '';
      },
      error: () => { this.loading = false; this.error = 'The competition plan could not be loaded.'; }
    });
  }

  get visible(): TeamCompetition[] {
    const query = this.search.trim().toLowerCase();
    return [...this.competitions]
      .filter(c => !query || c.name.toLowerCase().includes(query) || (c.currentStage || '').toLowerCase().includes(query))
      .filter(c => this.filter === 'ALL'
        || (this.filter === 'NEXT' && !!c.nextMatch)
        || (this.filter === 'ACTIVE' && !c.elimination)
        || (this.filter === 'ATTENTION' && (!!c.elimination || (c.position || 0) > Math.ceil((c.totalTeams || 20) / 2))))
      .sort((a, b) => this.priority(b) - this.priority(a) || a.name.localeCompare(b.name));
  }
  get nextCount(): number { return this.competitions.filter(c => c.nextMatch).length; }
  get activeCount(): number { return this.competitions.filter(c => !c.elimination).length; }
  get averagePosition(): number {
    const rows = this.competitions.filter(c => c.kind === 'LEAGUE' && c.position);
    return rows.length ? Math.round(rows.reduce((sum, c) => sum + Number(c.position), 0) / rows.length) : 0;
  }
  get totalMatches(): number { return this.competitions.reduce((sum, c) => sum + Number(c.games || 0), 0); }

  setFilter(filter: 'ALL' | 'NEXT' | 'ACTIVE' | 'ATTENTION'): void { this.filter = filter; this.selected = this.visible[0]; }
  select(comp: TeamCompetition): void { this.selected = comp; }
  open(comp = this.selected): void { if (comp) this.router.navigate(this.competitionLink(comp)); }
  competitionLink(comp: TeamCompetition): any[] {
    return comp.kind === 'MULTI_STAGE'
      ? ['/european-rounds', comp.competitionId, this.teamService.currentSeason]
      : ['/competition', comp.competitionId];
  }
  objective(comp: TeamCompetition): string {
    if (comp.elimination) return `Review the exit at ${comp.elimination.stage}.`;
    if (comp.nextMatch) return `Prepare for ${comp.nextMatch.opponentTeamName}.`;
    if (comp.kind === 'LEAGUE' && comp.position) return `Improve on position ${comp.position} of ${comp.totalTeams}.`;
    return 'Await the next draw or scheduled stage.';
  }
  form(comp: TeamCompetition): string[] { return (comp.form || '').split('').slice(-5); }
  statusClass(comp: TeamCompetition): string { return comp.elimination ? 'out' : comp.nextMatch ? 'next' : 'steady'; }
  private priority(comp: TeamCompetition): number {
    return (comp.nextMatch ? 1000 - Number(comp.nextMatch.day || 0) : 0) + (comp.elimination ? -100 : 0) + (comp.kind === 'LEAGUE' ? 30 : 50);
  }

  @HostListener('window:keydown', ['$event'])
  keyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!typing && event.key === '/') { event.preventDefault(); this.missionSearch?.nativeElement.focus(); return; }
    if (typing) return;
    if (event.key === 'j' || event.key === 'k') {
      const list = this.visible; if (!list.length) return;
      const current = Math.max(0, list.findIndex(c => c.competitionId === this.selected?.competitionId));
      this.selected = list[event.key === 'j' ? Math.min(list.length - 1, current + 1) : Math.max(0, current - 1)];
    }
    if (event.key === 'Enter') this.open();
    if (event.key.toLowerCase() === 'w') this.router.navigate(['/competitions-world']);
    if (event.key.toLowerCase() === 'c') this.router.navigate(['/competition-list']);
  }
}
