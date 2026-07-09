import { Component, OnInit } from '@angular/core';
import { NgModule } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';


@Component({
    selector: 'competitionoveriew',
    templateUrl: './competitionoveriew.component.html',
    styleUrls: ['./competitionoveriew.component.css']
})
export class CompetitionOveriewComponent implements OnInit{

    parameterCompetitionId: string = "";

    teams: String[] = [];
    _teams: any[] = [];
    sortOrder: number = -1;
    lastOrderKey: string = "";
    changeText: boolean;
    weights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    _position = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    rounds: any[] = [];
    matches: any[] = [];

    matchesCup: any = [];
    roundsCup: String[] = ["Round One", "Quarter-final", "Semi-final", "Final"];


    percents: any[] = [];
    currentTeam = "";

    constructor(private http: HttpClient, private route: ActivatedRoute) {
       this.changeText = false;
       for (let i = 1; i < 45; i++)
        this.rounds.push("Round " + i);
    }

    ngOnInit() {

      this.route.params.subscribe(params => {
        this.parameterCompetitionId = params['competitionId'];
      });

        this.getMatches(1);

        setInterval(() => {

            this.http.get<any>(urlApp + '/competition/getTeams/' + this.parameterCompetitionId ).subscribe(
      (response) => {
        this._teams = response;
        var index = 1;
    
        this.percents = this.getPercents();
        this._teams.sort(function (a, b) {
            return b.points - a.points || b.goalDifference - a.goalDifference;
        });
        for (let t of this._teams) {

            t.position = index++;
          }
      },

      (error) => {
        console.error('Error fetching players:', error);
      }
    );
          }, 15000);
      
    }

    getPercents() {

      var numberOfTeams = this._teams.length;

      let values = [];
      let currentPercent = 100;
      let oneTeamPercent = 100 / numberOfTeams;
      for (let i = 0; i < numberOfTeams; i++) { 
          values.push(Math.round(currentPercent));
          currentPercent -= oneTeamPercent;
      }
      console.log(values);
      return values;
    }



    showDiv(teamName: any) {

      this.currentTeam = teamName;

      for (let team of this._teams) {
        if (team.name == teamName) {

            const teamPositions = team.positions.split(", ").map((x: string) => parseInt(x));

          for (let index = 0; index < this.weights.length; index++) {
            this.weights[index] = this.getPercentFromScore(teamPositions[index] - 1);
            this._position[index] = teamPositions[index];
          }
          break;
        }
      }

      const element = document.getElementById("initialDiv");

      if (element != null && element.style != null)
        element.style.display = "flex";
    }

    getPercentFromScore(position: any) {
      
      return this.percents[position] - 7.5;
    }

    hideDiv() {
        
        const element = document.getElementById("initialDiv");

        if (element != null && element.style != null)
            element.style.display = "none";
    }

    sortBy(property: any) {

        if (property == this.lastOrderKey)
            this.sortOrder *= -1;
        else {
          if (property == 'name' || property == 'position')
            this.sortOrder = -1;
          else
          this.sortOrder = 1;
        }
  
        this.lastOrderKey = property;
        var order = this.sortOrder;
  
        if (property == 'form') {
  
          this._teams.sort(function (a, b) {
  
            var teamA = (a.form.slice(0).slice(-5).split("W").length - 1) * 3 + (a.form.slice(0).slice(-5).split("D").length - 1);
            var teamB = (b.form.slice(0).slice(-5).split("W").length - 1) * 3 + (b.form.slice(0).slice(-5).split("D").length - 1);
            var result = (teamA < teamB) ? 1 : (teamA > teamB) ? -1 : 0;
            return result * order;
          })
  
        } else if (property == 'name') {
  
          this._teams.sort(function (a, b) {
            var result = (a[property] < b[property]) ? 1 : (a[property] > b[property]) ? -1 : 0;
            return result * order;
          })
        } else {
  
          this._teams.sort(function (a, b) {
            var result = (parseInt(a[property]) < parseInt(b[property])) ? 1 : (parseInt(a[property]) > parseInt(b[property])) ? -1 : 0;
            
            return result * order;
          })
        }
        
      }


      currentRoundCup = 'Round One';

      getMatches(round: number) {
        this.http.get<any>(urlApp + '/competition/getResults/' + "2" + "/" + round ).subscribe(
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