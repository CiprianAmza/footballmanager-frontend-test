import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { GameEventsService } from '../services/game-events.service';

// --- INTERFEȚE ---
interface CompetitionHistory {
  id: number;
  teamId: number;
  competitionId: number;
  competitionTypeId: number;
  competitionName: string;
  seasonNumber: number;
  games: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  lastPosition: number;
}

interface CompetitionStatLine {
  competitionId: number;
  competitionTypeId: number;
  competitionName: string;
  seasonNumber: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leaguePosition: number | null;
}

interface Kit {
  type: 'Home' | 'Away' | 'Third';
  primaryColor: string;
  secondaryColor: string;
  pattern: 'stripes' | 'solid' | 'sash';
}

interface Trophy {
  name: string;
  count: number;
  lastWon: number;
  level: 'Continental' | 'National' | 'Cup';
  competitionId: number;
}

interface ClubDetails {
  id: number;
  name: string;
  color1: string | null;
  color2: string | null;
  nickname: string;
  foundedYear: number;
  nation: string;
  division: string;
  status: string;
  reputation: number;
  managerName: string;
  captainName: string;
  viceCaptainName: string;
  stadiumName: string;
  capacity: number;
  surface: string;
  condition: string;
  yearBuilt: number;
  derbies: string[];
  rivals: string[];
  kits: Kit[];
  legends: string[];
  icons: string[];
  trophies: Trophy[];
  historyDescription: string;
  transferBudget: number;
  wageBudget: number;
}

interface TeamBranding {
  id: number;
  name: string;
  color1: string | null;
  color2: string | null;
}

interface CurrentManagerSummary {
  found: boolean;
  managerId?: number;
  managerName?: string;
  reputation?: number;
  retired?: boolean;
  humanControlled?: boolean;
}

@Component({
  selector: 'app-club-info',
  templateUrl: './club-info.component.html',
  styleUrls: ['./club-info.component.css']
})
export class ClubInfoComponent implements OnInit, OnDestroy {

  private sub = new Subscription();

  teamId!: number;
  club: ClubDetails | null = null;
  currentManager: CurrentManagerSummary | null = null;
  loading: boolean = true;
  currentSeason: string = '1';

  // Stadium data from backend
  stadiumData: any = null;
  stadiumEffectiveCapacity: number = 0;
  stadiumRevenueMultiplier: number = 1.0;

  // State pentru tab-ul activ
  activeTab: 'overview' | 'squad' | 'tactics' | 'matches' | 'stats' = 'overview';

