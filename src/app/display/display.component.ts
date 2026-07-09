import { Component, OnInit } from '@angular/core';
import { NgModule } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { urlApp } from '../app.component';


@Component({
    selector: 'display',
    templateUrl: './display.component.html',
    styleUrls: ['./display.component.css']
})
export class DisplayComponent implements OnInit{

    matchesCup: any = [];
    roundsCup: String[] = ["Round One", "Quarter-final", "Semi-final", "Final", "?"];

    ngOnInit(): void {
        this.getMatches(1);
    }

    constructor(private http: HttpClient) {

     }

    currentRoundCup = 'roundOne';


  getMatches(round: number) {
    this.http.get<any>(urlApp + '/competition/getResults/' + "4" + "/" + round ).subscribe(
      (response) => {
        this.matchesCup = response;
      },
      (error) => {
        console.error('Error fetching players:', error);
      }
    );
  }

  selectRound(event: Event) {
    var round = (event.target as HTMLTextAreaElement).value;

    
    this.currentRoundCup = round;

    this.matchesCup = this.getMatches(this.roundsCup.indexOf(round) + 1);
  }
}