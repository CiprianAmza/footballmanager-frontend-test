import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface HubMetrics {
  matches: number; goals: number; conceded: number; goalsPerMatch: number; concededPerMatch: number;
  xgForPerMatch: number; xgAgainstPerMatch: number; xgDifferencePerMatch: number; possession: number;
  shotsPerMatch: number; shotsAgainstPerMatch: number; passAccuracy: number; xgPerShot: number;
  conversionPercentage: number; shotAccuracyPercentage: number; pressureProxy: number;
}

export interface HubStyleMetric { label: string; rawValue: number; score: number; displayValue: string; basis: string; }
export interface HubInsight { type: string; title: string; evidence: string; action: string; confidence: string; }
export interface HubMatch {
  matchId: number; day: number; round: number; competitionId: number; competitionName: string;
  opponentId: number; opponentName: string; home: boolean; result: string; goals: number; conceded: number;
  xg: number; xga: number; possession: number; shots: number; shotsAgainst: number; shotsOnTarget: number;
  passAccuracy: number; opponentPasses: number; defensiveActions: number; controlScore: number;
}
export interface HubCompetitionSplit { competitionId: number; competitionName: string; metrics: HubMetrics; }
export interface HubUpcoming { day: number; round: number; competitionId: number; competitionName: string; opponentId: number; opponentName: string; venue: string; }
export interface DataHubIntelligence {
  teamId: number; teamName: string; season: number; confidence: string; methodologyNote: string;
  seasonMetrics: HubMetrics; recentMetrics: HubMetrics; homeMetrics: HubMetrics; awayMetrics: HubMetrics;
  styleProfile: HubStyleMetric[]; insights: HubInsight[]; matches: HubMatch[];
  competitionSplits: HubCompetitionSplit[]; upcomingFixtures: HubUpcoming[];
}
export interface HubPlayer { playerId: number; playerName: string; position: string; appearances: number; goals: number; assists: number; goalContributions: number; averageRating: number; rank: number; }
export interface DataHubWorkspace { intelligence: DataHubIntelligence; players: HubPlayer[]; }

@Injectable({ providedIn: 'root' })
export class DataHubIntelligenceService {
  constructor(private http: HttpClient) {}
  load(teamId: number, season: number): Observable<DataHubWorkspace> {
    return forkJoin({
      intelligence: this.http.get<DataHubIntelligence>(`${urlApp}/stats/team/${teamId}/season/${season}/intelligence`),
      players: this.http.get<HubPlayer[]>(`${urlApp}/stats/team/${teamId}/season/${season}?limit=8`)
    });
  }
}
