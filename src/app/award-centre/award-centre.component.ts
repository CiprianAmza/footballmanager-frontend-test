import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { urlApp } from '../app.component';

interface AwardWinner {
  awardType: string;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  teamColor1: string | null;
  teamColor2: string | null;
  value: string;
  selectionSlot?: string;
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
  species: string;
}

interface AwardSection {
  awardType: string;
  title: string;
  description: string;
  winners: AwardWinner[];
}

interface AwardSeason {
  season: number;
  awards: AwardSection[];
}

interface AwardCentreResponse {
  scopeType: 'GLOBAL' | 'COMPETITION';
  scopeId: number;
  scopeName: string;
  currentSeason: number;
  seasons: AwardSeason[];
  awardDefinitions: AwardSection[];
}

@Component({
  selector: 'app-award-centre',
  templateUrl: './award-centre.component.html',
  styleUrls: ['./award-centre.component.css']
})
export class AwardCentreComponent implements OnInit {
  data?: AwardCentreResponse;
  selectedSeason?: number;
  loading = false;
  error = '';
  private global = false;
  private competitionId?: number;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    combineLatest([this.route.data, this.route.paramMap]).subscribe(([data, params]) => {
      this.global = !!data['global'];
      this.competitionId = Number(params.get('competitionId')) || undefined;
      this.load();
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const endpoint = this.global
      ? `${urlApp}/awards/centre/global`
      : `${urlApp}/awards/centre/competition/${this.competitionId}`;
    this.http.get<AwardCentreResponse>(endpoint).subscribe({
      next: response => {
        this.data = response;
        this.selectedSeason = response.seasons[0]?.season;
        this.loading = false;
      },
      error: () => {
        this.error = 'Awards could not be loaded.';
        this.loading = false;
      }
    });
  }

  get visibleSeason(): AwardSeason | undefined {
    return this.data?.seasons.find(season => season.season === this.selectedSeason);
  }

  isTeamOfYear(award: AwardSection): boolean {
    return award.awardType === 'TEAM_OF_YEAR';
  }

  isManager(award: AwardSection): boolean {
    return award.awardType === 'MANAGER_OF_YEAR';
  }

  icon(type: string): string {
    switch (type) {
      case 'BALLON_DOR': return '◆';
      case 'PLAYER_OF_YEAR': return '★';
      case 'TEAM_OF_YEAR': return 'XI';
      case 'GOLDEN_BOOT': return '🥾';
      case 'MOST_ASSISTS': return 'A';
      case 'BEST_GOALKEEPER': return '🧤';
      case 'MOST_ENTERTAINING': return '✨';
      case 'MANAGER_OF_YEAR': return 'M';
      default: return '★';
    }
  }

  position(slot: string | undefined): { left: string; top: string } {
    const positions: { [key: string]: [number, number] } = {
      GK: [50, 89], LB: [13, 68], CB1: [38, 74], CB2: [62, 74], RB: [87, 68],
      CM1: [34, 49], CM2: [66, 49], LW: [14, 27], AM: [50, 31], RW: [86, 27], ST: [50, 11]
    };
    const value = positions[slot || ''] || [50, 50];
    return { left: `${value[0]}%`, top: `${value[1]}%` };
  }
}
