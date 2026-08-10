import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';
import { SquadInsightOverview, SquadInsightPlayer, SquadInsightsService } from '../services/squad-insights.service';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-squad3',
  templateUrl: './squad3.component.html',
  styleUrls: ['./squad3.component.css']
})
export class Squad3Component implements OnInit, OnDestroy {
  @ViewChild('peopleSearch') peopleSearch?: ElementRef<HTMLInputElement>;

  teamId = 0;
  overview?: SquadInsightOverview;
  players: SquadInsightPlayer[] = [];
  selectedPlayer?: SquadInsightPlayer;
  filter: 'ALL' | 'ATTENTION' | 'AMBITION' | 'LEADERS' | 'YOUTH' = 'ALL';
  search = '';
  loading = true;
  error = '';
  actionMessage = '';
  actionLoading = false;
  private readonly sub = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private teamService: TeamService,
    private insights: SquadInsightsService,
    private gameEvents: GameEventsService) {}

  ngOnInit(): void {
    this.teamId = Number(this.route.snapshot.paramMap.get('teamId')) || this.teamService.teamId;
    if (this.teamId) {
      this.load();
    } else {
      this.sub.add(this.teamService.teamId$.subscribe(teamId => {
        if (teamId > 0 && teamId !== this.teamId) {
          this.teamId = teamId;
          this.load();
        }
      }));
    }
    this.sub.add(this.gameEvents.on('squad').subscribe(() => this.load(false)));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  load(spinner = true): void {
    if (!this.teamId) return;
    if (spinner) this.loading = true;
    this.insights.load(this.teamId).subscribe({
      next: overview => {
        this.overview = overview;
        this.players = overview.players;
        const queryPlayerId = Number(this.route.snapshot.queryParamMap.get('playerId'));
        const previousId = this.selectedPlayer?.id || queryPlayerId;
        this.selectedPlayer = this.players.find(player => player.id === previousId)
          || this.people[0];
        this.loading = false;
        this.error = '';
      },
      error: error => {
        this.loading = false;
        this.error = error.status === 403
          ? 'People & Culture is private to your own club.'
          : 'The people profile could not be loaded.';
      }
    });
  }

  get people(): SquadInsightPlayer[] {
    const query = this.search.trim().toLowerCase();
    return this.players
      .filter(player => !query || player.name.toLowerCase().includes(query)
        || player.profile.personalityLabel.toLowerCase().includes(query)
        || player.profile.careerGoal.toLowerCase().includes(query))
      .filter(player => {
        if (this.filter === 'ATTENTION') return player.transferRisk !== 'LOW' || player.concern !== 'No active concern';
        if (this.filter === 'AMBITION') return player.profile.ambition >= 15;
        if (this.filter === 'LEADERS') return player.profile.leadership >= 15;
        if (this.filter === 'YOUTH') return player.age <= 21;
        return true;
      })
      .sort((a, b) => b.transferRiskScore - a.transferRiskScore || b.profile.leadership - a.profile.leadership);
  }

  get avgProfessionalism(): number { return this.average('professionalism'); }
  get avgAmbition(): number { return this.average('ambition'); }
  get avgLoyalty(): number { return this.average('loyalty'); }
  get avgLeadership(): number { return this.average('leadership'); }
  get attentionCount(): number { return this.players.filter(p => p.transferRisk !== 'LOW' || p.concern !== 'No active concern').length; }
  get cultureLabel(): string {
    if (this.avgProfessionalism >= 15 && this.avgAmbition >= 14) return 'Driven standards';
    if (this.avgLoyalty >= 15) return 'Stable collective';
    if (this.avgLeadership >= 14) return 'Player-led group';
    return 'Mixed dressing room';
  }

  select(player: SquadInsightPlayer): void {
    this.selectedPlayer = player;
    this.actionMessage = '';
  }

  setFilter(filter: 'ALL' | 'ATTENTION' | 'AMBITION' | 'LEADERS' | 'YOUTH'): void {
    this.filter = filter;
    if (!this.people.some(player => player.id === this.selectedPlayer?.id)) this.selectedPlayer = this.people[0];
  }

  scoreWidth(score: number): number { return Math.max(5, Math.min(100, score * 5)); }
  scoreLabel(score: number): string { return score >= 16 ? 'High' : score >= 10 ? 'Balanced' : 'Developing'; }

  promisePlayingTime(player: SquadInsightPlayer): void {
    this.actionLoading = true;
    this.actionMessage = '';
    this.http.post<any>(`${urlApp}/contract/promisePlayingTime`, { playerId: player.id }).subscribe({
      next: response => {
        this.actionLoading = false;
        this.actionMessage = response?.message || 'The conversation is complete.';
        this.gameEvents.emit('squad');
      },
      error: error => {
        this.actionLoading = false;
        this.actionMessage = error.error?.message || 'The conversation could not be completed.';
      }
    });
  }

  openProfile(player = this.selectedPlayer): void {
    if (player) this.router.navigate(['/player', player.id], { queryParams: { actingTeamId: this.teamId } });
  }

  trackByPlayer(_: number, player: SquadInsightPlayer): number { return player.id; }

  @HostListener('window:keydown', ['$event'])
  keyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!typing && event.key === '/') {
      event.preventDefault();
      this.peopleSearch?.nativeElement.focus();
      return;
    }
    if (typing) return;
    const numericFilters: any = { '1': 'ALL', '2': 'ATTENTION', '3': 'AMBITION', '4': 'LEADERS', '5': 'YOUTH' };
    if (numericFilters[event.key]) this.setFilter(numericFilters[event.key]);
    if (event.key === 'j' || event.key === 'k') {
      const list = this.people;
      if (!list.length) return;
      const current = Math.max(0, list.findIndex(player => player.id === this.selectedPlayer?.id));
      this.selectedPlayer = list[event.key === 'j' ? Math.min(list.length - 1, current + 1) : Math.max(0, current - 1)];
    }
    if (event.key.toLowerCase() === 'p') this.openProfile();
    if (event.key.toLowerCase() === 'c') this.router.navigate(['/squad2', this.teamId]);
  }

  private average(field: 'professionalism' | 'ambition' | 'loyalty' | 'leadership'): number {
    if (!this.players.length) return 0;
    return Math.round(this.players.reduce((sum, player) => sum + player.profile[field], 0) / this.players.length);
  }
}
