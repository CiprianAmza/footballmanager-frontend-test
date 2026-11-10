import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { InboxComponent, ManagerInbox } from '../inbox/inbox.component';
import { TeamService } from '../services/team.service';
import { CareerService } from '../services/career.service';
import { AuthService } from '../services/auth.service';
import { urlApp } from '../app.component';

type InboxWorkspaceView = 'priority' | 'unread' | 'all';
type InboxTopic = 'all' | 'media' | 'transfers' | 'club';

@Component({
  selector: 'app-inbox2',
  templateUrl: './inbox2.component.html',
  styleUrls: ['./inbox2.component.css']
})
export class Inbox2Component extends InboxComponent {
  @ViewChild('messageSearch') messageSearch?: ElementRef<HTMLInputElement>;

  workspaceView: InboxWorkspaceView = 'priority';
  topicFilter: InboxTopic = 'all';
  searchText = '';

  private readonly decisionCategories = new Set([
    'JOB_OFFER', 'PRESS_CONFERENCE', 'board', 'discipline', 'transfer',
    'TACTICAL_MANDATE_UPDATED', 'COACH_COMPLAINT', 'TRADER_ADVICE_AVAILABLE'
  ]);
  private readonly mediaCategories = new Set(['MEDIA_REACTION', 'MEDIA_PREVIEW', 'TRANSFER_RUMOUR', 'league_news', 'match_result']);

  constructor(
    http: HttpClient,
    teamService: TeamService,
    careerService: CareerService,
    authService: AuthService,
    private router: Router
  ) {
    super(http, teamService, careerService, authService);
  }

  override loadMessages(): void {
    this.loading = true;
    this.error = '';
    this.http.get<ManagerInbox[]>(`${urlApp}/inbox/me`).subscribe({
      next: messages => {
        const selectedId = this.selectedMessage?.id;
        this.messages = messages;
        this.selectedMessage = messages.find(message => message.id === selectedId) || null;
        this.loading = false;
      },
      error: () => {
        this.error = 'Messages could not be loaded.';
        this.loading = false;
      }
    });
  }

  override selectMessage(message: ManagerInbox): void {
    // Keep the message in the Unread folder until the manager explicitly marks it read.
    this.selectedMessage = message;
  }

  get visibleMessages(): ManagerInbox[] {
    const query = this.searchText.trim().toLowerCase();
    return this.messages.filter(message => {
      if (this.workspaceView === 'priority' && !this.isDecision(message)) return false;
      if (this.workspaceView === 'unread' && message.isRead) return false;
      if (this.topicFilter === 'media' && !this.isMedia(message)) return false;
      if (this.topicFilter === 'transfers' && !['transfer', 'TRANSFER_RUMOUR', 'JOB_OFFER', 'CAREER'].includes(message.category)) return false;
      if (this.topicFilter === 'club' && !['board', 'discipline', 'morale', 'contract', 'facility', 'YOUTH_ACADEMY', 'AWARDS'].includes(message.category)) return false;
      return !query || message.title.toLowerCase().includes(query)
        || message.content.toLowerCase().includes(query)
        || this.getCategoryLabel(message.category).toLowerCase().includes(query);
    }).sort((left, right) => this.workspaceView === 'priority'
      ? this.priorityScore(right) - this.priorityScore(left) || Number(right.createdAt) - Number(left.createdAt)
      : Number(right.createdAt) - Number(left.createdAt));
  }

  get selectedVisibleMessage(): ManagerInbox | null {
    return this.visibleMessages.find(message => message.id === this.selectedMessage?.id) || null;
  }

  get importantCount(): number { return this.messages.filter(message => this.isDecision(message)).length; }

  messagePreview(message: ManagerInbox): string {
    return this.messageBody(message).slice(0, 120);
  }

  messageBody(message: ManagerInbox): string {
    return message.content.replace(/OFFER_ID:\d+/g, '').trim();
  }

  get decisionCount(): number {
    return this.messages.filter(message => this.isDecision(message) && !message.isRead).length;
  }

  get mediaUnreadCount(): number {
    return this.messages.filter(message => this.isMedia(message) && !message.isRead).length;
  }

  get transferCount(): number {
    return this.messages.filter(message => ['transfer', 'TRANSFER_RUMOUR', 'JOB_OFFER', 'CAREER'].includes(message.category) && !message.isRead).length;
  }

  setWorkspaceView(view: InboxWorkspaceView): void {
    this.workspaceView = view;
    if (!this.selectedVisibleMessage) this.selectedMessage = null;
  }

