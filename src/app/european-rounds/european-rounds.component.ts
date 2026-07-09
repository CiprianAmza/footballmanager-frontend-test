import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface MatchResult {
  team1Id: number;
  team2Id: number;
  teamName1: string;
  teamName2: string;
  score: string;
  roundId: number;
  competitionId: number;
  seasonNumber: number;
}

interface GroupStanding {
  teamId: number;
  teamName: string;
  groupNumber: number;
  potNumber: number;
  games: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

@Component({
  selector: 'app-european-rounds',
  templateUrl: './european-rounds.component.html',
  styleUrls: ['./european-rounds.component.css']
})
export class EuropeanRoundsComponent implements OnInit {

  competitionId!: number;
  season!: number;
  competitionName: string = '';
  maxSeason: number = 1;
  typeId: number = 0;
  totalRounds: number = 0;
  groupRounds: number = 0;
  qualifyingRounds: number = 0;

  // Group stage data
  groups: Map<number, GroupStanding[]> = new Map();
  groupNumbers: number[] = [];

  // All match results by round
  rounds: Map<number, MatchResult[]> = new Map();
  roundNumbers: number[] = [];

  selectedRound: number = 1;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.competitionId = Number(params['competitionId']);
      this.season = Number(params['season']) || this.teamService.currentSeason;
      this.loadData();
    });
    this.http.get<string>(urlApp + '/competition/getCurrentSeason', { responseType: 'text' as 'json' })
      .subscribe(s => this.maxSeason = Number(s));
  }

  loadData(): void {
    // Load competition name
    this.http.get(urlApp + `/competition/getCompetitionName/${this.competitionId}`, { responseType: 'text' })
      .subscribe(name => this.competitionName = name);

    // Load round info for correct labels
    this.http.get<any>(urlApp + `/competition/getCupRoundCount/${this.competitionId}`)
      .subscribe(info => {
        this.typeId = info.typeId || 0;
        this.totalRounds = info.totalRounds || 0;
        this.groupRounds = info.groupRounds || 0;
        this.qualifyingRounds = info.qualifyingRounds || 0;
      });

    // Load group standings (only relevant for LoC, but safe to call for any)
    this.http.get<GroupStanding[]>(urlApp + `/competition/getEuropeanGroups/${this.competitionId}/${this.season}`)
      .subscribe(data => {
        this.groups = new Map();
        data.forEach(s => {
          if (!this.groups.has(s.groupNumber)) {
            this.groups.set(s.groupNumber, []);
          }
          this.groups.get(s.groupNumber)!.push(s);
        });
        this.groups.forEach((standings) => {
          standings.sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
            return b.goalsFor - a.goalsFor;
          });
        });
        this.groupNumbers = Array.from(this.groups.keys()).sort();
      });

    // Load all match results for this competition and season
    this.http.get<MatchResult[]>(urlApp + `/competition/getMatchesByCompetitionAndSeason/${this.competitionId}/${this.season}`)
      .subscribe(data => {
        this.rounds = new Map();
        data.forEach(m => {
          if (!this.rounds.has(m.roundId)) {
            this.rounds.set(m.roundId, []);
          }
          this.rounds.get(m.roundId)!.push(m);
        });
        this.roundNumbers = Array.from(this.rounds.keys()).sort((a, b) => a - b);
        if (this.roundNumbers.length > 0) {
          this.selectedRound = this.roundNumbers[0];
        }
      });
  }

  selectRound(r: number): void {
    this.selectedRound = r;
  }

  getRoundLabel(r: number): string {
    // LoC (typeId 4)
    if (this.typeId === 4) {
      if (r === 0) return 'Preliminary Round';
      if (r === 1) return 'Qualifying Round';
      if (r >= 2 && r <= 7) return 'Matchday ' + (r - 1);
      if (r === 8) return 'Quarter-Final';
      if (r === 9) return 'Semi-Final';
      if (r === 10) return 'Final';
      return 'Round ' + r;
    }

    // Stars Cup (typeId 5) - group stage + knockout
    if (this.typeId === 5) {
      if (r >= 1 && r <= 6) return 'Matchday ' + r;
      if (r === 7) return 'Playoff Round';
      if (r === 8) return 'Quarter-Final';
      if (r === 9) return 'Semi-Final';
      if (r === 10) return 'Final';
      return 'Round ' + r;
    }

    // Generic knockout
    if (this.totalRounds > 0) {
      const fromEnd = this.totalRounds - r + 1;
      if (fromEnd === 1) return 'Final';
      if (fromEnd === 2) return 'Semi-Final';
      if (fromEnd === 3) return 'Quarter-Final';
      if (fromEnd === 4) return 'Round of 16';
      return 'Round ' + r;
    }

    return 'Round ' + r;
  }

  changeSeason(delta: number): void {
    const newSeason = this.season + delta;
    if (newSeason >= 1 && newSeason <= this.maxSeason) {
      this.season = newSeason;
      this.loadData();
    }
  }

  getMatchesForRound(): MatchResult[] {
    return this.rounds.get(this.selectedRound) || [];
  }

  getPotLabel(potNumber: number): string {
    if (potNumber > 0) return 'P' + potNumber;
    return '';
  }
}
