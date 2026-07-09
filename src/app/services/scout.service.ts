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
}
