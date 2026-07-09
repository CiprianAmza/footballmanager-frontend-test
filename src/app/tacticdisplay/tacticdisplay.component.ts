import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'tactic-display',
    templateUrl: './tacticdisplay.component.html',
    styleUrls: ['./tacticdisplay.component.css']
})
export class TacticDisplayComponent implements OnInit{

  players: any;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // this.http.get<any>('https://footballmanagergame-771c01868d32.herokuapp.com/getPlayers').subscribe(
    //   (response) => {
    //     this.players = response;
    //   },
    //   (error) => {
    //     console.error('Error fetching players:', error);
    //   }
    // );
  }

}