import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-compare',
  templateUrl: './compare.component.html',
  styleUrls: ['./compare.component.css']
})
export class CompareComponent implements OnInit {

  player1: any = null;
  player2: any = null;
  loading: boolean = false;

  // Search
  searchQuery1: string = '';
  searchQuery2: string = '';
  searchResults1: any[] = [];
  searchResults2: any[] = [];
  allPlayers: any[] = [];
  playersLoaded: boolean = false;

  selectedId1: number | null = null;
  selectedId2: number | null = null;

  Math = Math;

  // Enhanced stats from /stats/compare
  enhancedData: any = null;
  activeCompareTab: string = 'overview';

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.loadAllPlayers();
    this.route.params.subscribe(params => {
      if (params['id1'] && params['id2']) {
        this.selectedId1 = +params['id1'];
        this.selectedId2 = +params['id2'];
        this.loadComparison();
      }
    });
  }

  loadAllPlayers(): void {
    this.http.get<any[]>(urlApp + '/humans/allPlayers').subscribe(data => {
      this.allPlayers = data;
      this.playersLoaded = true;
    });
  }

  searchPlayer1(): void {
    if (this.searchQuery1.length < 2) { this.searchResults1 = []; return; }
    const q = this.searchQuery1.toLowerCase();
    this.searchResults1 = this.allPlayers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10);
  }

  searchPlayer2(): void {
    if (this.searchQuery2.length < 2) { this.searchResults2 = []; return; }
    const q = this.searchQuery2.toLowerCase();
    this.searchResults2 = this.allPlayers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10);
  }

  selectPlayer1(player: any): void {
    this.selectedId1 = player.id;
    this.searchQuery1 = player.name;
    this.searchResults1 = [];
    if (this.selectedId2) this.loadComparison();
  }

  selectPlayer2(player: any): void {
    this.selectedId2 = player.id;
    this.searchQuery2 = player.name;
    this.searchResults2 = [];
    if (this.selectedId1) this.loadComparison();
  }

  loadComparison(): void {
    if (!this.selectedId1 || !this.selectedId2) return;
    this.loading = true;
    this.enhancedData = null;

    // Load enhanced stats from /stats/compare
    this.http.get<any>(urlApp + `/stats/compare/${this.selectedId1}/${this.selectedId2}`).subscribe({
      next: (data) => {
        this.enhancedData = data;
        this.player1 = data.player1;
        this.player2 = data.player2;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  setCompareTab(tab: string) {
    this.activeCompareTab = tab;
  }

  getStatComparison(val1: number, val2: number): string {
    if (val1 > val2) return 'better';
    if (val1 < val2) return 'worse';
    return 'equal';
  }

  getInverseComparison(val1: number, val2: number): string {
    if (val1 < val2) return 'better';
    if (val1 > val2) return 'worse';
    return 'equal';
  }

  getBarWidth(val: number, max: number): number {
    if (max <= 0) return 0;
    return Math.min(100, (val / max) * 100);
  }

  getCompetitionTypes(): string[] {
    if (!this.player1?.byCompetitionType || !this.player2?.byCompetitionType) return [];
    const types = new Set<string>();
    Object.keys(this.player1.byCompetitionType).forEach(k => types.add(k));
    Object.keys(this.player2.byCompetitionType).forEach(k => types.add(k));
    return Array.from(types);
  }

  getCompTypeStat(player: any, type: string, stat: string): number {
    if (!player?.byCompetitionType?.[type]) return 0;
    return player.byCompetitionType[type][stat] || 0;
  }

  getAllSeasons(): number[] {
    const seasons = new Set<number>();
    (this.player1?.seasons || []).forEach((s: any) => seasons.add(s.season));
    (this.player2?.seasons || []).forEach((s: any) => seasons.add(s.season));
    return Array.from(seasons).sort((a, b) => a - b);
  }

  getSeasonStat(player: any, season: number, stat: string): number {
    const s = (player?.seasons || []).find((ss: any) => ss.season === season);
    return s ? (s[stat] || 0) : 0;
  }

  getRatingColor(rating: number): string {
    if (rating >= 80) return '#2ecc71';
    if (rating >= 70) return '#8bc34a';
    if (rating >= 60) return '#f1c40f';
    return '#e74c3c';
  }
}
