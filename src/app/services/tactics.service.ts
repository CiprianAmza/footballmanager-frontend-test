import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

// Strat-2 + Faza-2 tactic axes the backend now recommends alongside the classic settings.
export interface TacticAxes {
  defensiveLine?: string;
  pressing?: string;
  width?: string;
  dribbling?: string;
  foulFrequency?: string;
  foulHardness?: string;
  tempoFragmentation?: string;
  widePlay?: string;
  transition?: string;
}

export interface AnalyticalRow extends TacticAxes {
  formation: string;
  mentality: string;
  tempo: string;
  passingType: string;
  inPossession: string;
  timeWasting: string;
  expectedPoints: number;
  expectedGoalDifference: number;
  // optional win/draw/loss if backend provides them
  winProbability?: number;
  drawProbability?: number;
  lossProbability?: number;
}

export interface AnalyticalResponse {
  teamId: number;
  teamName: string;
  rows: AnalyticalRow[];
}

export interface SimulatedRow extends TacticAxes {
  mentality: string;
  tempo: string;
  passingType: string;
  inPossession: string;
  timeWasting: string;
  avgPoints: number;
  minPoints: number;
  maxPoints: number;
}

export interface SimulatedResponse {
  teamId: number;
  teamName: string;
  formation: string;
  seasons: number;
  opponentCount: number;
  rows: SimulatedRow[];
}

export interface LeagueTeam {
  teamId: number;
  teamName: string;
}

export interface LeagueWithTeams {
  competitionId: number;
  competitionName: string;
  teams: LeagueTeam[];
}

@Injectable({ providedIn: 'root' })
export class TacticsService {

  constructor(private http: HttpClient) {}

  /** Formation names for a dropdown. */
  getFormations(): Observable<string[]> {
    return this.http.get<string[]>(urlApp + '/tactics/formations');
  }

  /** Instant formula-based ranking for ONE formation: the "default = factor 1" enumeration of all 9
   *  new axes (17,100 tactics), returning the top {@code topN} by expected points. */
  getAnalytical(teamId: number, formation: string, topN = 300): Observable<AnalyticalResponse> {
    const url = urlApp + `/tactics/analytical/${teamId}`
      + `?formation=${encodeURIComponent(formation)}&topN=${topN}`;
    return this.http.get<AnalyticalResponse>(url);
  }

  /** Real-match simulation for one formation over N seasons vs chosen opponents. */
  simulate(teamId: number, formation: string, seasons: number, opponentIds?: number[]): Observable<SimulatedResponse> {
    let url = urlApp + `/tactics/simulate?teamId=${teamId}&formation=${encodeURIComponent(formation)}&seasons=${seasons}`;
    if (opponentIds && opponentIds.length > 0) {
      url += `&opponentIds=${opponentIds.join(',')}`;
    }
    return this.http.get<SimulatedResponse>(url);
  }

  /** All leagues + their teams, used by opponent / team pickers. */
  getLeaguesAndTeams(): Observable<LeagueWithTeams[]> {
    return this.http.get<LeagueWithTeams[]>(urlApp + '/competition/leaguesAndTeams');
  }
}
