import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

export interface ScheduleView {
  opponentTeam: string;
  homeOrAway: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  competitionName: string;
  score: string;
  date: string;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  teamId1: number;
  teamId2: number;
  resultType?: 'W' | 'D' | 'L' | 'Pending';
}

export interface CalendarEntry {
  roundNumber: number;
  competitionName: string;
  competitionId: number;
  competitionType: string; // "League", "Cup", "European"
  opponentTeamName: string;
  opponentTeamId: number;
  homeOrAway: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  dateDisplay: string;
  score: string;
  resultOutcome: string | null; // "W", "D", "L" or null
  status: string; // "played" or "upcoming"
  teamId1: number;
  teamId2: number;
  seasonNumber: number;
}

export interface MatchEvent {
  id: number;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  teamId1: number;
  teamId2: number;
  minute: number;
  eventType: string;
  playerId: number;
  playerName: string;
  teamId: number;
  details: string;
}

@Component({
  selector: 'app-fixtures',
  templateUrl: './fixtures.component.html',
  styleUrls: ['./fixtures.component.css']
})
export class FixturesComponent implements OnInit, OnDestroy {

  teamId!: number;
  fixtures: ScheduleView[] = [];
  selectedMatch: ScheduleView | null = null;

  selectedOpponentInfo: any = null;
  matchEvents: MatchEvent[] = [];
  loadingEvents: boolean = false;

  // Post-match summary
  matchSummary: any = null;
  loadingSummary: boolean = false;

  // Calendar tab
  activeTab: 'fixtures' | 'calendar' = 'fixtures';
  calendarEntries: CalendarEntry[] = [];
  currentRound: number = 0;

  private refreshSub?: Subscription;
  private routeSub?: Subscription;

