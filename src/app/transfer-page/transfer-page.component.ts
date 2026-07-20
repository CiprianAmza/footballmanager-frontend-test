import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TransferService, TransferOffer, AvailablePlayer, ScoutReport, Loan, FreeAgent, PreContractPlayer } from '../services/transfer.service';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

interface IncomingOfferGroup {
  playerId: number;
  player: TransferOffer;
  offers: TransferOffer[];
}

@Component({
  selector: 'app-transfer-page',
  templateUrl: './transfer-page.component.html',
  styleUrls: ['./transfer-page.component.css']
})
export class TransferPageComponent implements OnInit, OnDestroy, OnChanges {
  private sub = new Subscription();
  @Input() teamId!: number;
  @Input() currentSeason: number = 1;

  teamName: string = '';

  // Tab control
  activeTab: string = 'market';

  // Transfer Market
  availablePlayers: AvailablePlayer[] = [];
  filteredPlayers: AvailablePlayer[] = [];
  positionFilter: string = 'ALL';
  sortField: string = 'estimatedRating';
  sortDirection: 'asc' | 'desc' = 'desc';
  positions: string[] = ['ALL', 'GK', 'DC', 'DL', 'DR', 'MC', 'ML', 'MR', 'ST'];
  marketPage: number = 0;
  marketPageSize: number = 50;
  marketTotalPages: number = 0;
  marketTotalElements: number = 0;
  marketLoading: boolean = false;

  // Scout Report
  scoutReport: ScoutReport | null = null;
  scoutReportLoading: { [playerId: number]: boolean } = {};

  // Make Offer Modal
  showOfferModal: boolean = false;
  selectedPlayer: AvailablePlayer | null = null;
  offerAmount: number = 0;
  offerResult: TransferOffer | null = null;
  offerLoading: boolean = false;
  showOfferResult: boolean = false;

  // Transfer window status
  transferWindowOpen: boolean = false;
  errorMessage: string = '';

  // Incoming Offers
  incomingOffers: TransferOffer[] = [];
  counterOfferId: number | null = null;
  counterAmount: number = 0;
  respondLoading: boolean = false;

  get incomingOfferGroups(): IncomingOfferGroup[] {
    const groups = new Map<number, IncomingOfferGroup>();
    for (const offer of this.incomingOffers) {
      let group = groups.get(offer.playerId);
      if (!group) {
        group = { playerId: offer.playerId, player: offer, offers: [] };
        groups.set(offer.playerId, group);
      }
      group.offers.push(offer);
    }

    return Array.from(groups.values()).map(group => ({
      ...group,
      offers: [...group.offers].sort((left, right) =>
        right.offerAmount - left.offerAmount || left.fromTeamName.localeCompare(right.fromTeamName))
    }));
  }

  // Outgoing Offers
  outgoingOffers: TransferOffer[] = [];

  // Transfer History (existing)
  boughtPlayers: any[] = [];
  soldPlayers: any[] = [];

  // Loans
  loansIn: Loan[] = [];
  loansOut: Loan[] = [];
  loanHistoryIn: Loan[] = [];
  loanHistoryOut: Loan[] = [];
  recallLoading: { [key: number]: boolean } = {};
  showLoanModal: boolean = false;
  loanPlayer: AvailablePlayer | null = null;
  loanFeeAmount: number = 0;
  loanBuyOptionFee: number = 0;
  loanBuyObligatory: boolean = false;
  loanParentWageContribution: number = 0;
  loanLoading: boolean = false;
  loanResultMessage: string = '';
  loanResultSuccess: boolean = false;
  buyOptionLoading: { [loanId: number]: boolean } = {};

  // Free Agents
  freeAgents: FreeAgent[] = [];
  filteredFreeAgents: FreeAgent[] = [];
  freeAgentPositionFilter: string = 'ALL';
  showFreeAgentModal: boolean = false;
  selectedFreeAgent: FreeAgent | null = null;
  freeAgentWageOffer: number = 0;
  freeAgentContractYears: number = 3;
  freeAgentLoading: boolean = false;
  freeAgentResultMessage: string = '';
  freeAgentResultSuccess: boolean = false;

