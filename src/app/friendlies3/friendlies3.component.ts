import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FriendlyEventView, FriendlyHubService, FriendlyOpponent, FriendlyPlannerOptions } from '../services/friendly-hub.service';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-friendlies3',
  templateUrl: './friendlies3.component.html',
  styleUrls: ['./friendlies3.component.css']
})
export class Friendlies3Component implements OnInit {
  teamId = 0;
  season = 1;
  loading = true;
  saving = false;
  error = '';
  notice = '';
  options: FriendlyPlannerOptions | null = null;
  opponents: FriendlyOpponent[] = [];
  events: FriendlyEventView[] = [];
  selectedEvent: FriendlyEventView | null = null;
  selectedIndex = 0;
  eventQuery = '';
  opponentQuery = '';

  eventType: 'TRAINING_CAMP' | 'MINI_LEAGUE' | 'MINI_CUP' = 'TRAINING_CAMP';
  eventName = 'Pre-season Performance Camp';
  hostNationId = 1;
  locationName = '';
  startDay = 8;
  endDay = 14;
  focus = 'FITNESS';
  participationFee = 250000;
  prizePool = 1000000;
  organizerCost = 850000;
  participantIds: number[] = [];

  constructor(
    private route: ActivatedRoute,
    private hub: FriendlyHubService,
    public teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.teamId = Number(this.route.snapshot.paramMap.get('teamId')) || this.teamService.teamId;
    this.season = this.teamService.currentSeason;
    this.load();
  }

  load(): void {
    if (!this.teamId) return;
    this.loading = true;
    forkJoin({
      preparation: this.hub.loadPreparation(this.teamId, this.season),
      options: this.hub.plannerOptions(this.teamId)
    }).subscribe({
      next: data => {
        this.opponents = data.preparation.opponents;
        this.events = data.preparation.events;
        this.options = data.options;
        this.season = this.options.currentSeason;
        this.selectNextAvailableWindow();
        const domestic = this.options.destinations.find(destination => destination.domestic);
        if (domestic && !this.hostNationId) this.hostNationId = domestic.nationId;
        this.updateCostFromDestination(false);
        this.loading = false;
        this.refreshSelection();
      },
      error: () => {
        this.error = 'The event studio could not be loaded.';
        this.loading = false;
      }
    });
  }

  get filteredEvents(): FriendlyEventView[] {
    const term = this.eventQuery.trim().toLowerCase();
    return this.events.filter(event => !term || `${event.name} ${event.locationName} ${event.eventType} ${event.status}`.toLowerCase().includes(term));
  }

  get filteredOpponents(): FriendlyOpponent[] {
    const term = this.opponentQuery.trim().toLowerCase();
    return this.opponents.filter(opponent => !term || opponent.name.toLowerCase().includes(term)).slice(0, 20);
  }

  get requiredGuests(): string {
    if (this.eventType === 'MINI_CUP') return 'Select exactly 3 guest clubs';
    if (this.eventType === 'MINI_LEAGUE') return 'Select 2–5 guest clubs';
    return 'No invitations required';
  }

  get canCreate(): boolean {
    if (!this.eventName.trim() || !this.locationName.trim() || this.startDay > this.endDay || !this.isFutureWindow) return false;
    if (this.eventType === 'MINI_CUP') return this.participantIds.length === 3;
    if (this.eventType === 'MINI_LEAGUE') return this.participantIds.length >= 2 && this.participantIds.length <= 5;
    return true;
  }

  get isFutureWindow(): boolean {
    const currentDay = this.options?.currentDay || 0;
    const future = this.startDay > currentDay;
    const preSeason = this.startDay >= 1 && this.endDay <= 30;
    const winterBreak = this.startDay >= 201 && this.endDay <= 210;
    return future && (preSeason || winterBreak);
  }

  get hasAvailableWindow(): boolean {
    return (this.options?.currentDay || 0) < 210;
  }

  get projectedFeeIncome(): number {
    return this.eventType === 'TRAINING_CAMP' ? 0 : this.participantIds.length * Math.max(0, this.participationFee);
  }

  get projectedNetCost(): number {
    return Math.max(0, this.organizerCost) + (this.eventType === 'TRAINING_CAMP' ? 0 : Math.max(0, this.prizePool)) - this.projectedFeeIncome;
  }

  chooseType(type: 'TRAINING_CAMP' | 'MINI_LEAGUE' | 'MINI_CUP'): void {
    this.eventType = type;
    this.participantIds = [];
    if (type === 'TRAINING_CAMP') {
      this.eventName = 'Pre-season Performance Camp'; this.endDay = this.startDay + 6; this.prizePool = 0; this.participationFee = 0;
    } else if (type === 'MINI_LEAGUE') {
      this.eventName = `${this.options?.teamName || 'Club'} Invitational League`; this.endDay = this.startDay + 8; this.prizePool = 1500000; this.participationFee = 300000;
    } else {
      this.eventName = `${this.options?.teamName || 'Club'} Challenge Cup`; this.endDay = this.startDay + 4; this.prizePool = 2000000; this.participationFee = 400000;
    }
    this.updateCostFromDestination(true);
  }

