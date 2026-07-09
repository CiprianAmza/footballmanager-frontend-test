// top3-finishers.component.ts
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-top3-finishers',
  templateUrl: './top3-finishers.component.html',
  styleUrls: ['./top3-finishers.component.css']
})
export class Top3FinishersComponent implements OnInit {
  competitionId: any = 1;
  top3FinishersList: any[] = [];

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.competitionId = params['competitionId'];
    });

    this.fetchData();
  }

  fetchData() {
    const url = urlApp + `/history/top3Finishers/${this.competitionId}`;
    this.http.get<any[]>(url).subscribe((data: any[]) => {
      console.log(data);
      this.top3FinishersList = data;
    });
  }  
}
