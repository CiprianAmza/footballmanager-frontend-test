import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { urlApp } from '../app.component';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { TeamService } from '../services/team.service';
import { AdminService } from '../services/admin.service';

@Component({
    selector: 'player',
    templateUrl: './player.component.html',
    styleUrls: ['./player.component.css']
})
export class PlayerComponent implements OnInit {

    playerId: number;
    playerView: any;
    loading: boolean = true;
    errorMessage: string = '';
    emptyMessage: string = '';
    majorAwardSummary: any = { goldenBoots: 0, ballonDors: 0, awards: [] };

    // Tab Management (Default: Overview)
    activeTab: string = 'overview'; // 'overview', 'stats', 'contract', 'history', 'analytics', 'trophies'

    // Trophies
    loadingTrophies: boolean = false;
    trophies: any[] = [];
    trophiesLoaded: boolean = false;

    // Contract
    currentSeason: number = 1;
    renewWage: number = 0;
    renewYears: number = 2;
    renewMessage: string = '';
    renewSuccess: boolean = false;
    showRenewForm: boolean = false;
    renewalDemand: number = 0;
    renewalMinimum: number = 0;
    renewalMaximum: number = 0;

    // Contract Clauses
    showClausesForm: boolean = false;
    clauseReleaseClause: number = 0;
    clauseSellOnPercentage: number = 0;
    clauseOptionalExtensionYears: number = 0;
    clauseAppearanceBonus: number = 0;
    clauseGoalBonus: number = 0;
    clauseRelegationWageDrop: number = 0;
    clausesMessage: string = '';
    clausesSuccess: boolean = false;

    // Shortlist
    isInShortlist: boolean = false;

    // Role Suitabilities
    roleSuitabilities: any[] = [];
    roleSuitabilitiesLoaded: boolean = false;

    // Player Form (last 5 matches)
    playerForm: any = null;
    playerFormLoading: boolean = false;
    playerFormLoaded: boolean = false;
    showFormDetails: boolean = false;

    // Season Stats
    selectedSeason: number = 1;
    maxSeason: number = 1;
    seasonStats: any = null;
    seasonStatsLoading: boolean = false;
    seasonStatsLoaded: boolean = false;

