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

interface DrawTeam {
  teamId: number;
  teamName: string;
  coefficient: number;
  reputation: number;
}

interface DrawPot {
  potNumber: number;
  label: string;
  teams: DrawTeam[];
}

interface DrawPairing {
  team1: DrawTeam;
  team2: DrawTeam;
  twoLeg: boolean;
}

interface DrawGroup {
  groupNumber: number;
  teams: DrawTeam[];
}

interface EuropeanDraw {
  matchday: number;
  round: number;
  stageLabel: string;
  drawDay: number;
  drawDate: string;
  matchDay: number;
  matchDate: string;
  daysUntilDraw: number;
  status: 'POTS_PUBLISHED' | 'WAITING_FOR_TEAMS' | 'DRAW_COMPLETED';
  statusLabel: string;
  knownTeams: number;
  expectedTeams: number;
  pots: DrawPot[];
  pairings: DrawPairing[];
  groups: DrawGroup[];
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
  stageLabels: Map<number, string> = new Map();
  draws: EuropeanDraw[] = [];
  selectedDrawMatchday: number | null = null;

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
        this.stageLabels = new Map((info.stages || []).map((stage: any) => [Number(stage.round), stage.label]));
      });

    this.http.get<EuropeanDraw[]>(urlApp + `/competition/europeanDraws/${this.competitionId}/${this.season}`)
      .subscribe(data => {
        this.draws = data || [];
        const nextDraw = this.draws.find(draw => draw.status !== 'DRAW_COMPLETED');
        const fallback = this.draws.length > 0 ? this.draws[this.draws.length - 1] : null;
        this.selectedDrawMatchday = (nextDraw || fallback)?.matchday ?? null;
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
    return this.stageLabels.get(r) || `Round ${r}`;
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

  get selectedDraw(): EuropeanDraw | null {
    return this.draws.find(draw => draw.matchday === this.selectedDrawMatchday) || null;
  }

  selectDraw(matchday: number): void {
    this.selectedDrawMatchday = Number(matchday);
  }

  drawStatusClass(status: EuropeanDraw['status']): string {
    return status.toLowerCase().replace(/_/g, '-');
  }

}
