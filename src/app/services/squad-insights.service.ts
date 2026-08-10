import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface PlayerPersonalityProfile {
  personalityLabel: string;
  professionalism: number;
  ambition: number;
  loyalty: number;
  adaptability: number;
  pressureHandling: number;
  consistency: number;
  leadership: number;
  lifestyle: string;
  hobbies: string[];
  preferredTrainingStyle: string;
  preferredCoachingApproach: string;
  mediaStyle: string;
  careerGoal: string;
  personalSituation: string;
}

export interface SquadInsightPlayer {
  id: number;
  name: string;
  position: string;
  age: number;
  rating: number;
  currentAbility: number;
  potentialAbility: number;
  fitness: number;
  morale: number;
  readiness: number;
  transferValue: number;
  wage: number;
  contractEndSeason: number;
  agreedPlayingTime: string;
  appearances: number;
  goals: number;
  assists: number;
  consecutiveBenched: number;
  wantsTransfer: boolean;
  willNeverLeave: boolean;
  individualTrainingFocus: string | null;
  individualTrainingAttribute: string | null;
  individualTrainingRole: string | null;
  profile: PlayerPersonalityProfile;
  transferRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  transferRiskScore: number;
  destinationPreference: string;
  desiredTeamId: number | null;
  desiredTeamName: string | null;
  concern: string;
  nextAction: string;
  availability: any[];
  face: any;
}

export interface SquadInsightOverview {
  teamId: number;
  teamName: string;
  season: number;
  players: SquadInsightPlayer[];
}

@Injectable({ providedIn: 'root' })
export class SquadInsightsService {
  constructor(private http: HttpClient) {}

  load(teamId: number): Observable<SquadInsightOverview> {
    return forkJoin({
      overview: this.http.get<SquadInsightOverview>(`${urlApp}/squad-insights/${teamId}`),
      faces: this.http.get<any[]>(`${urlApp}/tactic/getPlayers/${teamId}`),
      availability: this.http.get<any[]>(`${urlApp}/teams/availability/${teamId}`)
    }).pipe(map(({ overview, faces, availability }) => {
      const facesById = new Map((faces || []).map(player => [Number(player.id), player]));
      const reasonsById = new Map<number, any[]>();
      (availability || []).forEach(reason => {
        const id = Number(reason.playerId);
        reasonsById.set(id, [...(reasonsById.get(id) || []), reason]);
      });
      return {
        ...overview,
        players: overview.players.map(player => ({
          ...player,
          availability: reasonsById.get(Number(player.id)) || [],
          face: facesById.get(Number(player.id)) || {}
        }))
      };
    }));
  }
}
