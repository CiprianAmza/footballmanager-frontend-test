import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';
import { ScoutService, AvailableScout, TeamScout, ScoutAssignment, CompletedReport, ExpiringScout } from '../services/scout.service';
import { TransferService, AvailablePlayer } from '../services/transfer.service';
import { urlApp } from '../app.component';

interface StaffRole {
  name: string;
  current: number;
  max: number;
}

interface ChartStat {
  label: string;
  value: number;
  leagueAvg: number;
  leagueBest: number;
}

interface StaffCategory {
  title: string;
  totalStaff: number;
  boardOpinion: string;
  roles: StaffRole[];
  chartData: ChartStat[];
  colorAccent: string;
}

interface CoachInfo {
  id: number;
  name: string;
  age: number;
  role: string;
  typeId: number;
  wage: number;
  contractEndSeason: number;
  coachingAttacking: number;
  coachingDefending: number;
  coachingTactical: number;
  coachingTechnical: number;
  coachingMental: number;
  coachingFitness: number;
  coachingGK: number;
  workingWithYoungsters: number;
  motivating: number;
}

@Component({
  selector: 'app-staff',
  templateUrl: './staff.component.html',
  styleUrls: ['./staff.component.css']
})
export class StaffComponent implements OnInit, OnDestroy {

  private sub = new Subscription();

  categories: StaffCategory[] = [];
  activeTab: string = 'Overview';
  tabs: string[] = ['Overview', 'Coaching Staff', 'Responsibilities', 'Scouts', 'Scout Reports', 'Staff Search'];

  // Coaching Staff
  coachingStaff: CoachInfo[] = [];
  trainingRatings: any = {};
  coachingMultiplier: number = 0;
  youthMultiplier: number = 0;
  hoydQuality: number = 0;
  availableCoaches: CoachInfo[] = [];
  showCoachHireModal: boolean = false;
  coachHireLoading: boolean = false;
  coachHireResult: string = '';
  coachHireSuccess: boolean = false;
  selectedCoach: CoachInfo | null = null;

  // Responsibilities
  attendPressConferences: boolean = true;
  viewFullMatch: boolean = false;
  watchGoalHighlights: boolean = true;
  // Match-watching granularity:
  //   NONE        — no in-match animations at all (text-only result)
  //   GOALS_ONLY  — animation pops up only when a goal is scored
  //   KEY_MOMENTS — also animates saves and misses on big chances
  // Backend keeps watchGoalHighlights in sync as a derived boolean.
  matchHighlightsLevel: 'NONE' | 'GOALS_ONLY' | 'KEY_MOMENTS' = 'GOALS_ONLY';

  // Scouts
  teamScouts: TeamScout[] = [];
  availableScouts: AvailableScout[] = [];
  activeAssignments: ScoutAssignment[] = [];
  completedReports: CompletedReport[] = [];
  expiringScouts: ExpiringScout[] = [];

  // Hire modal
  showHireModal: boolean = false;
  selectedScout: AvailableScout | null = null;
  offeredWage: number = 0;
  contractYears: number = 2;
  hireLoading: boolean = false;
  hireResultMessage: string = '';
  hireResultSuccess: boolean = false;

  // Renew modal
  showRenewModal: boolean = false;
  renewScout: ExpiringScout | null = null;
  renewWage: number = 0;
  renewYears: number = 2;
  renewLoading: boolean = false;
  renewResultMessage: string = '';
  renewResultSuccess: boolean = false;

  // Assign modal
  showAssignModal: boolean = false;
  assignScout: TeamScout | null = null;
  availablePlayers: AvailablePlayer[] = [];
  filteredPlayers: AvailablePlayer[] = [];
  playerSearchQuery: string = '';
  assignLoading: boolean = false;
  assignResultMessage: string = '';
  assignResultSuccess: boolean = false;

  // Scout sub-tab
  scoutSubTab: string = 'my-scouts';

  constructor(
    private http: HttpClient,
    public teamService: TeamService,
    private scoutService: ScoutService,
    private transferService: TransferService,
    private gameEvents: GameEventsService
  ) {}

