import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-finances',
  templateUrl: './finances.component.html',
  styleUrls: ['./finances.component.css']
})
export class FinancesComponent implements OnInit, OnDestroy {

  private refreshInterval: any;
  private refreshSub?: Subscription;

  activeTab: string = 'Overview';
  tabs: string[] = ['Overview', 'Transfers', 'Competition Stats', 'Sponsorships', 'Facilities'];

  teamName: string = '';

  // Transfer data
  boughtPlayers: any[] = [];
  soldPlayers: any[] = [];
  totalSpent: number = 0;
  totalReceived: number = 0;
  netTransfer: number = 0;

  // Financial overview
  transferBudget: number = 0;
  totalFinances: number = 0;
  monthlyWages: number = 0;
  monthsPassed: number = 0;
  wagesPaidThisSeason: number = 0;
  leagueIncome: number = 0;
  leagueName: string = '';
  leaguePosition: number = 0;
  europeanIncome: number = 0;
  estimatedSeasonIncome: number = 0;

  // New finance system fields
  debt: number = 0;
  boardConfidence: number = 50;
  transferBudgetPercentage: number = 50;
  stadiumCapacity: number = 0;

  // Financial report
  financialReport: any = null;
  reportBreakdown: { category: string; amount: number }[] = [];
  reportTransactions: any[] = [];
  reportSeason: number = 1;

  // Competition stats
  competitions: any[] = [];

  // Sponsorships
  activeSponsors: any[] = [];
  pendingOffers: any[] = [];
  sponsorMessage: string = '';
  totalSponsorIncome: number = 0;

  // Facilities (new system)
  facilities: any[] = [];
  facilityMessage: string = '';
  facilityOverview: any = null;
  facilityUpgrades: any[] = [];
  facilityInProgress: any[] = [];
  facilityCompleted: any[] = [];
  facilityStadium: any = null;
  facilityEffectiveCapacity: number = 0;
  facilityRevenueMultiplier: number = 1.0;

  // Season navigation
  viewSeason: number = 1;

  constructor(private http: HttpClient, public teamService: TeamService,
              private gameEvents: GameEventsService) {}

  ngOnInit(): void {
    this.viewSeason = this.teamService.currentSeason;
    this.reportSeason = this.teamService.currentSeason;
    this.loadTeamName();
    this.loadFinances();
    this.loadTransfers();
    this.loadCompetitions();
    this.loadSponsors();
    this.loadPendingOffers();
    this.loadFacilities();
    this.loadFinancialReport();

    // Auto-refresh finances every 10 seconds while on this page
    this.refreshInterval = setInterval(() => this.loadFinances(), 10000);

    // Reload all data after game advance
    this.refreshSub = this.teamService.refresh$.subscribe(() => {
      this.loadFinances();
      this.loadFacilities();
    });

    // Instant reaction to finance-changing actions (transfers, facility/stadium
    // upgrades) from anywhere in the app.
    this.refreshSub.add(this.gameEvents.on('finances').subscribe(() => {
      this.loadFinances();
      this.loadTransfers();
    }));
    this.refreshSub.add(this.gameEvents.on('stadium').subscribe(() => {
      this.loadFinances();
      this.loadFacilities();
    }));
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.refreshSub?.unsubscribe();
  }

  loadTeamName(): void {
    const teamId = this.teamService.teamId;
    this.http.get(urlApp + `/teams/getTeamNameById/${teamId}`, { responseType: 'text' })
      .subscribe({
        next: (name) => this.teamName = name,
        error: (err) => console.error('Error loading team name:', err)
      });
  }

  loadFinances(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any>(urlApp + `/teams/finances/${teamId}`)
      .subscribe({
        next: (data) => {
          this.transferBudget = data.transferBudget || 0;
          this.totalFinances = data.totalFinances || 0;
          this.monthlyWages = data.monthlyWages || 0;
          this.monthsPassed = data.monthsPassed || 0;
          this.wagesPaidThisSeason = data.wagesPaidThisSeason || 0;
          this.leagueIncome = data.leagueIncome || 0;
          this.leagueName = data.leagueName || '';
          this.leaguePosition = data.leaguePosition || 0;
          this.europeanIncome = data.europeanIncome || 0;
          this.estimatedSeasonIncome = data.estimatedSeasonIncome || 0;
          this.debt = data.debt || 0;
          this.boardConfidence = data.boardConfidence ?? 50;
          this.transferBudgetPercentage = data.transferBudgetPercentage ?? 50;
          this.stadiumCapacity = data.stadiumCapacity || 0;
        },
        error: (err) => console.error('Error loading finances:', err)
      });
  }

