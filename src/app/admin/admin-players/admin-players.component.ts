import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-players',
  templateUrl: './admin-players.component.html',
  styleUrls: ['../admin.component.css']
})
export class AdminPlayersComponent implements OnInit {

  teamId: number | null = null;
  name = '';
  position = 'MC';
  age: number | null = 22;
  rating: number | null = 70;

  positions = ['GK', 'DR', 'DC', 'DL', 'WBR', 'WBL', 'DM', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST'];

  loading = false;
  resultMessage = '';
  resultOk = false;

  constructor(public adminService: AdminService, private router: Router) {}

  ngOnInit(): void {
    if (!this.adminService.isAuthenticated) {
      this.router.navigate(['/admin']);
    }
  }

  generate(): void {
    if (this.rating == null || !Number.isFinite(Number(this.rating))) {
      this.resultOk = false;
      this.resultMessage = 'Rating is required.';
      return;
    }
    if (this.rating < 1 || this.rating > 300) {
      this.resultOk = false;
      this.resultMessage = 'Rating must be between 1 and 300.';
      return;
    }

    this.loading = true;
    this.resultMessage = '';
    this.resultOk = false;
    this.adminService.generatePlayer({
      position: this.position,
      rating: this.rating,
      ...(this.teamId != null ? { teamId: this.teamId } : {}),
      ...(this.name.trim() ? { name: this.name.trim() } : {}),
      ...(this.age != null ? { age: this.age } : {})
    }).subscribe({
      next: (res) => {
        this.loading = false;
        this.resultOk = true;
        const nm = res?.name || this.name || 'player';
        const playerId = res?.playerId ?? res?.id;
        const id = playerId != null ? ` (#${playerId})` : '';
        this.resultMessage = `Generated ${nm}${id}.`;
      },
      error: (err) => {
        this.loading = false;
        this.resultOk = false;
        if (err.status === 401) {
          this.adminService.logout();
          this.router.navigate(['/admin']);
          return;
        }
        this.resultMessage = err?.error?.error || 'Failed to generate player.';
      }
    });
  }
}