  ngOnInit(): void {
    this.loadStaffOverview();
    this.loadResponsibilities();

    // Coaches/scouts change on hire/fire and each game advance (contracts,
    // completed reports). Scout reports live in the 'scouting' domain.
    this.sub.add(this.gameEvents.on('staff').subscribe(() => {
      this.loadStaffOverview();
      this.loadResponsibilities();
    }));
    this.sub.add(this.gameEvents.on('scouting').subscribe(() => this.loadScoutData()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  setTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'Overview') {
      this.loadStaffOverview();
    } else if (tab === 'Coaching Staff') {
      this.loadStaffOverview();
    } else if (tab === 'Scouts') {
      this.loadScoutData();
    } else if (tab === 'Scout Reports') {
      this.loadCompletedReports();
    } else if (tab === 'Staff Search') {
      this.loadAvailableScouts();
    }
  }

  loadStaffOverview(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any>(urlApp + `/staff/overview/${teamId}`).subscribe({
      next: (data) => {
        this.coachingStaff = data.staff || [];
        this.trainingRatings = data.trainingRatings || {};
        this.coachingMultiplier = data.coachingMultiplier || 0;
        this.youthMultiplier = data.youthMultiplier || 0;
        this.hoydQuality = data.hoydQuality || 0;
        this.buildOverviewFromStaff();
      },
      error: (err) => {
        console.error('Error loading staff overview:', err);
        this.buildOverviewFromStaff();
      }
    });
  }

  private buildOverviewFromStaff(): void {
    const staff = this.coachingStaff;
    const byRole: { [key: string]: CoachInfo[] } = {};
    staff.forEach(c => {
      const role = c.role || 'Coach';
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(c);
    });

    const roleMax: { [key: string]: number } = {
      'Assistant Manager': 1, 'First Team Coach': 3, 'Fitness Coach': 2,
      'Goalkeeping Coach': 1, 'Youth Coach': 2, 'Head of Youth Development': 1
    };

    const roles: StaffRole[] = Object.keys(roleMax).map(name => ({
      name,
      current: (byRole[name] || []).length,
      max: roleMax[name]
    }));

    const r = this.trainingRatings;
    const chartData: ChartStat[] = [
      { label: 'Att', value: this.starToVal(r.attacking), leagueAvg: 10, leagueBest: 16 },
      { label: 'Def', value: this.starToVal(r.defending), leagueAvg: 10, leagueBest: 16 },
      { label: 'Tac', value: this.starToVal(r.tactical), leagueAvg: 10, leagueBest: 16 },
      { label: 'Tec', value: this.starToVal(r.technical), leagueAvg: 10, leagueBest: 16 },
      { label: 'Men', value: this.starToVal(r.mental), leagueAvg: 10, leagueBest: 16 },
      { label: 'Fit', value: this.starToVal(r.fitness), leagueAvg: 10, leagueBest: 16 },
      { label: 'GK', value: this.starToVal(r.goalkeeping), leagueAvg: 10, leagueBest: 16 },
      { label: 'Yth', value: this.starToVal(r.youth), leagueAvg: 10, leagueBest: 16 }
    ];

    this.categories = [{
      title: 'COACHING TEAM',
      totalStaff: staff.length,
      boardOpinion: staff.length >= 5 ?
        "The board have no concerns about the size of the coaching team." :
        "The board feel the coaching team could be strengthened.",
      colorAccent: '#2ecc71',
      roles,
      chartData
    }];
  }

  private starToVal(star: number): number {
    return star ? Math.round(star * 4) : 5;
  }

  loadAvailableCoachesForHire(): void {
    this.http.get<any[]>(urlApp + '/staff/available').subscribe({
      next: (coaches) => this.availableCoaches = coaches.map(c => ({
        id: c.id,
        name: c.name,
        age: c.age,
        role: this.getCoachTypeName(c.typeId),
        typeId: c.typeId,
        wage: c.wage,
        contractEndSeason: c.contractEndSeason,
        coachingAttacking: c.coachingAttacking,
        coachingDefending: c.coachingDefending,
        coachingTactical: c.coachingTactical,
        coachingTechnical: c.coachingTechnical,
        coachingMental: c.coachingMental,
        coachingFitness: c.coachingFitness,
        coachingGK: c.coachingGK,
        workingWithYoungsters: c.workingWithYoungsters,
        motivating: c.motivating
      })),
      error: (err) => console.error('Error loading available coaches:', err)
    });
  }

  getCoachTypeName(typeId: number): string {
    switch (typeId) {
      case 5: return 'Assistant Manager';
      case 6: return 'First Team Coach';
      case 7: return 'Fitness Coach';
      case 8: return 'Goalkeeping Coach';
      case 9: return 'Youth Coach';
      case 10: return 'Head of Youth Development';
      default: return 'Coach';
    }
  }

  openCoachHireModal(coach: CoachInfo): void {
    this.selectedCoach = coach;
    this.coachHireResult = '';
    this.coachHireSuccess = false;
    this.showCoachHireModal = true;
  }

  closeCoachHireModal(): void {
    this.showCoachHireModal = false;
    this.selectedCoach = null;
    this.coachHireResult = '';
  }

  hireCoach(): void {
    if (!this.selectedCoach) return;
    this.coachHireLoading = true;

    this.http.post<any>(urlApp + '/staff/hire', { coachId: this.selectedCoach.id }).subscribe({
      next: (res) => {
        this.coachHireResult = res.message;
        this.coachHireSuccess = res.success;
        this.coachHireLoading = false;
        if (res.success) {
          this.loadStaffOverview();
          this.loadAvailableCoachesForHire();
          this.gameEvents.emit('staff', 'finances');
        }
      },
      error: (err) => {
        this.coachHireResult = err.error?.message || 'Failed to hire coach.';
        this.coachHireSuccess = false;
        this.coachHireLoading = false;
      }
    });
  }

  fireCoach(coach: CoachInfo): void {
    if (!confirm('Release ' + coach.name + ' (' + coach.role + ')?')) return;

    this.http.post<any>(urlApp + `/staff/fire/${coach.id}`, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.loadStaffOverview();
          this.gameEvents.emit('staff', 'finances');
        }
      },
      error: (err) => console.error('Error firing coach:', err)
    });
  }

  getCoachAvgRating(coach: CoachInfo): number {
    const sum = coach.coachingAttacking + coach.coachingDefending + coach.coachingTactical +
      coach.coachingTechnical + coach.coachingMental + coach.coachingFitness +
      coach.coachingGK + coach.workingWithYoungsters + coach.motivating;
    return Math.round(sum / 9 * 10) / 10;
  }

  setScoutSubTab(subTab: string) {
    this.scoutSubTab = subTab;
    if (subTab === 'my-scouts') this.loadTeamScouts();
    if (subTab === 'assignments') this.loadActiveAssignments();
    if (subTab === 'expiring') this.loadExpiringScouts();
  }

  // ==========================================
  // SCOUT DATA LOADING
  // ==========================================

  loadScoutData(): void {
    this.loadTeamScouts();
    this.loadActiveAssignments();
  }

  loadTeamScouts(): void {
    this.scoutService.getTeamScouts(this.teamService.teamId).subscribe({
      next: (scouts) => this.teamScouts = scouts,
      error: (err) => console.error('Error loading team scouts:', err)
    });
  }

  loadAvailableScouts(): void {
    this.scoutService.getAvailableScouts().subscribe({
      next: (scouts) => this.availableScouts = scouts,
      error: (err) => console.error('Error loading available scouts:', err)
    });
  }

  loadActiveAssignments(): void {
    this.scoutService.getActiveAssignments(this.teamService.teamId).subscribe({
      next: (assignments) => this.activeAssignments = assignments,
      error: (err) => console.error('Error loading assignments:', err)
    });
  }

  loadCompletedReports(): void {
    this.scoutService.getCompletedReports(this.teamService.teamId).subscribe({
      next: (reports) => this.completedReports = reports,
      error: (err) => console.error('Error loading reports:', err)
    });
  }

  loadExpiringScouts(): void {
    this.scoutService.getExpiringContracts(this.teamService.teamId).subscribe({
      next: (scouts) => this.expiringScouts = scouts,
      error: (err) => console.error('Error loading expiring scouts:', err)
    });
  }

  // ==========================================
  // HIRE SCOUT
  // ==========================================

  openHireModal(scout: AvailableScout): void {
    this.selectedScout = scout;
    this.offeredWage = scout.wageDemand;
    this.contractYears = 2;
    this.hireResultMessage = '';
    this.hireResultSuccess = false;
    this.showHireModal = true;
  }

  closeHireModal(): void {
    this.showHireModal = false;
    this.selectedScout = null;
    this.hireResultMessage = '';
  }

  submitHire(): void {
    if (!this.selectedScout || this.offeredWage <= 0) return;
    this.hireLoading = true;

    this.scoutService.hireScout(this.selectedScout.id, this.offeredWage, this.contractYears).subscribe({
      next: (result) => {
        this.hireResultMessage = result.message;
        this.hireResultSuccess = result.success;
        this.hireLoading = false;
        if (result.success) {
          this.loadAvailableScouts();
          this.loadTeamScouts();
        }
      },
      error: (err) => {
        this.hireResultMessage = err.error?.message || 'Error hiring scout';
        this.hireResultSuccess = false;
        this.hireLoading = false;
      }
    });
  }

  // ==========================================
  // FIRE SCOUT
  // ==========================================

  fireScout(scout: TeamScout): void {
    if (!confirm('Release ' + scout.name + '? This will cancel any active assignments.')) return;

    this.scoutService.fireScout(scout.id).subscribe({
      next: () => {
        this.loadTeamScouts();
        this.loadActiveAssignments();
      },
      error: (err) => console.error('Error firing scout:', err)
    });
  }

  // ==========================================
  // RENEW CONTRACT
  // ==========================================

  openRenewModal(scout: ExpiringScout): void {
    this.renewScout = scout;
    this.renewWage = scout.wageDemand;
    this.renewYears = 2;
    this.renewResultMessage = '';
    this.renewResultSuccess = false;
    this.showRenewModal = true;
  }

  closeRenewModal(): void {
    this.showRenewModal = false;
    this.renewScout = null;
    this.renewResultMessage = '';
  }

  submitRenew(): void {
    if (!this.renewScout || this.renewWage <= 0) return;
    this.renewLoading = true;

    this.scoutService.renewContract(this.renewScout.id, this.renewWage, this.renewYears).subscribe({
      next: (result) => {
        this.renewResultMessage = result.message;
        this.renewResultSuccess = result.success;
        this.renewLoading = false;
        if (result.success) {
          this.loadExpiringScouts();
          this.loadTeamScouts();
        }
      },
      error: (err) => {
        this.renewResultMessage = err.error?.message || 'Error renewing contract';
        this.renewResultSuccess = false;
        this.renewLoading = false;
      }
    });
  }

  // ==========================================
  // ASSIGN SCOUT TO PLAYER
  // ==========================================

  openAssignModal(scout: TeamScout): void {
    this.assignScout = scout;
    this.playerSearchQuery = '';
    this.assignResultMessage = '';
    this.assignResultSuccess = false;
    this.showAssignModal = true;

    // Load available players
    this.transferService.getAvailablePlayers(this.teamService.teamId).subscribe({
      next: (players) => {
        this.availablePlayers = players;
        this.filteredPlayers = players.slice(0, 50); // Show first 50
      },
      error: (err) => console.error('Error loading players:', err)
    });
  }

  closeAssignModal(): void {
    this.showAssignModal = false;
    this.assignScout = null;
    this.assignResultMessage = '';
  }

  filterPlayers(): void {
    const query = this.playerSearchQuery.toLowerCase();
    if (!query) {
      this.filteredPlayers = this.availablePlayers.slice(0, 50);
      return;
    }
    this.filteredPlayers = this.availablePlayers.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.teamName.toLowerCase().includes(query) ||
      p.position.toLowerCase().includes(query)
    ).slice(0, 50);
  }

  assignToPlayer(player: AvailablePlayer): void {
    if (!this.assignScout) return;
    this.assignLoading = true;

    this.scoutService.assignScout(this.assignScout.id, player.id).subscribe({
      next: (result) => {
        this.assignResultMessage = result.message;
        this.assignResultSuccess = result.success;
        this.assignLoading = false;
        if (result.success) {
          this.loadTeamScouts();
          this.loadActiveAssignments();
          setTimeout(() => this.closeAssignModal(), 2000);
        }
      },
      error: (err) => {
        this.assignResultMessage = err.error?.message || 'Error assigning scout';
        this.assignResultSuccess = false;
        this.assignLoading = false;
      }
    });
  }

  // ==========================================
  // HELPERS
  // ==========================================

  getAbilityColor(value: number): string {
    if (value >= 16) return '#2ecc71';
    if (value >= 12) return '#f1c40f';
    if (value >= 8) return '#e67e22';
    return '#e74c3c';
  }

  getAbilityBadge(value: number): string {
    if (value >= 18) return 'World Class';
    if (value >= 15) return 'Excellent';
    if (value >= 12) return 'Good';
    if (value >= 8) return 'Average';
    return 'Poor';
  }

  formatCurrency(amount: number): string {
    if (amount == null) return '-';
    if (amount >= 1_000_000) return '\u20AC' + (amount / 1_000_000).toFixed(1) + 'M';
    if (amount >= 1_000) return '\u20AC' + (amount / 1_000).toFixed(0) + 'K';
    return '\u20AC' + amount;
  }

  getLeagueNames(leagues: any[]): string {
    if (!leagues || leagues.length === 0) return 'None';
    return leagues.map((l: any) => l.name).join(', ');
  }

  // ==========================================
  // EXISTING MOCK DATA & RESPONSIBILITIES
  // ==========================================


  loadResponsibilities(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any>(urlApp + `/managers/responsibilities/${teamId}`)
      .subscribe({
        next: (data) => {
          this.attendPressConferences = data.attendPressConferences;
          this.viewFullMatch = data.viewFullMatch ?? false;
          this.watchGoalHighlights = data.watchGoalHighlights ?? true;
          this.matchHighlightsLevel = (data.matchHighlightsLevel as any) || 'GOALS_ONLY';
          // Mirror to localStorage so app.component can read the setting cheaply
          // without an HTTP round-trip every match (refreshed on Staff page load).
          localStorage.setItem('fm_matchHighlightsLevel', this.matchHighlightsLevel);
        },
        error: (err) => console.error('Error loading responsibilities:', err)
      });
  }

  toggleAutoContinue(): void {
    this.teamService.autoContinue = !this.teamService.autoContinue;
    if (!this.teamService.autoContinue) {
      this.teamService.autoContinueMatchReport = false;
    }
  }

  toggleAutoContinueMatchReport(): void {
    this.teamService.autoContinueMatchReport = !this.teamService.autoContinueMatchReport;
  }

  toggleViewFullMatch(): void {
    this.viewFullMatch = !this.viewFullMatch;
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + `/managers/responsibilities/${teamId}`, {
      viewFullMatch: this.viewFullMatch
    }).subscribe({
      next: (data) => {
        this.viewFullMatch = data.viewFullMatch;
      },
      error: (err) => console.error('Error updating responsibilities:', err)
    });
  }

  toggleWatchGoalHighlights(): void {
    this.watchGoalHighlights = !this.watchGoalHighlights;
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + `/managers/responsibilities/${teamId}`, {
      watchGoalHighlights: this.watchGoalHighlights
    }).subscribe({
      next: (data) => {
        this.watchGoalHighlights = data.watchGoalHighlights;
      },
      error: (err) => console.error('Error updating responsibilities:', err)
    });
  }

  /** Drive the radio group in the template — fires on every level change. */
  setMatchHighlightsLevel(level: 'NONE' | 'GOALS_ONLY' | 'KEY_MOMENTS'): void {
    if (this.matchHighlightsLevel === level) return;
    this.matchHighlightsLevel = level;
    localStorage.setItem('fm_matchHighlightsLevel', level);
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + `/managers/responsibilities/${teamId}`, {
      matchHighlightsLevel: level
    }).subscribe({
      next: (data) => {
        if (data.matchHighlightsLevel) {
          this.matchHighlightsLevel = data.matchHighlightsLevel;
          this.watchGoalHighlights = data.watchGoalHighlights;
          localStorage.setItem('fm_matchHighlightsLevel', this.matchHighlightsLevel);
        }
      },
      error: (err) => console.error('Error updating match highlights level:', err)
    });
  }

  togglePressConferences(): void {
    this.attendPressConferences = !this.attendPressConferences;
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + `/managers/responsibilities/${teamId}`, {
      attendPressConferences: this.attendPressConferences
    }).subscribe({
      next: (data) => {
        this.attendPressConferences = data.attendPressConferences;
      },
      error: (err) => console.error('Error updating responsibilities:', err)
    });
  }

  getBarHeight(value: number): string {
    return (value / 20 * 100) + '%';
  }

  getAvgLineHeight(avg: number): string {
    return (avg / 20 * 100) + '%';
  }
}
