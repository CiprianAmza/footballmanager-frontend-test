import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompetitionGoalsRanking, CompetitionGoalsRankingRow, CompetitionHubService, WorldCompetition, WorldCompetitionOverview } from '../services/competition-hub.service';
import { TeamService } from '../services/team.service';

@Component({ selector: 'app-competitions-world', templateUrl: './competitions-world.component.html', styleUrls: ['./competitions-world.component.css'] })
export class CompetitionsWorldComponent implements OnInit, OnDestroy {
  @ViewChild('worldSearch') worldSearch?: ElementRef<HTMLInputElement>;
  overview?: WorldCompetitionOverview; competitions: WorldCompetition[] = []; selected?: WorldCompetition;
  search = ''; scope = 'ALL'; kind = 'ALL'; status = 'ALL'; sort = 'participants'; loading = true; error = '';
  goalsRanking?: CompetitionGoalsRanking;
  rankingSeason: number | null = null;
  rankingMinMatches = 1;
  rankingLoading = false;
  rankingError = '';
  private refreshSub?: Subscription;
  constructor(private hub: CompetitionHubService, private router: Router, public teamService: TeamService) {}
  ngOnInit(): void { this.load(); this.refreshSub = this.teamService.refresh$.subscribe(() => this.load(false)); }
  ngOnDestroy(): void { this.refreshSub?.unsubscribe(); }
  load(spinner = true): void { if (spinner) this.loading = true; this.hub.worldOverview().subscribe({ next: data => { this.overview = data; this.competitions = data.competitions || []; this.selected = this.competitions.find(c => c.competitionId === this.selected?.competitionId) || this.visible[0]; this.loading = false; this.error = ''; if (this.rankingSeason === null) this.rankingSeason = data.season; this.loadGoalsRanking(); }, error: () => { this.loading = false; this.error = 'The world competition catalog could not be loaded.'; } }); }
  get rankingSeasons(): number[] { return Array.from({length: this.overview?.season || 0}, (_, index) => (this.overview?.season || 0) - index); }
  get rankingRows(): CompetitionGoalsRankingRow[] { return (this.goalsRanking?.rows || []).filter(row => row.matches >= this.rankingMinMatches); }
  loadGoalsRanking(): void {
    if (this.rankingSeason === null) return;
    this.rankingLoading = true;
    this.rankingError = '';
    this.hub.goalsRanking(this.rankingSeason).subscribe({
      next: ranking => { this.goalsRanking = ranking; this.rankingLoading = false; },
      error: () => { this.goalsRanking = undefined; this.rankingLoading = false; this.rankingError = 'Could not load the goals ranking.'; }
    });
  }
  get visible(): WorldCompetition[] {
    const q = this.search.trim().toLowerCase();
    return [...this.competitions].filter(c => !q || c.name.toLowerCase().includes(q) || (c.nationName || '').toLowerCase().includes(q) || (c.currentStage || '').toLowerCase().includes(q))
      .filter(c => this.scope === 'ALL' || c.scopeLabel === this.scope)
      .filter(c => this.kind === 'ALL' || c.kind === this.kind)
      .filter(c => this.status === 'ALL' || c.status === this.status)
      .sort((a,b) => { if (this.sort === 'name') return a.name.localeCompare(b.name); if (this.sort === 'progress') return b.progressPercent-a.progressPercent; if (this.sort === 'goals') return b.goalsPerMatch-a.goalsPerMatch; return b.participantCount-a.participantCount || a.name.localeCompare(b.name); });
  }
  get biggestField(): WorldCompetition | undefined { return [...this.competitions].sort((a,b)=>b.participantCount-a.participantCount)[0]; }
  get highestScoring(): WorldCompetition | undefined { return [...this.competitions].filter(c=>c.completedMatches>0).sort((a,b)=>b.goalsPerMatch-a.goalsPerMatch)[0]; }
  get furthestAlong(): WorldCompetition | undefined { return [...this.competitions].sort((a,b)=>b.progressPercent-a.progressPercent)[0]; }
  select(c: WorldCompetition): void { this.selected = c; }
  clear(): void { this.search='';this.scope='ALL';this.kind='ALL';this.status='ALL'; }
  open(c=this.selected): void { if (!c) return; this.router.navigate(c.kind==='MULTI_STAGE'?['/european-rounds',c.competitionId,this.overview?.season||this.teamService.currentSeason]:['/competition',c.competitionId]); }
  accent(c: WorldCompetition): string { if(c.kind==='LEAGUE')return '#657bf3';if(c.kind==='KNOCKOUT')return '#ec6574';if(c.kind==='SHOWCASE')return '#d9ad4e';return '#45bfa2'; }
  @HostListener('window:keydown',['$event']) keyboard(event:KeyboardEvent):void{const el=event.target as HTMLElement|null;const typing=!!el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName);if(!typing&&event.key==='/'){event.preventDefault();this.worldSearch?.nativeElement.focus();return}if(typing)return;if(event.key==='j'||event.key==='k'){const list=this.visible;if(!list.length)return;const i=Math.max(0,list.findIndex(c=>c.competitionId===this.selected?.competitionId));this.selected=list[event.key==='j'?Math.min(list.length-1,i+1):Math.max(0,i-1)]}if(event.key==='Enter')this.open();if(event.key==='Escape')this.clear();if(event.key.toLowerCase()==='m')this.router.navigate(['/competitions2',this.teamService.teamId]);}
}
