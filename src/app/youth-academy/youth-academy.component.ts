import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

interface YouthPlayer {
  id: number;
  name: string;
  age: number;
  position: string;
  currentAbility: number;
  potential: number;
  potentialStars: number;
}

@Component({
  selector: 'app-youth-academy',
  templateUrl: './youth-academy.component.html',
  styleUrls: ['./youth-academy.component.css']
})
export class YouthAcademyComponent implements OnInit, OnDestroy {

  youthPlayers: YouthPlayer[] = [];
  loading: boolean = true;
  message: string = '';
  messageType: string = '';

  private sub = new Subscription();

  constructor(private http: HttpClient, private teamService: TeamService,
              private gameEvents: GameEventsService) {}

  ngOnInit(): void {
    this.loadYouthPlayers();
    // New intake / promotions happen on game advance.
    this.sub.add(this.gameEvents.on('youth').subscribe(() => this.loadYouthPlayers()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  loadYouthPlayers(): void {
    this.loading = true;
    const teamId = this.teamService.teamId;
    this.http.get<any[]>(urlApp + `/game/youthAcademy/${teamId}`).subscribe({
      next: (data) => {
        this.youthPlayers = (data || []).map(p => ({
          ...p,
          potentialStars: p.potentialStars || this.calculateStars(p.potential)
        }));
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading youth players:', err);
        this.youthPlayers = [];
        this.loading = false;
      }
    });
  }

  promotePlayer(playerId: number): void {
    this.http.post<any>(urlApp + `/game/youthAcademy/promote/${playerId}`, {}).subscribe({
      next: () => {
        this.message = 'Player promoted to first team!';
        this.messageType = 'success';
        this.youthPlayers = this.youthPlayers.filter(p => p.id !== playerId);
        // Promotion adds the player to the senior squad.
        this.gameEvents.emit('squad', 'youth');
        setTimeout(() => this.message = '', 3000);
      },
      error: (err) => {
        console.error('Error promoting player:', err);
        this.message = 'Failed to promote player.';
        this.messageType = 'error';
        setTimeout(() => this.message = '', 3000);
      }
    });
  }

  releasePlayer(playerId: number): void {
    this.http.post<any>(urlApp + `/game/youthAcademy/release/${playerId}`, {}).subscribe({
      next: () => {
        this.message = 'Player released from youth academy.';
        this.messageType = 'info';
        this.youthPlayers = this.youthPlayers.filter(p => p.id !== playerId);
        setTimeout(() => this.message = '', 3000);
      },
      error: (err) => {
        console.error('Error releasing player:', err);
        this.message = 'Failed to release player.';
        this.messageType = 'error';
        setTimeout(() => this.message = '', 3000);
      }
    });
  }

  calculateStars(potential: number): number {
    if (potential >= 90) return 5;
    if (potential >= 75) return 4;
    if (potential >= 60) return 3;
    if (potential >= 45) return 2;
    return 1;
  }

  getStarsArray(stars: number): number[] {
    return Array(5).fill(0).map((_, i) => i < stars ? 1 : 0);
  }

  getPositionColor(position: string): string {
    const pos = (position || '').toUpperCase();
    if (pos.includes('GK') || pos.includes('GOAL')) return '#f1c40f';
    if (pos.includes('CB') || pos.includes('DEF') || pos.includes('LB') || pos.includes('RB')) return '#3498db';
    if (pos.includes('CM') || pos.includes('MID') || pos.includes('DM') || pos.includes('AM')) return '#2ecc71';
    if (pos.includes('ST') || pos.includes('FW') || pos.includes('LW') || pos.includes('RW')) return '#e74c3c';
    return '#aaa';
  }
}
