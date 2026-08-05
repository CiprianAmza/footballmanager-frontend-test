import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { urlApp } from '../app.component';

export interface FriendlyMatchView {
  matchId: number;
  day: number;
  dateDisplay: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  homeGoals?: number;
  awayGoals?: number;
  score?: string;
  friendlyEventId?: number;
  matchType?: string;
  purpose?: string;
  ruleset?: string;
  eventStage?: string;
  venueName?: string;
  homePossession?: number;
  awayPossession?: number;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
}

export interface FriendlyOpponent {
  teamId: number;
  name: string;
  reputation: number;
  sameLeague: boolean;
}

export interface FriendlyDay {
  day: number;
  dateDisplay: string;
  phase: 'PRE_SEASON' | 'WINTER_BREAK';
}

export interface FriendlyParticipant {
  teamId: number;
  name: string;
  organizer: boolean;
}

export interface FriendlyEventView {
  eventId: number;
  season: number;
  organizerTeamId: number;
  organizerTeamName: string;
  name: string;
  eventType: 'TRAINING_CAMP' | 'MINI_LEAGUE' | 'MINI_CUP';
  status: 'DRAFT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  hostNationId: number;
  hostNationName: string;
  hostNationFlagCode: string;
  locationName: string;
  startDay: number;
  endDay: number;
  startDate: string;
  endDate: string;
  focus: string;
  format?: string;
  participants: FriendlyParticipant[];
  participationFee: number;
  prizePool: number;
  organizerCost: number;
  projectedFeeIncome: number;
  projectedNetCost: number;
  winnerTeamId?: number;
  winnerTeamName?: string;
  matches: FriendlyMatchView[];
}

export interface FriendlyPlannerOptions {
  teamId: number;
  teamName: string;
  availableBalance: number;
  currentSeason: number;
  currentDay: number;
  currentDate: string;
  minimumStartDay: number;
  dateOptions: FriendlyDay[];
  destinations: Array<{nationId: number; name: string; flagCode: string; domestic: boolean; estimatedBaseCost: number}>;
  eventTypes: Array<{id: string; label: string; description: string}>;
  rulesets: Array<{id: string; label: string; description: string}>;
}

@Injectable({ providedIn: 'root' })
export class FriendlyHubService {
  constructor(private http: HttpClient) {}

  loadPreparation(teamId: number, season: number): Observable<{
    matches: FriendlyMatchView[];
    opponents: FriendlyOpponent[];
    days: FriendlyDay[];
    events: FriendlyEventView[];
  }> {
    return forkJoin({
      matches: this.http.get<FriendlyMatchView[]>(`${urlApp}/friendly/matches/${teamId}/${season}`),
      opponents: this.http.get<FriendlyOpponent[]>(`${urlApp}/friendly/opponents/${teamId}`),
      days: this.http.get<FriendlyDay[]>(`${urlApp}/friendly/availableDays/${teamId}/${season}`),
      events: this.http.get<FriendlyEventView[]>(`${urlApp}/friendly/events/${teamId}/${season}`)
    });
  }

  plannerOptions(teamId: number): Observable<FriendlyPlannerOptions> {
    return this.http.get<FriendlyPlannerOptions>(`${urlApp}/friendly/plannerOptions/${teamId}`);
  }

  schedule(payload: Record<string, unknown>): Observable<any> {
    return this.http.post(`${urlApp}/friendly/schedule`, payload);
  }

  cancelMatch(matchId: number): Observable<any> {
    return this.http.delete(`${urlApp}/friendly/cancel/${matchId}`);
  }

  createEvent(payload: Record<string, unknown>): Observable<FriendlyEventView> {
    return this.http.post<FriendlyEventView>(`${urlApp}/friendly/events`, payload);
  }

  confirmEvent(eventId: number): Observable<FriendlyEventView> {
    return this.http.post<FriendlyEventView>(`${urlApp}/friendly/events/${eventId}/confirm`, {});
  }

  cancelEvent(eventId: number): Observable<FriendlyEventView> {
    return this.http.delete<FriendlyEventView>(`${urlApp}/friendly/events/${eventId}`);
  }
}