  loadFinancialReport(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any>(urlApp + `/teams/finances/report/${teamId}/${this.reportSeason}`)
      .subscribe({
        next: (data) => {
          this.financialReport = data;
          const breakdown = data.breakdown || {};
          this.reportBreakdown = Object.entries(breakdown).map(([category, amount]) => ({
            category,
            amount: amount as number
          }));
          this.reportTransactions = (data.transactions || []).sort((a: any, b: any) => b.day - a.day);
        },
        error: (err) => console.error('Error loading financial report:', err)
      });
  }

  changeReportSeason(delta: number): void {
    const newSeason = this.reportSeason + delta;
    if (newSeason >= 1 && newSeason <= this.teamService.currentSeason) {
      this.reportSeason = newSeason;
      this.loadFinancialReport();
    }
  }

  getCategoryLabel(category: string): string {
    const labels: { [key: string]: string } = {
      'MATCH_DAY': 'Match Day Revenue',
      'TV_INCOME': 'TV Income',
      'MERCHANDISING': 'Merchandising',
      'SPONSORSHIP': 'Sponsorships',
      'TRANSFER_SALE': 'Transfer Sales',
      'TRANSFER_BUY': 'Transfer Purchases',
      'WAGES': 'Wages',
      'PRIZE_MONEY': 'Prize Money',
      'OWNER_INJECTION': 'Owner Investment',
      'OWNER_WITHDRAWAL': 'Owner / Shareholder Withdrawal',
      'FINES': 'Fines & Penalties',
      'FINANCIAL_ADJUSTMENT': 'Financial Adjustment',
      'LOAN_FEE': 'Loan Fees',
      'SCOUT_COST': 'Scouting Costs',
      'DEBT_INTEREST': 'Debt Interest',
      'OTHER': 'Other'
    };
    return labels[category] || category;
  }

  getCategoryIcon(category: string): string {
    const icons: { [key: string]: string } = {
      'MATCH_DAY': '\uD83C\uDFDF\uFE0F',
      'TV_INCOME': '\uD83D\uDCFA',
      'MERCHANDISING': '\uD83D\uDC55',
      'SPONSORSHIP': '\uD83E\uDD1D',
      'TRANSFER_SALE': '\uD83D\uDCB0',
      'TRANSFER_BUY': '\uD83D\uDED2',
      'WAGES': '\uD83D\uDCB3',
      'PRIZE_MONEY': '\uD83C\uDFC6',
      'OWNER_INJECTION': '\uD83C\uDFE6',
      'OWNER_WITHDRAWAL': '\uD83D\uDCB8',
      'FINES': '\u26A0\uFE0F',
      'FINANCIAL_ADJUSTMENT': '\uD83E\uDDEE',
      'LOAN_FEE': '\uD83D\uDD04',
      'SCOUT_COST': '\uD83D\uDD0D',
      'DEBT_INTEREST': '\uD83D\uDCC9',
      'OTHER': '\uD83D\uDCCC'
    };
    return icons[category] || '\uD83D\uDCCC';
  }

  getIncomeBreakdown(): { category: string; amount: number }[] {
    return this.reportBreakdown.filter(b => b.amount > 0);
  }

  getExpenseBreakdown(): { category: string; amount: number }[] {
    return this.reportBreakdown.filter(b => b.amount < 0);
  }

  formatMoney(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return Math.floor(value / 1_000) + 'K';
    return String(value);
  }

