import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

interface CountryCoefficient {
  leagueId: number;
  leagueName: string;
  coefficient: number;
  rank: number;
  locSpots: number;
  locEntry: string;
  starsCupSpots: number;
  perSeason: { [key: number]: number };
}

interface ClubCoefficient {
  teamId: number;
  teamName: string;
  leagueName: string;
  coefficient: number;
  rank: number;
  perSeason: { [key: number]: number };
}

@Component({
  selector: 'app-coefficients',
  templateUrl: './coefficients.component.html',
  styleUrls: ['./coefficients.component.css']
})
export class CoefficientsComponent implements OnInit {

  activeTab: 'country' | 'club' = 'country';

  countries: CountryCoefficient[] = [];
  clubs: ClubCoefficient[] = [];

  seasonKeys: number[] = [];

  // Dynamic summary from backend
  locSummary: any = {};
  scSummary: any = {};
  locPoints: { [key: string]: string } = {};
  scPoints: { [key: string]: string } = {};

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadCountryCoefficients();
    this.loadClubCoefficients();
    this.loadEuropeanSummary();
  }

  loadCountryCoefficients(): void {
    this.http.get<CountryCoefficient[]>(urlApp + '/competition/getCountryCoefficients').subscribe(
      (data) => {
        this.countries = data;
        if (data.length > 0 && data[0].perSeason) {
          this.seasonKeys = Object.keys(data[0].perSeason).map(Number).sort((a, b) => a - b);
        }
      },
      (error) => console.error('Error loading country coefficients:', error)
    );
  }

  loadClubCoefficients(): void {
    this.http.get<ClubCoefficient[]>(urlApp + '/competition/getClubCoefficients').subscribe(
      (data) => { this.clubs = data; },
      (error) => console.error('Error loading club coefficients:', error)
    );
  }

  loadEuropeanSummary(): void {
    this.http.get<any>(urlApp + '/competition/getEuropeanSummary').subscribe(
      (data) => {
        this.locSummary = data.loc || {};
        this.scSummary = data.starsCup || {};
        this.locPoints = data.locPoints || {};
        this.scPoints = data.starsCupPoints || {};
      },
      (error) => console.error('Error loading European summary:', error)
    );
  }

  getPointsEntries(points: { [key: string]: string }): { key: string; value: string }[] {
    return Object.entries(points).map(([key, value]) => ({ key, value }));
  }

  getSeasonValue(perSeason: { [key: number]: number }, season: number): string {
    const val = perSeason?.[season];
    if (val === undefined || val === 0) return '-';
    return val.toFixed(1);
  }
}
