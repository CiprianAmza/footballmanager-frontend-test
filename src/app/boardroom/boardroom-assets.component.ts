import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

interface Asset { id: number; type: string; name: string; value: number; clubTeamId: number; }
interface Shareholding {
  teamId: number; teamName: string; percent: number; pricePerPercent: number; isOwner: boolean;
}
interface WealthData {
  humanId: number; name: string; wealth: number; managerReputation: number;
  careerEarnings: number; assets: Asset[]; shareholdings: Shareholding[]; ownedClubs: any[];
}
interface TeamOption { id: number; name: string; }

@Component({
  selector: 'app-boardroom-assets',
  templateUrl: './boardroom-assets.component.html',
  styleUrls: ['./boardroom.component.css']
})
export class BoardroomAssetsComponent implements OnInit {

  humanId!: number;
  data?: WealthData;
  teams: TeamOption[] = [];
  loading = true;
  error = '';
  message = '';

  // buy personal asset form
  newAssetType = 'HOUSE';
  newAssetName = '';
  newAssetValue = 0;

  // shares form
  shareTeamId?: number;
  sharePercent = 5;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.humanId = Number(this.route.snapshot.paramMap.get('humanId'));
    this.http.get<TeamOption[]>(urlApp + '/teams/all').subscribe({ next: t => this.teams = t || [] });
    this.load();
  }

  load(): void {
    this.loading = true;
    this.http.get<WealthData>(urlApp + `/boardroom/wealth/${this.humanId}`).subscribe({
      next: (d) => { this.data = d; this.loading = false; },
      error: () => { this.error = 'Failed to load.'; this.loading = false; }
    });
  }

  get houses(): Asset[] { return (this.data?.assets || []).filter(a => a.type === 'HOUSE'); }
  get cars(): Asset[] { return (this.data?.assets || []).filter(a => a.type === 'CAR'); }

  buyAsset(): void {
    this.message = '';
    const body = { humanId: this.humanId, type: this.newAssetType, name: this.newAssetName, value: this.newAssetValue };
    this.http.post<any>(urlApp + '/boardroom/assets/buy', body).subscribe({
      next: (r) => { this.handle(r, 'Asset purchased.'); this.newAssetName = ''; this.newAssetValue = 0; },
      error: (e) => this.fail(e)
    });
  }

  sellAsset(assetId: number): void {
    this.message = '';
    this.http.post<any>(urlApp + '/boardroom/assets/sell', { humanId: this.humanId, assetId }).subscribe({
      next: (r) => this.handle(r, 'Asset sold.'),
      error: (e) => this.fail(e)
    });
  }

  buyShares(): void {
    this.message = '';
    if (!this.shareTeamId) { this.message = 'Pick a club.'; return; }
    const body = { humanId: this.humanId, teamId: this.shareTeamId, percent: this.sharePercent };
    this.http.post<any>(urlApp + '/boardroom/shares/buy', body).subscribe({
      next: (r) => this.handle(r, 'Shares bought.'),
      error: (e) => this.fail(e)
    });
  }

  sellShares(teamId: number, percent: number): void {
    this.message = '';
    this.http.post<any>(urlApp + '/boardroom/shares/sell', { humanId: this.humanId, teamId, percent }).subscribe({
      next: (r) => this.handle(r, 'Shares sold.'),
      error: (e) => this.fail(e)
    });
  }

  private handle(r: any, ok: string): void {
    if (r && r.success === false) { this.message = r.message || 'Action failed.'; return; }
    this.message = ok;
    this.load();
  }

  private fail(e: any): void {
    this.message = e?.error?.message || 'Action failed.';
  }

  money(v: number): string {
    if (v == null) return '-';
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
    return '$' + v;
  }
}