    // Federation editor
    editorWillNeverLeave: boolean = false;
    editorSaving: boolean = false;
    editorMessage: string = '';
    editorSuccess: boolean = false;

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private router: Router,
        private teamService: TeamService,
        public adminService: AdminService
    ) { }

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.playerId = Number(params['playerId']);
            // Reset state on player change
            this.majorAwardSummary = { goldenBoots: 0, ballonDors: 0, awards: [] };
            this.activeTab = 'overview';
            this.trophies = [];
            this.trophiesLoaded = false;
            this.seasonStats = null;
            this.seasonStatsLoaded = false;
            this.playerForm = null;
            this.playerFormLoaded = false;
            this.showFormDetails = false;
            this.roleSuitabilities = [];
            this.roleSuitabilitiesLoaded = false;
            this.playerView = null;
            this.errorMessage = '';
            this.emptyMessage = '';
            this.maxSeason = this.teamService.currentSeason;
            this.selectedSeason = this.maxSeason;
            this.fetchData();
            this.fetchMajorAwards();
        });
    }

    fetchMajorAwards(): void {
        this.http.get<any>(urlApp + `/awards/player/${this.playerId}`).subscribe({
            next: data => {
                this.majorAwardSummary = data || { goldenBoots: 0, ballonDors: 0, awards: [] };
            },
            error: () => {
                // The profile remains usable even if award history is unavailable.
                this.majorAwardSummary = { goldenBoots: 0, ballonDors: 0, awards: [] };
            }
        });
    }

    fetchData() {
        if (!Number.isFinite(this.playerId) || this.playerId <= 0) {
            this.loading = false;
            this.errorMessage = 'This player link is invalid.';
            return;
        }
        this.loading = true;
        this.errorMessage = '';
        this.emptyMessage = '';
        this.http.get(urlApp + `/humans/${this.playerId}`)
            .subscribe({
              next: (data: any) => {
                if (!data) {
                    this.playerView = null;
                    this.loading = false;
                    this.emptyMessage = 'No player data is available for this profile.';
                    return;
                }
                this.playerView = data;
                this.loading = false;
                this.editorWillNeverLeave = !!data.willNeverLeave;
                this.currentSeason = this.teamService.currentSeason;
                if (data.wage) {
                    this.renewWage = data.wage;
                }
                if (data.contractEndSeason) {
                    this.renewYears = 2;
                }
                this.checkShortlist();
                this.fetchPlayerForm();
                this.fetchRoleSuitabilities();
                if (this.isOwnPlayer()) {
                    this.fetchRenewalDemand();
                }
              },
              error: (error) => {
                this.playerView = null;
                this.loading = false;
                this.emptyMessage = '';
                this.errorMessage = error?.status === 404
                    ? 'Player not found.'
                    : 'Player data could not be loaded. Check the connection and try again.';
              }
            });
    }

    retry(): void {
        this.fetchData();
        this.fetchMajorAwards();
    }

    get shirtNumberLabel(): number | string {
        return this.playerView?.shirtNumber ?? '—';
    }

    get positionLabel(): string {
        return this.playerView?.position || 'Unknown';
    }

    get ratingLabel(): number | string {
        return this.playerView?.rating ?? '—';
    }

    get preferredFootLabel(): string {
        return this.playerView?.preferredFoot || 'Unknown';
    }

    competitionLink(competition: { competitionId: number; competitionTypeId?: number | null }): any[] {
        return competition.competitionTypeId === 4 || competition.competitionTypeId === 5
            ? ['/european-rounds', competition.competitionId, this.teamService.currentSeason]
            : ['/comp', competition.competitionId];
    }

    saveWillNeverLeave(): void {
        if (!this.adminService.isAuthenticated || this.editorSaving) return;
        this.editorSaving = true;
        this.editorMessage = '';
        this.adminService.updateWillNeverLeave(this.playerId, this.editorWillNeverLeave).subscribe({
            next: response => {
                this.editorSaving = false;
                this.editorSuccess = true;
                this.editorMessage = response.message || 'Editor setting saved.';
                this.playerView.willNeverLeave = !!response.willNeverLeave;
                this.editorWillNeverLeave = !!response.willNeverLeave;
            },
            error: error => {
                this.editorSaving = false;
                this.editorSuccess = false;
                this.editorMessage = error.error?.error || error.error?.message || error.error
                    || 'Could not save the editor setting.';
                this.editorWillNeverLeave = !!this.playerView.willNeverLeave;
            }
        });
    }

    fetchRenewalDemand(): void {
        this.http.get<any>(urlApp + `/contract/demand/${this.playerId}`).subscribe({
            next: data => {
                this.renewalDemand = data.wageDemand || this.playerView.wage;
                this.renewalMinimum = data.minimumWage || 0;
                this.renewalMaximum = data.maximumWage || 0;
                this.renewWage = this.renewalDemand;
            }
        });
    }

    checkShortlist() {
        this.http.get<any>(urlApp + `/shortlist/check/${this.playerId}`).subscribe({
            next: (data) => {
                this.isInShortlist = data.inShortlist;
            },
            error: () => {
                this.isInShortlist = false;
            }
        });
    }

    toggleShortlistFromPlayer() {
        if (this.isInShortlist) {
            this.http.delete(urlApp + `/shortlist/remove/${this.playerId}`).subscribe(() => {
                this.isInShortlist = false;
            });
        } else {
            this.http.post(urlApp + `/shortlist/add/${this.playerId}`, {}).subscribe(() => {
                this.isInShortlist = true;
            });
        }
    }

    isOwnPlayer(): boolean {
        return this.playerView && this.playerView.teamId === this.teamService.teamId;
    }

    // Grouped attributes for FM-style display
    getAttributeGroups(): { title: string; attrs: { name: string; value: number }[] }[] {
        if (!this.playerView || !this.playerView.skillNames || !this.playerView.skillValues) {
            return [];
        }
        const names: string[] = this.playerView.skillNames;
        const values: number[] = this.playerView.skillValues;
        const isGK = this.playerView.position === 'GK';

        const groups: { title: string; attrs: { name: string; value: number }[] }[] = [];
        let idx = 0;

        if (isGK) {
            // GK: 6 goalkeeper + 14 mental + 8 physical
            groups.push({ title: 'GOALKEEPER', attrs: this.sliceAttrs(names, values, idx, 6) });
            idx += 6;
            groups.push({ title: 'MENTAL', attrs: this.sliceAttrs(names, values, idx, 14) });
            idx += 14;
            groups.push({ title: 'PHYSICAL', attrs: this.sliceAttrs(names, values, idx, values.length - idx) });
        } else {
            // Outfield: 14 technical + 14 mental + 8 physical
            groups.push({ title: 'TECHNICAL', attrs: this.sliceAttrs(names, values, idx, 14) });
            idx += 14;
            groups.push({ title: 'MENTAL', attrs: this.sliceAttrs(names, values, idx, 14) });
            idx += 14;
            groups.push({ title: 'PHYSICAL', attrs: this.sliceAttrs(names, values, idx, values.length - idx) });
        }

        return groups;
    }

    private sliceAttrs(names: string[], values: number[], start: number, count: number): { name: string; value: number }[] {
        const result: { name: string; value: number }[] = [];
        for (let i = start; i < start + count && i < names.length; i++) {
            result.push({ name: names[i], value: values[i] });
        }
        return result;
    }

    getAttrClass(value: number): string {
        if (value >= 16) return 'elite';
        if (value >= 12) return 'good';
        return 'average';
    }

    isContractExpiring(): boolean {
        return this.playerView && this.playerView.contractEndSeason > 0
            && this.playerView.contractEndSeason <= this.currentSeason + 1;
    }

    canRenewContract(): boolean {
        return this.isOwnPlayer();
    }

    toggleRenewForm() {
        this.showRenewForm = !this.showRenewForm;
        this.renewMessage = '';
    }

    submitRenewal() {
        const body = {
            playerId: this.playerId,
            contractYears: this.renewYears,
            newWage: this.renewWage
        };
        this.http.post<any>(urlApp + '/contract/renew', body)
            .subscribe({
                next: (res) => {
                    this.renewMessage = res.message;
                    this.renewSuccess = res.success;
                    if (res.success) {
                        this.showRenewForm = false;
                        this.fetchData();
                    }
                },
                error: (err) => {
                    this.renewMessage = err.error?.message || 'Renewal failed.';
                    this.renewSuccess = false;
                }
            });
    }

    toggleClausesForm() {
        this.showClausesForm = !this.showClausesForm;
        this.clausesMessage = '';
        if (this.showClausesForm && this.playerView) {
            this.clauseReleaseClause = this.playerView.releaseClause || 0;
            this.clauseSellOnPercentage = this.playerView.sellOnPercentage || 0;
            this.clauseOptionalExtensionYears = this.playerView.optionalExtensionYears || 0;
            this.clauseAppearanceBonus = this.playerView.appearanceBonus || 0;
            this.clauseGoalBonus = this.playerView.goalBonus || 0;
            this.clauseRelegationWageDrop = this.playerView.relegationWageDrop || 0;
        }
    }

    submitClauses() {
        const body: any = { playerId: this.playerId };
        if (this.clauseReleaseClause > 0) body.releaseClause = this.clauseReleaseClause;
        if (this.clauseSellOnPercentage > 0) body.sellOnPercentage = this.clauseSellOnPercentage;
        if (this.clauseOptionalExtensionYears > 0) body.optionalExtensionYears = this.clauseOptionalExtensionYears;
        if (this.clauseAppearanceBonus > 0) body.appearanceBonus = this.clauseAppearanceBonus;
        if (this.clauseGoalBonus > 0) body.goalBonus = this.clauseGoalBonus;
        if (this.clauseRelegationWageDrop > 0) body.relegationWageDrop = this.clauseRelegationWageDrop;

        this.http.post<any>(urlApp + '/contract/setClauses', body).subscribe({
            next: (res) => {
                this.clausesMessage = res.message;
                this.clausesSuccess = res.success;
                if (res.success) {
                    this.showClausesForm = false;
                    this.fetchData();
                }
            },
            error: (err) => {
                this.clausesMessage = err.error?.message || 'Failed to update clauses.';
                this.clausesSuccess = false;
            }
        });
    }

    // Tab switching
    setTab(tabName: string) {
        this.activeTab = tabName;

        if (tabName === 'trophies' && !this.trophiesLoaded) {
            this.fetchTrophies();
        }
        if (tabName === 'stats' && !this.seasonStatsLoaded) {
            this.fetchSeasonStats();
        }
    }

    // Season Stats
    fetchSeasonStats() {
        this.seasonStatsLoading = true;
        this.http.get(`${urlApp}/stats/getStats/${this.playerId}/${this.selectedSeason}`)
            .subscribe({
                next: (data: any) => {
                    // Backend returns Map<Integer, ScorerEntry> -- extract the entry for this season
                    const entries = Object.values(data);
                    if (entries.length > 0) {
                        const entry: any = entries[0];
                        // Build competition rows and totals
                        const competitions = (entry.competitionEntries || []).map((c: any) => ({
                            competitionId: c.competitionId,
                            competitionTypeId: c.competitionTypeId ?? c.typeId ?? null,
                            name: c.competitionName || 'Unknown',
                            games: c.games || 0,
                            subApps: c.gamesAsSubstitute || 0,
                            goals: c.goals || 0,
                            assists: c.assists || 0,
                            avgRating: c.avgRating ? (Math.round(c.avgRating * 100) / 100) : null
                        }));

                        const totals = {
                            games: competitions.reduce((s: number, c: any) => s + c.games, 0),
                            subApps: competitions.reduce((s: number, c: any) => s + c.subApps, 0),
                            goals: competitions.reduce((s: number, c: any) => s + c.goals, 0),
                            assists: competitions.reduce((s: number, c: any) => s + c.assists, 0),
                            avgRating: null as number | null
                        };

                        // Compute weighted average rating across competitions
                        const totalGamesForRating = competitions.filter((c: any) => c.avgRating !== null).reduce((s: number, c: any) => s + c.games + c.subApps, 0);
                        if (totalGamesForRating > 0) {
                            const weightedSum = competitions
                                .filter((c: any) => c.avgRating !== null)
                                .reduce((s: number, c: any) => s + c.avgRating * (c.games + c.subApps), 0);
                            totals.avgRating = Math.round(weightedSum / totalGamesForRating * 100) / 100;
                        }

                        this.seasonStats = {
                            teamName: entry.teamName,
                            seasonNumber: entry.seasonNumber,
                            competitions,
                            totals
                        };
                    } else {
                        this.seasonStats = null;
                    }
                    this.seasonStatsLoading = false;
                    this.seasonStatsLoaded = true;
                },
                error: () => {
                    this.seasonStats = null;
                    this.seasonStatsLoading = false;
                    this.seasonStatsLoaded = true;
                }
            });
    }

    prevSeason() {
        if (this.selectedSeason > 1) {
            this.selectedSeason--;
            this.seasonStatsLoaded = false;
            this.fetchSeasonStats();
        }
    }

    nextSeason() {
        if (this.selectedSeason < this.maxSeason) {
            this.selectedSeason++;
            this.seasonStatsLoaded = false;
            this.fetchSeasonStats();
        }
    }

    // Player Form
    fetchPlayerForm() {
        this.playerFormLoading = true;
        this.http.get<any>(`${urlApp}/stats/playerForm/${this.playerId}`).subscribe({
            next: (data) => {
                this.playerForm = data;
                this.playerFormLoading = false;
                this.playerFormLoaded = true;
            },
            error: () => {
                this.playerForm = null;
                this.playerFormLoading = false;
                this.playerFormLoaded = true;
            }
        });
    }

    getFormResultClass(result: string): string {
        if (result === 'W') return 'form-win';
        if (result === 'D') return 'form-draw';
        return 'form-loss';
    }

    getTrendIcon(trend: string): string {
        if (trend === 'IMPROVING') return '\u2191';
        if (trend === 'DECLINING') return '\u2193';
        if (trend === 'STABLE') return '\u2192';
        return '';
    }

    getTrendClass(trend: string): string {
        if (trend === 'IMPROVING') return 'trend-up';
        if (trend === 'DECLINING') return 'trend-down';
        return 'trend-stable';
    }

    // Role Suitabilities
    fetchRoleSuitabilities(): void {
        this.http.get<any[]>(`${urlApp}/tactic/allRoleSuitabilities/${this.playerId}`).subscribe({
            next: (data) => {
                this.roleSuitabilities = data;
                this.roleSuitabilitiesLoaded = true;
            },
            error: () => {
                this.roleSuitabilities = [];
                this.roleSuitabilitiesLoaded = true;
            }
        });
    }

    getRoleSuitClass(suitability: number): string {
        if (suitability >= 80) return 'role-suit-excellent';
        if (suitability >= 60) return 'role-suit-good';
        if (suitability >= 40) return 'role-suit-average';
        return 'role-suit-poor';
    }

    getRatingClass(rating: number): string {
        if (rating >= 80) return 'rating-elite';
        if (rating >= 70) return 'rating-good';
        if (rating >= 60) return 'rating-avg';
        return 'rating-poor';
    }

    fetchTrophies() {
        this.loadingTrophies = true;

        this.http.get<any[]>(urlApp + `/history/playerCompetitionWins/${this.playerId}`)
            .subscribe((rawTrophies) => {
                
                if (rawTrophies.length === 0) {
                    this.trophies = [];
                    this.loadingTrophies = false;
                    this.trophiesLoaded = true;
                    return;
                }

                const requests = rawTrophies.map(trophy => {
                    const teamRequest = this.http.get(
                        `${urlApp}/teams/getTeamNameById/${trophy.teamId}`, 
                        { responseType: 'text' }
                    );

                    const compRequest = this.http.get(
                        `${urlApp}/competition/getCompetitionNameById/${trophy.competitionId}`, 
                        { responseType: 'text' }
                    );

                    return forkJoin([teamRequest, compRequest]).pipe(
                        map(([teamName, compName]) => ({
                            ...trophy, 
                            teamName: teamName,
                            competitionName: compName
                        }))
                    );
                });

                forkJoin(requests).subscribe((resolvedTrophies) => {
                    this.trophies = resolvedTrophies.sort((a: any, b: any) => b.seasonNumber - a.seasonNumber); // Sortare descrescătoare (cele mai recente sus)
                    this.loadingTrophies = false;
                    this.trophiesLoaded = true;
                });
            });
    }
}
