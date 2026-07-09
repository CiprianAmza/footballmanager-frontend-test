import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface UpcomingMatch {
  competitionId: number;
  competitionName: string;
  seasonNumber: number;
  roundNumber: number;
  day: number;
  team1Id: number;
  team1Name: string;
  team2Id: number;
  team2Name: string;
  predeterminedId?: number;
  predeterminedTeam1Score?: number;
  predeterminedTeam2Score?: number;
}

export interface PredeterminedScore {
  id: number;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  consumed: boolean;
}

export interface TacticOption {
  formation: string;
  mentality: string;
  tempo: string;
  passingType: string;
  inPossession: string;
  timeWasting: string;
  expectedGoalDifference: number;
  expectedPoints: number;
}

export interface BestTacticResponse {
  teamId: number;
  teamName: string;
  recommendedFormation: string;
  recommendedMentality: string;
  recommendedTempo: string;
  recommendedPassingType: string;
  recommendedInPossession: string;
  recommendedTimeWasting: string;
  expectedGoalDifference: number;
  expectedPoints: number;
  winProbability: number;
  drawProbability: number;
  lossProbability: number;
  baseSquadValue: number;
  top: TacticOption[];
}

const TOKEN_STORAGE_KEY = 'fm_admin_token';

@Injectable({ providedIn: 'root' })
export class AdminService {

  constructor(private http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Admin-Token': this.token || '' });
  }

  login(username: string, password: string): Observable<{ success: boolean; token?: string; message?: string }> {
    return this.http.post<any>(urlApp + '/admin/login', { username, password });
  }

  storeToken(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  getUpcomingMatches(): Observable<UpcomingMatch[]> {
    return this.http.get<UpcomingMatch[]>(urlApp + '/admin/upcomingMatches', { headers: this.authHeaders() });
  }

  setScore(payload: {
    competitionId: number;
    seasonNumber: number;
    roundNumber: number;
    team1Id: number;
    team2Id: number;
    team1Score: number;
    team2Score: number;
  }): Observable<{ success: boolean; id: number }> {
    return this.http.post<any>(urlApp + '/admin/setScore', payload, { headers: this.authHeaders() });
  }

  listPredetermined(): Observable<PredeterminedScore[]> {
    return this.http.get<PredeterminedScore[]>(urlApp + '/admin/predeterminedScores', { headers: this.authHeaders() });
  }

  deletePredetermined(id: number): Observable<{ success: boolean }> {
    return this.http.delete<any>(urlApp + `/admin/predeterminedScore/${id}`, { headers: this.authHeaders() });
  }

  // ===== Job offer admin controls =====

  jobOfferState(): Observable<{ jobOffersEnabled: boolean; forceJobOfferOnNextAdvance: boolean }> {
    return this.http.get<any>(urlApp + '/admin/jobOffers/state', { headers: this.authHeaders() });
  }

  setJobOffersEnabled(enabled: boolean): Observable<{ jobOffersEnabled: boolean }> {
    return this.http.post<any>(urlApp + '/admin/jobOffers/setEnabled', { enabled }, { headers: this.authHeaders() });
  }

  forceNextOffer(): Observable<{ forceJobOfferOnNextAdvance: boolean }> {
    return this.http.post<any>(urlApp + '/admin/jobOffers/forceNext', {}, { headers: this.authHeaders() });
  }

  generateOfferNow(userId: number, teamId: number): Observable<any> {
    return this.http.post<any>(urlApp + '/admin/jobOffers/generateNow', { userId, teamId }, { headers: this.authHeaders() });
  }

  listAdminUsers(): Observable<{ id: number; username: string; teamId: number | null }[]> {
    return this.http.get<any>(urlApp + '/admin/users', { headers: this.authHeaders() });
  }

  // ===== Best Tactic advisor =====

  /**
   * Recommended tactic computed from the team's CURRENT database squad values.
   * Returns the best formation + 5 settings plus a ranked top-15 list.
   */
  bestTactic(teamId: number): Observable<BestTacticResponse> {
    return this.http.get<BestTacticResponse>(
      urlApp + `/admin/bestTactic/${teamId}`,
      { headers: this.authHeaders() }
    );
  }

  // ===== Generate player =====

  /** Generate a new player and (optionally) assign to a team. */
  generatePlayer(payload: {
    teamId?: number | null;
    name?: string;
    position?: string;
    age?: number;
    overall?: number;
  }): Observable<any> {
    return this.http.post<any>(urlApp + '/admin/generatePlayer', payload, { headers: this.authHeaders() });
  }
}
