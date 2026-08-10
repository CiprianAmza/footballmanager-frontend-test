import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';
import { MatchPhaseData } from '../models/live-match.model';

export interface PhaseLabPlayer {
  id: number;
  name: string;
  role: string;
  teamId: number;
  shirtNumber: number;
  goalkeeper: boolean;
}

export interface PhasePreview {
  strategy: string;
  scenario: string;
  outcome: string;
  seed: number;
  predictedRating: number;
  phase: MatchPhaseData | null;
  players: PhaseLabPlayer[];
  homeTeamId: number;
  awayTeamId: number;
}

export interface ScenarioStat {
  name: string;
  ratings: number;
  avgRating: number;
  status: 'EXPLORING' | 'TRIAL' | 'KEPT' | 'DROPPED';
}

export interface PhaseCatalog {
  strategies: { name: string; scenarios: ScenarioStat[] }[];
  outcomes: string[];
  totalCombos: number;
  totalRatings: number;
}

/** Phase Lab backend: scenario catalog, deterministic generation, the taste
 *  agent's next proposal, and rating submission. */
@Injectable({ providedIn: 'root' })
export class PhaseLabService {

  private readonly base = `${urlApp}/api/dev/phaselab`;

  constructor(private http: HttpClient) {}

  catalog(): Observable<PhaseCatalog> {
    return this.http.get<PhaseCatalog>(`${this.base}/catalog`);
  }

  next(): Observable<PhasePreview> {
    return this.http.get<PhasePreview>(`${this.base}/next`);
  }

  generate(strategy: string, scenario: string, outcome: string, seed: number): Observable<PhasePreview> {
    return this.http.get<PhasePreview>(`${this.base}/generate`, {
      params: { strategy, scenario, outcome, seed }
    });
  }

  rate(preview: PhasePreview, rating: number): Observable<ScenarioStat> {
    return this.http.post<ScenarioStat>(`${this.base}/rate`, {
      strategy: preview.strategy,
      scenario: preview.scenario,
      outcome: preview.outcome,
      seed: preview.seed,
      rating
    });
  }
}
