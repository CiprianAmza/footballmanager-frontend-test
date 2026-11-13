import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, from, map, mergeMap, Observable, of, switchMap, toArray } from 'rxjs';
import { urlApp } from '../app.component';
import { CompetitionDisplayMetadata } from '../services/competition-hub.service';
import { LegacyRecordsData } from '../competition-records/competition-records.component';
import { TransferService } from '../services/transfer.service';

export interface LeagueInfo extends Partial<CompetitionDisplayMetadata> {
  name: string;
  typeId: number;
  tier: number;
}

export function isLeague(info: Pick<LeagueInfo, 'kind' | 'typeId'>): boolean {
  return info.kind ? info.kind === 'LEAGUE' : info.typeId === 1 || info.typeId === 3;
}

export interface Club {
  teamId: number;
  teamName: string;
  color1?: string;
  color2?: string;
}

interface StandingResponse extends Omit<Club, 'teamName'> {
  name: string;
  position: number;
  humanTeam?: boolean;
  games: string;
  wins: string;
  draws: string;
  loses: string;
  goalsFor: string;
  goalsAgainst: string;
  goalDifference: string;
  points: string;
  form?: string;
}

export interface Standing extends StandingResponse {
  teamName: string;
  recentForm: string[];
}

export interface LeagueQualification {
  locSpots: number;
  starsCupSpots: number;
  hasLowerTier: boolean;
  relegationFrom: number | null;
  qualifications: { teamId: number; route: 'LOC' | 'STARS_CUP' }[];
}

export interface MatchSummary {
  goals?: { playerId: number; playerName: string; minute: number; teamName: string }[];
  manOfTheMatchPlayerId: number;
  manOfTheMatchName: string;
  manOfTheMatchRating: number;
}

export interface LeagueMatch {
  round: number;
  day?: number;
  date?: string | null;
  team1Id?: number;
  team2Id?: number;
  team1Name: string;
  team2Name: string;
  score: string | null;
}

interface MatchResult {
  roundId: number;
  day: number;
  team1Id: number;
  team2Id: number;
  teamName1: string;
  teamName2: string;
  score: string;
}

interface Prediction extends Club {
  mediaPrediction: number;
  titleOdds?: number;
  topElevenRating: number;
  reputation: number;
  squadValue: number;
  monthlyPayroll: number;
  landscapeDataSource: 'HISTORICAL_SNAPSHOT' | 'LIVE';
}

export interface CompetitionStage {
  round: number;
  label: string;
  phase?: string;
  twoLeg?: boolean;
}

export interface LeagueOverview {
  champion: Club | null;
  teams: Prediction[];
  stages: CompetitionStage[];
}

export interface Leader extends Club {
  playerId?: number;
  playerName?: string;
  position?: string;
  goals?: number;
  assists?: number;
  matches?: number;
  avgRating?: number;
  cleanSheets?: number;
  yellowCards?: number;
  redCards?: number;
  totalCards?: number;
}

export const LEADER_CATEGORIES = [
  { key: 'topScorers', label: 'Goals', metric: 'goals' },
  { key: 'topAssisters', label: 'Assists', metric: 'assists' },
  { key: 'topRated', label: 'Average rating', metric: 'avgRating' },
  { key: 'cleanSheets', label: 'Club clean sheets', metric: 'cleanSheets' },
  { key: 'disciplinary', label: 'Cards', metric: 'totalCards' }
] as const;

export type LeaderCategory = typeof LEADER_CATEGORIES[number];
export type PlayerStats = Partial<Record<LeaderCategory['key'], Leader[]>>;

export interface ClubStats {
  matchesPlayed: number;
  categories: Record<string, (Club & { value: number; unit: string })[]>;
}

export interface LineupPlayer {
  playerId: number;
  name: string;
  label: string;
  cell: number;
  rating: number;
  club?: string;
  teamId?: number;
  color1?: string;
  color2?: string;
}

export interface LineupProfile {
  id: number;
  name: string;
  teamId: number;
  teamName: string;
  position: string;
  age: number;
  transferValue: number;
  nationName?: string;
  nationId?: number;
  baseFaceId: number;
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  eyeColor: number;
  faceShape: number;
  noseShape: number;
  eyeShape: number;
  mouthShape: number;
  browShape: number;
  species?: string;
}

interface ClubLineupResponse {
  teamName: string;
  managerTactic: Tactic;
  bestPossibleTactic: Tactic;
}

interface Tactic {
  tactic: string;
  formationDataList: { positionIndex: number; playerId: number; role?: string }[];
}

export interface Podium {
  seasonNumber: number;
  teamPlace1: string;
  teamPlace2: string;
  teamPlace3: string;
}

export interface TransferRumour {
  playerId: number;
  playerName: string;
  club: Club | null;
  contenders: Club[];
}

export interface ManagerSeason {
  managerId: number;
  managerName: string;
  gamesPlayed: number;
}

export interface ClubManager {
  found: boolean;
  managerId?: number;
  managerName?: string;
}

export interface Availability {
  playerId: number;
  playerName: string;
  type: 'INJURY' | 'SUSPENSION';
  competitionId?: number;
  label: string;
  remaining: number;
  remainingUnit: string;
}

