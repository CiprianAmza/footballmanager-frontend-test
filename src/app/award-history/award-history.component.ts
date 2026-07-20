import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface AwardHistoryRow {
  season: number;
  awardType: string;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  teamColor1: string | null;
  teamColor2: string | null;
  value: string;
  votingPoints: number;
  firstPlaceVotes: number;
  averageRating: number;
  goals: number;
  assists: number;
  appearances: number;
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

interface AwardHistoryResponse {
  awardType: 'GOLDEN_BOOT' | 'BALLON_DOR';
  title: string;
  description: string;
  rule: string;
  history: AwardHistoryRow[];
}

@Component({
  selector: 'app-award-history',
  templateUrl: './award-history.component.html',
  styleUrls: ['./award-history.component.css']
})
export class AwardHistoryComponent implements OnInit {
  awardType: 'GOLDEN_BOOT' | 'BALLON_DOR' = 'GOLDEN_BOOT';
  data?: AwardHistoryResponse;
  loading = false;
  error = '';

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.data.subscribe(data => {
      this.awardType = data['awardType'] || 'GOLDEN_BOOT';
      this.loadHistory();
    });
  }

  loadHistory(): void {
    this.loading = true;
    this.error = '';
    this.http.get<AwardHistoryResponse>(`${urlApp}/awards/history/${this.awardType}`).subscribe({
      next: response => {
        this.data = response;
        this.loading = false;
      },
      error: () => {
        this.error = 'Award history could not be loaded.';
        this.loading = false;
      }
    });
  }

  trackSeason(_: number, row: AwardHistoryRow): number {
    return row.season;
  }
}