  // Per-competition breakdown (GET /stats/team/{teamId}/competitionBreakdown)
  competitionBreakdown: CompetitionStatLine[] = [];

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router,
    private gameEvents: GameEventsService
  ) { }

  ngOnInit(): void {
    this.sub.add(this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']);
      // Resetam pe overview cand schimbam echipa
      this.activeTab = 'overview';
      this.loadData();
    }));
    // Stadium/facility info on the overview reacts to upgrades; the embedded
    // squad/tactics children refresh themselves via their own subscriptions.
    this.sub.add(this.gameEvents.on('stadium').subscribe(() => this.loadStadiumData()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  // --- LOGICA DE NAVIGARE ---
  
  switchTab(tab: 'overview' | 'squad' | 'tactics' | 'matches' | 'stats') {
    this.activeTab = tab;
  }

  competitionTypeLabel(typeId: number): string {
    switch (typeId) {
      case 1: return 'League';
      case 2: return 'Cup';
      case 3: return 'Second League';
      case 4: return 'League of Champions';
      case 5: return 'Stars Cup';
      default: return 'Competition';
    }
  }

  goToTransfers() {
      // Redirectionare catre pagina separata de transferuri
      this.router.navigate(['/transfers', this.teamId, this.currentSeason]);
  }

  goToHistory() {
    this.router.navigate(['/team-history', this.teamId]);
  }
  
  goToCompetition(compId: number) {
    this.router.navigate(['/comp', compId]);
  }

  goToStadium() {
    this.router.navigate(['/stadium']);
  }

  // --- DATA LOADING ---

  loadData() {
    this.loading = true;

    const seasonReq = this.http.get<any>(urlApp + "/competition/getCurrentSeason");
    const teamInfoReq = this.http.get<TeamBranding>(urlApp + `/teams/info/${this.teamId}`);
    const historyReq = this.http.get<CompetitionHistory[]>(urlApp + `/history/teamCompetitionWins/${this.teamId}`);
    const managerReq = this.http.get<CurrentManagerSummary>(urlApp + `/managers/current/team/${this.teamId}`)
      .pipe(catchError(() => of({ found: false } as CurrentManagerSummary)));

    forkJoin([seasonReq, teamInfoReq, historyReq, managerReq]).subscribe({
      next: ([seasonResp, teamInfoResp, historyResp, managerResp]) => {
        
        this.currentSeason = seasonResp.toString();
        const teamBranding: TeamBranding = {
          id: teamInfoResp?.id || this.teamId,
          name: teamInfoResp?.name || 'Unknown Club',
          color1: teamInfoResp?.color1 || null,
          color2: teamInfoResp?.color2 || null
        };
        
        const processedTrophies = this.processTrophies(historyResp);
        this.currentManager = managerResp?.found ? managerResp : null;
        this.generateMockData(teamBranding, processedTrophies,
          this.currentManager?.managerName || 'Vacant');
        this.fetchCompetitionNames(processedTrophies);

        this.loading = false;
        this.loadStadiumData();
        this.loadCompetitionBreakdown();
      },
      error: (err) => {
        console.error("Error loading club data", err);
        this.loading = false;
      }
    });
  }

  loadCompetitionBreakdown(): void {
    this.http.get<CompetitionStatLine[]>(urlApp + `/stats/team/${this.teamId}/competitionBreakdown`)
      .subscribe({
        next: (lines) => { this.competitionBreakdown = lines || []; },
        error: () => { this.competitionBreakdown = []; }
      });
  }

  loadStadiumData(): void {
    this.http.get<any>(urlApp + `/game/facilities/${this.teamId}`).subscribe({
      next: (data) => {
        this.stadiumData = data.stadium;
        this.stadiumEffectiveCapacity = data.effectiveCapacity || 0;
        this.stadiumRevenueMultiplier = data.revenueMultiplier || 1.0;
        if (this.club && this.stadiumData) {
          this.club.stadiumName = this.stadiumData.stadiumName || this.club.stadiumName;
          this.club.capacity = this.stadiumEffectiveCapacity || this.club.capacity;
        }
      },
      error: () => {}
    });
  }

  processTrophies(historyList: CompetitionHistory[]): Trophy[] {
    const trophyMap = new Map<number, Trophy>();

    historyList.forEach(record => {
      if (record.lastPosition === 1) {
        if (!trophyMap.has(record.competitionId)) {
          let levelType: 'National' | 'Cup' | 'Continental' = 'National';
          if (record.competitionTypeId === 2) levelType = 'Cup';

          trophyMap.set(record.competitionId, {
            name: record.competitionName, 
            count: 0,
            lastWon: 0,
            level: levelType,
            competitionId: record.competitionId
          });
        }
        const trophy = trophyMap.get(record.competitionId)!;
        trophy.count++;
        if (record.seasonNumber > trophy.lastWon) {
          trophy.lastWon = record.seasonNumber;
        }
      }
    });
    return Array.from(trophyMap.values());
  }

  fetchCompetitionNames(trophies: Trophy[]) {
    trophies.forEach(t => {
      this.http.get(urlApp + `/competition/getCompetitionName/${t.competitionId}`, { responseType: 'text' })
        .subscribe({
          next: (name) => { if (name) t.name = name; },
          error: () => { }
        });
    });
  }

  // --- MOCK DATA & HELPERS ---

  generateMockData(team: TeamBranding, realTrophies: Trophy[], managerName: string) {
    const primaryColor = team.color1 || '#2d6cdf';
    const secondaryColor = team.color2 || '#f5f7ff';
    this.club = {
      id: this.teamId,
      name: team.name,
      color1: team.color1,
      color2: team.color2,
      nickname: "The Team", 
      foundedYear: 1905,   
      nation: "England",    
      division: "Premier League",
      status: "Professional",
      reputation: 4, 
      managerName,
      captainName: "Club Captain", 
      viceCaptainName: "Vice Captain", 
      stadiumName: team.name + " Stadium",
      capacity: 30000,
      surface: "Grass",
      condition: "Good",
      yearBuilt: 1995,
      derbies: ["City Rivals"],
      rivals: ["Old Enemy"],
      kits: [
        { type: 'Home', primaryColor, secondaryColor, pattern: 'solid' },
        { type: 'Away', primaryColor: secondaryColor, secondaryColor: primaryColor, pattern: 'stripes' },
        { type: 'Third', primaryColor: '#e74c3c', secondaryColor: '#2c3e50', pattern: 'sash' }
      ],
      legends: ["Legend 1", "Legend 2"],
      icons: ["Icon 1"],
      historyDescription: `${team.name} has a long and proud history...`,
      trophies: realTrophies, 
      transferBudget: 10000000,
      wageBudget: 500000
    };
  }

  getReputationStars(count: number): string {
    return "⭐".repeat(count);
  }
}