  setTopic(topic: InboxTopic): void {
    this.topicFilter = topic;
    if (!this.selectedVisibleMessage) this.selectedMessage = null;
  }

  isDecision(message: ManagerInbox): boolean {
    return this.decisionCategories.has(message.category)
      || (message.category === 'CAREER' && !message.isRead);
  }

  isMedia(message: ManagerInbox): boolean {
    return this.mediaCategories.has(message.category) || message.category.startsWith('MEDIA_');
  }

  priorityLabel(message: ManagerInbox): string {
    if (message.category === 'JOB_OFFER' || message.category === 'discipline') return 'URGENT';
    if (this.isDecision(message)) return 'ACTION';
    if (!message.isRead) return 'NEW';
    return 'INFO';
  }

  priorityScore(message: ManagerInbox): number {
    let score = !message.isRead ? 30 : 0;
    if (message.category === 'JOB_OFFER') score += 100;
    else if (message.category === 'PRESS_CONFERENCE' || message.category === 'discipline') score += 80;
    else if (this.isDecision(message)) score += 55;
    return score;
  }

  sourceLabel(message: ManagerInbox): string {
    if (this.isMedia(message)) return 'Football Wire';
    if (message.category === 'board' || message.category.includes('MANDATE')) return 'Club Board';
    if (message.category === 'TRANSFER_RUMOUR') return 'Transfer Wire';
    if (message.category === 'transfer') return 'Transfer Office';
    if (message.category === 'JOB_OFFER' || message.category === 'CAREER') return 'Career Office';
    if (message.category === 'discipline') return 'Competition Office';
    if (message.category === 'morale' || message.category === 'contract') return 'Dressing Room';
    return 'Club Operations';
  }

  categoryIcon(message: ManagerInbox): string {
    if (this.isMedia(message)) return '◉';
    if (message.category === 'JOB_OFFER' || message.category === 'CAREER') return '◆';
    if (message.category === 'transfer' || message.category === 'TRANSFER_RUMOUR') return '⇄';
    if (message.category === 'board') return '▣';
    if (message.category === 'discipline') return '!';
    if (message.category === 'PRESS_CONFERENCE') return '●';
    return '•';
  }

  actionLabel(message: ManagerInbox): string | null {
    if (message.category === 'transfer' || message.category === 'TRANSFER_RUMOUR') return 'Open Transfer Centre';
    if (message.category === 'board') return 'Open Manager Desk';
    if (message.category === 'match_result') return 'Open Fixtures';
    if (message.category === 'discipline') return 'Review Squad';
    if (message.category === 'morale' || message.category === 'contract') return 'Open Squad';
    if (message.category === 'YOUTH_ACADEMY') return 'Open Academy';
    if (message.category === 'TRADER_ADVICE_AVAILABLE') return 'Open Market';
    return null;
  }

  openMessageAction(message: ManagerInbox): void {
    const teamId = this.teamService.teamId;
    const routes: { [category: string]: any[] } = {
      transfer: ['/transfers', teamId, this.teamService.currentSeason],
      TRANSFER_RUMOUR: ['/transfers', teamId, this.teamService.currentSeason],
      board: ['/home2'],
      match_result: ['/fixtures', teamId],
      discipline: ['/team', teamId],
      morale: ['/team', teamId],
      contract: ['/team', teamId],
      YOUTH_ACADEMY: ['/youth-academy'],
      TRADER_ADVICE_AVAILABLE: ['/market']
    };
    const route = routes[message.category];
    if (route) this.router.navigate(route);
  }

  selectRelative(offset: number): void {
    const visible = this.visibleMessages;
    if (!visible.length) return;
    const current = visible.findIndex(message => message.id === this.selectedMessage?.id);
    const next = current < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, current + offset));
    this.selectMessage(visible[next]);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      this.messageSearch?.nativeElement.focus();
      return;
    }
    if (typing) return;
    if (event.key.toLowerCase() === 'j' || event.key === 'ArrowDown') {
      event.preventDefault(); this.selectRelative(1);
    } else if (event.key.toLowerCase() === 'k' || event.key === 'ArrowUp') {
      event.preventDefault(); this.selectRelative(-1);
    } else if (event.key.toLowerCase() === 'u' && this.selectedMessage) {
      this.markAsUnread(this.selectedMessage);
    } else if (event.key.toLowerCase() === 'a') {
      this.markAllRead();
    } else if (event.key.toLowerCase() === 'o' && this.selectedMessage && this.actionLabel(this.selectedMessage)) {
      this.openMessageAction(this.selectedMessage);
    }
  }
}
