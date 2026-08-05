import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FriendlyCompetitionDetail, FriendlyCompetitionSeries, FriendlyEventView, FriendlyHubService, FriendlyOpponent, FriendlyPlannerOptions } from '../services/friendly-hub.service';
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
  competitions: FriendlyCompetitionSeries[] = [];
  seriesDetail: FriendlyCompetitionDetail | null = null;
  repeatSeriesId = '';
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
    private router: Router,
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
      options: this.hub.plannerOptions(this.teamId),
      competitions: this.hub.competitions(this.teamId)
    }).subscribe({
      next: data => {
        this.opponents = data.preparation.opponents;
        this.events = data.preparation.events;
        this.options = data.options;
        this.competitions = data.competitions;
        if (!this.options.availableSeasons.includes(this.season)) this.season = this.options.currentSeason;
        this.selectNextAvailableWindow();
        const domestic = this.options.destinations.find(destination => destination.domestic);
        if (domestic && !this.hostNationId) this.hostNationId = domestic.nationId;
        this.updateCostFromDestination(false);
        this.loading = false;
        this.refreshSelection();
        const requestedSeries = this.route.snapshot.queryParamMap.get('seriesId');
        if (requestedSeries) this.loadSeries(requestedSeries);
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
    const currentSeason = this.options?.currentSeason || this.season;
    const future = this.season > currentSeason || (this.season === currentSeason && this.startDay > currentDay);
    const allowedSeason = !!this.options?.availableSeasons.includes(this.season);
    const preSeason = this.startDay >= 1 && this.endDay <= 30;
    const winterBreak = this.startDay >= 201 && this.endDay <= 210;
    return allowedSeason && future && (preSeason || winterBreak);
  }

  get hasAvailableWindow(): boolean {
    return this.startDateOptions.length > 0;
  }

  get startDateOptions() { return (this.options?.dateOptions || []).filter(option => option.season === this.season); }

  get endDateOptions() {
    const sameWindow = this.startDay <= 30 ? (day: number) => day <= 30 : (day: number) => day >= 201;
    return this.startDateOptions.filter(option => option.day >= this.startDay && sameWindow(option.day));
  }

  get projectedFeeIncome(): number {
    return this.eventType === 'TRAINING_CAMP' ? 0 : this.participantIds.length * Math.max(0, this.participationFee);
  }

  get projectedNetCost(): number {
    return Math.max(0, this.organizerCost) + (this.eventType === 'TRAINING_CAMP' ? 0 : Math.max(0, this.prizePool)) - this.projectedFeeIncome;
  }

  chooseType(type: 'TRAINING_CAMP' | 'MINI_LEAGUE' | 'MINI_CUP'): void {
    if (this.repeatSeriesId && type !== this.eventType) this.repeatSeriesId = '';
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

  changeStartDate(): void {
    if (!this.endDateOptions.some(option => option.day === this.endDay)) {
      this.endDay = this.endDateOptions[0]?.day || this.startDay;
    }
    this.updateCostFromDestination(true);
  }

  changePlanningSeason(): void {
    this.startDay = 0;
    this.endDay = 0;
    this.events = [];
    this.selectedEvent = null;
    this.load();
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
      organizerCost: Number(this.organizerCost),
      ...(this.repeatSeriesId ? { seriesId: this.repeatSeriesId } : {})
    }).subscribe({
      next: event => {
        this.saving = false;
        this.notice = `${event.name} saved as draft. Review the budget before confirmation.`;
        this.repeatSeriesId = '';
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

  openSeries(seriesId: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { seriesId }, queryParamsHandling: 'merge' });
    this.loadSeries(seriesId);
  }

  closeSeries(): void {
    this.seriesDetail = null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { seriesId: null }, queryParamsHandling: 'merge' });
  }

  repeatSeries(): void {
    if (!this.seriesDetail || !this.options || !this.seriesDetail.proposalAvailable) return;
    const latest = this.seriesDetail.latestEdition;
    const nextEdition = (latest.editionNumber || this.seriesDetail.editionCount) + 1;
    this.repeatSeriesId = this.seriesDetail.seriesId;
    this.eventType = this.seriesDetail.eventType;
    this.eventName = this.seriesDetail.name;
    this.season = Math.min(this.options.currentSeason + 1, Math.max(this.options.currentSeason, this.seriesDetail.nextEditionSeason));
    this.hostNationId = latest.hostNationId;
    this.locationName = latest.locationName;
    this.focus = latest.focus;
    this.participationFee = latest.participationFee;
    this.prizePool = latest.prizePool;
    this.organizerCost = latest.organizerCost;
    this.participantIds = latest.participants.filter(participant => !participant.organizer).map(participant => participant.teamId);
    this.startDay = 0;
    this.endDay = 0;
    this.seriesDetail = null;
    this.selectNextAvailableWindow();
    this.notice = `Planning Edition ${nextEdition} of ${this.eventName}. Prize money, fees, venue and invited clubs can all be changed for this season.`;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { seriesId: null }, queryParamsHandling: 'merge' });
  }

  private loadSeries(seriesId: string): void {
    this.hub.competition(seriesId).subscribe({
      next: detail => { this.seriesDetail = detail; this.error = ''; },
      error: () => { this.error = 'The friendly competition history could not be loaded.'; this.seriesDetail = null; }
    });
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
    if (!this.startDateOptions.length && this.season === this.options?.currentSeason) this.season = this.options.currentSeason + 1;
    const dates = this.startDateOptions;
    if (!dates.length) return;
    if (dates.some(option => option.day === this.startDay) && this.endDateOptions.some(option => option.day === this.endDay)) return;
    this.startDay = dates[0].day;
    const desiredEnd = this.startDay + (this.eventType === 'TRAINING_CAMP' ? 6 : 4);
    const ends = this.endDateOptions;
    this.endDay = ends.find(option => option.day >= desiredEnd)?.day || ends[ends.length - 1]?.day || this.startDay;
  }
}
