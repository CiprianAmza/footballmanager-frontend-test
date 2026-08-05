import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface ScoutLeague {
  id: number;
  name: string;
}

export interface AvailableScout {
  id: number;
  name: string;
  scoutingAbility: number;
  experience: number;
  judgingPotential: number;
  wageDemand: number;
  knownLeagues: ScoutLeague[];
}

export interface TeamScout {
  id: number;
  name: string;
  scoutingAbility: number;
  experience: number;
  judgingPotential: number;
  wage: number;
  contractEndSeason: number;
  knownLeagues: ScoutLeague[];
  onAssignment: boolean;
  assignmentPlayerName?: string;
  assignmentEndDay?: number;
  assignmentType?: 'PLAYER' | 'FOCUS';
}

export type ScoutingTargetType = 'TEAM' | 'COMPETITION' | 'NATION';
export type ScoutingEmphasis = 'BALANCED' | 'CURRENT_ABILITY' | 'POTENTIAL' | 'KEY_ATTRIBUTES' | 'VALUE';

export interface ScoutingTarget { id: number; name: string; competitionId?: number; nationId?: number; typeId?: number; }
export interface ScoutingFocusCatalog {
  teams: ScoutingTarget[];
  competitions: ScoutingTarget[];
  nations: ScoutingTarget[];
  positions: string[];
  attributes: string[];
  emphases: ScoutingEmphasis[];
}
export interface ScoutingFocusRequest {
  scoutId: number;
  targetType: ScoutingTargetType;
  targetId: number;
  position: string;
  minRating: number;
  maxRating: number;
  minAge: number;
  maxAge: number;
  keyAttributes: string[];
  minimumAttribute: number;
  emphasis: ScoutingEmphasis;
}
export interface ScoutingFocus extends ScoutingFocusRequest {
  id: number;
  scoutName: string;
  targetName: string;
  startDay: number;
  endDay: number;
  daysRemaining: number;
  season: number;
  cost: number;
  status: 'in_progress' | 'completed' | 'cancelled';
  candidatesFound: number;
}
export interface ScoutingFocusResult {
  id: number;
  focusId: number;
  playerId: number;
  playerName: string;
  position: string;
  age: number;
  playerTeamId: number;
  playerTeamName: string;
  estimatedRating: number;
  estimatedPotential: number;
  estimatedTransferValue: number;
  fitScore: number;
  matchedAttributes: string;
  recommendation: 'TOP_TARGET' | 'STRONG_MATCH' | 'MONITOR' | 'DEPTH_OPTION';
}

export interface ScoutAssignment {
  id: number;
  scoutName: string;
  playerName: string;
  playerPosition: string;
  playerTeamName: string;
  startDay: number;
  endDay: number;
  daysRemaining: number;
  cost: number;
  sameLeague: boolean;
}

export interface CompletedReport {
  id: number;
  scoutName: string;
  playerId: number;
  playerName: string;
  playerPosition: string;
  playerTeamId: number;
  playerTeamName: string;
  revealedRating: number;
  revealedPotential: number;
  revealedTransferValue: number;
  cost: number;
  season: number;
}

export interface ExpiringScout {
  id: number;
  name: string;
  scoutingAbility: number;
  experience: number;
  judgingPotential: number;
  wage: number;
  wageDemand: number;
  contractEndSeason: number;
}

@Injectable({
  providedIn: 'root'
})
export class ScoutService {

  constructor(private http: HttpClient) {}

  getAvailableScouts(): Observable<AvailableScout[]> {
    return this.http.get<AvailableScout[]>(urlApp + '/scouts/available');
  }

  getTeamScouts(teamId: number): Observable<TeamScout[]> {
    return this.http.get<TeamScout[]>(urlApp + `/scouts/team/${teamId}`);
  }

  hireScout(scoutId: number, offeredWage: number, contractYears: number): Observable<any> {
    return this.http.post(urlApp + '/scouts/hire', { scoutId, offeredWage, contractYears });
  }

  fireScout(scoutId: number): Observable<any> {
    return this.http.post(urlApp + `/scouts/fire/${scoutId}`, {});
  }

  renewContract(scoutId: number, newWage: number, extraYears: number): Observable<any> {
    return this.http.post(urlApp + '/scouts/renew', { scoutId, newWage, extraYears });
  }

  assignScout(scoutId: number, playerId: number): Observable<any> {
    return this.http.post(urlApp + '/scouts/assign', { scoutId, playerId });
  }

  getActiveAssignments(teamId: number): Observable<ScoutAssignment[]> {
    return this.http.get<ScoutAssignment[]>(urlApp + `/scouts/assignments/${teamId}`);
  }

  getCompletedReports(teamId: number): Observable<CompletedReport[]> {
    return this.http.get<CompletedReport[]>(urlApp + `/scouts/completed/${teamId}`);
  }

  getExpiringContracts(teamId: number): Observable<ExpiringScout[]> {
    return this.http.get<ExpiringScout[]>(urlApp + `/scouts/expiring/${teamId}`);
  }

  getFocusCatalog(): Observable<ScoutingFocusCatalog> {
    return this.http.get<ScoutingFocusCatalog>(urlApp + '/scouts/focuses/catalog');
  }

  createFocus(request: ScoutingFocusRequest): Observable<{ success: boolean; message: string; focus: ScoutingFocus }> {
    return this.http.post<{ success: boolean; message: string; focus: ScoutingFocus }>(urlApp + '/scouts/focuses', request);
  }

  getFocuses(status: string = 'all'): Observable<ScoutingFocus[]> {
    return this.http.get<ScoutingFocus[]>(urlApp + `/scouts/focuses?status=${encodeURIComponent(status)}`);
  }

  getFocusResults(focusId: number): Observable<ScoutingFocusResult[]> {
    return this.http.get<ScoutingFocusResult[]>(urlApp + `/scouts/focuses/${focusId}/results`);
  }

  cancelFocus(focusId: number): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(urlApp + `/scouts/focuses/${focusId}/cancel`, {});
  }
}
