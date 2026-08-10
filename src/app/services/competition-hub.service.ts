import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface CompetitionDisplayMetadata {
  kind: 'LEAGUE' | 'KNOCKOUT' | 'MULTI_STAGE' | 'SHOWCASE';
  categoryLabel: string;
  scopeLabel: 'Domestic' | 'Continental';
  formatLabel: string;
  tierLabel: string | null;
  nationName: string;
  nationFlagCode: string;
  shortCode: string;
  description: string;
}

export interface TeamCompetition extends CompetitionDisplayMetadata {
  competitionId: number;
  name: string;
  typeId: number;
  tier: number;
  games?: number;
  wins?: number;
  draws?: number;
  loses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  points?: number;
  form?: string;
  position?: number;
  totalTeams?: number;
  status?: string;
  statusLabel?: string;
  entryStage?: string;
  currentStage?: string;
  stageReached?: string;
  nextMatch?: {
    round: number;
    stage: string;
    day?: number;
    date?: string;
    legNumber?: number;
    opponentTeamId: number;
    opponentTeamName: string;
    venue: 'HOME' | 'AWAY';
  };
  elimination?: {
    stage: string;
    byTeamName?: string;
    byTeamId?: number;
    score?: string;
    date?: string;
  };
}

export interface WorldCompetition extends CompetitionDisplayMetadata {
  competitionId: number;
  name: string;
  nationId: number;
  typeId: number;
  tier: number;
  participantCount: number;
  currentRound: number;
  currentStage: string;
  stageCount: number;
  completedMatches: number;
  knownFixtures: number;
  progressPercent: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  statusLabel: string;
  goalsPerMatch: number;
  leader?: { teamId: number; teamName: string; color1: string; color2: string };
  titleHolder?: { teamId: number; teamName: string; color1: string; color2: string };
  titleHolderSeason?: number;
}

export interface WorldCompetitionOverview {
  season: number;
  totalCompetitions: number;
  domesticCompetitions: number;
  continentalCompetitions: number;
  activeCompetitions: number;
  participantPlaces: number;
  competitions: WorldCompetition[];
}

@Injectable({ providedIn: 'root' })
export class CompetitionHubService {
  constructor(private http: HttpClient) {}

  teamCompetitions(teamId: number): Observable<{ teamName: string; competitions: TeamCompetition[] }> {
    return forkJoin({
      team: this.http.get<any>(`${urlApp}/teams/info/${teamId}`),
      competitions: this.http.get<TeamCompetition[]>(`${urlApp}/competition/getTeamCompetitions/${teamId}`)
    }).pipe(map(({ team, competitions }) => ({ teamName: team?.name || 'Your club', competitions: competitions || [] })));
  }

  worldOverview(): Observable<WorldCompetitionOverview> {
    return this.http.get<WorldCompetitionOverview>(`${urlApp}/competition/catalogOverview`);
  }
}
