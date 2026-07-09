import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TeamService } from '../services/team.service';
import { urlApp } from '../app.component';
import { forkJoin } from 'rxjs';

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

@Component({
  selector: 'app-data-hub',
  templateUrl: './data-hub.component.html',
  styleUrls: ['./data-hub.component.css']
})
export class DataHubComponent implements OnInit {

  activeTab: string = 'Overview';
  tabs: string[] = ['Overview', 'Match Stats', 'Team', 'Player', 'Matches', 'Next Opponent'];

  teamName: string = 'Team';
  loading: boolean = true;

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

  // Season match stats (Opta-style)
  seasonStats: any = null;
  loadingSeasonStats: boolean = false;

  constructor(private http: HttpClient, private teamService: TeamService) { }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    const teamId = this.teamService.teamId;

    // Wait for currentSeason to be loaded
    this.teamService.currentSeason$.subscribe(season => {
      if (season < 1) return;

      forkJoin({
        hubStats: this.http.get<TeamDataHubStats>(`${urlApp}/stats/teamDataHub/${teamId}/${season}`),
        inboxMessages: this.http.get<any[]>(`${urlApp}/inbox/messages/${teamId}/${season}`)
      }).subscribe({
        next: (data) => {
          this.hubStats = data.hubStats;
          this.teamName = data.hubStats.teamName || 'Team';
          this.buildRadarStats(data.hubStats);
          this.buildKeyFindings(data.hubStats);
          this.buildRecentReports(data.inboxMessages);
          this.calculateRadarPaths();
          this.buildSummaries(data.hubStats);
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading data hub stats:', err);
          this.loading = false;
        }
      });
    });
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
    this.activeTab = tab;
    if (tab === 'Match Stats' && !this.seasonStats) {
      this.loadSeasonStats();
    }
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
