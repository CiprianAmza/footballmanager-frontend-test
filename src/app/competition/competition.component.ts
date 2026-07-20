import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';

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
    relegationFrom: number = 18;

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
                    this.relegationFrom = info.relegationFrom || 18;
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
            this.loadLeagueData();
        }
        this.loadCompetitionStats();
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
