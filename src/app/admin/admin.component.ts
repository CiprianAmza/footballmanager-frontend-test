import { Component, OnInit } from '@angular/core';
import {
  AdminFundingOption,
  AdminService,
  AdminTeamOption
} from '../services/admin.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {

  // Login state
  username = '';
  password = '';
  loginError = '';
  loginLoading = false;

  teams: AdminTeamOption[] = [];
  contractScope: 'TEAM' | 'ALL' = 'TEAM';
  selectedTeamId: number | null = null;
  extensionSeasons = 3;
  contractLoading = false;
  contractMessage = '';
  contractSuccess = false;

  fundingOptions: AdminFundingOption[] = [];
  withdrawalOptions: AdminFundingOption[] = [];
  financeAction: 'ADD' | 'REMOVE' = 'ADD';
  fundingTeamId: number | null = null;
  fundingAmount = 10_000_000;
  fundingReason = 'BENEFACTOR';
  fundingNote = '';
  fundingLoading = false;
  fundingMessage = '';
  fundingSuccess = false;

  constructor(public adminService: AdminService) {}

  ngOnInit(): void {
    if (this.adminService.isAuthenticated) this.loadAdminData();
  }

  login(): void {
    if (!this.username || !this.password) {
      this.loginError = 'Username and password required';
      return;
    }
    this.loginLoading = true;
    this.loginError = '';
    this.adminService.login(this.username, this.password).subscribe({
      next: (res) => {
        this.loginLoading = false;
        if (res.success && res.token) {
          this.adminService.storeToken(res.token);
          this.loadAdminData();
        } else {
          this.loginError = res.message || 'Login failed';
        }
      },
      error: (err) => {
        this.loginLoading = false;
        this.loginError = err?.error?.message || 'Invalid credentials';
      }
    });
  }

  logout(): void {
    this.adminService.logout();
  }

  loadAdminData(): void {
    this.loadTeams();
    this.loadFundingOptions();
  }

  loadTeams(): void {
    this.adminService.listTeams().subscribe({
      next: teams => {
        this.teams = teams || [];
        if (this.selectedTeamId == null && this.teams.length > 0) {
          this.selectedTeamId = this.teams[0].id;
        }
        if (this.fundingTeamId == null && this.teams.length > 0) {
          this.fundingTeamId = this.teams[0].id;
        }
      },
      error: () => {
        this.contractMessage = 'Could not load teams.';
        this.contractSuccess = false;
      }
    });
  }

  loadFundingOptions(): void {
    this.fundingMessage = '';
    this.adminService.fundingOptions().subscribe({
      next: options => {
        this.fundingOptions = options || [];
        if (!this.fundingOptions.some(option => option.code === this.fundingReason)
            && this.fundingOptions.length > 0) {
          this.fundingReason = this.fundingOptions[0].code;
        }
      },
      error: () => {
        this.fundingMessage = 'Could not load funding sources.';
        this.fundingSuccess = false;
      }
    });
    this.adminService.withdrawalOptions().subscribe({
      next: options => {
        this.withdrawalOptions = options || [];
        if (this.financeAction === 'REMOVE'
            && !this.withdrawalOptions.some(option => option.code === this.fundingReason)) {
          this.fundingReason = this.withdrawalOptions[0]?.code || '';
        }
      },
      error: () => {
        this.fundingMessage = 'Could not load withdrawal reasons.';
        this.fundingSuccess = false;
      }
    });
  }

  changeFinanceAction(action: string): void {
    this.financeAction = action === 'REMOVE' ? 'REMOVE' : 'ADD';
    this.fundingReason = this.financeReasonOptions()[0]?.code || '';
    this.fundingMessage = '';
  }

  financeReasonOptions(): AdminFundingOption[] {
    return this.financeAction === 'ADD' ? this.fundingOptions : this.withdrawalOptions;
  }

  submitFinanceAdjustment(): void {
    const amount = Number(this.fundingAmount);
    if (this.fundingTeamId == null) {
      this.fundingMessage = 'Select a team.';
      this.fundingSuccess = false;
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000_000) {
      this.fundingMessage = 'Enter a whole amount between €1 and €10,000,000,000,000.';
      this.fundingSuccess = false;
      return;
    }
    if (!this.fundingReason) {
      this.fundingMessage = 'Select a reason.';
      this.fundingSuccess = false;
      return;
    }
    if ((this.fundingNote || '').trim().length > 200) {
      this.fundingMessage = 'The note cannot exceed 200 characters.';
      this.fundingSuccess = false;
      return;
    }

    const team = this.teams.find(item => item.id === Number(this.fundingTeamId));
    const source = this.financeReasonOptions().find(item => item.code === this.fundingReason);
    const verb = this.financeAction === 'ADD' ? 'Add' : 'Remove';
    const preposition = this.financeAction === 'ADD' ? 'to' : 'from';
    if (!window.confirm(`${verb} ${this.formatEuros(amount)} ${preposition} ${team?.name || 'the selected club'} — ${source?.label || this.fundingReason}?`)) {
      return;
    }

    this.fundingLoading = true;
    this.fundingMessage = '';
    const payload = {
      teamId: Number(this.fundingTeamId),
      amount,
      reason: this.fundingReason,
      note: (this.fundingNote || '').trim()
    };
    const request = this.financeAction === 'ADD'
      ? this.adminService.addClubFunding(payload)
      : this.adminService.removeClubFunding(payload);
    request.subscribe({
      next: result => {
        this.fundingLoading = false;
        this.fundingSuccess = true;
        this.fundingMessage = this.financeAction === 'ADD'
          ? `${this.formatEuros(result.amount)} added to ${result.teamName}. `
            + `${this.formatEuros(result.transferBudgetAdded)} was allocated to the transfer budget; `
            + `new club balance: ${this.formatEuros(result.totalFinances)}.`
          : `${this.formatEuros(result.amount)} removed from ${result.teamName}. `
            + `New club balance: ${this.formatEuros(result.totalFinances)}; transfer budget unchanged.`;
        this.fundingNote = '';
      },
      error: err => {
        this.fundingLoading = false;
        this.fundingSuccess = false;
        this.fundingMessage = err?.error?.error || 'Could not update club finances.';
      }
    });
  }

  selectedFundingDescription(): string {
    return this.financeReasonOptions().find(option => option.code === this.fundingReason)?.description || '';
  }

  formatEuros(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  extendContracts(): void {
    const seasons = Number(this.extensionSeasons);
    if (!Number.isInteger(seasons) || seasons < 1 || seasons > 100) {
      this.contractMessage = 'Choose between 1 and 100 seasons.';
      this.contractSuccess = false;
      return;
    }
    if (this.contractScope === 'TEAM' && this.selectedTeamId == null) {
      this.contractMessage = 'Select a team.';
      this.contractSuccess = false;
      return;
    }

    const team = this.teams.find(item => item.id === Number(this.selectedTeamId));
    const target = this.contractScope === 'ALL' ? 'ALL teams' : (team?.name || 'the selected team');
    if (!window.confirm(`Extend every player contract for ${target} by ${seasons} season(s)?`)) return;

    const payload: { seasons: number; allTeams: boolean; teamId?: number } = {
      seasons,
      allTeams: this.contractScope === 'ALL'
    };
    if (this.contractScope === 'TEAM') payload.teamId = Number(this.selectedTeamId);

    this.contractLoading = true;
    this.contractMessage = '';
    this.adminService.extendContracts(payload).subscribe({
      next: result => {
        this.contractLoading = false;
        this.contractSuccess = true;
        this.contractMessage = `${result.contractsExtended} contracts extended by ${result.seasonsAdded} season(s) `
          + `across ${result.teamsAffected} team(s).`;
      },
      error: err => {
        this.contractLoading = false;
        this.contractSuccess = false;
        this.contractMessage = err?.error?.error || 'Contract extension failed.';
      }
    });
  }
}
