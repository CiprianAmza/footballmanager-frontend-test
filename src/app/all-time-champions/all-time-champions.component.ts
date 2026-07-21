import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

type ChampionsView = 'clubs' | 'competitions';
type CompetitionSort = 'name' | 'editions' | 'type';

interface ChampionTitle {
  season: number;
  competitionId: number;
  competitionName: string;
  competitionTypeId: number;
}

interface ChampionTeam {
  teamId: number;
  teamName: string;
  totalTitles: number;
  leagueTitles: number;
  cupTitles: number;
  secondLeagueTitles: number;
  locTitles: number;
  starsCupTitles: number;
  superCupTitles: number;
  titles: ChampionTitle[];
}

interface PastWinner {
  season: number;
  teamId: number;
  teamName: string;
}

interface CompetitionWinnerRanking {
  teamId: number;
  teamName: string;
  titles: number;
  latestSeason: number;
}

interface CompetitionChampionsHistory {
  key: string;
  competitionId: number | null;
  competitionName: string;
  competitionTypeId: number;
  pastWinners: PastWinner[];
  winnerRanking: CompetitionWinnerRanking[];
}

@Component({
  selector: 'app-all-time-champions',
  templateUrl: './all-time-champions.component.html',
  styleUrls: ['./all-time-champions.component.css']
})
export class AllTimeChampionsComponent implements OnInit {

  champions: ChampionTeam[] = [];
  competitions: CompetitionChampionsHistory[] = [];
  loading = true;
  error = '';
  expandedTeamId: number | null = null;
  view: ChampionsView = 'clubs';
  competitionSort: CompetitionSort = 'name';
  selectedCompetitionKey: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadChampions();
  }

  loadChampions(): void {
    this.loading = true;
    this.error = '';
    this.http.get<ChampionTeam[]>(urlApp + '/stats/allTimeChampions').subscribe({
      next: (data) => {
        this.champions = (data || []).map(team => ({
          ...team,
          superCupTitles: team.superCupTitles || 0,
          titles: team.titles || []
        }));
        this.buildCompetitionHistory();
        this.loading = false;
      },
      error: () => {
        this.champions = [];
        this.competitions = [];
        this.error = 'The title history could not be loaded.';
        this.loading = false;
      }
    });
  }

  setView(view: ChampionsView): void {
    this.view = view;
  }

  toggleExpand(teamId: number): void {
    this.expandedTeamId = this.expandedTeamId === teamId ? null : teamId;
  }

  selectCompetition(key: string): void {
    this.selectedCompetitionKey = key;
  }

  get sortedCompetitions(): CompetitionChampionsHistory[] {
    return [...this.competitions].sort((left, right) => {
      if (this.competitionSort === 'editions') {
        return right.pastWinners.length - left.pastWinners.length
          || left.competitionName.localeCompare(right.competitionName);
      }
      if (this.competitionSort === 'type') {
        return left.competitionTypeId - right.competitionTypeId
          || left.competitionName.localeCompare(right.competitionName);
      }
      return left.competitionName.localeCompare(right.competitionName);
    });
  }

  get selectedCompetition(): CompetitionChampionsHistory | undefined {
    return this.competitions.find(competition => competition.key === this.selectedCompetitionKey)
      || this.sortedCompetitions[0];
  }

  getCompTypeLabel(typeId: number): string {
    switch (typeId) {
      case 1: return 'League';
      case 2: return 'Cup';
      case 3: return 'League 2';
      case 4: return 'League of Champions';
      case 5: return 'Stars Cup';
      case 6: return 'Super Cup';
      default: return 'Other';
    }
  }

  getCompTypeClass(typeId: number): string {
    switch (typeId) {
      case 1: return 'type-league';
      case 2: return 'type-cup';
      case 3: return 'type-league2';
      case 4: return 'type-loc';
      case 5: return 'type-sc';
      case 6: return 'type-super-cup';
      default: return '';
    }
  }

  getMedalClass(index: number): string {
    if (index === 0) return 'gold';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    return '';
  }

  trackCompetition(_: number, competition: CompetitionChampionsHistory): string {
    return competition.key;
  }

  trackWinner(_: number, winner: PastWinner): string {
    return `${winner.season}:${winner.teamId}`;
  }

  private buildCompetitionHistory(): void {
    const grouped = new Map<string, CompetitionChampionsHistory>();
    const seen = new Set<string>();

    for (const team of this.champions) {
      for (const title of team.titles) {
        const competitionId = Number(title.competitionId) || null;
        const key = competitionId != null
          ? String(competitionId)
          : `legacy:${title.competitionTypeId}:${title.competitionName}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            key,
            competitionId,
            competitionName: title.competitionName,
            competitionTypeId: title.competitionTypeId,
            pastWinners: [],
            winnerRanking: []
          });
        }

        const uniqueWinnerKey = `${key}:${title.season}:${team.teamId}`;
        if (seen.has(uniqueWinnerKey)) continue;
        seen.add(uniqueWinnerKey);
        grouped.get(key)!.pastWinners.push({
          season: title.season,
          teamId: team.teamId,
          teamName: team.teamName
        });
      }
    }

    this.competitions = Array.from(grouped.values()).map(competition => {
      competition.pastWinners.sort((left, right) => right.season - left.season);
      const byTeam = new Map<number, CompetitionWinnerRanking>();
      for (const winner of competition.pastWinners) {
        const current = byTeam.get(winner.teamId);
        if (current) {
          current.titles++;
          current.latestSeason = Math.max(current.latestSeason, winner.season);
        } else {
          byTeam.set(winner.teamId, {
            teamId: winner.teamId,
            teamName: winner.teamName,
            titles: 1,
            latestSeason: winner.season
          });
        }
      }
      competition.winnerRanking = Array.from(byTeam.values()).sort((left, right) =>
        right.titles - left.titles
        || right.latestSeason - left.latestSeason
        || left.teamName.localeCompare(right.teamName));
      return competition;
    });

    const firstCompetition = this.sortedCompetitions[0];
    if (!this.selectedCompetitionKey && firstCompetition) {
      this.selectedCompetitionKey = firstCompetition.key;
    }
  }
}
