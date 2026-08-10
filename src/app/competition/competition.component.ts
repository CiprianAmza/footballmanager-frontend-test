import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';

interface WindowPerformance {
    requestedMatches: number;
    sampleMatches: number;
    xgDifferencePer90: number;
}

interface SegmentPerformance {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    points: number;
    expectedPoints: number;
    xgDifferencePer90: number;
}

interface CompetitionUnderlyingTeam {
    rank: number;
    teamId: number;
    teamName: string;
    matches: number;
    xgDifferencePer90: number;
    rolling5: WindowPerformance;
    rolling10: WindowPerformance;
    rolling20: WindowPerformance;
    higherXgMatchPercentage: number;
    actualPoints: number;
    expectedPoints: number;
    luckPoints: number;
    luckIndex: number;
    balancedMatches: SegmentPerformance;
    versusTop4: SegmentPerformance;
    versusUpperHalf: SegmentPerformance;
    versusLowerHalf: SegmentPerformance;
}

interface CompetitionUnderlyingPerformance {
    competitionId: number;
    seasonNumber: number;
    matches: number;
    teams: number;
    balancedXgThreshold: number;
    methodology: string;
    teamPerformance: CompetitionUnderlyingTeam[];
}

interface TeamQualification {
    teamId: number;
    route: 'LOC' | 'STARS_CUP';
    source: 'LEAGUE_POSITION' | 'CUP_WINNER' | 'CUP_REALLOCATION';
    leaguePosition: number | null;
}

interface LeagueQualificationContext {
    competitionId: number;
    season: number;
    hasLowerTier: boolean;
    relegationFrom: number | null;
    locSpots: number;
    starsCupSpots: number;
    cupCompetitionId: number | null;
    cupCompetitionName: string | null;
    cupWinnerTeamId: number | null;
    cupWinnerTeamName: string | null;
    cupWinnerRoute: 'LOC' | 'STARS_CUP' | null;
    qualifications: TeamQualification[];
}

@Component({
    selector: 'competition',
    templateUrl: './competition.component.html',
    styleUrls: ['./competition.component.css']
})
export class CompetitionComponent implements OnInit, OnDestroy {

    private sub = new Subscription();

    parameterCompetitionId: string = '';
    competitionType: 'League' | 'Cup' = 'League';

    _teams: any[] = [];
    sortOrder: number = -1;
    lastOrderKey: string = "";

    // European qualification zones (dynamic per league coefficient)
    locSpots: number = 0;
    starsCupSpots: number = 0;
    hasLowerTier: boolean = false;
    relegationFrom: number | null = null;
    cupWinnerTeamId: number | null = null;
    cupWinnerTeamName: string | null = null;
    cupWinnerRoute: 'LOC' | 'STARS_CUP' | null = null;
    qualificationContextLoaded: boolean = false;
    teamQualifications: TeamQualification[] = [];

    // Seasons Logic
    currentSeason: string = "";
    selectedSeason: string = "";
    seasons: string[] = [];

    competitionName: string = "Competition";
    currentTeam = "Man UFC";

    // Competition Stats
    compStats: any = null;
    compStatsLoading: boolean = false;
    activeStatsTab: string = 'scorers';
    underlyingStats: CompetitionUnderlyingPerformance | null = null;
    underlyingStatsLoading: boolean = false;
    underlyingStatsError: string = '';
    expandedUnderlyingTeamId: number | null = null;

    constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router,
                private gameEvents: GameEventsService) {}

    ngOnInit() {
        this.sub.add(this.route.params.subscribe(params => {
            this.parameterCompetitionId = params['competitionId'];
            this.initPage();
        }));

        // Standings + stats change after matches are played — refresh live when
        // viewing the current season (historical seasons are immutable).
        this.sub.add(this.gameEvents.on('standings').subscribe(() => {
            // The event stream can emit while the route is still initializing.
            // Do not build stats URLs until both route and season are available.
            if (!this.parameterCompetitionId || !this.selectedSeason) return;
            if (this.competitionType === 'League' && this.selectedSeason === this.currentSeason) {
                this.loadLeagueQualification();
                this.loadLeagueData();
            }
            this.loadCompetitionStats();
        }));
    }

    ngOnDestroy(): void {
        this.sub.unsubscribe();
    }

    initPage() {
        this.http.get<any>(urlApp + "/competition/getCurrentSeason").subscribe(
            (response) => {
                this.currentSeason = response.toString();
                this.selectedSeason = this.currentSeason;

                this.seasons = [];
                for (let i = 1; i <= Number(response); i++)
                    this.seasons.push(i + "");

                this.fetchCompetitionInfo();
            }
        );
    }

    fetchCompetitionInfo() {
        this.http.get<any>(urlApp + "/competition/getCompetitionInfo/" + this.parameterCompetitionId).subscribe(
            (info) => {
                // European competitions -> redirect to european-rounds page
                if (info.typeId === 4 || info.typeId === 5) {
                    this.router.navigate(['/european-rounds', this.parameterCompetitionId, this.currentSeason]);
                    return;
                }
                if (info.typeId === 2 || info.typeId === 6) {
                    this.competitionType = 'Cup';
                } else {
                    this.competitionType = 'League';
                    this.locSpots = info.locSpots || 0;
                    this.starsCupSpots = info.starsCupSpots || 0;
                    this.loadLeagueQualification();
                    this.loadLeagueData();
                }
                this.competitionName = info.name || "Competition";
                this.loadCompetitionStats();
            },
            (error) => {
                console.error('Error info:', error);
                this.competitionType = 'League';
                this.loadLeagueData();
            }
        );
    }

    loadLeagueData() {
        let url = "";
        // Logică diferită pentru sezon curent vs istoric
        if (this.selectedSeason === this.currentSeason) {
             url = urlApp + "/competition/getTeams/" + this.parameterCompetitionId;
        } else {
             url = urlApp + "/competition/historical/getTeams/" + this.selectedSeason + "/" + this.parameterCompetitionId;
        }

        this.http.get<any[]>(url).subscribe(
            (response) => {
                this._teams = response;
                this.initialSort();
            },
            (error) => console.error('Error fetching teams:', error)
        );
    }

    // --- EVENT HANDLER ---
    onSeasonChange() {
        if (this.competitionType === 'League') {
            this.loadLeagueQualification();
            this.loadLeagueData();
        }
        this.loadCompetitionStats();
    }

    loadLeagueQualification(): void {
        if (!this.parameterCompetitionId || !this.selectedSeason) return;
        this.qualificationContextLoaded = false;
        this.http.get<LeagueQualificationContext>(
            `${urlApp}/competition/leagueQualification/${this.parameterCompetitionId}/${this.selectedSeason}`
        ).subscribe({
            next: context => {
                this.hasLowerTier = context.hasLowerTier;
                this.relegationFrom = context.relegationFrom;
                this.locSpots = context.locSpots;
                this.starsCupSpots = context.starsCupSpots;
                this.cupWinnerTeamId = context.cupWinnerTeamId;
                this.cupWinnerTeamName = context.cupWinnerTeamName;
                this.cupWinnerRoute = context.cupWinnerRoute;
                this.teamQualifications = context.qualifications || [];
                this.qualificationContextLoaded = true;
            },
            error: () => {
                // A missing context must never invent relegation for a league
                // whose nation may not have a lower tier.
                this.hasLowerTier = false;
                this.relegationFrom = null;
                this.cupWinnerTeamId = null;
                this.cupWinnerTeamName = null;
                this.cupWinnerRoute = null;
                this.teamQualifications = [];
            }
        });
    }

    qualificationFor(team: any): 'LOC' | 'STARS_CUP' | null {
        const exact = this.teamQualifications.find(entry => Number(entry.teamId) === Number(team.teamId));
        if (exact) return exact.route;
        if (this.qualificationContextLoaded) return null;
        if (team.position <= this.locSpots) return 'LOC';
        if (team.position <= this.locSpots + this.starsCupSpots) return 'STARS_CUP';
        return null;
    }

    qualificationTitle(team: any): string {
        const qualification = this.teamQualifications.find(
            entry => Number(entry.teamId) === Number(team.teamId));
        if (!qualification) return '';
        if (qualification.route === 'LOC') return 'Qualified for League of Champions';
        if (qualification.source === 'CUP_WINNER') return 'Cup winner — qualified for Stars Cup';
        if (qualification.source === 'CUP_REALLOCATION') {
            return 'Qualified for Stars Cup via the reallocated cup-winner place';
        }
        return 'Qualified for Stars Cup through league position';
    }

    isCupWinner(team: any): boolean {
        return this.cupWinnerTeamId != null && Number(team.teamId) === Number(this.cupWinnerTeamId);
    }

    isRelegatedPosition(position: number): boolean {
        return this.hasLowerTier && this.relegationFrom != null && position >= this.relegationFrom;
    }

    loadCompetitionStats() {
        if (!this.parameterCompetitionId || !this.selectedSeason) return;
        this.compStatsLoading = true;
        this.http.get<any>(urlApp + `/stats/competition/${this.parameterCompetitionId}/${this.selectedSeason}`).subscribe({
            next: (data) => {
                this.compStats = data;
                this.compStatsLoading = false;
            },
            error: () => {
                this.compStats = null;
                this.compStatsLoading = false;
            }
        });
        // Also load the aggregated team match-stats leaderboards (possession / xG / cards / etc.)
        this.loadChampionshipStats();
        this.loadUnderlyingStats();
    }

    loadUnderlyingStats(): void {
        if (!this.parameterCompetitionId || !this.selectedSeason) return;
        this.underlyingStatsLoading = true;
        this.underlyingStatsError = '';
        this.http.get<CompetitionUnderlyingPerformance>(
            `${urlApp}/stats/competition/${this.parameterCompetitionId}/${this.selectedSeason}/underlying-performance`
        ).subscribe({
            next: data => {
                this.underlyingStats = data;
                this.underlyingStatsLoading = false;
                const currentExpandedStillExists = data.teamPerformance.some(
                    row => row.teamId === this.expandedUnderlyingTeamId);
                if (!currentExpandedStillExists) {
                    this.expandedUnderlyingTeamId = data.teamPerformance[0]?.teamId ?? null;
                }
            },
            error: () => {
                this.underlyingStats = null;
                this.underlyingStatsLoading = false;
                this.underlyingStatsError = 'Underlying performance is unavailable until the analytics backend is restarted.';
            }
        });
    }

    toggleUnderlyingTeam(teamId: number): void {
        this.expandedUnderlyingTeamId = this.expandedUnderlyingTeamId === teamId ? null : teamId;
    }

    signedMetric(value: number, digits: number = 2): string {
        const normalized = Math.abs(value) < Math.pow(10, -digits) / 2 ? 0 : value;
        return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`;
    }

    underlyingTone(value: number): string {
        if (Math.abs(value) < 0.05) return 'neutral';
        return value > 0 ? 'positive' : 'negative';
    }

    segmentRecord(segment: SegmentPerformance): string {
        return segment.matches ? `${segment.wins}W ${segment.draws}D ${segment.losses}L` : 'No matches';
    }

    // === Championship team-stat leaderboards (Most Possession, Best xG, etc.) ===
    champStats: any = null;
    champStatsLoading: boolean = false;
    expandedCategory: string | null = null;

    /** Curated list driving the accordion order + labels (matches backend keys).
     *  `money=true` runs the value through a currency formatter. `group` lets us
     *  show small section headers between Performance / Discipline / Finances. */
    statCategories: { key: string; label: string; icon: string; defaultOpen?: boolean; money?: boolean; group?: string }[] = [
        // --- Performance ---
        { key: 'possession',    label: 'Most Possession',      icon: '⚽', defaultOpen: true, group: 'Performance' },
        { key: 'passAccuracy',  label: 'Best Pass Accuracy',   icon: '🎯', group: 'Performance' },
        { key: 'shots',         label: 'Most Shots',           icon: '💥', group: 'Performance' },
        { key: 'shotsOnTarget', label: 'Most Shots on Target', icon: '🥅', group: 'Performance' },
        { key: 'xg',            label: 'Best xG',              icon: '📈', group: 'Performance' },
        { key: 'bigChances',    label: 'Most Big Chances',     icon: '⭐', group: 'Performance' },
        { key: 'goalsScored',   label: 'Most Goals Scored',    icon: '⚽', group: 'Performance' },
        { key: 'goalsConceded', label: 'Best Defense',         icon: '🛡️', group: 'Performance' },
        { key: 'corners',       label: 'Most Corners',         icon: '🚩', group: 'Performance' },
        // --- Discipline ---
        { key: 'yellowCards',   label: 'Most Yellow Cards',    icon: '🟨', group: 'Discipline' },
        { key: 'redCards',      label: 'Most Red Cards',       icon: '🟥', group: 'Discipline' },
        { key: 'fouls',         label: 'Most Fouls',           icon: '⚠️', group: 'Discipline' },
        { key: 'offsides',      label: 'Most Offsides',        icon: '🚫', group: 'Discipline' },
        // --- Defensive work ---
        { key: 'tackles',       label: 'Most Tackles',         icon: '🦵', group: 'Defensive' },
        { key: 'interceptions', label: 'Most Interceptions',   icon: '✋', group: 'Defensive' },
        { key: 'clearances',    label: 'Most Clearances',      icon: '🧹', group: 'Defensive' },
        { key: 'duelsWon',      label: 'Most Duels Won',       icon: '⚔️', group: 'Defensive' },
        { key: 'aerialDuels',   label: 'Best Aerial Duels',    icon: '🤾', group: 'Defensive' },
        // --- Finances ---
        { key: 'totalFinances',  label: 'Richest Clubs',         icon: '💰', money: true, group: 'Finances' },
        { key: 'transferBudget', label: 'Biggest Transfer Budget', icon: '🏦', money: true, group: 'Finances' },
        { key: 'monthlyWages',   label: 'Highest Monthly Payroll', icon: '📅', money: true, group: 'Finances' },
        { key: 'annualWages',    label: 'Highest Annual Payroll',  icon: '🗓️', money: true, group: 'Finances' },
        { key: 'transferSpent',  label: 'Biggest Spenders',        icon: '💸', money: true, group: 'Finances' },
        { key: 'transferEarned', label: 'Biggest Sellers',         icon: '💵', money: true, group: 'Finances' },
        { key: 'transferProfit', label: 'Transfer Net Profit',     icon: '📊', money: true, group: 'Finances' }
    ];

    /** Format raw cent values into "12.5M", "850K" etc. for compact display. */
    formatMoney(v: number | null | undefined): string {
        if (v == null) return '€0';
        const n = Math.abs(v);
        const sign = v < 0 ? '-' : '';
        if (n >= 1_000_000_000) return `${sign}€${(n / 1_000_000_000).toFixed(1)}B`;
        if (n >= 1_000_000)     return `${sign}€${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000)         return `${sign}€${(n / 1_000).toFixed(0)}K`;
        return `${sign}€${n}`;
    }

    isMoneyCategory(key: string): boolean {
        return !!this.statCategories.find(c => c.key === key)?.money;
    }

    loadChampionshipStats() {
        if (!this.parameterCompetitionId || !this.selectedSeason) return;
        this.champStatsLoading = true;
        this.http.get<any>(urlApp + `/stats/championshipStats/${this.parameterCompetitionId}/${this.selectedSeason}`).subscribe({
            next: (data) => {
                this.champStats = data;
                this.champStatsLoading = false;
                // Auto-open the first category so the section isn't empty
                if (!this.expandedCategory) {
                    const firstDefault = this.statCategories.find(c => c.defaultOpen);
                    this.expandedCategory = firstDefault ? firstDefault.key : this.statCategories[0]?.key || null;
                }
            },
            error: () => {
                this.champStats = null;
                this.champStatsLoading = false;
            }
        });
    }

    toggleCategory(key: string): void {
        this.expandedCategory = this.expandedCategory === key ? null : key;
    }

    /** Returns the top N entries for a category, or empty array if unavailable. */
    topForCategory(key: string, n: number = 5): any[] {
        if (!this.champStats || !this.champStats.categories) return [];
        return (this.champStats.categories[key] || []).slice(0, n);
    }

    setStatsTab(tab: string) {
        this.activeStatsTab = tab;
    }

    // --- SORTING & UTILS ---
    initialSort() {
        this._teams.sort((a, b) => {
            return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
        });
        let index = 1;
        for (let t of this._teams) {
            t.position = index++;
        }
    }

    sortBy(property: any) {
        if (property == this.lastOrderKey)
            this.sortOrder *= -1;
        else {
            this.sortOrder = (property == 'name' || property == 'position') ? 1 : -1;
        }
        this.lastOrderKey = property;
        const order = this.sortOrder;
  
        this._teams.sort((a, b) => {
            if (property === 'name') {
                return a[property].localeCompare(b[property]) * order;
            } else {
                return (Number(a[property]) - Number(b[property])) * order;
            }
        });
    }

    getFormArray(formString: string): string[] {
        if (!formString) return [];
        return formString.split('').slice(-5);
    }
}
