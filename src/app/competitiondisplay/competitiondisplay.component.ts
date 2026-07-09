import { Component, OnInit } from '@angular/core';
import { NgModule } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';


@Component({
    selector: 'competitiondisplay',
    templateUrl: './competitiondisplay.component.html',
    styleUrls: ['./competitiondisplay.component.css']
})
export class CompetitionDisplayComponent implements OnInit{

    parameterCompetitionId: string = "";

    matches: any = [];
    rounds: String[] = [];
    currentRound: number = 0;

    ngOnInit(): void {

      this.route.params.subscribe(params => {
        this.parameterCompetitionId = params['competitionId'];
      });


        setInterval(() => {

          this.http.get<any>(urlApp + '/competition/getCurrentRound').subscribe(
            (response) => {
              this.currentRound = parseInt(response) - 2;
              this.getMatches(this.currentRound);
            },

            (error) => {
              console.error('Error fetching players:', error);
            }
          );
          }, 3000);
    }

    constructor(private http: HttpClient, private route: ActivatedRoute) {
      for (let i = 1; i < 45; i++)
        this.rounds.push(i.toString());
     }
 

  getMatches(round: number) {
    this.http.get<any>(urlApp + '/competition/getFuturesMatches/' + this.parameterCompetitionId + "/" + round).subscribe(
      (response) => {
        this.matches = response;
      },
      (error) => {
        console.error('Error fetching players:', error);
      }
    );
  }

  selectRound(event: Event) {
    var round = (event.target as HTMLTextAreaElement).value;
  
    this.matches = this.getMatches(parseInt(round));
  }
}