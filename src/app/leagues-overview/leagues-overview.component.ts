import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface QualificationZones {
  locGroup: number[];        // 1-based positions that go straight to LoC group stage
  locQualifying: number[];   // → LoC qualifying round
  locPreliminary: number[];  // → LoC preliminary
  starsCup: number[];        // → Stars Cup
}

interface TeamRow {
  position: number;
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
}

interface LeagueOverview {
  competitionId: number;
  name: string;
  nationId: number;
  rank: number;
  qualificationZones: QualificationZones;
  topTeams: TeamRow[];
  totalTeams: number;
}

interface CupOverviewMatch {
  matchIndex: number;
  team1Name: string | null;
  team2Name: string | null;
  score: string | null;
}

interface CupOverview {
  competitionId: number;
  name: string;
  nationId: number;
  rank: number;
  totalRounds: number;
  lastPlayedRound: number;
  currentRoundName: string;
  focusRound: number;
  focusRoundMatches: CupOverviewMatch[];
}

@Component({
  selector: 'app-leagues-overview',
  templateUrl: './leagues-overview.component.html',
  styleUrls: ['./leagues-overview.component.css']
})
export class LeaguesOverviewComponent implements OnInit, OnDestroy {

  season: number = 1;
  leagues: LeagueOverview[] = [];
  cups: CupOverview[] = [];

  topN: number = 5;
  topNOptions: number[] = [5, 10];

  view: 'leagues' | 'cups' = 'leagues';

  // Per-league visibility — keyed by competitionId. Default true.
  visibleLeagues: { [id: number]: boolean } = {};
  visibleCups: { [id: number]: boolean } = {};
  filterOpen: boolean = false;

  loading: boolean = false;
  private refreshSub?: Subscription;

  constructor(private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.loadAll();
    // Refresh whenever the game advances so standings update in-place
    this.refreshSub = this.teamService.refresh$.subscribe(() => this.loadAll());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  setView(v: 'leagues' | 'cups'): void {
    this.view = v;
  }

  setTopN(n: number): void {
    this.topN = n;
    this.loadLeagues();
  }

  toggleLeagueVisibility(id: number): void {
    this.visibleLeagues[id] = !this.visibleLeagues[id];
  }

  toggleCupVisibility(id: number): void {
    this.visibleCups[id] = !this.visibleCups[id];
  }

  selectAllLeagues(visible: boolean): void {
    for (const l of this.leagues) this.visibleLeagues[l.competitionId] = visible;
  }
  selectAllCups(visible: boolean): void {
    for (const c of this.cups) this.visibleCups[c.competitionId] = visible;
  }

  get visibleLeagueList(): LeagueOverview[] {
    return this.leagues.filter(l => this.visibleLeagues[l.competitionId] !== false);
  }
  get visibleCupList(): CupOverview[] {
    return this.cups.filter(c => this.visibleCups[c.competitionId] !== false);
  }

  loadAll(): void {
    this.loadLeagues();
    this.loadCups();
  }

  loadLeagues(): void {
    this.loading = true;
    this.http.get<{ season: number; topN: number; leagues: LeagueOverview[] }>(
      `${urlApp}/competition/leaguesOverview?topN=${this.topN}`
    ).subscribe({
      next: (data) => {
        this.season = data.season;
        this.leagues = data.leagues;
        // First-time: mark all visible by default. Preserve user toggles afterwards.
        for (const l of this.leagues) {
          if (this.visibleLeagues[l.competitionId] === undefined) {
            this.visibleLeagues[l.competitionId] = true;
          }
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadCups(): void {
    this.http.get<{ season: number; cups: CupOverview[] }>(
      `${urlApp}/competition/cupsOverview`
    ).subscribe({
      next: (data) => {
        this.cups = data.cups;
        for (const c of this.cups) {
          if (this.visibleCups[c.competitionId] === undefined) {
            this.visibleCups[c.competitionId] = true;
          }
        }
      }
    });
  }

  /**
   * Maps a 1-based position to a CSS qualification class for row coloring.
   * Priority: LoC group > LoC qualifying > LoC preliminary > Stars Cup > nothing.
   */
  zoneFor(zones: QualificationZones, position: number, totalTeams: number): string {
    if (zones.locGroup.includes(position)) return 'zone-loc-group';
    if (zones.locQualifying.includes(position)) return 'zone-loc-qual';
    if (zones.locPreliminary.includes(position)) return 'zone-loc-prelim';
    if (zones.starsCup.includes(position)) return 'zone-stars-cup';
    // Relegation: bottom 2 positions of the league (only if we're showing enough rows)
    if (totalTeams > 0 && position >= totalTeams - 1) return 'zone-relegation';
    return '';
  }

  /**
   * Short tag shown next to the position number for the legend feel.
   */
  zoneTag(zones: QualificationZones, position: number, totalTeams: number): string {
    if (zones.locGroup.includes(position)) return 'LoC G';
    if (zones.locQualifying.includes(position)) return 'LoC Q';
    if (zones.locPreliminary.includes(position)) return 'LoC P';
    if (zones.starsCup.includes(position)) return 'SC';
    if (totalTeams > 0 && position >= totalTeams - 1) return 'R';
    return '';
  }

  formChar(c: string): string {
    return c.toUpperCase();
  }
}