  loadTransfers(): void {
    const teamId = this.teamService.teamId;
    const season = this.viewSeason;

    this.http.get<any[]>(urlApp + `/transfers/boughtPlayers/${teamId}/${season}`)
      .subscribe({
        next: (players) => {
          this.boughtPlayers = players;
          this.totalSpent = players.reduce((sum: number, p: any) => sum + (p.playerTransferValue || 0), 0);
          this.calculateNet();
        },
        error: (err) => {
          console.error('Error loading bought players:', err);
          this.boughtPlayers = [];
          this.totalSpent = 0;
          this.calculateNet();
        }
      });

    this.http.get<any[]>(urlApp + `/transfers/soldPlayers/${teamId}/${season}`)
      .subscribe({
        next: (players) => {
          this.soldPlayers = players;
          this.totalReceived = players.reduce((sum: number, p: any) => sum + (p.playerTransferValue || 0), 0);
          this.calculateNet();
        },
        error: (err) => {
          console.error('Error loading sold players:', err);
          this.soldPlayers = [];
          this.totalReceived = 0;
          this.calculateNet();
        }
      });
  }

  loadCompetitions(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any[]>(urlApp + `/competition/getTeamCompetitions/${teamId}`)
      .subscribe({
        next: (comps) => this.competitions = comps,
        error: (err) => console.error('Error loading competitions:', err)
      });
  }

  calculateNet(): void {
    this.netTransfer = this.totalReceived - this.totalSpent;
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    this.loadFinances();
    if (tab === 'Overview') {
      this.loadFinancialReport();
    }
  }

  changeSeason(delta: number): void {
    const newSeason = this.viewSeason + delta;
    if (newSeason >= 1 && newSeason <= this.teamService.currentSeason) {
      this.viewSeason = newSeason;
      this.loadTransfers();
    }
  }

  // --- SPONSORSHIPS ---

  loadSponsors(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any>(urlApp + `/game/sponsorships/${teamId}`).subscribe({
      next: (data) => {
        this.activeSponsors = data?.active || [];
        this.pendingOffers = data?.offered || [];
        this.totalSponsorIncome = this.activeSponsors.reduce((sum: number, s: any) => sum + (s.annualValue || 0), 0);
      },
      error: (err) => {
        console.error('Error loading sponsors:', err);
        this.activeSponsors = [];
        this.pendingOffers = [];
      }
    });
  }

  loadPendingOffers(): void {
    // Reloads both active and pending from the same endpoint
    this.loadSponsors();
  }

  acceptSponsor(sponsorId: number): void {
    this.http.post<any>(urlApp + `/game/sponsorship/${sponsorId}/accept`, {}).subscribe({
      next: () => {
        this.sponsorMessage = 'Sponsorship accepted!';
        this.loadSponsors();
        this.loadPendingOffers();
        this.loadFinances();
        setTimeout(() => this.sponsorMessage = '', 3000);
      },
      error: (err) => {
        console.error('Error accepting sponsor:', err);
        this.sponsorMessage = 'Failed to accept sponsorship.';
        setTimeout(() => this.sponsorMessage = '', 3000);
      }
    });
  }

  rejectSponsor(sponsorId: number): void {
    this.http.post<any>(urlApp + `/game/sponsorship/${sponsorId}/reject`, {}).subscribe({
      next: () => {
        this.sponsorMessage = 'Sponsorship rejected.';
        this.loadPendingOffers();
        setTimeout(() => this.sponsorMessage = '', 3000);
      },
      error: (err) => {
        console.error('Error rejecting sponsor:', err);
        this.sponsorMessage = 'Failed to reject sponsorship.';
        setTimeout(() => this.sponsorMessage = '', 3000);
      }
    });
  }

  // --- FACILITIES ---

  loadFacilities(): void {
    const teamId = this.teamService.teamId;
    const previousInProgress = this.facilityInProgress;

    this.http.get<any>(urlApp + `/game/facilities/${teamId}`).subscribe({
      next: (data) => {
        this.facilityOverview = data;
        this.facilityStadium = data.stadium;
        this.facilityEffectiveCapacity = data.effectiveCapacity || 0;
        this.facilityRevenueMultiplier = data.revenueMultiplier || 1.0;
        this.facilityUpgrades = data.availableUpgrades || [];
        const newInProgress: any[] = data.upgradesInProgress || [];

        // Detect completed upgrades
        if (previousInProgress.length > 0) {
          const newTypes = new Set(newInProgress.map((u: any) => u.facilityType));
          const justCompleted = previousInProgress.filter((u: any) => !newTypes.has(u.facilityType));
          if (justCompleted.length > 0) {
            this.facilityCompleted = justCompleted;
            setTimeout(() => this.facilityCompleted = [], 6000);
          }
        }

        this.facilityInProgress = newInProgress;
      },
      error: (err) => {
        console.error('Error loading facilities:', err);
        this.facilityUpgrades = [];
      }
    });
  }

