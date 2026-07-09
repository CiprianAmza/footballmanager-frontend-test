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
  position = 'CM';
  age: number | null = 22;
  overall: number | null = 70;

  positions = ['GK', 'DR', 'DC', 'DL', 'DM', 'MR', 'MC', 'ML', 'AM', 'ST', 'CM'];

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
    this.loading = true;
    this.resultMessage = '';
    this.resultOk = false;
    this.adminService.generatePlayer({
      teamId: this.teamId,
      name: this.name || undefined,
      position: this.position || undefined,
      age: this.age ?? undefined,
      overall: this.overall ?? undefined
    }).subscribe({
      next: (res) => {
        this.loading = false;
        this.resultOk = true;
        const nm = res?.name || this.name || 'player';
        const id = res?.id != null ? ` (#${res.id})` : '';
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
