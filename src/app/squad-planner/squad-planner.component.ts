import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TeamService } from '../services/team.service';
import { urlApp } from '../app.component';

interface PlannerPlayer {
  id: number;
  name: string;
  age: number;
  position: string;
  role: string;
  playingTime: string;
  contractExpires: string;
  transferValue: string;
  ability: number; // 1-5 stars (mapped from currentAbility 1-200)
  potential: number;
  notes?: string[];
}

interface TacticPosition {
  code: string;
  name: string;
  top: string;
  left: string;
}

@Component({
  selector: 'app-squad-planner',
  templateUrl: './squad-planner.component.html',
  styleUrls: ['./squad-planner.component.css']
})
export class SquadPlannerComponent implements OnInit {

  // State
  currentSeason: string = '';
  activeTab: string = 'current';
  selectedPosCode: string = 'ST';
  selectedPosName: string = 'Striker (Center)';

  // Formation 4-2-3-1 Wide
  formation: TacticPosition[] = [
    { code: 'GK', name: 'Goalkeeper', top: '85%', left: '50%' },
    { code: 'DL', name: 'Left Back', top: '65%', left: '15%' },
    { code: 'DCL', name: 'Center Back (Left)', top: '75%', left: '35%' },
    { code: 'DCR', name: 'Center Back (Right)', top: '75%', left: '65%' },
    { code: 'DR', name: 'Right Back', top: '65%', left: '85%' },
    { code: 'MCL', name: 'Midfielder (Center)', top: '50%', left: '35%' },
    { code: 'MCR', name: 'Midfielder (Center)', top: '50%', left: '65%' },
    { code: 'AML', name: 'Winger (Left)', top: '30%', left: '15%' },
    { code: 'AMC', name: 'Attacking Mid (Center)', top: '30%', left: '50%' },
    { code: 'AMR', name: 'Winger (Right)', top: '30%', left: '85%' },
    { code: 'ST', name: 'Striker', top: '12%', left: '50%' }
  ];

  // Player lists populated from API
  allPlayers: PlannerPlayer[] = [];
  displayList: PlannerPlayer[] = [];

  constructor(private http: HttpClient, private teamService: TeamService) { }

  ngOnInit(): void {
    this.teamService.currentSeason$.subscribe(season => {
      this.currentSeason = `${season}/${season + 1}`;
    });
    this.loadSquad();
  }

  loadSquad(): void {
    const teamId = this.teamService.teamId;
    this.http.get<any[]>(`${urlApp}/teams/allPlayers/${teamId}`).subscribe({
      next: (players) => {
        this.allPlayers = players.map(p => this.mapPlayer(p));
        this.filterPlayers();
      },
      error: (err) => console.error('Error loading squad:', err)
    });
  }

  private mapPlayer(p: any): PlannerPlayer {
    // Map currentAbility (1-200 scale) to 1-5 star rating
    const abilityStars = Math.round((p.currentAbility / 200) * 5 * 2) / 2; // half-star increments
    const potentialStars = Math.round((p.potentialAbility / 200) * 5 * 2) / 2;

    // Format contract end date
    let contractExpires = 'N/A';
    if (p.contractEndDate) {
      const d = new Date(p.contractEndDate);
      contractExpires = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }

    // Format transfer value
    const transferValue = this.formatTransferValue(p.transferValue);

    // Build notes based on status
    const notes: string[] = [];
    if (p.currentStatus && p.currentStatus !== 'Available') {
      notes.push(p.currentStatus.substring(0, 3));
    }

    // Map position to match formation codes (normalize backend positions)
    const position = this.normalizePosition(p.position);

    return {
      id: p.id,
      name: p.name,
      age: p.age,
      position: position,
      role: p.position || 'Unknown', // Show original position as role
      playingTime: p.agreedPlayingTime || 'Not Set',
      contractExpires: contractExpires,
      transferValue: transferValue,
      ability: Math.max(0.5, abilityStars),
      potential: Math.max(0.5, potentialStars),
      notes: notes.length > 0 ? notes : undefined
    };
  }

  private formatTransferValue(value: number): string {
    if (!value || value === 0) return 'N/A';
    if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `€${(value / 1000).toFixed(0)}K`;
    return `€${value}`;
  }

  private normalizePosition(pos: string): string {
    if (!pos) return 'Unknown';
    // Map common position names to formation codes
    const posMap: { [key: string]: string } = {
      'Goalkeeper': 'GK', 'GK': 'GK',
      'Left Back': 'DL', 'DL': 'DL', 'LB': 'DL',
      'Right Back': 'DR', 'DR': 'DR', 'RB': 'DR',
      'Center Back': 'DCL', 'CB': 'DCL', 'DC': 'DCL', 'DCL': 'DCL', 'DCR': 'DCR',
      'Left Wing Back': 'DL', 'Right Wing Back': 'DR',
      'Defensive Midfielder': 'MCL', 'DM': 'MCL', 'DMC': 'MCL',
      'Central Midfielder': 'MCL', 'CM': 'MCL', 'MC': 'MCL', 'MCL': 'MCL', 'MCR': 'MCR',
      'Left Midfielder': 'AML', 'LM': 'AML', 'ML': 'AML',
      'Right Midfielder': 'AMR', 'RM': 'AMR', 'MR': 'AMR',
      'Attacking Midfielder': 'AMC', 'AM': 'AMC', 'AMC': 'AMC', 'CAM': 'AMC',
      'Left Winger': 'AML', 'AML': 'AML', 'LW': 'AML',
      'Right Winger': 'AMR', 'AMR': 'AMR', 'RW': 'AMR',
      'Striker': 'ST', 'ST': 'ST', 'CF': 'ST', 'Forward': 'ST'
    };
    return posMap[pos] || pos;
  }

  selectPosition(pos: TacticPosition) {
    this.selectedPosCode = pos.code;
    this.selectedPosName = pos.name;
    this.filterPlayers();
  }

  filterPlayers() {
    // Match players to selected position, also match related positions
    // (e.g., DCL and DCR are both center backs)
    const relatedPositions = this.getRelatedPositions(this.selectedPosCode);
    this.displayList = this.allPlayers.filter(p => relatedPositions.includes(p.position));

    // Sort by ability descending (1st choice at top)
    this.displayList.sort((a, b) => b.ability - a.ability);
  }

  private getRelatedPositions(code: string): string[] {
    // Group related formation codes so both DCL/DCR show all center backs, etc.
    const groups: string[][] = [
      ['DCL', 'DCR'],
      ['MCL', 'MCR'],
    ];
    for (const group of groups) {
      if (group.includes(code)) {
        return group;
      }
    }
    return [code];
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  // Helper for star display (array for ngFor)
  getStars(rating: number): string[] {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;
    const stars = Array(fullStars).fill('full');
    if (halfStar) stars.push('half');
    return stars;
  }
}