import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FriendlyDay, FriendlyHubService, FriendlyMatchView, FriendlyOpponent } from '../services/friendly-hub.service';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-friendlies2',
  templateUrl: './friendlies2.component.html',
  styleUrls: ['./friendlies2.component.css']
})
export class Friendlies2Component implements OnInit {
  teamId = 0;
  season = 1;
  loading = true;
  error = '';
  notice = '';
  matches: FriendlyMatchView[] = [];
  opponents: FriendlyOpponent[] = [];
  availableDays: FriendlyDay[] = [];
  query = '';
  statusFilter = 'ALL';
  selectedMatch: FriendlyMatchView | null = null;
  selectedIndex = 0;

  plannerOpen = false;
  opponentQuery = '';
  selectedOpponent: FriendlyOpponent | null = null;
  selectedDay: number | null = null;
  purpose = 'BALANCED';
  ruleset = 'EXTENDED_BENCH';
  venueName = '';
  saving = false;

  purposes = [
    { id: 'FITNESS', label: 'Build fitness', note: 'Match load and sharpness' },
    { id: 'TACTICAL', label: 'Test tactic', note: 'Structure and automatisms' },
    { id: 'DEVELOPMENT', label: 'Youth test', note: 'Minutes for prospects' },
    { id: 'BALANCED', label: 'Balanced', note: 'General preparation' }
  ];

  constructor(
    private route: ActivatedRoute,
    private hub: FriendlyHubService,
    public teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.teamId = Number(this.route.snapshot.paramMap.get('teamId')) || this.teamService.teamId;
    this.season = this.teamService.currentSeason;
    this.load();
  }

  load(): void {
    if (!this.teamId) return;
    this.loading = true;
    this.error = '';
    this.hub.loadPreparation(this.teamId, this.season).subscribe({
      next: data => {
        this.matches = data.matches;
        this.opponents = data.opponents;
        this.availableDays = data.days;
        this.loading = false;
        this.keepSelection();
      },
      error: () => {
        this.error = 'Preparation data could not be loaded.';
        this.loading = false;
      }
    });
  }

  get filteredMatches(): FriendlyMatchView[] {
    const term = this.query.trim().toLowerCase();
    return this.matches.filter(match => {
      const statusMatch = this.statusFilter === 'ALL'
        || (this.statusFilter === 'EVENT' ? !!match.friendlyEventId : match.status === this.statusFilter);
      const textMatch = !term || `${match.homeTeamName} ${match.awayTeamName} ${match.purpose} ${match.venueName}`.toLowerCase().includes(term);
      return statusMatch && textMatch;
    });
  }

  get filteredOpponents(): FriendlyOpponent[] {
    const term = this.opponentQuery.trim().toLowerCase();
    return this.opponents.filter(opponent => !term || opponent.name.toLowerCase().includes(term)).slice(0, 12);
  }

  get completed(): FriendlyMatchView[] { return this.matches.filter(match => match.status === 'COMPLETED'); }
  get scheduledCount(): number { return this.matches.filter(match => match.status === 'SCHEDULED').length; }
  get eventMatchCount(): number { return this.matches.filter(match => !!match.friendlyEventId).length; }
  get goalsFor(): number {
    return this.completed.reduce((sum, match) => sum + (match.homeTeamId === this.teamId ? match.homeGoals || 0 : match.awayGoals || 0), 0);
  }
  get goalsAgainst(): number {
    return this.completed.reduce((sum, match) => sum + (match.homeTeamId === this.teamId ? match.awayGoals || 0 : match.homeGoals || 0), 0);
  }
  get readinessScore(): number {
    return Math.min(100, 28 + this.completed.length * 13 + Math.max(0, this.goalsFor - this.goalsAgainst) * 2);
  }

  selectMatch(match: FriendlyMatchView, index?: number): void {
    this.selectedMatch = match;
    if (index !== undefined) this.selectedIndex = index;
  }

  openPlanner(): void {
    this.plannerOpen = true;
    this.notice = '';
    this.selectedOpponent = null;
    this.selectedDay = this.availableDays[0]?.day || null;
    setTimeout(() => document.getElementById('friendly-opponent-search')?.focus());
  }

  schedule(): void {
    if (!this.selectedOpponent || !this.selectedDay || this.saving) return;
    this.saving = true;
    this.hub.schedule({
      teamId: this.teamId,
      opponentTeamId: this.selectedOpponent.teamId,
      day: this.selectedDay,
      season: this.season,
      purpose: this.purpose,
      ruleset: this.ruleset,
      venueName: this.venueName
    }).subscribe({
      next: response => {
        this.saving = false;
        if (response.success === false) {
          this.notice = response.error || 'The match could not be scheduled.';
          return;
        }
        this.notice = `Friendly against ${this.selectedOpponent?.name} added to the calendar.`;
        this.plannerOpen = false;
        this.load();
      },
      error: error => {
        this.saving = false;
        this.notice = error.error?.error || 'The match could not be scheduled.';
      }
    });
  }

  cancelMatch(match: FriendlyMatchView): void {
    this.hub.cancelMatch(match.matchId).subscribe({ next: () => this.load() });
  }

  opponentName(match: FriendlyMatchView): string {
    return match.homeTeamId === this.teamId ? match.awayTeamName : match.homeTeamName;
  }

  venue(match: FriendlyMatchView): string {
    if (match.venueName) return match.venueName;
    return match.homeTeamId === this.teamId ? 'Home' : 'Away';
  }

  resultLabel(match: FriendlyMatchView): string {
    if (match.status !== 'COMPLETED') return match.status;
    const ours = match.homeTeamId === this.teamId ? match.homeGoals || 0 : match.awayGoals || 0;
    const theirs = match.homeTeamId === this.teamId ? match.awayGoals || 0 : match.homeGoals || 0;
    return ours > theirs ? 'WIN' : ours < theirs ? 'LOSS' : 'DRAW';
  }

  dayLabel(day: number): string {
    if (day <= 30) return `Pre-season · Day ${day}`;
    if (day >= 201 && day <= 210) return `Winter break · Day ${day - 200}`;
    return `Season day ${day}`;
  }

  pretty(value?: string): string {
    return (value || 'Balanced').toLowerCase().replace(/_/g, ' ').replace(/^./, first => first.toUpperCase());
  }

  trackMatch(_: number, match: FriendlyMatchView): number { return match.matchId; }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
      if (event.key === 'Escape') (target as HTMLInputElement).blur();
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      document.getElementById('friendly-search')?.focus();
    } else if (event.key.toLowerCase() === 'n') {
      this.openPlanner();
    } else if (event.key === 'Escape') {
      this.plannerOpen = false;
      this.selectedMatch = null;
    } else if (event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'k') {
      const rows = this.filteredMatches;
      if (!rows.length) return;
      const delta = event.key.toLowerCase() === 'j' ? 1 : -1;
      this.selectedIndex = Math.max(0, Math.min(rows.length - 1, this.selectedIndex + delta));
      this.selectedMatch = rows[this.selectedIndex];
    } else if (event.key === 'Enter' && this.filteredMatches[this.selectedIndex]) {
      this.selectedMatch = this.filteredMatches[this.selectedIndex];
    }
  }

  private keepSelection(): void {
    if (this.selectedMatch) {
      this.selectedMatch = this.matches.find(match => match.matchId === this.selectedMatch?.matchId) || null;
    }
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredMatches.length - 1));
  }
}
