import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  AdminMovementExecution,
  AdminMovementType,
  AdminPlayerMovement,
  AdminService,
  AdminTeamOption,
  AdminTransferPlayer
} from '../../services/admin.service';

@Component({
  selector: 'app-admin-transfers',
  templateUrl: './admin-transfers.component.html',
  styleUrls: ['../admin.component.css', './admin-transfers.component.css']
})
export class AdminTransfersComponent implements OnInit {
  teams: AdminTeamOption[] = [];
  players: AdminTransferPlayer[] = [];
  movements: AdminPlayerMovement[] = [];
  currentSeason = 1;

  type: AdminMovementType = 'PERMANENT';
  sourceTeamId: number | null = null;
  playerId: number | null = null;
  destinationTeamId: number | null = null;
  transferFee = 0;
  wage = 0;
  contractSeasons = 3;
  loanSeasons = 1;
  parentWageContribution = 0;
  executionMode: AdminMovementExecution = 'NOW';
  executionSeason = 2;
  playerQuery = '';

  loading = false;
  playersLoading = false;
  saving = false;
  error = '';
  message = '';

  constructor(public adminService: AdminService, private router: Router) {}

  ngOnInit(): void {
    if (!this.adminService.isAuthenticated) {
      this.router.navigate(['/admin']);
      return;
    }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.adminService.listTeams().subscribe({
      next: teams => {
        this.teams = (teams || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        if (this.sourceTeamId == null && this.teams.length) this.sourceTeamId = this.teams[0].id;
        this.ensureDestination();
        this.loadState();
        this.loadPlayers();
      },
      error: err => this.handleError(err, 'Could not load teams.')
    });
  }

  loadState(): void {
    this.adminService.adminTransferState().subscribe({
      next: state => {
        this.currentSeason = state.currentSeason;
        this.executionSeason = Math.max(this.executionSeason, this.currentSeason + 1);
        this.movements = state.movements || [];
        this.loading = false;
      },
      error: err => this.handleError(err, 'Could not load Admin transfer history.')
    });
  }

  loadPlayers(): void {
    if (this.type !== 'FREE_AGENT' && this.sourceTeamId == null) return;
    this.playersLoading = true;
    this.playerId = null;
    this.adminService.adminTransferPlayers(
      this.type === 'FREE_AGENT' ? null : Number(this.sourceTeamId),
      this.type === 'FREE_AGENT',
      this.playerQuery
    ).subscribe({
      next: players => {
        this.players = players || [];
        this.playersLoading = false;
        if (this.players.length) this.selectPlayer(this.players[0].id);
      },
      error: err => {
        this.playersLoading = false;
        this.handleError(err, 'Could not load players.');
      }
    });
  }

  changeType(): void {
    this.playerQuery = '';
    this.transferFee = 0;
    this.loanSeasons = 1;
    this.parentWageContribution = 0;
    this.ensureDestination();
    this.loadPlayers();
  }

  changeSource(): void {
    this.ensureDestination();
    this.loadPlayers();
  }

  selectPlayer(id: number | null): void {
    this.playerId = id == null ? null : Number(id);
    const player = this.selectedPlayer;
    if (!player) return;
    this.wage = player.wage;
    this.transferFee = this.type === 'FREE_AGENT' ? 0 : player.transferValue;
    this.loanSeasons = Math.max(1, Math.min(this.loanSeasons, this.maxLoanSeasons));
  }

  submit(): void {
    const validation = this.validationMessage;
    if (validation) {
      this.error = validation;
      return;
    }
    const player = this.selectedPlayer!;
    const destination = this.teams.find(team => team.id === Number(this.destinationTeamId));
    const timing = this.executionMode === 'NOW'
      ? 'immediately'
      : `at the start of Season ${this.executionSeason}`;
    if (!window.confirm(`${this.typeLabel}: ${player.name} → ${destination?.name}, ${timing}?`)) return;

    this.saving = true;
    this.error = '';
    this.message = '';
    this.adminService.createAdminTransfer({
      type: this.type,
      playerId: Number(this.playerId),
      destinationTeamId: Number(this.destinationTeamId),
      transferFee: this.type === 'FREE_AGENT' ? 0 : Number(this.transferFee),
      wage: this.type === 'LOAN' ? undefined : Number(this.wage),
      contractSeasons: this.type === 'LOAN' ? undefined : Number(this.contractSeasons),
      loanSeasons: this.type === 'LOAN' ? Number(this.loanSeasons) : undefined,
      parentWageContribution: this.type === 'LOAN' ? Number(this.parentWageContribution) : undefined,
      executionMode: this.executionMode,
      executionSeason: this.executionMode === 'START_OF_SEASON' ? Number(this.executionSeason) : undefined
    }).subscribe({
      next: movement => {
        this.saving = false;
        this.message = movement.status === 'COMPLETED'
          ? `${movement.playerName} moved to ${movement.destinationTeamName}.`
          : `${movement.playerName} scheduled for Season ${movement.executionSeason}.`;
        this.loadState();
        this.loadPlayers();
      },
      error: err => {
        this.saving = false;
        this.handleError(err, 'Admin movement failed.');
      }
    });
  }

  cancel(movement: AdminPlayerMovement): void {
    if (!window.confirm(`Cancel the scheduled movement for ${movement.playerName}?`)) return;
    this.adminService.cancelAdminTransfer(movement.id).subscribe({
      next: () => {
        this.message = `Scheduled movement for ${movement.playerName} cancelled.`;
        this.loadState();
      },
      error: err => this.handleError(err, 'Could not cancel movement.')
    });
  }

  get selectedPlayer(): AdminTransferPlayer | null {
    return this.players.find(player => player.id === Number(this.playerId)) || null;
  }

  get destinationTeams(): AdminTeamOption[] {
    if (this.type === 'FREE_AGENT') return this.teams;
    return this.teams.filter(team => team.id !== Number(this.sourceTeamId));
  }

  get maxLoanSeasons(): number {
    const player = this.selectedPlayer;
    if (!player) return 0;
    const startSeason = this.executionMode === 'NOW' ? this.currentSeason : Number(this.executionSeason);
    return Math.max(0, player.contractEndSeason - startSeason);
  }

  get validationMessage(): string {
    if (!this.selectedPlayer) return 'Select a player.';
    if (this.destinationTeamId == null) return 'Select a destination team.';
    if (this.type !== 'FREE_AGENT' && Number(this.sourceTeamId) === Number(this.destinationTeamId)) {
      return 'Source and destination teams must be different.';
    }
    if (this.selectedPlayer.activeLoan) return 'This player is already on loan.';
    if (this.transferFee < 0) return 'Transfer/loan fee cannot be negative.';
    if (this.executionMode === 'START_OF_SEASON' && this.executionSeason <= this.currentSeason) {
      return `Execution season must be after Season ${this.currentSeason}.`;
    }
    if (this.type === 'LOAN') {
      if (this.maxLoanSeasons < 1) return 'The contract expires before this loan could start.';
      if (this.loanSeasons < 1 || this.loanSeasons > this.maxLoanSeasons) {
        return `Loan duration must be between 1 and ${this.maxLoanSeasons} season(s).`;
      }
      if (this.parentWageContribution < 0 || this.parentWageContribution > 100) {
        return 'Parent wage contribution must be between 0% and 100%.';
      }
    } else {
      if (this.wage <= 0) return 'Salary must be greater than 0.';
      if (this.contractSeasons < 1 || this.contractSeasons > 100) {
        return 'Contract length must be between 1 and 100 seasons.';
      }
    }
    return '';
  }

  get typeLabel(): string {
    if (this.type === 'FREE_AGENT') return 'Free-agent signing';
    if (this.type === 'LOAN') return 'Loan';
    return 'Permanent transfer';
  }

  formatMoney(value: number): string {
    if (Math.abs(value) >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
    return `€${value}`;
  }

  private ensureDestination(): void {
    if (!this.destinationTeams.some(team => team.id === Number(this.destinationTeamId))) {
      this.destinationTeamId = this.destinationTeams[0]?.id ?? null;
    }
  }

  private handleError(err: any, fallback: string): void {
    if (err?.status === 401) {
      this.adminService.logout();
      this.router.navigate(['/admin']);
      return;
    }
    this.loading = false;
    this.error = err?.error?.error || err?.error?.message || (typeof err?.error === 'string' ? err.error : fallback);
  }
}
