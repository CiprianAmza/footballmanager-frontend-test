import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

@Component({
  selector: 'app-job-search',
  templateUrl: './job-search.component.html',
  styleUrls: ['./job-search.component.css']
})
export class JobSearchComponent implements OnInit {

  availableJobs: any[] = [];
  loading: boolean = true;
  acceptingJobId: number | null = null;
  message: string = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    public teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.loadJobs();
  }

  loadJobs(): void {
    this.loading = true;
    this.http.get<any[]>(urlApp + '/competition/availableJobs')
      .subscribe({
        next: (jobs) => {
          this.availableJobs = jobs;
          this.loading = false;
        },
        error: () => {
          this.availableJobs = [];
          this.loading = false;
        }
      });
  }

  acceptJob(teamId: number): void {
    if (this.acceptingJobId !== null) return;
    this.acceptingJobId = teamId;

    this.http.post(urlApp + '/competition/acceptJob', { teamId }, { responseType: 'text' })
      .subscribe({
        next: (msg) => {
          this.message = msg;
          this.acceptingJobId = null;
          this.teamService.setManagerFired(false);
          this.teamService.teamId = teamId;
          setTimeout(() => {
            this.router.navigate(['/home']);
          }, 2000);
        },
        error: (err) => {
          this.acceptingJobId = null;
          this.message = 'Failed to accept job.';
          console.error(err);
        }
      });
  }
}
