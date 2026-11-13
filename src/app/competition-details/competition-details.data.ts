import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, from, map, mergeMap, Observable, of, switchMap, toArray } from 'rxjs';
import { resultRecords, sequences } from './match-records';
import { urlApp } from '../app.component';
import { Availability, Club, ClubManager, ClubStats, CompetitionStage, LeagueCompetitionData, LeagueInfo, LeagueMatch, PlayerStats } from '../league-competition/league-competition.data';

export type DetailsView = 'teams' | 'rules' | 'stadiums' | 'managers' | 'tickets' | 'news' | 'winners' | 'team-overview' | 'player-overview' | 'player-stats' | 'team-stats' | 'injuries' | 'suspensions' | 'referees' | 'record-results' | 'record-sequences' | 'record-clubs' | 'record-attendance' | 'record-overview' | 'round-history';
interface Participant extends Club {
  entryStage?: string;
  progress?: { currentRound?: number; currentStage?: string; stageReached?: string; statusLabel?: string };
}
interface DetailRow extends Participant {
  stadium?: string;
  capacity?: number;
  manager?: ClubManager;
  coefficient?: number;
}
export interface Winner extends Club {
  season: number;
}
export interface Details {
  info?: LeagueInfo;
  stages?: CompetitionStage[];
  roundHistory?: { club: Club; round: number; stage: string; played: number; status: string }[];
  teams?: DetailRow[];
  winners?: Winner[];
  champion?: Club | null;
  results?: LeagueMatch[];
  fixtures?: LeagueMatch[];
  clubStats?: ClubStats;
  playerStats?: PlayerStats;
  availability?: { club: Participant; rows: { playerId: number; playerName: string; label: string; remaining: number; remainingUnit: string }[] }[];
  liveOnly?: boolean;
  resultRecords?: ReturnType<typeof resultRecords>;
  sequences?: ReturnType<typeof sequences>;
  attendance?: { teamId: number; teamName: string; homeMatches: number; averageAttendance: number }[];
}

@Injectable({ providedIn: 'root' })
export class CompetitionDetailsData {
  constructor(private http: HttpClient, private competitions: LeagueCompetitionData) {}

