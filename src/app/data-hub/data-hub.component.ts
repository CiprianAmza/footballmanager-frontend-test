import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { TeamService } from '../services/team.service';
import { urlApp } from '../app.component';
import { catchError, forkJoin, map, of, Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { bindTabToUrl, navigateToTab } from '../shared/url-tab-state';

interface UnderlyingMatchPerformance {
  matchId: number;
  round: number;
  home: boolean;
  goals: number;
  goalsConceded: number;
  xg: number;
  xga: number;
  actualPoints: number;
  expectedPoints: number;
}

interface UnderlyingPerformance {
  teamId: number;
  seasonNumber: number;
  matches: number;
  actualPoints: number;
  expectedPoints: number;
  pointsDelta: number;
  goals: number;
  xg: number;
  finishingDelta: number;
  goalsConceded: number;
  xga: number;
  goalsPrevented: number;
  actualConversionPercentage: number;
  expectedConversionPercentage: number;
  conversionDeltaPercentagePoints: number;
  xgPer90: number;
  xgaPer90: number;
  xgDifferencePer90: number;
  confidence: string;
  methodology: string;
  recentMatches: UnderlyingMatchPerformance[];
}

interface RadarStat {
  label: string;
  teamValue: number; // 0-20
  leagueValue: number; // 0-20
}

interface KeyFinding {
  id: number;
  title: string;
  description: string;
  type: 'pos' | 'neg' | 'neu';
  icon: string;
}

interface ReportItem {
  date: string;
  title: string;
  subtitle: string;
  type: 'match' | 'team' | 'player' | 'scout';
  img: string;
}

interface TeamDataHubStats {
  teamId: number;
  teamName: string;
  seasonNumber: number;
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  goalsPerGame: number;
  concededPerGame: number;
  avgTeamRating: number;
  totalAssists: number;
  assistsPerGame: number;
  cleanSheets: number;
  cleanSheetPercentage: number;
  winPercentage: number;
  topScorer: string;
  topScorerGoals: number;
  topAssister: string;
  topAssisterAssists: number;
  highestRatedPlayer: string;
  highestRating: number;
  recentForm: string[];
  leagueAvgGoalsPerGame: number;
  leagueAvgConcededPerGame: number;
  leagueAvgRating: number;
  leagueAvgAssistsPerGame: number;
  leagueAvgCleanSheetPct: number;
  leagueAvgWinPct: number;
}

type PerfectRatingLevel = 'ALL' | 'CHAMPIONSHIP' | 'CUP';

interface PerfectRatingCompetition {
  competitionId: number;
  competitionName: string;
  level: Exclude<PerfectRatingLevel, 'ALL'>;
  perfectRatings: number;
  players: number;
}

interface PerfectRatingLeader {
  rank: number;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  perfectRatings: number;
  championshipPerfectRatings: number;
  cupPerfectRatings: number;
  competitionCount: number;
  firstSeason: number;
  lastSeason: number;
}

interface PerfectRatingLeaderboard {
  scope: string;
  level: PerfectRatingLevel;
  competitionId: number | null;
  competitionName: string | null;
  totalPerfectRatings: number;
  totalPlayers: number;
  leaders: PerfectRatingLeader[];
  competitions: PerfectRatingCompetition[];
  methodology: string;
}

@Component({
  selector: 'app-data-hub',
  templateUrl: './data-hub.component.html',
  styleUrls: ['./data-hub.component.css']
})
export class DataHubComponent implements OnInit, OnDestroy {

  activeTab: string = 'Underlying Performance';
  tabs: string[] = ['Underlying Performance', 'Shot & Chance Creation', 'Possession & Progression', 'Pressing & Defence', 'Set Pieces Hub', 'Perfect 10s', 'Overview', 'Match Stats'];
  private seasonSubscription?: Subscription;
  private tabSubscription?: Subscription;
  private perfectRatingSubscription?: Subscription;

  teamName: string = 'Team';
  loading: boolean = true;
  errorMessage = '';

  // Radar data - will be populated from API
  generalStats: RadarStat[] = [];

  // Key Findings - dynamically generated
  keyFindings: KeyFinding[] = [];

  // Reports - from inbox messages
  recentReports: ReportItem[] = [];

  // Chart paths (calculated)
  generalTeamPath: string = '';
  generalLeaguePath: string = '';

  // Attacking/Defending summary text
  attackingSummary: string = '';
  defendingSummary: string = '';

  // Modal state
  modalOpen: boolean = false;
  activeModalContent: any = null;

  // Raw stats for modal detail
  hubStats: TeamDataHubStats | null = null;
  underlyingPerformance: UnderlyingPerformance | null = null;
  shotCreation: any = null;
  possessionProgression: any = null;
  pressingDefence: any = null;
  setPieces: any = null;

  // Season match stats (Opta-style)
  seasonStats: any = null;
  loadingSeasonStats: boolean = false;

  perfectRatings: PerfectRatingLeaderboard | null = null;
  perfectRatingsLoading = false;
  perfectRatingsError = '';
  perfectRatingLevel: PerfectRatingLevel = 'ALL';
  perfectRatingCompetitionId: number | null = null;

  constructor(private http: HttpClient, private teamService: TeamService,
              private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    this.tabSubscription = bindTabToUrl(this.route, this.tabs, 'Underlying Performance', tab => {
      this.activeTab = tab;
      if (tab === 'Match Stats' && !this.seasonStats) this.loadSeasonStats();
      if (tab === 'Perfect 10s' && !this.perfectRatings) this.loadPerfectRatings();
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    this.seasonSubscription?.unsubscribe();
    this.tabSubscription?.unsubscribe();
    this.perfectRatingSubscription?.unsubscribe();
  }

  loadData(): void {
    this.seasonSubscription?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';
    const teamId = this.teamService.teamId;

    // Wait for currentSeason to be loaded
    this.seasonSubscription = this.teamService.currentSeason$.subscribe(season => {
      if (season < 1) return;

      forkJoin({
        hubStats: this.http.get<TeamDataHubStats>(`${urlApp}/stats/teamDataHub/${teamId}/${season}`),
        inboxMessages: this.http.get<any[]>(`${urlApp}/inbox/messages/${teamId}/${season}`),
        underlyingPerformance: this.loadUnderlyingPerformance(teamId, season),
        shotCreation: this.http.get<any>(`${urlApp}/stats/team/${teamId}/season/${season}/shot-creation`)
          .pipe(catchError(() => of(null))),
        possessionProgression: this.http.get<any>(`${urlApp}/stats/team/${teamId}/season/${season}/possession-progression`)
          .pipe(catchError(() => of(null))),
        pressingDefence: this.http.get<any>(`${urlApp}/stats/team/${teamId}/season/${season}/pressing-defence`)
          .pipe(catchError(() => of(null))),
        setPieces: this.http.get<any>(`${urlApp}/stats/team/${teamId}/season/${season}/set-pieces`)
          .pipe(catchError(() => of(null)))
      }).subscribe({
        next: (data) => {
          this.hubStats = data.hubStats;
          this.underlyingPerformance = data.underlyingPerformance;
          this.shotCreation = data.shotCreation;
          this.possessionProgression = data.possessionProgression;
          this.pressingDefence = data.pressingDefence;
          this.setPieces = data.setPieces;
          this.teamName = data.hubStats.teamName || 'Team';
          this.buildRadarStats(data.hubStats);
          this.buildKeyFindings(data.hubStats);
          this.buildRecentReports(data.inboxMessages);
          this.calculateRadarPaths();
          this.buildSummaries(data.hubStats);
          this.loading = false;
          this.errorMessage = '';
        },
        error: (err) => {
          console.error('Error loading data hub stats:', err);
          this.loading = false;
          this.errorMessage = 'Analytics could not be loaded for this season.';
        }
      });
    });
  }

  private loadUnderlyingPerformance(teamId: number, season: number) {
    return this.http.get<UnderlyingPerformance>(
      `${urlApp}/stats/team/${teamId}/season/${season}/underlying-performance`
    ).pipe(
      catchError(() => this.http.get<any>(
        `${urlApp}/stats/team/${teamId}/season/${season}/intelligence`
      ).pipe(
        map(data => this.buildUnderlyingFallback(teamId, season, data?.matches || [])),
        catchError(() => of(this.emptyUnderlyingPerformance(teamId, season)))
      ))
    );
  }

  private buildUnderlyingFallback(teamId: number, season: number, rows: any[]): UnderlyingPerformance {
    const matches = [...rows].sort((a, b) => Number(a.matchId) - Number(b.matchId));
    const goals = matches.reduce((total, row) => total + Number(row.goals || 0), 0);
    const goalsConceded = matches.reduce((total, row) => total + Number(row.conceded || 0), 0);
    const xg = matches.reduce((total, row) => total + Number(row.xg || 0), 0);
    const xga = matches.reduce((total, row) => total + Number(row.xga || 0), 0);
    const shots = matches.reduce((total, row) => total + Number(row.shots || 0), 0);
    const actualPoints = matches.reduce((total, row) => {
      const scored = Number(row.goals || 0);
      const allowed = Number(row.conceded || 0);
      return total + (scored > allowed ? 3 : scored === allowed ? 1 : 0);
    }, 0);
    const expectedPoints = matches.reduce(
      (total, row) => total + this.calculateExpectedPoints(Number(row.xg || 0), Number(row.xga || 0)), 0);
    const actualConversion = shots ? goals * 100 / shots : 0;
    const expectedConversion = shots ? xg * 100 / shots : 0;
    const count = matches.length;
    const xgPer90 = count ? xg / count : 0;
    const xgaPer90 = count ? xga / count : 0;

    return {
      teamId,
      seasonNumber: season,
      matches: count,
      actualPoints,
      expectedPoints: this.roundMetric(expectedPoints),
      pointsDelta: this.roundMetric(actualPoints - expectedPoints),
      goals,
      xg: this.roundMetric(xg),
      finishingDelta: this.roundMetric(goals - xg),
      goalsConceded,
      xga: this.roundMetric(xga),
      goalsPrevented: this.roundMetric(xga - goalsConceded),
      actualConversionPercentage: this.roundMetric(actualConversion),
      expectedConversionPercentage: this.roundMetric(expectedConversion),
      conversionDeltaPercentagePoints: this.roundMetric(actualConversion - expectedConversion),
      xgPer90: this.roundMetric(xgPer90),
      xgaPer90: this.roundMetric(xgaPer90),
      xgDifferencePer90: this.roundMetric(xgPer90 - xgaPer90),
      confidence: count >= 12 ? 'HIGH' : count >= 5 ? 'MEDIUM' : 'LOW',
      methodology: 'Expected Points uses Poisson goal probabilities derived from each match\'s xG and xGA.',
      recentMatches: matches.slice(-10).map(row => {
        const scored = Number(row.goals || 0);
        const allowed = Number(row.conceded || 0);
        return {
          matchId: Number(row.matchId),
          round: Number(row.round),
          home: Boolean(row.home),
          goals: scored,
          goalsConceded: allowed,
          xg: this.roundMetric(Number(row.xg || 0)),
          xga: this.roundMetric(Number(row.xga || 0)),
          actualPoints: scored > allowed ? 3 : scored === allowed ? 1 : 0,
          expectedPoints: this.roundMetric(this.calculateExpectedPoints(Number(row.xg || 0), Number(row.xga || 0)))
        };
      })
    };
  }

  private emptyUnderlyingPerformance(teamId: number, season: number): UnderlyingPerformance {
    return this.buildUnderlyingFallback(teamId, season, []);
  }

  private calculateExpectedPoints(xg: number, xga: number): number {
    const scoring = this.poissonProbabilities(Math.max(0, xg));
    const conceding = this.poissonProbabilities(Math.max(0, xga));
    let winProbability = 0;
    let drawProbability = 0;
    for (let scored = 0; scored < scoring.length; scored++) {
      for (let allowed = 0; allowed < conceding.length; allowed++) {
        const probability = scoring[scored] * conceding[allowed];
        if (scored > allowed) winProbability += probability;
        if (scored === allowed) drawProbability += probability;
      }
    }
    return 3 * winProbability + drawProbability;
  }

  private poissonProbabilities(expectedGoals: number): number[] {
    const maxGoals = 10;
    const probabilities = new Array(maxGoals + 1).fill(0);
    probabilities[0] = Math.exp(-expectedGoals);
    let accountedFor = probabilities[0];
    for (let goals = 1; goals < maxGoals; goals++) {
      probabilities[goals] = probabilities[goals - 1] * expectedGoals / goals;
      accountedFor += probabilities[goals];
    }
    probabilities[maxGoals] = Math.max(0, 1 - accountedFor);
    return probabilities;
  }

  private roundMetric(value: number): number {
    if (Math.abs(value) < 0.005) return 0;
    return Math.round(value * 100) / 100;
  }

  signed(value: number, digits: number = 2): string {
    const normalized = Math.abs(value) < Math.pow(10, -digits) / 2 ? 0 : value;
    return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`;
  }

  deltaTone(value: number, positiveIsGood: boolean = true): string {
    if (Math.abs(value) < 0.05) return 'neutral';
    const positive = positiveIsGood ? value > 0 : value < 0;
    return positive ? 'positive' : 'negative';
  }

  metricShare(value: number, total: number): number {
    return total > 0 ? Math.max(0, Math.min(100, value * 100 / total)) : 0;
  }

  shotRadius(xg: number): number {
    return Math.max(1.5, Math.min(6, 1.5 + xg * 7));
  }

  analyticsLabel(value: string): string {
    if (!value) return 'Unknown';
    return value.toLowerCase().split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  private buildRadarStats(stats: TeamDataHubStats): void {
    // Normalize values to 0-20 scale for the radar chart
    // Each stat is scaled relative to a reasonable max

    const scaleValue = (val: number, max: number): number => {
      return Math.min(20, Math.max(0, Math.round((val / max) * 20)));
    };

    const scaleInverted = (val: number, max: number): number => {
      // For "conceded" - lower is better, so invert
      return Math.min(20, Math.max(0, Math.round(((max - val) / max) * 20)));
    };

    this.generalStats = [
      {
        label: 'Gl/Gm',
        teamValue: scaleValue(stats.goalsPerGame, 4),
        leagueValue: scaleValue(stats.leagueAvgGoalsPerGame, 4)
      },
      {
        label: 'Win %',
        teamValue: scaleValue(stats.winPercentage * 100, 100),
        leagueValue: scaleValue(stats.leagueAvgWinPct * 100, 100)
      },
      {
        label: 'Conc/Gm',
        teamValue: scaleInverted(stats.concededPerGame, 4),
        leagueValue: scaleInverted(stats.leagueAvgConcededPerGame, 4)
      },
      {
        label: 'CS %',
        teamValue: scaleValue(stats.cleanSheetPercentage * 100, 100),
        leagueValue: scaleValue(stats.leagueAvgCleanSheetPct * 100, 100)
      },
      {
        label: 'Rating',
        teamValue: scaleValue(stats.avgTeamRating, 10),
        leagueValue: scaleValue(stats.leagueAvgRating, 10)
      },
      {
        label: 'Ast/Gm',
        teamValue: scaleValue(stats.assistsPerGame, 5),
        leagueValue: scaleValue(stats.leagueAvgAssistsPerGame, 5)
      },
      {
        label: 'Goals',
        teamValue: scaleValue(stats.goalsScored, Math.max(stats.goalsScored * 2, 50)),
        leagueValue: scaleValue(stats.leagueAvgGoalsPerGame * stats.totalMatches, Math.max(stats.goalsScored * 2, 50))
      },
      {
        label: 'Form',
        teamValue: this.getFormScore(stats.recentForm),
        leagueValue: 10  // average is always 10/20
      }
    ];
  }

  private getFormScore(form: string[]): number {
    if (!form || form.length === 0) return 10;
    let pts = 0;
    for (const r of form) {
      if (r === 'W') pts += 3;
      else if (r === 'D') pts += 1;
    }
    // Max possible is 15 (5 wins). Scale to 0-20.
    return Math.min(20, Math.round((pts / 15) * 20));
  }

  private buildKeyFindings(stats: TeamDataHubStats): void {
    this.keyFindings = [];
    let id = 1;

    // 1. Goals per game comparison
    if (stats.totalMatches > 0 && stats.leagueAvgGoalsPerGame > 0) {
      const ratio = stats.goalsPerGame / stats.leagueAvgGoalsPerGame;
      if (ratio >= 1.3) {
        this.keyFindings.push({
          id: id++, title: 'ATTACKING OUTPUT',
          description: `Scoring ${stats.goalsPerGame} goals/game, well above the league average of ${stats.leagueAvgGoalsPerGame}.`,
          type: 'pos', icon: '\u26BD'
        });
      } else if (ratio < 0.8) {
        this.keyFindings.push({
          id: id++, title: 'ATTACKING OUTPUT',
          description: `Scoring only ${stats.goalsPerGame} goals/game, below the league average of ${stats.leagueAvgGoalsPerGame}.`,
          type: 'neg', icon: '\u26BD'
        });
      } else {
        this.keyFindings.push({
          id: id++, title: 'ATTACKING OUTPUT',
          description: `Scoring ${stats.goalsPerGame} goals/game, around the league average of ${stats.leagueAvgGoalsPerGame}.`,
          type: 'neu', icon: '\u26BD'
        });
      }
    }

    // 2. Defensive record
    if (stats.totalMatches > 0 && stats.leagueAvgConcededPerGame > 0) {
      const ratio = stats.concededPerGame / stats.leagueAvgConcededPerGame;
      if (ratio <= 0.7) {
        this.keyFindings.push({
          id: id++, title: 'DEFENSIVE RECORD',
          description: `Conceding only ${stats.concededPerGame} goals/game. Excellent defensive record with ${stats.cleanSheets} clean sheets.`,
          type: 'pos', icon: '\uD83D\uDEE1\uFE0F'
        });
      } else if (ratio > 1.3) {
        this.keyFindings.push({
          id: id++, title: 'DEFENSIVE RECORD',
          description: `Conceding ${stats.concededPerGame} goals/game, above league average. Defense needs improvement.`,
          type: 'neg', icon: '\u26A0\uFE0F'
        });
      } else {
        this.keyFindings.push({
          id: id++, title: 'DEFENSIVE RECORD',
          description: `Conceding ${stats.concededPerGame} goals/game, around the league average. ${stats.cleanSheets} clean sheets so far.`,
          type: 'neu', icon: '\uD83D\uDEE1\uFE0F'
        });
      }
    }

    // 3. Win percentage
    if (stats.totalMatches > 0) {
      const winPct = Math.round(stats.winPercentage * 100);
      if (winPct >= 60) {
        this.keyFindings.push({
          id: id++, title: 'WIN RATE',
          description: `Winning ${winPct}% of matches (${stats.wins}W ${stats.draws}D ${stats.losses}L). Dominant form this season.`,
          type: 'pos', icon: '\uD83C\uDFC6'
        });
      } else if (winPct < 40) {
        this.keyFindings.push({
          id: id++, title: 'WIN RATE',
          description: `Winning only ${winPct}% of matches (${stats.wins}W ${stats.draws}D ${stats.losses}L). Results need to improve.`,
          type: 'neg', icon: '\uD83D\uDCC9'
        });
      } else {
        this.keyFindings.push({
          id: id++, title: 'WIN RATE',
          description: `Winning ${winPct}% of matches (${stats.wins}W ${stats.draws}D ${stats.losses}L).`,
          type: 'neu', icon: '\uD83D\uDCCA'
        });
      }
    }

    // 4. Top scorer highlight
    if (stats.topScorer) {
      this.keyFindings.push({
        id: id++, title: 'TOP SCORER',
        description: `${stats.topScorer} leads the team with ${stats.topScorerGoals} goals this season.`,
        type: 'pos', icon: '\uD83D\uDD25'
      });
    }

    // 5. Team rating
    if (stats.avgTeamRating > 0 && stats.leagueAvgRating > 0) {
      const diff = stats.avgTeamRating - stats.leagueAvgRating;
      if (diff > 0.3) {
        this.keyFindings.push({
          id: id++, title: 'TEAM PERFORMANCE',
          description: `Average team rating of ${stats.avgTeamRating} is above the league average of ${stats.leagueAvgRating}. ${stats.highestRatedPlayer || 'N/A'} is the highest rated (${stats.highestRating}).`,
          type: 'pos', icon: '\uD83D\uDCC8'
        });
      } else if (diff < -0.3) {
        this.keyFindings.push({
          id: id++, title: 'TEAM PERFORMANCE',
          description: `Average team rating of ${stats.avgTeamRating} is below the league average of ${stats.leagueAvgRating}.`,
          type: 'neg', icon: '\uD83D\uDCC9'
        });
      } else {
        this.keyFindings.push({
          id: id++, title: 'TEAM PERFORMANCE',
          description: `Average team rating of ${stats.avgTeamRating}, in line with the league average of ${stats.leagueAvgRating}.`,
          type: 'neu', icon: '\uD83D\uDCCA'
        });
      }
    }

    // 6. Recent form
    if (stats.recentForm && stats.recentForm.length > 0) {
      const formStr = stats.recentForm.join('');
      const wCount = stats.recentForm.filter(r => r === 'W').length;
      const lCount = stats.recentForm.filter(r => r === 'L').length;
      let formType: 'pos' | 'neg' | 'neu' = 'neu';
      let formDesc = `Recent form: ${formStr}.`;
      if (wCount >= 4) { formType = 'pos'; formDesc += ' Excellent run of results.'; }
      else if (lCount >= 3) { formType = 'neg'; formDesc += ' Struggling for results recently.'; }
      else { formDesc += ' Mixed results in recent matches.'; }

      this.keyFindings.push({
        id: id++, title: 'RECENT FORM',
        description: formDesc,
        type: formType, icon: formType === 'pos' ? '\uD83D\uDFE2' : formType === 'neg' ? '\uD83D\uDD34' : '\uD83D\uDFE1'
      });
    }
  }

  private buildRecentReports(inboxMessages: any[]): void {
    this.recentReports = [];

    // Take the 6 most recent messages
    const recent = inboxMessages.slice(0, 6);

    for (const msg of recent) {
      let type: 'match' | 'team' | 'player' | 'scout' = 'match';
      let img = '\uD83D\uDCCB';

      if (msg.category === 'match_result') {
        type = 'match';
        img = '\u26BD';
      } else if (msg.category === 'scout') {
        type = 'scout';
        img = '\uD83D\uDD0D';
      } else if (msg.category === 'transfer') {
        type = 'player';
        img = '\uD83D\uDCB0';
      } else {
        type = 'team';
        img = '\uD83D\uDCCB';
      }

      // Format the date from createdAt timestamp
      const dateStr = msg.createdAt ? this.formatTimeAgo(msg.createdAt) : `Round ${msg.roundNumber}`;

      this.recentReports.push({
        date: dateStr,
        title: msg.title || 'REPORT',
        subtitle: msg.content ? msg.content.substring(0, 60) + (msg.content.length > 60 ? '...' : '') : '',
        type: type,
        img: img
      });
    }

    // If no messages, show placeholder
    if (this.recentReports.length === 0) {
      this.recentReports.push({
        date: 'N/A',
        title: 'NO REPORTS YET',
        subtitle: 'Reports will appear as the season progresses.',
        type: 'team',
        img: '\uD83D\uDCCB'
      });
    }
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min ago`;
    return 'Just now';
  }

  private buildSummaries(stats: TeamDataHubStats): void {
    // Attacking summary
    if (stats.leagueAvgGoalsPerGame > 0) {
      const atkRatio = stats.goalsPerGame / stats.leagueAvgGoalsPerGame;
      if (atkRatio >= 1.3) {
        this.attackingSummary = `Performing well above average in attacking. ${stats.goalsPerGame} goals/game with ${stats.totalAssists} assists.`;
      } else if (atkRatio < 0.8) {
        this.attackingSummary = `Attacking output below average. Only ${stats.goalsPerGame} goals/game.`;
      } else {
        this.attackingSummary = `Attacking output around average. ${stats.goalsPerGame} goals/game.`;
      }
    } else {
      this.attackingSummary = 'Not enough data to assess attacking performance.';
    }

    // Defending summary
    if (stats.leagueAvgConcededPerGame > 0) {
      const defRatio = stats.concededPerGame / stats.leagueAvgConcededPerGame;
      if (defRatio <= 0.7) {
        this.defendingSummary = `Outstanding defensive record. Only ${stats.concededPerGame} conceded/game, ${stats.cleanSheets} clean sheets.`;
      } else if (defRatio > 1.3) {
        this.defendingSummary = `Defensive issues. Conceding ${stats.concededPerGame}/game, above league average.`;
      } else {
        this.defendingSummary = `Average defensive performance. ${stats.concededPerGame} conceded/game.`;
      }
    } else {
      this.defendingSummary = 'Not enough data to assess defensive performance.';
    }
  }

  setTab(tab: string) {
    void navigateToTab(this.router, this.route, this.tabs, 'Underlying Performance', tab);
  }

  loadPerfectRatings(): void {
    this.perfectRatingSubscription?.unsubscribe();
    this.perfectRatingsLoading = true;
    this.perfectRatingsError = '';
    let params = new HttpParams()
      .set('level', this.perfectRatingLevel)
      .set('limit', '100');
    if (this.perfectRatingCompetitionId !== null) {
      params = params.set('competitionId', String(this.perfectRatingCompetitionId));
    }
    this.perfectRatingSubscription = this.http.get<PerfectRatingLeaderboard>(
      `${urlApp}/stats/perfect-ratings`, { params }
    ).subscribe({
      next: data => {
        this.perfectRatings = data;
        this.perfectRatingsLoading = false;
      },
      error: () => {
        this.perfectRatingsLoading = false;
        this.perfectRatingsError = 'The perfect-rating leaderboard could not be loaded.';
      }
    });
  }

  setPerfectRatingLevel(level: PerfectRatingLevel): void {
    if (this.perfectRatingCompetitionId === null && this.perfectRatingLevel === level) return;
    this.perfectRatingLevel = level;
    this.perfectRatingCompetitionId = null;
    this.loadPerfectRatings();
  }

  selectPerfectRatingCompetition(value: string): void {
    const competitionId = Number(value);
    this.perfectRatingCompetitionId = Number.isFinite(competitionId) && competitionId > 0
      ? competitionId : null;
    this.loadPerfectRatings();
  }

  perfectRatingScopeLabel(data: PerfectRatingLeaderboard): string {
    if (data.competitionName) return data.competitionName;
    if (data.level === 'CHAMPIONSHIP') return 'All championships';
    if (data.level === 'CUP') return 'All cups';
    return 'All competitions';
  }

  perfectRatingSeasonSpan(player: PerfectRatingLeader): string {
    return player.firstSeason === player.lastSeason
      ? `S${player.firstSeason}` : `S${player.firstSeason}–S${player.lastSeason}`;
  }

  get actingTeamId(): number {
    return this.teamService.teamId;
  }

  loadSeasonStats(): void {
    this.loadingSeasonStats = true;
    const teamId = this.teamService.teamId;
    const season = this.teamService.currentSeason;
    this.http.get<any>(`${urlApp}/match/stats/season/${teamId}/${season}`).subscribe({
      next: (data) => {
        this.seasonStats = data;
        this.loadingSeasonStats = false;
      },
      error: () => {
        this.seasonStats = null;
        this.loadingSeasonStats = false;
      }
    });
  }

  // Radar chart SVG polygon calculation
  calculateRadarPaths() {
    const centerX = 100;
    const centerY = 100;
    const radius = 80;
    const totalPoints = this.generalStats.length;
    if (totalPoints === 0) return;

    const angleStep = (Math.PI * 2) / totalPoints;

    let teamPoints = '';
    let leaguePoints = '';

    this.generalStats.forEach((stat, i) => {
      const angle = (i * angleStep) - (Math.PI / 2);

      const tFactor = stat.teamValue / 20;
      const lFactor = stat.leagueValue / 20;

      const tx = centerX + Math.cos(angle) * (radius * tFactor);
      const ty = centerY + Math.sin(angle) * (radius * tFactor);
      teamPoints += `${tx},${ty} `;

      const lx = centerX + Math.cos(angle) * (radius * lFactor);
      const ly = centerY + Math.sin(angle) * (radius * lFactor);
      leaguePoints += `${lx},${ly} `;
    });

    this.generalTeamPath = teamPoints;
    this.generalLeaguePath = leaguePoints;
  }

  // Modal actions
  openFindingDetails(finding: KeyFinding) {
    this.activeModalContent = {
      type: 'finding',
      title: finding.title,
      data: finding,
      stats: this.hubStats
    };
    this.modalOpen = true;
  }

  openChartDetails(chartName: string) {
    this.activeModalContent = {
      type: 'chart',
      title: chartName,
      description: this.getChartDescription(chartName),
      stats: this.hubStats
    };
    this.modalOpen = true;
  }

  private getChartDescription(chartName: string): string {
    if (!this.hubStats) return 'No data available.';
    const s = this.hubStats;
    if (chartName === 'GENERAL PERFORMANCE') {
      return `Season overview: ${s.totalMatches} matches played. Record: ${s.wins}W ${s.draws}D ${s.losses}L. ` +
             `Goals: ${s.goalsScored} scored, ${s.goalsConceded} conceded. Team rating: ${s.avgTeamRating}.`;
    }
    if (chartName === 'ATTACKING PERFORMANCE') {
      return `Attacking stats: ${s.goalsPerGame} goals/game (league avg: ${s.leagueAvgGoalsPerGame}). ` +
             `${s.totalAssists} assists (${s.assistsPerGame}/game). Top scorer: ${s.topScorer} (${s.topScorerGoals}).`;
    }
    if (chartName === 'DEFENSIVE PERFORMANCE') {
      return `Defensive stats: ${s.concededPerGame} conceded/game (league avg: ${s.leagueAvgConcededPerGame}). ` +
             `${s.cleanSheets} clean sheets (${Math.round(s.cleanSheetPercentage * 100)}%).`;
    }
    return 'Detailed analysis of this metric compared to the rest of the league.';
  }

  closeModal() {
    this.modalOpen = false;
    this.activeModalContent = null;
  }

  // Helper for label coordinates on radar chart
  getLabelX(index: number, offset: number = 95): number {
    const total = this.generalStats.length || 8;
    const angle = (index * (Math.PI * 2) / total) - (Math.PI / 2);
    return 100 + Math.cos(angle) * offset;
  }

  getLabelY(index: number, offset: number = 95): number {
    const total = this.generalStats.length || 8;
    const angle = (index * (Math.PI * 2) / total) - (Math.PI / 2);
    return 100 + Math.sin(angle) * offset;
  }
}