  upgradeFacility(facilityType: string): void {
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + '/game/facilities/upgrade', { teamId, facilityType }).subscribe({
      next: (result) => {
        if (result) {
          this.facilityMessage = `Upgrade started!`;
        } else {
          this.facilityMessage = 'Cannot start upgrade. Check funds.';
        }
        this.loadFacilities();
        this.loadFinances();
        setTimeout(() => this.facilityMessage = '', 3000);
      },
      error: (err) => {
        console.error('Error upgrading facility:', err);
        this.facilityMessage = 'Failed to start upgrade.';
        setTimeout(() => this.facilityMessage = '', 3000);
      }
    });
  }

  getFacilityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'TRAINING_GROUND': '\uD83C\uDFCB\uFE0F',
      'YOUTH_ACADEMY': '\uD83C\uDF31',
      'MEDICAL_CENTER': '\uD83C\uDFE5',
      'STADIUM_EXPANSION': '\uD83C\uDFDF\uFE0F',
      'VIP_BOXES': '\uD83C\uDFAB',
      'CATERING': '\uD83C\uDF7D\uFE0F',
      'FAN_SHOP': '\uD83D\uDC55',
      'FAST_FOOD': '\uD83C\uDF54',
      'HEADQUARTERS': '\uD83C\uDFE2',
      'TRAINING_PITCH': '\u26BD',
      'PARKING': '\uD83C\uDD7F\uFE0F'
    };
    const key = (type || '').toUpperCase().replace(/ /g, '_');
    return icons[key] || icons[type] || '\uD83C\uDFE2';
  }

  getLevelColor(level: number): string {
    if (level >= 8) return '#2ecc71';
    if (level >= 5) return '#f1c40f';
    if (level >= 3) return '#e67e22';
    return '#e74c3c';
  }

  getFacilityName(type: string): string {
    const names: { [key: string]: string } = {
      'TRAINING_GROUND': 'Training Ground',
      'YOUTH_ACADEMY': 'Youth Academy',
      'MEDICAL_CENTER': 'Medical Center',
      'STADIUM_EXPANSION': 'Stadium Expansion',
      'VIP_BOXES': 'VIP Boxes',
      'CATERING': 'Catering Facilities',
      'FAN_SHOP': 'Fan Shop',
      'FAST_FOOD': 'Fast Food Area',
      'HEADQUARTERS': 'Club Headquarters',
      'TRAINING_PITCH': 'Training Pitch',
      'PARKING': 'Parking Area'
    };
    return names[type] || type;
  }

  getUpgradeInProgress(facilityType: string): any {
    return this.facilityInProgress.find((u: any) => u.facilityType === facilityType);
  }

  getDaysRemaining(upgrade: any): number {
    const currentDay = this.teamService.currentDay;
    const currentSeason = this.teamService.currentSeason;

    if (upgrade.startSeason < currentSeason) {
      const daysInOldSeason = 365 - upgrade.startDay;
      const daysNeeded = upgrade.durationDays - daysInOldSeason;
      return Math.max(0, daysNeeded - currentDay);
    }

    const endDay = upgrade.startDay + upgrade.durationDays;
    return Math.max(0, endDay - currentDay);
  }

  getUpgradeProgress(upgrade: any): number {
    const currentDay = this.teamService.currentDay;
    const currentSeason = this.teamService.currentSeason;
    let elapsed: number;

    if (upgrade.startSeason < currentSeason) {
      const daysInOldSeason = 365 - upgrade.startDay;
      elapsed = daysInOldSeason + currentDay;
    } else {
      elapsed = currentDay - upgrade.startDay;
    }

    return Math.min(100, Math.max(0, (elapsed / upgrade.durationDays) * 100));
  }
}