  load(id: string, season: number, view: DetailsView): Observable<Details> {
    if (view === 'tickets' || view === 'referees') return of({});
    if (view === 'record-results' || view === 'record-sequences') {
      return this.competitions.schedule(id, season).pipe(map(matches => view === 'record-results'
        ? { resultRecords: resultRecords(matches) } : { sequences: sequences(matches) }));
    }
    if (view === 'record-attendance') return this.attendance(id, season);
    if (view === 'record-overview') {
      return forkJoin({
        matches: this.competitions.schedule(id, season),
        overview: this.competitions.overview(id, season),
        playerStats: this.competitions.playerStats(id, season),
        clubStats: this.competitions.clubStats(id, season),
        attendance: this.attendance(id, season)
      }).pipe(map(({ matches, overview, playerStats, clubStats, attendance }) => ({
        ...attendance, champion: overview.champion, resultRecords: resultRecords(matches),
        sequences: sequences(matches), playerStats, clubStats
      })));
    }
    if (view === 'round-history') {
      return forkJoin({
        matches: this.competitions.schedule(id, season),
        overview: this.competitions.overview(id, season)
      }).pipe(map(({ matches, overview }) => {
        const clubs = new Map<number, { club: Club; round: number; played: number }>();
        const stages = new Map((overview.stages || []).map(stage => [stage.round, stage.label]));
        const update = (id: number | undefined, name: string, match: LeagueMatch) => {
          if (id == null) return;
          const row = clubs.get(id) || { club: { teamId: id, teamName: name }, round: match.round, played: 0 };
          row.round = Math.max(row.round, match.round);
          if (match.score) row.played++;
          clubs.set(id, row);
        };
        for (const match of matches) {
          update(match.team1Id, match.team1Name, match);
          update(match.team2Id, match.team2Name, match);
        }
        const participants = new Map<number, Participant>((overview.teams || []).map(team => [team.teamId, team]));
        return { roundHistory: [...clubs.values()].map(row => {
          const participant = participants.get(row.club.teamId);
          const progress = participant?.progress;
          return { ...row, club: participant || row.club, stage: stages.get(row.round) || 'Round ' + row.round,
            status: progress?.currentRound === row.round ? progress?.statusLabel || '' : '' };
        }).sort((a, b) => b.round - a.round || a.club.teamName.localeCompare(b.club.teamName)) };
      }));
    }
    if (view === 'player-overview' || view === 'player-stats') {
      return this.competitions.playerStats(id, season).pipe(map(playerStats => ({ playerStats })));
    }
    if (view === 'team-stats' || view === 'team-overview' || view === 'record-clubs') {
      return this.competitions.clubStats(id, season).pipe(map(clubStats => ({ clubStats })));
    }
    if (view === 'injuries' || view === 'suspensions') {
      return this.competitions.season().pipe(switchMap(current => {
        if (season !== Number(current)) return of({ liveOnly: true });
        return this.competitions.overview(id, season).pipe(switchMap(value => from<Participant[]>(value.teams || []).pipe(
          mergeMap(club => this.http.get<Availability[]>(
            `${urlApp}/teams/availability/${club.teamId}`
          ).pipe(map(rows => ({
            club, rows: rows.filter(row => view === 'injuries' ? row.type === 'INJURY'
              : row.type === 'SUSPENSION' && row.competitionId === Number(id))
          }))), 5), toArray(),
          map(availability => ({ availability: availability.sort((a, b) =>
            b.rows.length - a.rows.length || a.club.teamName.localeCompare(b.club.teamName)) }))
        )));
      }));
    }
    if (view === 'rules') {
      return forkJoin({
        info: this.competitions.info(id),
        stages: this.competitions.stages(id, season)
      });
    }
    if (view === 'winners') {
      return this.competitions.season().pipe(switchMap(current => from(
        Array.from({ length: Number(current) }, (_, index) => Number(current) - index)
      ).pipe(mergeMap(year => this.competitions.overview(id, year).pipe(
        map(({ champion }): Winner | null => champion ? { ...champion, season: year } : null)
      ), 3), toArray(), map(rows => ({ winners: rows.filter((row): row is Winner => row != null)
        .sort((a, b) => b.season - a.season) })))));
    }
    const overview = this.competitions.overview(id, season);
    if (view === 'news') return forkJoin({ overview, matches: this.competitions.schedule(id, season) }).pipe(
      map(({ overview: value, matches }) => ({
        champion: value.champion,
        results: matches.filter(match => match.score).sort((a, b) => (b.day || 0) - (a.day || 0)).slice(0, 5),
        fixtures: matches.filter(match => !match.score).sort((a, b) => (a.day || 0) - (b.day || 0)).slice(0, 5)
      }))
    );
    if (view === 'teams') {
      return forkJoin({
        overview, info: this.competitions.info(id)
      }).pipe(switchMap(({ overview: value, info }) => {
        const teams: Participant[] = value.teams || [];
        if (info.kind !== 'MULTI_STAGE') return of({ teams });
        return this.http.get<{ teamId: number; coefficient: number }[]>(`${urlApp}/competition/getClubCoefficients`).pipe(
          map(rows => {
            const coefficients = new Map(rows.map(row => [row.teamId, row.coefficient]));
            const clubs = teams.map(team => ({ ...team, coefficient: coefficients.get(team.teamId) }));
            clubs.sort((a, b) => (b.coefficient ?? -1) - (a.coefficient ?? -1) || a.teamName.localeCompare(b.teamName));
            return { teams: clubs };
          })
        );
      }));
    }
    return overview.pipe(switchMap(value => from<Participant[]>(value.teams || []).pipe(
      mergeMap(team => this.clubDetail(team, view), 5), toArray(),
      map(teams => ({ teams: teams.sort((a, b) => a.teamName.localeCompare(b.teamName)) }))
    )));
  }

  private attendance(id: string, season: number): Observable<Pick<Details, 'attendance' | 'liveOnly'>> {
    return this.competitions.season().pipe(switchMap(current => Number(current) === season
      ? this.competitions.attendance(id).pipe(map(attendance => ({
          attendance: attendance.filter(row => row.homeMatches > 0)
            .sort((a, b) => b.averageAttendance - a.averageAttendance || a.teamName.localeCompare(b.teamName))
        })))
      : of({ liveOnly: true })));
  }

  private clubDetail(team: Participant, view: 'stadiums' | 'managers'): Observable<DetailRow> {
    if (view === 'managers') {
      return this.http.get<ClubManager>(`${urlApp}/managers/current/team/${team.teamId}`).pipe(map(manager => ({ ...team, manager })));
    }
    return this.http.get<{ stadiumName?: string; stadiumCapacity?: number }>(`${urlApp}/teams/info/${team.teamId}`).pipe(
      map(venue => ({ ...team, stadium: venue.stadiumName, capacity: venue.stadiumCapacity }))
    );
  }
}
