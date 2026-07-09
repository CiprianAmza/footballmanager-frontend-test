import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

interface Player {
  id: number;
  name: string;
  age: number;
  position: string;
  rating: number;
  // Putem adăuga proprietăți calculate local
  leadershipTier?: string; 
  personality?: string; // Mock
}

@Component({
  selector: 'app-dynamics',
  templateUrl: './dynamics.component.html',
  styleUrls: ['./dynamics.component.css']
})
export class DynamicsComponent implements OnInit {

  teamId!: number;
  players: Player[] = [];
  
  // Categorii Ierarhice
  teamLeaders: Player[] = [];
  highlyInfluential: Player[] = [];
  influential: Player[] = [];
  otherPlayers: Player[] = [];

  // Mock Data pentru Manager
  managerName: string = "You (Manager)"; 

  constructor(private route: ActivatedRoute, private http: HttpClient, private teamService: TeamService) {}

  ngOnInit(): void {
    this.teamId = this.teamService.teamId;
    this.loadPlayers();
  }

  loadPlayers() {
    this.http.get<Player[]>(urlApp + `/tactic/getPlayers/${this.teamId}`).subscribe(
      (data) => {
        this.players = data;
        this.processHierarchy();
      },
      (error) => console.error('Error loading players:', error)
    );
  }

  // Algoritm simplu de determinare a ierarhiei (Mock Logic)
  processHierarchy() {
    // Sortăm după Rating (și vârstă ca tie-breaker)
    // În realitate, Leadership-ul depinde de vechime, personalitate etc.
    const sortedPlayers = [...this.players].sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.age - a.age;
    });

    // Împărțim lotul
    // Top 3 -> Team Leaders
    this.teamLeaders = sortedPlayers.slice(0, 3).map(p => ({...p, personality: 'Perfectionist'}));
    
    // Următorii 5 -> Highly Influential
    this.highlyInfluential = sortedPlayers.slice(3, 8).map(p => ({...p, personality: 'Professional'}));

    // Următorii 8 -> Influential
    this.influential = sortedPlayers.slice(8, 16).map(p => ({...p, personality: 'Determined'}));

    // Restul -> Other Players
    this.otherPlayers = sortedPlayers.slice(16).map(p => ({...p, personality: 'Balanced'}));
  }
}