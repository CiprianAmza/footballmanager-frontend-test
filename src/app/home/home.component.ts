import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { TeamService } from '../services/team.service';
import { urlApp } from '../app.component';

interface HomePlayerStat {
  rank: number;
  playerId: number;
  playerName: string;
  position: string;
  appearances: number;
  goals: number;
  assists: number | null;
  averageRating: number | null;
  overallRating?: number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {

  private refreshSub?: Subscription;

  teamName: string = '';
  leaguePosition: number = 0;
  leaguePoints: number = 0;
  form: string = '';

  // League competition info
  leagueCompetition: any = null;

  // Next match
  nextMatch: any = null;

  // Match preview from backend
  matchPreview: any = null;

  // Recent results (last 5 played matches)
  recentResults: any[] = [];

  // Mini league table
  leagueTable: any[] = [];

  // Current-season contributors for the user's team
  playerStats: HomePlayerStat[] = [];
  playerStatsSeason: number = 0;
  playerStatsLoading: boolean = true;

  // Upcoming fixtures (next 5 unplayed)
  upcomingFixtures: any[] = [];

  // Season Objectives
  seasonObjectives: any[] = [];

  // League news feed (GET /game/leagueNews/{season}): {type,title,content,season}
  leagueNews: any[] = [];

  // Board requests (GET /game/boardRequests/{teamId}): BoardRequest entity
  boardRequests: any[] = [];

  // Team Talk (expanded)
  teamTalkUsed: boolean = false;
  teamTalkResult: string = '';
  teamTalkLoading: boolean = false;
  teamTalkPlayerReactions: any[] = [];
  showPlayerReactions: boolean = false;
  teamTalkPhase: string = 'PRE_MATCH';
  teamTalkPhases: string[] = ['PRE_MATCH', 'HALF_TIME', 'POST_MATCH'];
  matchContext: string = '';
  teamTalkOptions: any[] = [];
  loadingTalkOptions: boolean = false;
  phasesUsed: Set<string> = new Set();

  // Individual Player Talks
  showIndividualTalk: boolean = false;
  individualTalkOptions: any[] = [];
  individualTalkLoading: boolean = false;
  individualTalkResult: string = '';
  selectedTalkPlayerId: number | null = null;
  squadPlayers: any[] = [];

  // Finance summary
  transferBudget: number = 0;
  totalFinances: number = 0;
  debt: number = 0;
  boardConfidence: number = 50;

  // Manager Fired
  managerFired: boolean = false;

  constructor(private http: HttpClient, public teamService: TeamService) {}

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  ngOnInit(): void {
    // Check if manager is fired
    this.managerFired = this.teamService.managerFired;
    this.teamService.managerFired$.subscribe(fired => this.managerFired = fired);

    // Reload data after each game advance / live-match commit / press conference
    this.refreshSub = this.teamService.refresh$.subscribe(() => this.loadData());
    // Also reload once the team id becomes known (setup check resolves async) so
    // the first paint isn't stuck on a teamId=0 request. Only react to a *real*
    // (non-zero) id and ignore repeat emissions so we never spin on the seeded 0.
    this.refreshSub.add(
      this.teamService.teamId$
        .pipe(filter(id => !!id), distinctUntilChanged())
        .subscribe(() => this.loadData())
    );

    this.loadData();
  }

  loadData(): void {
    const teamId = this.teamService.teamId;
    if (!teamId) return; // setup not resolved yet — wait for teamId$ / refresh$

    // Load team name
    this.http.get(urlApp + `/teams/getTeamNameById/${teamId}`, { responseType: 'text' })
      .subscribe({
        next: (name) => this.teamName = name,
        error: (err) => console.error('Error loading team name:', err)
      });

    // Load team competitions to find league
    this.http.get<any[]>(urlApp + `/competition/getTeamCompetitions/${teamId}`)
      .subscribe({
        next: (competitions) => {
          // Find the first league (typeId === 1)
          this.leagueCompetition = competitions.find(c => c.typeId === 1) || competitions[0];
          if (this.leagueCompetition) {
            this.leaguePosition = this.leagueCompetition.position;
            this.leaguePoints = this.leagueCompetition.points;
            this.form = (this.leagueCompetition.form && this.leagueCompetition.form !== 'null') ? this.leagueCompetition.form : '';

            // Load mini league table
            this.http.get<any[]>(urlApp + `/competition/getTeams/${this.leagueCompetition.competitionId}`)
              .subscribe({
                next: (teams) => {
                  this.leagueTable = teams.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
                },
                error: (err) => console.error('Error loading league table:', err)
              });
          }
        },
        error: (err) => console.error('Error loading competitions:', err)
      });

    // Load schedule for fixtures and recent results
    this.http.get<any[]>(urlApp + `/match/getScheduleForCurrentSeasonAndTeamId/${teamId}`)
      .subscribe({
        next: (schedule) => {
          // Recent results: matches with a real score (not "-")
          const played = schedule.filter(m => m.score && m.score.trim() !== '' && m.score.trim() !== '-');
          this.recentResults = played.slice(-5).reverse();

          // Next match: first match without a score (score is "-" or empty)
          const unplayed = schedule.filter(m => !m.score || m.score.trim() === '' || m.score.trim() === '-');
          this.nextMatch = unplayed.length > 0 ? unplayed[0] : null;

          // Upcoming fixtures (next 5 unplayed)
          this.upcomingFixtures = unplayed.slice(0, 5);
        },
        error: (err) => console.error('Error loading schedule:', err)
      });

    // Load match preview
    this.http.get<any>(urlApp + `/match/preview/${teamId}`)
      .subscribe({
        next: (preview) => this.matchPreview = preview,
        error: (err) => console.error('Error loading match preview:', err)
      });

    // Load finances summary
    this.http.get<any>(urlApp + `/teams/finances/${teamId}`)
      .subscribe({
        next: (data) => {
          this.transferBudget = data.transferBudget || 0;
          this.totalFinances = data.totalFinances || 0;
          this.debt = data.debt || 0;
          this.boardConfidence = data.boardConfidence ?? 50;
        },
        error: (err) => console.error('Error loading finances:', err)
      });

    // Load season objectives
    this.loadSeasonObjectives();

    // Board requests (objectives set by the board for this team)
    this.http.get<any[]>(urlApp + `/game/boardRequests/${teamId}`)
      .subscribe({
        next: (requests) => this.boardRequests = requests || [],
        error: (err) => console.error('Error loading board requests:', err)
      });

    // League news feed for the current season
    this.http.get<any>(urlApp + `/competition/getCurrentSeason`)
      .subscribe({
        next: (season) => {
          const seasonNumber = Number(season);
          this.loadLeagueNews(seasonNumber);
          this.loadPlayerStats(teamId, seasonNumber);
        },
        error: (err) => console.error('Error loading current season:', err)
      });

    // Reload team talk status
    this.loadTeamTalkStatus();
  }

  private loadPlayerStats(teamId: number, seasonNumber: number): void {
    this.playerStatsSeason = seasonNumber;
    this.playerStatsLoading = true;
    this.http.get<HomePlayerStat[]>(
      urlApp + `/stats/team/${teamId}/season/${seasonNumber}?limit=3`
    ).subscribe({
      next: (stats) => {
        this.playerStats = stats || [];
        this.playerStatsLoading = false;
      },
      error: () => this.loadLegacyPlayerStats(teamId)
    });
  }

  /**
   * Keeps Home usable against an already-running older backend. That endpoint
   * does not contain assists or match ratings, so the UI labels its overall
   * rating honestly instead of rendering missing values as empty text.
   */
  private loadLegacyPlayerStats(teamId: number): void {
    this.http.get<{ [playerId: string]: any }>(urlApp + `/stats/playerStats/leaderboard`)
      .subscribe({
        next: (stats) => {
          this.playerStats = Object.entries(stats || {})
            .map(([playerId, stat]: [string, any]) => ({ playerId: Number(playerId), stat }))
            .filter(({ stat }) => stat && Number(stat.teamId) === Number(teamId))
            .sort((left, right) =>
              Number(right.stat.currentSeasonGoals || 0) - Number(left.stat.currentSeasonGoals || 0)
              || Number(right.stat.currentRating || 0) - Number(left.stat.currentRating || 0))
            .slice(0, 3)
            .map(({ playerId, stat }, index) => ({
              rank: index + 1,
              playerId,
              playerName: stat.name || 'Unknown player',
              position: stat.position || '',
              appearances: Number(stat.currentSeasonGames || 0),
              goals: Number(stat.currentSeasonGoals || 0),
              assists: null,
              averageRating: null,
              overallRating: Number(stat.currentRating || 0)
            }));
          this.playerStatsLoading = false;
        },
        error: (err) => {
          this.playerStats = [];
          this.playerStatsLoading = false;
          console.error('Error loading player stats:', err);
        }
      });
  }

  loadLeagueNews(season: number): void {
    this.http.get<any[]>(urlApp + `/game/leagueNews/${season}`)
      .subscribe({
        next: (news) => this.leagueNews = news || [],
        error: (err) => console.error('Error loading league news:', err)
      });
  }

  loadSeasonObjectives(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any[]>(urlApp + `/objectives/current/${teamId}`)
      .subscribe({
        next: (objectives) => this.seasonObjectives = objectives,
        error: (err) => console.error('Error loading season objectives:', err)
      });
  }

  getObjectiveDescription(objective: any): string {
    if (objective.objectiveType === 'league_position') {
      if (objective.targetValue <= 3) return 'Finish top ' + objective.targetValue;
      if (objective.targetValue <= 5) return 'Finish top ' + objective.targetValue;
      return 'Finish in position ' + objective.targetValue + ' or higher';
    } else if (objective.objectiveType === 'cup_round') {
      return 'Reach cup semi-final';
    }
    return 'Unknown objective';
  }

  getObjectiveStatusClass(status: string): string {
    switch (status) {
      case 'achieved': return 'obj-achieved';
      case 'failed': return 'obj-failed';
      case 'active': return 'obj-active';
      default: return '';
    }
  }

  getObjectiveTypeBadgeClass(type: string): string {
    switch (type) {
      case 'league_position': return 'badge-league';
      case 'cup_round': return 'badge-cup';
      case 'european_round': return 'badge-european';
      default: return 'badge-cup';
    }
  }

  getObjectiveTypeLabel(type: string): string {
    switch (type) {
      case 'league_position': return 'LEAGUE';
      case 'cup_round': return 'CUP';
      case 'european_round': return 'EUROPE';
      default: return 'OTHER';
    }
  }

  loadTeamTalkStatus(): void {
    this.http.get<any>(urlApp + '/competition/teamTalkStatus')
      .subscribe({
        next: (status) => {
          this.teamTalkUsed = status.used;
          this.phasesUsed = new Set();
          if (status.used) this.phasesUsed.add('PRE_MATCH');
        },
        error: (err) => console.error('Error loading team talk status:', err)
      });
    this.loadSquadPlayers();
    this.loadTeamTalkOptions();
    this.loadIndividualTalkOptions();
  }

  loadSquadPlayers(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any[]>(urlApp + `/tactic/getPlayers/${teamId}`).subscribe({
      next: (data) => this.squadPlayers = data,
      error: () => this.squadPlayers = []
    });
  }

  setTeamTalkPhase(phase: string): void {
    this.teamTalkPhase = phase;
    this.teamTalkResult = '';
    this.teamTalkPlayerReactions = [];
    this.showPlayerReactions = false;
    this.loadTeamTalkOptions();
  }

  loadTeamTalkOptions(): void {
    this.loadingTalkOptions = true;
    const contextParam = this.matchContext ? `?matchContext=${this.matchContext}` : '';
    this.http.get<any[]>(urlApp + `/competition/teamTalkOptions/${this.teamTalkPhase}${contextParam}`)
      .subscribe({
        next: (options) => {
          this.teamTalkOptions = options;
          this.loadingTalkOptions = false;
        },
        error: () => {
          this.teamTalkOptions = [];
          this.loadingTalkOptions = false;
        }
      });
  }

  setMatchContext(context: string): void {
    this.matchContext = context;
    this.loadTeamTalkOptions();
  }

  giveExpandedTeamTalk(type: string): void {
    if (this.phasesUsed.has(this.teamTalkPhase) || this.teamTalkLoading) return;

    this.teamTalkLoading = true;
    this.teamTalkResult = '';
    this.teamTalkPlayerReactions = [];
    this.showPlayerReactions = false;

    this.http.post<any>(urlApp + '/competition/teamTalkExpanded', {
      phase: this.teamTalkPhase,
      type,
      matchContext: this.matchContext || null
    }).subscribe({
      next: (response) => {
        this.teamTalkLoading = false;
        if (response.success) {
          this.phasesUsed.add(this.teamTalkPhase);
          if (this.teamTalkPhase === 'PRE_MATCH') this.teamTalkUsed = true;
          this.teamTalkResult = response.message;
          this.teamTalkPlayerReactions = response.playerReactions || [];
        } else {
          this.teamTalkResult = response.message;
        }
      },
      error: (err) => {
        this.teamTalkLoading = false;
        this.teamTalkResult = 'Failed to deliver team talk.';
        console.error('Error giving team talk:', err);
      }
    });
  }

  togglePlayerReactions(): void {
    this.showPlayerReactions = !this.showPlayerReactions;
  }

  getPhaseLabel(phase: string): string {
    switch (phase) {
      case 'PRE_MATCH': return 'Pre-Match';
      case 'HALF_TIME': return 'Half-Time';
      case 'POST_MATCH': return 'Post-Match';
      default: return phase;
    }
  }

  getReactionClass(reaction: string): string {
    switch (reaction) {
      case 'Fired Up':
      case 'Motivated': return 'reaction-positive';
      case 'Pleased': return 'reaction-ok';
      case 'Neutral': return 'reaction-neutral';
      case 'Unhappy':
      case 'Furious': return 'reaction-negative';
      default: return '';
    }
  }

  // Individual Player Talks
  loadIndividualTalkOptions(): void {
    this.http.get<any[]>(urlApp + '/competition/playerTalkOptions').subscribe({
      next: (options) => this.individualTalkOptions = options,
      error: () => this.individualTalkOptions = []
    });
  }

  giveIndividualTalk(type: string): void {
    if (!this.selectedTalkPlayerId || this.individualTalkLoading) return;
    this.individualTalkLoading = true;
    this.individualTalkResult = '';

    this.http.post<any>(urlApp + '/competition/playerTalk', {
      playerId: this.selectedTalkPlayerId,
      type
    }).subscribe({
      next: (response) => {
        this.individualTalkLoading = false;
        if (response.success) {
          this.individualTalkResult = response.message;
        } else {
          this.individualTalkResult = response.message;
        }
      },
      error: () => {
        this.individualTalkLoading = false;
        this.individualTalkResult = 'Failed to deliver individual talk.';
      }
    });
  }

  getFormClass(char: string): string {
    switch (char.toUpperCase()) {
      case 'W': return 'form-win';
      case 'D': return 'form-draw';
      case 'L': return 'form-loss';
      default: return '';
    }
  }
}
