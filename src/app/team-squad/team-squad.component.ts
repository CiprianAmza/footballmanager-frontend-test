import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-team-squad',
  templateUrl: './team-squad.component.html',
  styleUrls: ['./team-squad.component.css']
})
export class TeamSquadComponent implements OnInit {
  teamId!: number;
  players: any[] = [];

  constructor(private route: ActivatedRoute, private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.teamId = params['teamId'];
      this.http.get<any[]>(urlApp + `/tactic/getPlayers/${this.teamId}`).subscribe(data => {
         this.players = data.sort((a, b) => b.rating - a.rating);
      });
    });
  }
  
  goBack() { this.router.navigate(['/team', this.teamId]); }
}