  constructor(private route: ActivatedRoute, private router: Router, private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']) || this.teamService.teamId;
      this.loadAll();
    });

    // Reload after each game advance (CONTINUE) so scores, fixtures and calendar refresh
    this.refreshSub = this.teamService.refresh$.subscribe(() => this.loadAll());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.routeSub?.unsubscribe();
  }

  private loadAll(): void {
    this.fetchFixtures();
    this.fetchCurrentRound();
    this.fetchCalendar();
  }

  switchTab(tab: 'fixtures' | 'calendar'): void {
    this.activeTab = tab;
  }

  fetchCurrentRound(): void {
    this.http.get<string>(urlApp + '/competition/getCurrentRound', { responseType: 'text' as 'json' })
      .subscribe(round => {
        this.currentRound = Number(round);
      });
  }

  fetchCalendar(): void {
    const season = this.teamService.currentSeason;
    this.http.get<CalendarEntry[]>(urlApp + `/match/calendar/${this.teamId}/${season}`)
      .subscribe(data => {
        // First load — populate normally
        if (this.calendarEntries.length === 0) {
          this.calendarEntries = data;
          return;
        }

        // Incremental update — mutate existing entries in place so the calendar
        // table doesn't re-render, only the changed score/status/outcome cells update.
        const existingByKey = new Map<string, CalendarEntry>();
        this.calendarEntries.forEach(e => existingByKey.set(this.fixtureKey(e), e));
        const seen = new Set<string>();

        data.forEach(incomingEntry => {
          const key = this.fixtureKey(incomingEntry);
          seen.add(key);
          const existing = existingByKey.get(key);
          if (!existing) {
            this.calendarEntries.push(incomingEntry);
            return;
          }
          if (existing.score !== incomingEntry.score) existing.score = incomingEntry.score;
          if (existing.resultOutcome !== incomingEntry.resultOutcome) existing.resultOutcome = incomingEntry.resultOutcome;
          if (existing.status !== incomingEntry.status) existing.status = incomingEntry.status;
          if (existing.dateDisplay !== incomingEntry.dateDisplay) existing.dateDisplay = incomingEntry.dateDisplay;
        });

        for (let i = this.calendarEntries.length - 1; i >= 0; i--) {
          if (!seen.has(this.fixtureKey(this.calendarEntries[i]))) {
            this.calendarEntries.splice(i, 1);
          }
        }
      });
  }

  getCompTypeClass(compType: string): string {
    switch (compType) {
      case 'League': return 'comp-league';
      case 'Cup': return 'comp-cup';
      case 'European': return 'comp-european';
      default: return 'comp-league';
    }
  }

  private fixtureKey(m: { competitionId: number; roundNumber: number; teamId1: number; teamId2: number }): string {
    return `${m.competitionId}-${m.roundNumber}-${m.teamId1}-${m.teamId2}`;
  }

  // Used by *ngFor trackBy on both fixtures and calendar lists. Tells Angular
  // to identify rows by their (competition, round, team1, team2) tuple instead
  // of by array index, so mutating a score in place updates only that cell.
  trackByFixture = (_: number, item: { competitionId: number; roundNumber: number; teamId1: number; teamId2: number }): string => {
    return this.fixtureKey(item);
  }

  fetchFixtures(): void {
    this.http.get<ScheduleView[]>(urlApp + `/match/getScheduleForCurrentSeasonAndTeamId/${this.teamId}`)
      .subscribe(data => {
        const incoming = data.map(match => ({
          ...match,
          resultType: this.calculateResultType(match.score, match.homeOrAway)
        }));

        // ===== First load: populate normally and auto-select first fixture =====
        if (this.fixtures.length === 0) {
          this.fixtures = incoming;
          if (this.fixtures.length > 0) {
            this.selectMatch(this.fixtures[0]);
          }
          return;
        }

        // ===== Incremental update: mutate existing entries in-place so Angular
        // doesn't re-render the whole *ngFor list. Only mutates the cells whose
        // values actually changed (score / resultType / date). =====
        const existingByKey = new Map<string, ScheduleView>();
        this.fixtures.forEach(f => existingByKey.set(this.fixtureKey(f), f));
        const seen = new Set<string>();

        incoming.forEach(incomingFixture => {
          const key = this.fixtureKey(incomingFixture);
          seen.add(key);
          const existing = existingByKey.get(key);

          if (!existing) {
            // Brand-new fixture (e.g. a knockout round was just drawn)
            this.fixtures.push(incomingFixture);
            return;
          }

          // Mutate only the fields that can change between refreshes
          const wasPending = existing.resultType === 'Pending';
          if (existing.score !== incomingFixture.score) {
            existing.score = incomingFixture.score;
            existing.resultType = incomingFixture.resultType;
          }
          if (existing.date !== incomingFixture.date) {
            existing.date = incomingFixture.date;
          }

          // If THIS is the currently selected match and it just got played,
          // pull in the live events / summary / stats so the right panel updates too.
          if (this.selectedMatch === existing && wasPending && existing.resultType !== 'Pending') {
            this.loadMatchEvents(existing);
            this.loadMatchSummary(existing);
            this.loadMatchStats(existing);
          }
        });

        // Drop fixtures the backend no longer returns (rare — e.g. knockout reset)
        for (let i = this.fixtures.length - 1; i >= 0; i--) {
          if (!seen.has(this.fixtureKey(this.fixtures[i]))) {
            if (this.selectedMatch === this.fixtures[i]) this.selectedMatch = null;
            this.fixtures.splice(i, 1);
          }
        }
      });
  }

  calculateResultType(score: string, homeOrAway: string): 'W' | 'D' | 'L' | 'Pending' {
    if (!score || score.trim() === "" || score.trim() === "-") return 'Pending';

    // The backend stores scores as "X - Y" (already from our team's perspective)
    // and may append a knockout suffix like " (agg 3-2, a.e.t.)" or " (4-2 pen)".
    // A naive split("-") breaks on those suffixes (3+ parts) and silently returns
    // 'Pending', which is why knockout results never coloured. Match the first
    // "X - Y" pair instead and colour by the visible scoreline.
    const m = score.match(/(\d+)\s*-\s*(\d+)/);
    if (!m) return 'Pending';

    const teamGoals = parseInt(m[1], 10);
    const oppGoals = parseInt(m[2], 10);
    if (isNaN(teamGoals) || isNaN(oppGoals)) return 'Pending';

    if (teamGoals > oppGoals) return 'W';
    if (teamGoals < oppGoals) return 'L';
    return 'D';
  }

  selectMatch(match: ScheduleView) {
      this.selectedMatch = match;
      this.selectedOpponentInfo = {
          name: match.opponentTeam,
          stadium: "Opponent Stadium",
          manager: "Opponent Manager",
          form: ["W", "L", "D", "W", "W"],
          lastMeeting: "2-1 (Prev Season)"
      };

      // Load match events, summary, and stats if match has been played
      this.matchEvents = [];
      this.matchSummary = null;
      this.matchStats = null;
      if (match.resultType !== 'Pending' && match.competitionId && match.teamId1 && match.teamId2) {
          this.loadMatchEvents(match);
          this.loadMatchSummary(match);
          this.loadMatchStats(match);
      }
  }

  loadMatchSummary(match: ScheduleView): void {
      this.loadingSummary = true;
      const url = `${urlApp}/match/summary/${match.competitionId}/${match.seasonNumber}/${match.roundNumber}/${match.teamId1}/${match.teamId2}`;
      this.http.get<any>(url).subscribe({
          next: (summary) => {
              this.matchSummary = summary;
              this.loadingSummary = false;
          },
          error: () => {
              this.matchSummary = null;
              this.loadingSummary = false;
          }
      });
  }

  loadMatchEvents(match: ScheduleView): void {
      this.loadingEvents = true;
      const url = `${urlApp}/match/matchEvents/${match.competitionId}/${match.seasonNumber}/${match.roundNumber}/${match.teamId1}/${match.teamId2}`;
      this.http.get<MatchEvent[]>(url).subscribe({
          next: (events) => {
              this.matchEvents = events;
              this.loadingEvents = false;
          },
          error: () => {
              this.matchEvents = [];
              this.loadingEvents = false;
          }
      });
  }

  // Match Stats
  matchStats: any = null;
  loadingStats: boolean = false;

  getEventIcon(eventType: string): string {
      switch (eventType) {
          case 'goal': return '\u26BD';
          case 'assist': return '\uD83C\uDFA8';
          case 'yellow_card': return '\uD83D\uDFE8';
          case 'red_card': return '\uD83D\uDFE5';
          case 'substitution': return '\uD83D\uDD04';
          case 'offside': return '\uD83D\uDEA9';
          case 'shot_saved': return '\uD83E\uDDE4';
          case 'shot_wide': return '\u274C';
          default: return '\u25CF';
      }
  }

  getEventClass(eventType: string): string {
      switch (eventType) {
          case 'goal': return 'event-goal';
          case 'assist': return 'event-assist';
          case 'yellow_card': return 'event-yellow';
          case 'red_card': return 'event-red';
          case 'substitution': return 'event-sub';
          case 'offside': return 'event-offside';
          case 'shot_saved': return 'event-save';
          case 'shot_wide': return 'event-miss';
          default: return '';
      }
  }

  loadMatchStats(match: ScheduleView): void {
      this.loadingStats = true;
      const url = `${urlApp}/match/stats/${match.competitionId}/${match.seasonNumber}/${match.roundNumber}/${match.teamId1}/${match.teamId2}`;
      this.http.get<any>(url).subscribe({
          next: (data) => {
              this.matchStats = data?.available ? data : null;
              this.loadingStats = false;
          },
          error: () => {
              this.matchStats = null;
              this.loadingStats = false;
          }
      });
  }

  getStatBarWidth(home: any, away: any): { homeWidth: string, awayWidth: string } {
      const h = typeof home === 'string' ? parseFloat(home) : (home || 0);
      const a = typeof away === 'string' ? parseFloat(away) : (away || 0);
      const total = h + a;
      if (total === 0) return { homeWidth: '50%', awayWidth: '50%' };
      return {
          homeWidth: Math.round(h / total * 100) + '%',
          awayWidth: Math.round(a / total * 100) + '%'
      };
  }

  isHomeTeamEvent(event: MatchEvent): boolean {
      return event.teamId === event.teamId1;
  }

  viewTeam(teamName: string): void {
    console.log("Navigating to team:", teamName);
  }
}
