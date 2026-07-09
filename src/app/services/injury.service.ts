import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

@Injectable({
  providedIn: 'root'
})
export class InjuryService {

  constructor(private http: HttpClient) {}

  getActiveInjuries(teamId: number): Observable<any[]> {
    return this.http.get<any[]>(`${urlApp}/injuries/active/${teamId}`);
  }

  getInjuryHistory(teamId: number): Observable<any[]> {
    return this.http.get<any[]>(`${urlApp}/injuries/history/${teamId}`);
  }

  getPlayerInjuries(playerId: number): Observable<any[]> {
    return this.http.get<any[]>(`${urlApp}/injuries/player/${playerId}`);
  }

  getRiskAssessment(teamId: number): Observable<any[]> {
    return this.http.get<any[]>(`${urlApp}/injuries/riskAssessment/${teamId}`);
  }
}
