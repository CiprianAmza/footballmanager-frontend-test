import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { InboxComponent, ManagerInbox } from '../inbox/inbox.component';
import { TeamService } from '../services/team.service';
import { CareerService } from '../services/career.service';
import { AuthService } from '../services/auth.service';

type NewsroomView = 'all' | 'reaction' | 'league' | 'club';

@Component({
  selector: 'app-inbox3',
  templateUrl: './inbox3.component.html',
  styleUrls: ['./inbox3.component.css']
})
export class Inbox3Component extends InboxComponent {
  @ViewChild('newsSearch') newsSearch?: ElementRef<HTMLInputElement>;
  newsroomView: NewsroomView = 'all';
  newsQuery = '';
  manuallySelectedStory: ManagerInbox | null = null;

  constructor(http: HttpClient, teamService: TeamService, careerService: CareerService, authService: AuthService) {
    super(http, teamService, careerService, authService);
  }

  get newsroomMessages(): ManagerInbox[] {
    const query = this.newsQuery.trim().toLowerCase();
    return this.messages.filter(message => {
      if (!this.isNews(message)) return false;
      if (this.newsroomView === 'reaction' && !['MEDIA_REACTION', 'match_result'].includes(message.category)) return false;
      if (this.newsroomView === 'league' && !['league_news', 'european', 'european_prize', 'season_end'].includes(message.category)) return false;
      if (this.newsroomView === 'club' && !['transfer', 'TRANSFER_RUMOUR', 'board', 'morale', 'contract', 'CAREER', 'MEDIA_PREVIEW', 'PRESS_CONFERENCE'].includes(message.category)) return false;
      return !query || message.title.toLowerCase().includes(query) || message.content.toLowerCase().includes(query);
    });
  }

  get featuredStory(): ManagerInbox | null {
    if (this.manuallySelectedStory) return this.manuallySelectedStory;
    if (this.selectedMessage && this.isNews(this.selectedMessage)) return this.selectedMessage;
    return this.newsroomMessages[0] || null;
  }

  get unreadDecisions(): number {
    const decisionCategories = ['JOB_OFFER', 'PRESS_CONFERENCE', 'discipline', 'board', 'TACTICAL_MANDATE_UPDATED'];
    return this.messages.filter(message => !message.isRead && decisionCategories.includes(message.category)).length;
  }

  get reactionCount(): number {
    return this.messages.filter(message => ['MEDIA_REACTION', 'match_result'].includes(message.category)).length;
  }

  get pressCount(): number {
    return this.messages.filter(message => ['PRESS_CONFERENCE', 'MEDIA_PREVIEW'].includes(message.category)).length;
  }

  get clubWire(): ManagerInbox[] {
    return this.messages.filter(message => !this.isNews(message)).slice(0, 5);
  }

  isNews(message: ManagerInbox): boolean {
    return message.category.startsWith('MEDIA_') || [
      'match_result', 'league_news', 'european', 'european_prize', 'season_end',
      'transfer', 'TRANSFER_RUMOUR', 'board', 'morale', 'contract', 'CAREER', 'PRESS_CONFERENCE'
    ].includes(message.category);
  }

  storySource(message: ManagerInbox): string {
    if (message.category === 'MEDIA_REACTION') return 'Studio Analysis';
    if (message.category === 'match_result') return 'Match Centre';
    if (message.category === 'league_news') return 'League Wire';
    if (message.category === 'transfer' || message.category === 'TRANSFER_RUMOUR') return 'Transfer Desk';
    if (message.category === 'PRESS_CONFERENCE' || message.category === 'MEDIA_PREVIEW') return 'Press Room';
    if (message.category === 'board') return 'Club Sources';
    return 'Football Daily';
  }

  storyTag(message: ManagerInbox): string {
    if (message.category === 'MEDIA_REACTION') return 'REACTION';
    if (message.category === 'MEDIA_PREVIEW') return 'PREVIEW';
    if (message.category === 'match_result') return 'MATCH REPORT';
    if (message.category === 'league_news') return 'AROUND THE LEAGUE';
    if (message.category === 'transfer' || message.category === 'TRANSFER_RUMOUR') return 'TRANSFER RUMOUR';
    if (message.category === 'board') return 'INSIDE THE CLUB';
    return this.getCategoryLabel(message.category).toUpperCase();
  }

  storyTone(message: ManagerInbox): string {
    const copy = `${message.title} ${message.content}`.toLowerCase();
    if (/defeat|pressure|scrutiny|crisis|unhappy|rejected|failed/.test(copy)) return 'negative';
    if (/victory|win|praise|accepted|signed|award|champion/.test(copy)) return 'positive';
    return 'neutral';
  }

  storyExcerpt(message: ManagerInbox, length = 150): string {
    const cleaned = message.content.replace(/\s+/g, ' ').replace(/OFFER_ID:\d+/g, '').trim();
    return cleaned.length > length ? cleaned.slice(0, length).trim() + '…' : cleaned;
  }

  selectStory(message: ManagerInbox): void {
    this.manuallySelectedStory = message;
    this.selectMessage(message);
  }

  setNewsroomView(view: NewsroomView): void {
    this.newsroomView = view;
    this.manuallySelectedStory = null;
    if (this.newsroomMessages.length) this.selectStory(this.newsroomMessages[0]);
  }

  moveStory(offset: number): void {
    const stories = this.newsroomMessages;
    if (!stories.length) return;
    const current = stories.findIndex(story => story.id === this.featuredStory?.id);
    const next = current < 0 ? 0 : Math.max(0, Math.min(stories.length - 1, current + offset));
    this.selectStory(stories[next]);
  }

  @HostListener('window:keydown', ['$event'])
  handleNewsroomKeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (event.key === '/' && !typing) {
      event.preventDefault(); this.newsSearch?.nativeElement.focus(); return;
    }
    if (typing) return;
    if (event.key.toLowerCase() === 'n' || event.key === 'ArrowRight') this.moveStory(1);
    else if (event.key.toLowerCase() === 'p' || event.key === 'ArrowLeft') this.moveStory(-1);
    else if (event.key === '1') this.setNewsroomView('all');
    else if (event.key === '2') this.setNewsroomView('reaction');
    else if (event.key === '3') this.setNewsroomView('league');
    else if (event.key === '4') this.setNewsroomView('club');
  }
}