  // Pre-Contract
  preContractPlayers: PreContractPlayer[] = [];
  filteredPreContractPlayers: PreContractPlayer[] = [];
  preContractPositionFilter: string = 'ALL';
  showPreContractModal: boolean = false;
  selectedPreContractPlayer: PreContractPlayer | null = null;
  preContractWageOffer: number = 0;
  preContractContractYears: number = 3;
  preContractLoading: boolean = false;
  preContractResultMessage: string = '';
  preContractResultSuccess: boolean = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private transferService: TransferService,
    private teamService: TeamService,
    private gameEvents: GameEventsService
  ) {}

  ngOnInit(): void {
    if (this.teamId) {
      this.fetchData();
    } else {
      this.route.params.subscribe(params => {
        this.teamId = params['teamId'] || this.teamService.teamId;
        this.currentSeason = params['season'] || this.teamService.currentSeason;
        this.fetchData();
      });
    }

    // Refresh transfer window status after each game advance
    this.teamService.refresh$.subscribe(() => {
      this.http.get<boolean>(urlApp + `/competition/isTransferWindowOpen`)
        .subscribe((open) => {
          this.transferWindowOpen = open;
        });
    });

    // Live-reload the active tab when transfers or the squad change.
    this.sub.add(this.gameEvents.on('transfers').subscribe(() => this.loadTabData()));
    this.sub.add(this.gameEvents.on('squad').subscribe(() => this.loadTabData()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['teamId'] || changes['currentSeason']) && !changes['teamId']?.firstChange) {
      this.fetchData();
    }
  }

  fetchData(): void {
    if (!this.teamId) return;

    // Team Name
    this.http.get(urlApp + `/teams/getTeamNameById/${this.teamId}`, { responseType: 'text' })
      .subscribe((data: any) => {
        this.teamName = data;
      });

    // Check transfer window status
    this.http.get<boolean>(urlApp + `/competition/isTransferWindowOpen`)
      .subscribe((open) => {
        this.transferWindowOpen = open;
      });

    this.loadTabData();
  }

  loadTabData(): void {
    switch (this.activeTab) {
      case 'market':
        this.loadMarket();
        break;
      case 'incoming':
        this.loadIncoming();
        break;
      case 'outgoing':
        this.loadOutgoing();
        break;
      case 'history':
        this.loadHistory();
        break;
      case 'loans':
        this.loadLoans();
        break;
      case 'loanHistory':
        this.loadLoanHistory();
        break;
      case 'freeAgents':
        this.loadFreeAgents();
        break;
      case 'preContract':
        this.loadPreContractPlayers();
        break;
    }
  }

  switchTab(tab: string): void {
    this.activeTab = tab;
    this.loadTabData();
  }

  // --- Transfer Market ---

  loadMarket(page: number = this.marketPage): void {
    this.marketLoading = true;
    const backendSort = this.sortField === 'estimatedRating' ? 'rating' : this.sortField;
    this.transferService.getAvailablePlayersPage(
      this.teamId,
      page,
      this.marketPageSize,
      this.positionFilter,
      backendSort,
      this.sortDirection
    ).subscribe({
      next: (result) => {
        this.availablePlayers = result.content;
        this.filteredPlayers = result.content;
        this.marketPage = result.page;
        this.marketTotalPages = result.totalPages;
        this.marketTotalElements = result.totalElements;
        this.marketLoading = false;
      },
      error: (err) => {
        this.availablePlayers = [];
        this.filteredPlayers = [];
        this.marketLoading = false;
        console.error('Error loading available players:', err);
      }
    });
  }

  applyFilters(): void {
    this.filteredPlayers = [...this.availablePlayers];
  }

  onFilterChange(): void {
    this.marketPage = 0;
    this.loadMarket(0);
  }

  toggleSort(field: string): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = field === 'name' ? 'asc' : 'desc';
    }
    this.marketPage = 0;
    this.loadMarket(0);
  }

  changeMarketPage(delta: number): void {
    const nextPage = this.marketPage + delta;
    if (nextPage < 0 || nextPage >= this.marketTotalPages || this.marketLoading) return;
    this.loadMarket(nextPage);
  }

  getSortIcon(field: string): string {
    if (this.sortField !== field) return '';
    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  openOfferModal(player: AvailablePlayer): void {
    if (!this.transferWindowOpen) {
      this.errorMessage = 'Transfer window is closed. You can only make offers during the transfer window (end of season).';
      setTimeout(() => this.errorMessage = '', 5000);
      return;
    }
    this.selectedPlayer = player;
    this.offerAmount = player.transferValue;
    this.offerResult = null;
    this.showOfferResult = false;
    this.showOfferModal = true;
  }

  closeOfferModal(): void {
    this.showOfferModal = false;
    this.selectedPlayer = null;
    this.offerResult = null;
    this.showOfferResult = false;
  }

  submitOffer(): void {
    if (!this.selectedPlayer || this.offerAmount <= 0) return;
    this.offerLoading = true;

    this.transferService.makeOffer(this.selectedPlayer.id, this.offerAmount).subscribe({
      next: (result) => {
        this.offerResult = result;
        this.showOfferResult = true;
        this.offerLoading = false;
        // Refresh outgoing offers if on that tab
        if (this.activeTab === 'outgoing') {
          this.loadOutgoing();
        }
      },
      error: (err) => {
        console.error('Error making offer:', err);
        this.offerLoading = false;
        this.closeOfferModal();
        this.errorMessage = err.error || 'Failed to submit offer.';
        setTimeout(() => this.errorMessage = '', 5000);
      }
    });
  }

  acceptCounter(): void {
    if (!this.offerResult) return;
    this.offerLoading = true;

    this.transferService.makeOffer(this.offerResult.playerId, this.offerResult.askingPrice).subscribe({
      next: (result) => {
        this.offerResult = result;
        this.offerLoading = false;
      },
      error: (err) => {
        console.error('Error accepting counter:', err);
        this.offerLoading = false;
      }
    });
  }

  // --- Incoming Offers ---

  loadIncoming(): void {
    this.transferService.getIncomingOffers(this.teamId).subscribe({
      next: (offers) => {
        this.incomingOffers = offers;
      },
      error: (err) => {
        console.error('Error loading incoming offers:', err);
        this.showTransferError(err, 'Could not load incoming offers.');
      }
    });
  }

  contractSummary(offer: TransferOffer): string {
    if (!offer.contractEndSeason) return 'Contract information unavailable';
    const remaining = offer.contractSeasonsRemaining ??
      Math.max(0, offer.contractEndSeason - Number(this.currentSeason || 1));
    if (remaining === 0) return `Expires this season (S${offer.contractEndSeason})`;
    return `Until Season ${offer.contractEndSeason} · ${remaining} season${remaining === 1 ? '' : 's'} left`;
  }

  respondToOffer(offerId: number, action: 'accept' | 'reject' | 'counter'): void {
    if (action === 'counter') {
      this.counterOfferId = offerId;
      const offer = this.incomingOffers.find(o => o.id === offerId);
      this.counterAmount = offer ? offer.askingPrice : 0;
      return;
    }

    this.respondLoading = true;
    this.transferService.respondToOffer(offerId, action).subscribe({
      next: () => {
        this.respondLoading = false;
        this.loadIncoming();
        // Accepting an offer completes a sale — squad, finances and the
        // transfer lists all change.
        if (action === 'accept') {
          this.gameEvents.emit('squad', 'finances', 'transfers');
        }
      },
      error: (err) => {
        console.error('Error responding to offer:', err);
        this.respondLoading = false;
        this.showTransferError(err, 'Could not process this offer.');
        // A conflict normally means the player has moved or become a free
        // agent. Reload so the stale offer disappears immediately.
        this.loadIncoming();
      }
    });
  }

  submitCounter(offerId: number): void {
    if (this.counterAmount <= 0) return;
    this.respondLoading = true;

    this.transferService.respondToOffer(offerId, 'counter', this.counterAmount).subscribe({
      next: () => {
        this.counterOfferId = null;
        this.respondLoading = false;
        this.loadIncoming();
        this.gameEvents.emit('squad', 'finances', 'transfers');
      },
      error: (err) => {
        console.error('Error submitting counter:', err);
        this.respondLoading = false;
        this.showTransferError(err, 'Could not submit this counter-offer.');
        this.loadIncoming();
      }
    });
  }

  cancelCounter(): void {
    this.counterOfferId = null;
  }

  private showTransferError(err: any, fallback: string): void {
    const backendError = err?.error;
    const message = (typeof backendError === 'string'
      ? backendError
      : backendError?.message) || fallback;
    this.errorMessage = message;
    setTimeout(() => {
      if (this.errorMessage === message) this.errorMessage = '';
    }, 5000);
  }

  // --- Outgoing Offers ---

  loadOutgoing(): void {
    this.transferService.getOutgoingOffers(this.teamId).subscribe({
      next: (offers) => {
        this.outgoingOffers = offers;
      },
      error: (err) => console.error('Error loading outgoing offers:', err)
    });
  }

  // --- Transfer History ---

  loadHistory(): void {
    this.transferService.getBoughtPlayers(this.teamId, this.currentSeason).subscribe({
      next: (data) => { this.boughtPlayers = data; },
      error: (err) => console.error('Error loading bought players:', err)
    });

    this.transferService.getSoldPlayers(this.teamId, this.currentSeason).subscribe({
      next: (data) => { this.soldPlayers = data; },
      error: (err) => console.error('Error loading sold players:', err)
    });
  }

  prevSeason(): void {
    if (this.currentSeason > 1) {
      this.currentSeason--;
      this.loadHistory();
    }
  }

  nextSeason(): void {
    this.currentSeason++;
    this.loadHistory();
  }

  // --- Scouting ---

  requestScoutReport(player: AvailablePlayer): void {
    this.scoutReportLoading[player.id] = true;
    this.scoutReport = null;

    this.transferService.getScoutReport(player.id, this.teamId).subscribe({
      next: (report) => {
        this.scoutReport = report;
        this.scoutReportLoading[player.id] = false;
      },
      error: (err) => {
        console.error('Error fetching scout report:', err);
        this.scoutReportLoading[player.id] = false;
      }
    });
  }

  closeScoutReport(): void {
    this.scoutReport = null;
  }

  // --- Loans ---

  loadLoans(): void {
    this.transferService.getActiveLoans(this.teamId).subscribe({
      next: (data) => {
        this.loansIn = data.loansIn || [];
        this.loansOut = data.loansOut || [];
      },
      error: (err) => console.error('Error loading loans:', err)
    });
  }

  openLoanModal(player: AvailablePlayer): void {
    if (!this.transferWindowOpen) {
      this.errorMessage = 'Transfer window is closed. You can only make loan offers during the transfer window.';
      setTimeout(() => this.errorMessage = '', 5000);
      return;
    }
    this.loanPlayer = player;
    this.loanFeeAmount = Math.round(player.transferValue * 0.1);
    this.loanBuyOptionFee = 0;
    this.loanBuyObligatory = false;
    this.loanParentWageContribution = 0;
    this.loanResultMessage = '';
    this.loanResultSuccess = false;
    this.showLoanModal = true;
  }

  closeLoanModal(): void {
    this.showLoanModal = false;
    this.loanPlayer = null;
    this.loanResultMessage = '';
  }

  submitLoanOffer(): void {
    if (!this.loanPlayer || this.loanFeeAmount <= 0) return;
    this.loanLoading = true;

    this.transferService.makeLoanOffer(this.loanPlayer.id, this.loanFeeAmount, this.loanBuyOptionFee, this.loanBuyObligatory, this.loanParentWageContribution).subscribe({
      next: (loan) => {
        this.loanResultMessage = loan.playerName + ' has joined on loan from ' + loan.parentTeamName + '!';
        this.loanResultSuccess = true;
        this.loanLoading = false;
        if (this.activeTab === 'loans') {
          this.loadLoans();
        }
      },
      error: (err) => {
        this.loanResultMessage = err.error || 'Loan offer was rejected.';
        this.loanResultSuccess = false;
        this.loanLoading = false;
      }
    });
  }

  loanHistorySeason(delta: number): void {
    const next = this.currentSeason + delta;
    if (next < 1) return;
    this.currentSeason = next;
    this.loadLoanHistory();
  }

  loadLoanHistory(): void {
    this.transferService.getLoanHistory(this.teamId, this.currentSeason).subscribe({
      next: (data) => {
        this.loanHistoryIn = data.loansIn || [];
        this.loanHistoryOut = data.loansOut || [];
      },
      error: (err) => console.error('Error loading loan history:', err)
    });
  }

  recallLoan(loan: Loan): void {
    if (!confirm(`Recall ${loan.playerName} from ${loan.loanTeamName}?`)) return;
    this.recallLoading[loan.id] = true;
    this.transferService.recallLoan(loan.id).subscribe({
      next: (res) => {
        this.recallLoading[loan.id] = false;
        this.loanResultMessage = (res && res.message) || `${loan.playerName} has been recalled.`;
        this.loanResultSuccess = true;
        this.loadLoans();
      },
      error: (err) => {
        this.recallLoading[loan.id] = false;
        // Backend currently rejects recall during the season; surface its message.
        this.errorMessage = (typeof err.error === 'string' ? err.error : err.error?.message) || 'Cannot recall this player right now.';
        setTimeout(() => this.errorMessage = '', 5000);
      }
    });
  }

  // --- Exercise Buy Option ---

  exerciseBuyOption(loan: Loan): void {
    if (!confirm(`Exercise buy option for ${loan.playerName} at ${this.formatCurrency(loan.buyOptionFee)}?`)) return;
    this.buyOptionLoading[loan.id] = true;

    this.transferService.exerciseBuyOption(loan.id).subscribe({
      next: () => {
        this.buyOptionLoading[loan.id] = false;
        this.loadLoans();
      },
      error: (err) => {
        this.buyOptionLoading[loan.id] = false;
        this.errorMessage = err.error || 'Failed to exercise buy option.';
        setTimeout(() => this.errorMessage = '', 5000);
      }
    });
  }

  // --- Free Agents ---

  loadFreeAgents(): void {
    this.transferService.getFreeAgents(this.teamId).subscribe({
      next: (agents) => {
        this.freeAgents = agents;
        this.applyFreeAgentFilters();
      },
      error: (err) => console.error('Error loading free agents:', err)
    });
  }

  applyFreeAgentFilters(): void {
    let players = [...this.freeAgents];
    if (this.freeAgentPositionFilter !== 'ALL') {
      players = players.filter(p => p.position === this.freeAgentPositionFilter);
    }
    players.sort((a, b) => b.rating - a.rating);
    this.filteredFreeAgents = players;
  }

  openFreeAgentModal(agent: FreeAgent): void {
    this.selectedFreeAgent = agent;
    this.freeAgentWageOffer = agent.wage;
    this.freeAgentContractYears = 3;
    this.freeAgentResultMessage = '';
    this.freeAgentResultSuccess = false;
    this.showFreeAgentModal = true;
  }

  closeFreeAgentModal(): void {
    this.showFreeAgentModal = false;
    this.selectedFreeAgent = null;
    this.freeAgentResultMessage = '';
  }

  submitFreeAgentOffer(): void {
    if (!this.selectedFreeAgent || this.freeAgentWageOffer <= 0) return;
    this.freeAgentLoading = true;

    this.transferService.signFreeAgent(this.selectedFreeAgent.id, this.freeAgentWageOffer, this.freeAgentContractYears).subscribe({
      next: (res) => {
        this.freeAgentResultMessage = res.message;
        this.freeAgentResultSuccess = res.success;
        this.freeAgentLoading = false;
        if (res.success) {
          this.loadFreeAgents();
        }
      },
      error: (err) => {
        this.freeAgentResultMessage = err.error?.message || err.error || 'Failed to sign free agent.';
        this.freeAgentResultSuccess = false;
        this.freeAgentLoading = false;
      }
    });
  }

  // --- Pre-Contract ---

  loadPreContractPlayers(): void {
    this.transferService.getPreContractAvailable(this.teamId).subscribe({
      next: (players) => {
        this.preContractPlayers = players;
        this.applyPreContractFilters();
      },
      error: (err) => console.error('Error loading pre-contract players:', err)
    });
  }

  applyPreContractFilters(): void {
    let players = [...this.preContractPlayers];
    if (this.preContractPositionFilter !== 'ALL') {
      players = players.filter(p => p.position === this.preContractPositionFilter);
    }
    players.sort((a, b) => b.rating - a.rating);
    this.filteredPreContractPlayers = players;
  }

  openPreContractModal(player: PreContractPlayer): void {
    this.selectedPreContractPlayer = player;
    this.preContractWageOffer = player.wageDemand;
    this.preContractContractYears = 3;
    this.preContractResultMessage = '';
    this.preContractResultSuccess = false;
    this.showPreContractModal = true;
  }

  closePreContractModal(): void {
    this.showPreContractModal = false;
    this.selectedPreContractPlayer = null;
    this.preContractResultMessage = '';
  }

  submitPreContractOffer(): void {
    if (!this.selectedPreContractPlayer || this.preContractWageOffer <= 0) return;
    this.preContractLoading = true;

    this.transferService.signPreContract(this.selectedPreContractPlayer.id, this.preContractWageOffer, this.preContractContractYears).subscribe({
      next: (res) => {
        this.preContractResultMessage = res.message;
        this.preContractResultSuccess = res.success;
        this.preContractLoading = false;
        if (res.success) {
          this.loadPreContractPlayers();
        }
      },
      error: (err) => {
        this.preContractResultMessage = err.error?.message || err.error || 'Failed to sign pre-contract.';
        this.preContractResultSuccess = false;
        this.preContractLoading = false;
      }
    });
  }

  // --- Utility ---

  formatCurrency(amount: number): string {
    if (amount == null) return '-';
    if (amount >= 1_000_000) {
      return '\u20AC' + (amount / 1_000_000).toFixed(1) + 'M';
    }
    if (amount >= 1_000) {
      return '\u20AC' + (amount / 1_000).toFixed(0) + 'K';
    }
    return '\u20AC' + amount.toFixed(0);
  }

  getStatusClass(status: string): string {
    if (!status) return '';
    switch (status.toLowerCase()) {
      case 'accepted': return 'status-accepted';
      case 'rejected': return 'status-rejected';
      case 'pending': return 'status-pending';
      case 'counter': return 'status-counter';
      default: return '';
    }
  }
}