  updateCostFromDestination(force = true): void {
    const destination = this.options?.destinations.find(item => item.nationId === Number(this.hostNationId));
    if (!destination) return;
    if (!this.locationName || force) this.locationName = destination.name + (this.eventType === 'TRAINING_CAMP' ? ' Performance Centre' : ' National Stadium');
    if (force || !this.organizerCost) {
      const duration = Math.max(1, this.endDay - this.startDay + 1);
      const eventMultiplier = this.eventType === 'TRAINING_CAMP' ? 1 : this.eventType === 'MINI_LEAGUE' ? 2.2 : 1.8;
      this.organizerCost = Math.round((destination.estimatedBaseCost + duration * 90000) * eventMultiplier / 10000) * 10000;
    }
  }

  toggleParticipant(teamId: number): void {
    if (this.participantIds.includes(teamId)) this.participantIds = this.participantIds.filter(id => id !== teamId);
    else this.participantIds = [...this.participantIds, teamId];
  }

  isSelected(teamId: number): boolean { return this.participantIds.includes(teamId); }

  createDraft(): void {
    if (!this.canCreate || this.saving) return;
    this.saving = true;
    this.notice = '';
    this.hub.createEvent({
      organizerTeamId: this.teamId,
      season: this.season,
      name: this.eventName,
      eventType: this.eventType,
      hostNationId: Number(this.hostNationId),
      locationName: this.locationName,
      startDay: Number(this.startDay),
      endDay: Number(this.endDay),
      focus: this.focus,
      participantTeamIds: this.participantIds,
      participationFee: Number(this.participationFee),
      prizePool: this.eventType === 'TRAINING_CAMP' ? 0 : Number(this.prizePool),
      organizerCost: Number(this.organizerCost)
    }).subscribe({
      next: event => {
        this.saving = false;
        this.notice = `${event.name} saved as draft. Review the budget before confirmation.`;
        this.load();
        this.selectedEvent = event;
      },
      error: error => {
        this.saving = false;
        this.notice = error.error?.error || 'The event could not be created.';
      }
    });
  }

  confirm(event: FriendlyEventView): void {
    this.saving = true;
    this.hub.confirmEvent(event.eventId).subscribe({
      next: confirmed => {
        this.saving = false;
        this.notice = `${confirmed.name} confirmed. Costs and fees were posted and fixtures added.`;
        this.load();
      },
      error: error => {
        this.saving = false;
        this.notice = error.error?.error || 'The event could not be confirmed.';
      }
    });
  }

  cancel(event: FriendlyEventView): void {
    this.hub.cancelEvent(event.eventId).subscribe({ next: () => { this.notice = `${event.name} cancelled.`; this.load(); } });
  }

  selectEvent(event: FriendlyEventView, index?: number): void {
    this.selectedEvent = event;
    if (index !== undefined) this.selectedIndex = index;
  }

  money(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
  }

  pretty(value?: string): string {
    return (value || '').toLowerCase().replace(/_/g, ' ').replace(/^./, first => first.toUpperCase());
  }

  typeIcon(type: string): string { return type === 'TRAINING_CAMP' ? '⌂' : type === 'MINI_LEAGUE' ? '▦' : '♜'; }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
      if (event.key === 'Escape') (target as HTMLInputElement).blur();
      return;
    }
    if (event.key === '/') {
      event.preventDefault(); document.getElementById('event-search')?.focus();
    } else if (event.key === '1') this.chooseType('TRAINING_CAMP');
    else if (event.key === '2') this.chooseType('MINI_LEAGUE');
    else if (event.key === '3') this.chooseType('MINI_CUP');
    else if (event.key.toLowerCase() === 'c' && this.canCreate) this.createDraft();
    else if (event.key === 'Escape') this.selectedEvent = null;
    else if (event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'k') {
      const rows = this.filteredEvents;
      if (!rows.length) return;
      this.selectedIndex = Math.max(0, Math.min(rows.length - 1, this.selectedIndex + (event.key.toLowerCase() === 'j' ? 1 : -1)));
      this.selectedEvent = rows[this.selectedIndex];
    }
  }

  private refreshSelection(): void {
    if (this.selectedEvent) this.selectedEvent = this.events.find(event => event.eventId === this.selectedEvent?.eventId) || null;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredEvents.length - 1));
  }

  private selectNextAvailableWindow(): void {
    const currentDay = this.options?.currentDay || 1;
    if (this.startDay > currentDay && ((this.startDay <= 30 && this.endDay <= 30) || (this.startDay >= 201 && this.endDay <= 210))) return;
    if (currentDay < 30) {
      this.startDay = currentDay + 1;
      this.endDay = Math.min(30, this.startDay + (this.eventType === 'TRAINING_CAMP' ? 6 : 4));
    } else if (currentDay < 210) {
      this.startDay = Math.max(201, currentDay + 1);
      this.endDay = Math.min(210, this.startDay + (this.eventType === 'TRAINING_CAMP' ? 6 : 4));
    }
  }
}
