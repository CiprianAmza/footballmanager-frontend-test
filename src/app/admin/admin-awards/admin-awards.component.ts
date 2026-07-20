import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  AdminService,
  BallonDorAdminState,
  BallonDorCandidate
} from '../../services/admin.service';

@Component({
  selector: 'app-admin-awards',
  templateUrl: './admin-awards.component.html',
  styleUrls: ['../admin.component.css', './admin-awards.component.css']
})
export class AdminAwardsComponent implements OnInit {
  state?: BallonDorAdminState;
  loading = false;
  savingPlayerId: number | null = null;
  message = '';
  error = '';

  constructor(public adminService: AdminService, private router: Router) {}

  ngOnInit(): void {
    if (!this.adminService.isAuthenticated) {
      this.router.navigate(['/admin']);
      return;
    }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.adminService.ballonDorState().subscribe({
      next: state => {
        this.state = state;
        this.loading = false;
      },
      error: err => this.handleError(err, 'Could not load the Ballon d’Or ranking.')
    });
  }

  selectWinner(candidate: BallonDorCandidate): void {
    if (!this.state || this.state.finalized) return;
    const confirmed = window.confirm(
      `Select ${candidate.playerName} as the Ballon d’Or winner for Season ${this.state.season}?`
    );
    if (!confirmed) return;

    this.savingPlayerId = candidate.playerId;
    this.message = '';
    this.error = '';
    this.adminService.setBallonDorWinner(this.state.season, candidate.playerId).subscribe({
      next: state => {
        this.state = state;
        this.savingPlayerId = null;
        this.message = `${candidate.playerName} is now locked in as the admin selection. Final statistics will still be recorded.`;
      },
      error: err => this.handleError(err, 'Could not save the winner selection.')
    });
  }

  useStatisticalWinner(): void {
    if (!this.state || this.state.finalized || this.state.overrideWinnerId == null) return;
    this.savingPlayerId = -1;
    this.message = '';
    this.error = '';
    this.adminService.clearBallonDorWinner(this.state.season).subscribe({
      next: state => {
        this.state = state;
        this.savingPlayerId = null;
        this.message = 'Manual selection removed. The statistical vote leader will win.';
      },
      error: err => this.handleError(err, 'Could not remove the winner selection.')
    });
  }

  private handleError(err: any, fallback: string): void {
    this.loading = false;
    this.savingPlayerId = null;
    if (err?.status === 401) {
      this.adminService.logout();
      this.router.navigate(['/admin']);
      return;
    }
    this.error = err?.error?.error || fallback;
  }
}
