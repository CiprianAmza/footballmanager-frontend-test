import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-offers',
  templateUrl: './admin-offers.component.html',
  styleUrls: ['../admin.component.css']
})
export class AdminOffersComponent implements OnInit {

  jobOffersEnabled = true;
  forceJobOfferArmed = false;
  jobOfferStateMessage = '';
  jobOfferUsers: { id: number; username: string; teamId: number | null }[] = [];
  selectedUserId: number | null = null;
  manualOfferTeamId: number | null = null;
  manualOfferResult = '';

  constructor(public adminService: AdminService, private router: Router) {}

  ngOnInit(): void {
    if (!this.adminService.isAuthenticated) {
      this.router.navigate(['/admin']);
      return;
    }
    this.loadJobOfferState();
    this.loadAdminUsers();
  }

  loadJobOfferState(): void {
    this.adminService.jobOfferState().subscribe({
      next: (s) => {
        this.jobOffersEnabled = s.jobOffersEnabled;
        this.forceJobOfferArmed = s.forceJobOfferOnNextAdvance;
      },
      error: () => { /* ignore */ }
    });
  }

  toggleJobOffersEnabled(): void {
    const next = !this.jobOffersEnabled;
    this.adminService.setJobOffersEnabled(next).subscribe({
      next: (res) => {
        this.jobOffersEnabled = res.jobOffersEnabled;
        this.jobOfferStateMessage = res.jobOffersEnabled
          ? 'Automatic job offers ENABLED.'
          : 'Automatic job offers DISABLED — no offers will be auto-generated.';
      },
      error: () => { this.jobOfferStateMessage = 'Failed to update.'; }
    });
  }

  armForceOffer(): void {
    this.adminService.forceNextOffer().subscribe({
      next: () => {
        this.forceJobOfferArmed = true;
        this.jobOfferStateMessage = 'Armed — next advance will spawn an offer for every active user.';
      },
      error: () => { this.jobOfferStateMessage = 'Failed to arm force-offer.'; }
    });
  }

  loadAdminUsers(): void {
    this.adminService.listAdminUsers().subscribe({
      next: (users) => { this.jobOfferUsers = users; },
      error: () => { this.jobOfferUsers = []; }
    });
  }

  generateManualOffer(): void {
    if (this.selectedUserId == null || this.manualOfferTeamId == null) {
      this.manualOfferResult = 'Pick a user and enter a team id.';
      return;
    }
    this.adminService.generateOfferNow(this.selectedUserId, this.manualOfferTeamId).subscribe({
      next: (offer) => {
        this.manualOfferResult = `Created offer #${offer.id} from ${offer.teamName} to user ${this.selectedUserId}.`;
      },
      error: (err) => {
        this.manualOfferResult = err?.error?.error || 'Failed to create offer.';
      }
    });
  }
}
