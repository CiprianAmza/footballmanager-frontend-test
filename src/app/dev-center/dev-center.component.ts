import { Component, OnInit } from '@angular/core';

interface LoanPlayer {
  id: number;
  name: string;
  position: string;
  age: number;
  loanTeam: string;
  loanLeague: string;
  loanExpires: string;
  
  // Stats
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
  
  // Visuals
  statusIcons: string[]; // ex: ['Wnt', 'Inj']
  progressHistory: number[]; // Array pt grafic (ex: [6.5, 7.0, 6.8, 7.5])
}

@Component({
  selector: 'app-dev-center',
  templateUrl: './dev-center.component.html',
  styleUrls: ['./dev-center.component.css']
})
export class DevCenterComponent implements OnInit {

  activeTab: string = 'Loans';
  tabs: string[] = ['Overview', 'Loans', 'Under 23s', 'Under 18s', 'Youth Candidates', 'Staff'];

  loanPlayers: LoanPlayer[] = [];

  constructor() { }

  ngOnInit(): void {
    this.loadMockData();
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  loadMockData() {
    this.loanPlayers = [
      {
        id: 1, name: "Theo Stenumgaard", position: "ST", age: 19,
        loanTeam: "Nice", loanLeague: "Ligue 1", loanExpires: "30/6/2025",
        apps: 4, goals: 0, assists: 2, avgRating: 7.45,
        statusIcons: [],
        progressHistory: [7.0, 7.2, 7.1, 7.4, 7.5, 7.45]
      },
      {
        id: 2, name: "Gino Holsing", position: "MC", age: 20,
        loanTeam: "Stuttgart", loanLeague: "Bundesliga", loanExpires: "1/7/2025",
        apps: 16, goals: 3, assists: 1, avgRating: 7.15,
        statusIcons: [],
        progressHistory: [6.8, 6.9, 7.0, 7.2, 7.1, 7.15]
      },
      {
        id: 3, name: "Giulio Iannini", position: "AMR", age: 21,
        loanTeam: "PSV", loanLeague: "Eredivisie", loanExpires: "1/7/2025",
        apps: 34, goals: 10, assists: 4, avgRating: 7.12,
        statusIcons: ['Lst'], // Listed
        progressHistory: [7.5, 7.4, 7.2, 7.0, 7.1, 7.12]
      },
      {
        id: 4, name: "Anthony Menza", position: "DC", age: 18,
        loanTeam: "Hellas Verona", loanLeague: "Serie A", loanExpires: "30/6/2025",
        apps: 7, goals: 1, assists: 2, avgRating: 7.09,
        statusIcons: ['Wnt'], // Wanted
        progressHistory: [6.5, 6.8, 7.2, 7.5, 6.9, 7.09]
      },
      {
        id: 5, name: "Michal Visek", position: "GK", age: 22,
        loanTeam: "Newcastle", loanLeague: "Premier League", loanExpires: "30/6/2025",
        apps: 6, goals: 0, assists: 0, avgRating: 7.07,
        statusIcons: ['Unr'], // Unrest
        progressHistory: [7.0, 7.0, 7.1, 7.0, 7.2, 7.07]
      },
      {
        id: 6, name: "Patrick Roberts", position: "AML", age: 20,
        loanTeam: "Padova", loanLeague: "Serie C", loanExpires: "1/7/2025",
        apps: 25, goals: 2, assists: 0, avgRating: 7.02,
        statusIcons: ['nEU'], // Non-EU
        progressHistory: [6.5, 6.6, 6.7, 6.9, 7.0, 7.02]
      },
      {
        id: 7, name: "Giuseppe Casonato", position: "DM", age: 19,
        loanTeam: "Bournemouth", loanLeague: "Championship", loanExpires: "1/7/2025",
        apps: 24, goals: 0, assists: 0, avgRating: 6.91,
        statusIcons: ['Inj'], // Injured
        progressHistory: [7.0, 6.9, 6.8, 6.9, 6.8, 6.91]
      }
    ];
  }

  // 🔹 Helper pentru a desena linia SVG (Sparkline)
  getSparklinePath(history: number[]): string {
    if (!history || history.length < 2) return '';
    
    const width = 80;  // Lățimea SVG
    const height = 20; // Înălțimea SVG
    const minVal = 6.0; // Nota minimă pe axa Y
    const maxVal = 8.0; // Nota maximă pe axa Y
    
    const stepX = width / (history.length - 1);
    
    let path = '';
    history.forEach((val, index) => {
      const x = index * stepX;
      // Normalizăm valoarea între 0 și height (inversat pt SVG unde 0 e sus)
      const y = height - ((val - minVal) / (maxVal - minVal) * height);
      
      if (index === 0) path += `M ${x},${y} `;
      else path += `L ${x},${y} `;
    });
    
    return path;
  }

  // Helper pt culoarea tag-urilor
  getStatusColor(tag: string): string {
    switch(tag) {
      case 'Inj': return '#e74c3c'; // Rosu
      case 'Wnt': return '#27ae60'; // Verde
      case 'Lst': return '#f1c40f'; // Galben
      case 'Unr': return '#e67e22'; // Portocaliu
      case 'nEU': return '#3498db'; // Albastru
      default: return '#95a5a6';
    }
  }

  // Helper pt culoarea notei
  getRatingColor(rating: number): string {
    if (rating >= 7.5) return '#2ecc71'; // Verde aprins
    if (rating >= 7.0) return '#27ae60'; // Verde inchis
    if (rating >= 6.8) return '#f1c40f'; // Galben
    return '#95a5a6'; // Gri
  }
}