export interface LeagueTransfer {
  playerId: number;
  playerName: string;
  fromId: number;
  fromName: string;
  toId: number;
  toName: string;
  fee: number;
  kind: 'Transfer' | 'Loan';
}

@Injectable({ providedIn: 'root' })
export class LeagueCompetitionData {
  constructor(private http: HttpClient, private transferService: TransferService) {}

  info(id: string) {
    return this.http.get<LeagueInfo>(`${urlApp}/competition/getCompetitionInfo/${id}`);
  }

  season() {
    return this.http.get<number>(`${urlApp}/competition/getCurrentSeason`);
  }

  standings(id: string, season: number, currentSeason: number) {
    const path = season === currentSeason ? `getTeams/${id}` : `historical/getTeams/${season}/${id}`;
    return this.http.get<StandingResponse[]>(`${urlApp}/competition/${path}`).pipe(
      map(rows => [...rows].sort((a, b) => a.position && b.position ? a.position - b.position
        : Number(b.points) - Number(a.points) || Number(b.goalDifference) - Number(a.goalDifference)
          || Number(b.goalsFor) - Number(a.goalsFor))
        .map((team, index): Standing => ({
          ...team, teamName: team.name, position: index + 1,
          recentForm: (team.form || '').replace(/[^WDL]/g, '').slice(-5).split('')
        })))
    );
  }

  qualification(id: string, season: number) {
    return this.http.get<LeagueQualification>(`${urlApp}/competition/leagueQualification/${id}/${season}`);
  }

  overview(id: string, season: number) {
    return this.http.get<LeagueOverview>(`${urlApp}/competition/${id}/${season}/overview`);
  }

  results(id: string, season: number) {
    return this.http.get<MatchResult[]>(`${urlApp}/competition/getMatchesByCompetitionAndSeason/${id}/${season}`).pipe(
      map(rows => rows.filter(row => row.score && row.score !== '-').map((row): LeagueMatch => ({
        round: row.roundId, day: row.day, team1Id: row.team1Id, team2Id: row.team2Id,
        team1Name: row.teamName1, team2Name: row.teamName2, score: row.score
      })))
    );
  }

  playerStats(id: string, season: number) {
    return this.http.get<PlayerStats>(`${urlApp}/stats/competition/${id}/${season}`);
  }

  clubStats(id: string, season: number) {
    return this.http.get<ClubStats>(`${urlApp}/stats/championshipStats/${id}/${season}`);
  }

  managers(clubs$: Observable<Standing[]>) {
    return this.forClubs(clubs$, club => this.http.get<ClubManager>(
      `${urlApp}/managers/current/team/${club.teamId}`
    ).pipe(map(manager => ({ club, manager }))));
  }

  managerHistory(season: number, clubs$: Observable<Standing[]>) {
    return this.forClubs(clubs$, club => this.http.get<{ records: (ManagerSeason & { seasonNumber: number })[] }[]>(
      `${urlApp}/managers/teamHistory/${club.teamId}`
    ).pipe(map(rows => ({
      club, managers: rows.flatMap(row => row.records).filter(row => row.seasonNumber === season)
    }))));
  }

  stages(id: string, season: number) {
    return this.http.get<CompetitionStage[]>(`${urlApp}/competition/${id}/${season}/stages`);
  }

  matchSummary(id: string, season: number, round: number, home: number, away: number) {
    return this.http.get<MatchSummary>(`${urlApp}/match/summary/${id}/${season}/${round}/${home}/${away}`);
  }

  schedule(id: string, season: number) {
    return this.http.get<LeagueMatch[]>(`${urlApp}/competition/${id}/${season}/schedule`);
  }

  leagueBestXi(id: string) {
    const cells: Record<string, number> = {
      GK: 27, DL: 20, 'DC-L': 21, 'DC-R': 23, DR: 24, ML: 10,
      'MC-L': 11, 'MC-R': 13, MR: 14, 'ST-L': 1, 'ST-R': 3
    };
    return this.http.get<{ formation: string; players: {
      slot: string; slotPosition: string; playerId: number; playerName: string;
      positionRating: number; teamId: number; teamName: string; teamColor1?: string; teamColor2?: string;
    }[] }>(`${urlApp}/overview/league-best-xi/${id}`).pipe(map(data => ({
      formation: data.formation,
      players: data.players.map((player): LineupPlayer => ({
        playerId: player.playerId, name: player.playerName, label: player.slotPosition,
        rating: player.positionRating, club: player.teamName, teamId: player.teamId,
        color1: player.teamColor1, color2: player.teamColor2, cell: cells[player.slot]
      }))
    })));
  }

  venues(clubs$: ReturnType<LeagueCompetitionData['standings']>) {
    return this.forClubs(clubs$, club => this.http.get<{ stadiumName?: string; stadiumCapacity?: number }>(
      `${urlApp}/teams/info/${club.teamId}`
    ).pipe(map(team => ({ ...club, stadium: team.stadiumName, capacity: team.stadiumCapacity }))));
  }

