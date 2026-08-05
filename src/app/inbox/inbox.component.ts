import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TeamService } from '../services/team.service';
import { CareerService, JobOffer } from '../services/career.service';
import { urlApp } from '../app.component';
import { AuthService } from '../services/auth.service';

interface ManagerInbox {
  id: number;
  teamId: number;
  seasonNumber: number;
  roundNumber: number;
  title: string;
  content: string;
  category: string;
  isRead: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-inbox',
  templateUrl: './inbox.component.html',
  styleUrls: ['./inbox.component.css']
})
export class InboxComponent implements OnInit {

  messages: ManagerInbox[] = [];
  filteredMessages: ManagerInbox[] = [];
  selectedMessage: ManagerInbox | null = null;
  unreadCount: number = 0;
  activeFilter: string = 'all';

  // Pending job offers indexed by id so JOB_OFFER messages can render accept/decline inline.
  offersById: { [offerId: number]: JobOffer } = {};
  offerActionInFlight: boolean = false;
  offerActionMessage: string = '';
  loading = false;
  error = '';
  get chairmanMode(): boolean { return this.authService.careerRole === 'CHAIRMAN'; }

  categories: string[] = ['all', 'JOB_OFFER', 'CAREER', 'match_result', 'league_news', 'MEDIA_FORMER_PLAYER', 'MEDIA_FORMER_MANAGER', 'MEDIA_FINANCIAL_TROUBLE', 'TRANSFER_RUMOUR', 'transfer', 'european_prize', 'board', 'discipline', 'season_end', 'european',
    'CHAIRMAN_WELCOME', 'CONTROL_ACQUIRED', 'TREASURY_TRANSFER', 'TACTICAL_MANDATE_UPDATED',
    'TRADER_ADVISER_HIRED', 'TRADER_ADVICE_AVAILABLE', 'CONTROLLED_CLUB_MATCH_RESULT'];

  constructor(
    private http: HttpClient,
    private teamService: TeamService,
    public careerService: CareerService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadMessages();
    this.loadUnreadCount();
    if (!this.chairmanMode) this.loadPendingOffers();
  }

  loadPendingOffers(): void {
    this.careerService.refresh();
    this.careerService.pendingOffers$.subscribe(offers => {
      const idx: { [k: number]: JobOffer } = {};
      (offers || []).forEach(o => { idx[o.id] = o; });
      this.offersById = idx;
    });
  }

  /** Pulls "OFFER_ID:<n>" out of the content blob so we can resolve the offer. */
  extractOfferId(content: string): number | null {
    if (!content) return null;
    const m = content.match(/OFFER_ID:(\d+)/);
    if (!m) return null;
    return Number(m[1]);
  }

  /** True if this inbox message is a job-offer notification and its offer is still pending. */
  isJobOfferMessage(msg: ManagerInbox): boolean {
    if (msg.category !== 'JOB_OFFER') return false;
    const id = this.extractOfferId(msg.content);
    return id !== null && !!this.offersById[id];
  }

  getOfferForMessage(msg: ManagerInbox): JobOffer | null {
    const id = this.extractOfferId(msg.content);
    return id !== null ? (this.offersById[id] || null) : null;
  }

  acceptOfferMsg(msg: ManagerInbox): void {
    const offer = this.getOfferForMessage(msg);
    if (!offer || this.offerActionInFlight) return;
    this.offerActionInFlight = true;
    this.offerActionMessage = '';
    this.careerService.accept(offer.id).subscribe({
      next: () => {
        this.offerActionInFlight = false;
        this.offerActionMessage = `You accepted the offer from ${offer.teamName}.`;
        this.careerService.refresh();
        this.teamService.checkSetup();
      },
      error: () => {
        this.offerActionInFlight = false;
        this.offerActionMessage = 'Could not accept the offer.';
      }
    });
  }

