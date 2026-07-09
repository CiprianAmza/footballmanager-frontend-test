import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-all-time-champions',
  templateUrl: './all-time-champions.component.html',
  styleUrls: ['./all-time-champions.component.css']
})
export class AllTimeChampionsComponent implements OnInit {

  champions: any[] = [];
  loading: boolean = true;
  expandedTeamId: number | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<any[]>(urlApp + '/stats/allTimeChampions').subscribe({
      next: (data) => {
        this.champions = data;
        this.loading = false;
      },
      error: () => {
        this.champions = [];
        this.loading = false;
      }
    });
  }

  toggleExpand(teamId: number) {
    this.expandedTeamId = this.expandedTeamId === teamId ? null : teamId;
  }

  getCompTypeLabel(typeId: number): string {
    switch (typeId) {
      case 1: return 'League';
      case 2: return 'Cup';
      case 3: return 'League 2';
      case 4: return 'LoC';
      case 5: return 'Stars Cup';
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
      default: return '';
    }
  }

  getMedalClass(index: number): string {
    if (index === 0) return 'gold';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    return '';
  }
}
