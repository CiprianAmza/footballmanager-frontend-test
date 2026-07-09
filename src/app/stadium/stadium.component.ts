import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-stadium',
  templateUrl: './stadium.component.html',
  styleUrls: ['./stadium.component.css']
})
export class StadiumComponent implements OnInit, OnDestroy {

  private refreshSub?: Subscription;

  loading = true;
  teamName = '';

  // Stadium data
  stadium: any = null;
  effectiveCapacity = 0;
  revenueMultiplier = 1.0;

  // Facilities data
  facilities: any = null;

  // Available upgrades
  availableUpgrades: any[] = [];

  // Upgrades in progress
  upgradesInProgress: any[] = [];

  // Completed upgrades (for toast notifications)
  completedUpgrades: any[] = [];

  // Message after upgrade action
  upgradeMessage = '';

  constructor(private http: HttpClient, public teamService: TeamService,
              private gameEvents: GameEventsService) {}

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  ngOnInit(): void {
    this.loadTeamName();
    this.loadFacilities();

    // Reload after every game advance
    this.refreshSub = this.teamService.refresh$.subscribe(() => this.loadFacilities());
    // Instant reload when a stadium/facility change happens anywhere.
    this.refreshSub.add(this.gameEvents.on('stadium').subscribe(() => this.loadFacilities()));
  }

  loadTeamName(): void {
    const teamId = this.teamService.teamId;
    this.http.get(urlApp + `/teams/getTeamNameById/${teamId}`, { responseType: 'text' })
      .subscribe({
        next: (name) => this.teamName = name,
        error: () => {}
      });
  }

  loadFacilities(): void {
    const teamId = this.teamService.teamId;
    const previousInProgress = this.upgradesInProgress;

    this.http.get<any>(urlApp + `/game/facilities/${teamId}`).subscribe({
      next: (data) => {
        this.stadium = data.stadium;
        this.facilities = data.facilities;
        this.effectiveCapacity = data.effectiveCapacity || 0;
        this.revenueMultiplier = data.revenueMultiplier || 1.0;
        const newInProgress: any[] = data.upgradesInProgress || [];
        this.availableUpgrades = data.availableUpgrades || [];

        // Detect completed upgrades: were in progress before, gone now
        if (previousInProgress.length > 0) {
          const newTypes = new Set(newInProgress.map((u: any) => u.facilityType));
          const justCompleted = previousInProgress.filter(u => !newTypes.has(u.facilityType));
          if (justCompleted.length > 0) {
            this.completedUpgrades = justCompleted;
            // Auto-clear after 6 seconds
            setTimeout(() => this.completedUpgrades = [], 6000);
          }
        }

        this.upgradesInProgress = newInProgress;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading facilities:', err);
        this.loading = false;
      }
    });
  }

  startUpgrade(facilityType: string): void {
    const teamId = this.teamService.teamId;
    this.http.post<any>(urlApp + '/game/facilities/upgrade', { teamId, facilityType }).subscribe({
      next: (result) => {
        if (result) {
          this.upgradeMessage = this.getFacilityLabel(facilityType) + ' upgrade started!';
          this.loadFacilities();
          // Starting an upgrade spends money — refresh finances too.
          this.gameEvents.emit('stadium', 'finances');
        } else {
          this.upgradeMessage = 'Cannot start upgrade. Check funds or prerequisites.';
        }
        setTimeout(() => this.upgradeMessage = '', 4000);
      },
      error: (err) => {
        console.error('Error starting upgrade:', err);
        this.upgradeMessage = 'Failed to start upgrade.';
        setTimeout(() => this.upgradeMessage = '', 4000);
      }
    });
  }

  getUpgradeInProgress(facilityType: string): any {
    return this.upgradesInProgress.find(u => u.facilityType === facilityType);
  }

  getDaysRemaining(upgrade: any): number {
    const currentDay = this.teamService.currentDay;
    const currentSeason = this.teamService.currentSeason;

    if (upgrade.startSeason < currentSeason) {
      // Cross-season: days left from old season spill into new
      const daysInOldSeason = 365 - upgrade.startDay;
      const daysNeeded = upgrade.durationDays - daysInOldSeason;
      return Math.max(0, daysNeeded - currentDay);
    }

    const endDay = upgrade.startDay + upgrade.durationDays;
    return Math.max(0, endDay - currentDay);
  }

  getUpgradeProgress(upgrade: any): number {
    const currentDay = this.teamService.currentDay;
    const currentSeason = this.teamService.currentSeason;
    let elapsed: number;

    if (upgrade.startSeason < currentSeason) {
      const daysInOldSeason = 365 - upgrade.startDay;
      elapsed = daysInOldSeason + currentDay;
    } else {
      elapsed = currentDay - upgrade.startDay;
    }

    return Math.min(100, Math.max(0, (elapsed / upgrade.durationDays) * 100));
  }

  getFacilityLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'TRAINING_GROUND': 'Training Ground',
      'YOUTH_ACADEMY': 'Youth Academy',
      'MEDICAL_CENTER': 'Medical Center',
      'STADIUM_EXPANSION': 'Stadium Expansion',
      'VIP_BOXES': 'VIP Boxes',
      'CATERING': 'Catering Facilities',
      'FAN_SHOP': 'Fan Shop',
      'FAST_FOOD': 'Fast Food Area',
      'HEADQUARTERS': 'Club Headquarters',
      'TRAINING_PITCH': 'Training Pitch',
      'PARKING': 'Parking Area'
    };
    return labels[type] || type;
  }

  getFacilityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'TRAINING_GROUND': '\uD83C\uDFCB\uFE0F',
      'YOUTH_ACADEMY': '\uD83C\uDF31',
      'MEDICAL_CENTER': '\uD83C\uDFE5',
      'STADIUM_EXPANSION': '\uD83C\uDFDF\uFE0F',
      'VIP_BOXES': '\uD83C\uDFAB',
      'CATERING': '\uD83C\uDF7D\uFE0F',
      'FAN_SHOP': '\uD83D\uDC55',
      'FAST_FOOD': '\uD83C\uDF54',
      'HEADQUARTERS': '\uD83C\uDFE2',
      'TRAINING_PITCH': '\u26BD',
      'PARKING': '\uD83C\uDD7F\uFE0F'
    };
    return icons[type] || '\uD83C\uDFE2';
  }

  isStadiumFacility(type: string): boolean {
    return ['STADIUM_EXPANSION', 'VIP_BOXES', 'CATERING', 'FAN_SHOP', 'FAST_FOOD', 'PARKING'].includes(type);
  }

  isClubFacility(type: string): boolean {
    return ['TRAINING_GROUND', 'YOUTH_ACADEMY', 'MEDICAL_CENTER', 'HEADQUARTERS', 'TRAINING_PITCH'].includes(type);
  }

  getStadiumUpgrades(): any[] {
    return this.availableUpgrades.filter(u => this.isStadiumFacility(u.type));
  }

  getClubUpgrades(): any[] {
    return this.availableUpgrades.filter(u => this.isClubFacility(u.type));
  }

  getLevelColor(level: number): string {
    if (level >= 8) return '#2ecc71';
    if (level >= 5) return '#f1c40f';
    if (level >= 3) return '#e67e22';
    return '#e74c3c';
  }

  formatMoney(value: number): string {
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return Math.floor(value / 1_000) + 'K';
    return String(value);
  }
}