  declineOfferMsg(msg: ManagerInbox): void {
    const offer = this.getOfferForMessage(msg);
    if (!offer || this.offerActionInFlight) return;
    this.offerActionInFlight = true;
    this.offerActionMessage = '';
    this.careerService.decline(offer.id).subscribe({
      next: () => {
        this.offerActionInFlight = false;
        this.offerActionMessage = `You declined the offer from ${offer.teamName}.`;
        this.careerService.refresh();
      },
      error: () => {
        this.offerActionInFlight = false;
        this.offerActionMessage = 'Could not decline the offer.';
      }
    });
  }

  loadMessages(): void {
    this.loading = true; this.error = '';
    this.http.get<ManagerInbox[]>(`${urlApp}/inbox/me`).subscribe({
      next: (data) => {
        this.loading = false;
        this.messages = data;
        this.applyFilter();
        if (this.filteredMessages.length > 0) {
          this.selectMessage(this.filteredMessages[0]);
        }
      },
      error: () => { this.loading = false; this.error = 'Inbox could not be loaded.'; }
    });
  }

  loadUnreadCount(): void {
    this.http.get<number>(`${urlApp}/inbox/me/unreadCount`).subscribe({
      next: (count) => this.unreadCount = count,
      error: (err) => console.error('Error loading unread count:', err)
    });
  }

  selectMessage(msg: ManagerInbox): void {
    this.selectedMessage = msg;
    if (!msg.isRead) {
      this.markAsRead(msg);
    }
  }

  markAsRead(msg: ManagerInbox): void {
    this.http.post(`${urlApp}/inbox/me/${msg.id}/read`, {}).subscribe({
      next: () => {
        msg.isRead = true;
        this.unreadCount = this.messages.filter(m => !m.isRead).length;
      },
      error: (err) => console.error('Error marking message as read:', err)
    });
  }

  markAllRead(): void {
    this.http.post(`${urlApp}/inbox/me/markAllRead`, {}).subscribe({
      next: () => {
        this.messages.forEach(m => m.isRead = true);
        this.unreadCount = 0;
      },
      error: (err) => console.error('Error marking all as read:', err)
    });
  }

  filterByCategory(category: string): void {
    this.activeFilter = category;
    this.applyFilter();
  }

  private applyFilter(): void {
    if (this.activeFilter === 'all') {
      this.filteredMessages = [...this.messages];
    } else {
      this.filteredMessages = this.messages.filter(m => m.category === this.activeFilter);
    }
  }

  getCategoryLabel(category: string): string {
    switch (category) {
      case 'match_result': return 'Match Result';
      case 'league_news': return 'League News';
      case 'MEDIA_FORMER_PLAYER': return 'Former Player';
      case 'MEDIA_FORMER_MANAGER': return 'Former Manager';
      case 'MEDIA_FINANCIAL_TROUBLE': return 'Financial Watch';
      case 'TRANSFER_RUMOUR': return 'Transfer Rumour';
      case 'transfer': return 'Transfer';
      case 'board': return 'Board';
      case 'discipline': return 'Discipline';
      case 'season_end': return 'Season End';
      case 'european': return 'European';
      case 'european_prize': return 'European Prize';
      case 'morale': return 'Morale';
      case 'contract': return 'Contract';
      case 'YOUTH_ACADEMY': return 'Youth Academy';
      case 'AWARDS': return 'Awards';
      case 'sponsorship': return 'Sponsorship';
      case 'national_team': return 'National Team';
      case 'facility': return 'Facility';
      case 'JOB_OFFER': return 'Job Offer';
      case 'CAREER': return 'Career';
      case 'CHAIRMAN_WELCOME': return 'Chairman Welcome';
      case 'CONTROL_ACQUIRED': return 'Control Acquired';
      case 'TREASURY_TRANSFER': return 'Treasury Transfer';
      case 'TACTICAL_MANDATE_UPDATED': return 'Tactical Mandate';
      case 'TRADER_ADVISER_HIRED': return 'Trader Adviser Hired';
      case 'TRADER_ADVICE_AVAILABLE': return 'Trader Advice';
      case 'CONTROLLED_CLUB_MATCH_RESULT': return 'Controlled Club Match';
      default: return category;
    }
  }

  getCategoryFilterLabel(category: string): string {
    if (category === 'all') return 'All';
    return this.getCategoryLabel(category);
  }
}