  availability(clubs$: ReturnType<LeagueCompetitionData['standings']>) {
    return this.forClubs(clubs$, club => this.http.get<Availability[]>(
      `${urlApp}/teams/availability/${club.teamId}`
    ).pipe(map(rows => ({ club, rows }))));
  }

  rumours(id: string) {
    return this.http.get<TransferRumour[]>(`${urlApp}/humans/transfer-rumours/${id}`);
  }

  sponsorships(season: number, clubs$: Observable<Standing[]>) {
    return this.forClubs(clubs$, club => this.http.get<{ breakdown: Record<string, number> }>(
      `${urlApp}/teams/finances/report/${club.teamId}/${season}`
    ).pipe(map(report => ({ club, revenue: report.breakdown?.['SPONSORSHIP'] ?? 0 })))).pipe(
      map(rows => rows.sort((a, b) => b.revenue - a.revenue))
    );
  }

  transferWindow() {
    return this.http.get<boolean>(`${urlApp}/competition/isTransferWindowOpen`);
  }

  attendance(id: string) {
    return this.http.get<import('../services/competition-hub.service').CompetitionEconomyDetail>(
      `${urlApp}/stats/competition-economy-ranking/${id}`
    ).pipe(map(data => [...data.clubs].sort((a, b) => b.averageAttendance - a.averageAttendance)));
  }

  history(id: string) {
    return this.http.get<Podium[]>(`${urlApp}/history/top3Finishers/${id}`).pipe(
      map(rows => [...rows].sort((a, b) => b.seasonNumber - a.seasonNumber))
    );
  }

  records(id: string, season: number) {
    return this.http.get<LegacyRecordsData>(`${urlApp}/stats/records/competition/${id}?season=${season}&limit=10`);
  }

  playerProfile(playerId: number) {
    return this.http.get<LineupProfile>(`${urlApp}/humans/${playerId}`);
  }

  clubLineups(teamId: number) {
    return forkJoin({
      tactics: this.http.get<ClubLineupResponse>(`${urlApp}/tactic/teamView/${teamId}`),
      squad: this.http.get<{ id: number; name: string; position: string; rating: number }[]>(
        `${urlApp}/tactic/getPlayers/${teamId}`
      ),
      club: this.http.get<{ color1?: string; color2?: string }>(`${urlApp}/teams/info/${teamId}`)
    }).pipe(map(({ tactics, squad, club }) => {
      const players = new Map(squad.map(player => [player.id, player]));
      const lineup = (tactic: Tactic) => ({
        formation: tactic.tactic?.replace(/^\d+$/, value => value.split('').join('-')),
        players: tactic.formationDataList.filter(slot => slot.positionIndex < 30 && slot.playerId > 0)
          .map((slot): LineupPlayer => {
            const player = players.get(slot.playerId);
            return {
              playerId: slot.playerId, name: player?.name || 'Player', label: slot.role || player?.position || '',
              cell: slot.positionIndex, rating: player?.rating ?? 0,
              club: tactics.teamName, teamId, color1: club.color1, color2: club.color2
            };
          })
      });
      return { name: tactics.teamName, best: lineup(tactics.bestPossibleTactic), manager: lineup(tactics.managerTactic) };
    }));
  }

  transfers(season: number, clubs$: ReturnType<LeagueCompetitionData['standings']>) {
    return clubs$.pipe(
      switchMap(clubs => {
        if (!clubs.length) return of({ clubs, rows: [] as LeagueTransfer[] });
        return from(clubs).pipe(
          mergeMap(club => forkJoin({
            bought: this.transferService.getBoughtPlayers(club.teamId, season),
            sold: this.transferService.getSoldPlayers(club.teamId, season),
            loans: this.transferService.getLoanHistory(club.teamId, season)
          }), 5),
          toArray(),
          map(data => {
            const moves = new Map<string, LeagueTransfer>();
            for (const { bought, sold, loans } of data) {
              for (const row of [...bought, ...sold]) {
                moves.set(`transfer-${row.id}`, {
                  playerId: row.playerId, playerName: row.playerName,
                  fromId: row.sellTeamId, fromName: row.sellTeamName,
                  toId: row.buyTeamId, toName: row.buyTeamName,
                  fee: row.playerTransferValue, kind: 'Transfer'
                });
              }
              for (const row of [...loans.loansIn, ...loans.loansOut]) {
                moves.set(`loan-${row.id}`, {
                  playerId: row.playerId, playerName: row.playerName,
                  fromId: row.parentTeamId, fromName: row.parentTeamName,
                  toId: row.loanTeamId, toName: row.loanTeamName,
                  fee: row.loanFee, kind: 'Loan'
                });
              }
            }
            return { clubs, rows: [...moves.values()].sort((a, b) => b.fee - a.fee ||
              (a.playerName || '').localeCompare(b.playerName || '')) };
          })
        );
      })
    );
  }

  private forClubs<T>(clubs$: ReturnType<LeagueCompetitionData['standings']>,
                      request: (club: Standing) => Observable<T>) {
    return clubs$.pipe(switchMap(clubs => from(clubs).pipe(mergeMap(request, 5), toArray())));
  }

}
