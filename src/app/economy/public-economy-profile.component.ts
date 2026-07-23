import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EconomyService } from '../services/economy.service';
import { PublicProfileView } from './economy.models';

@Component({ selector: 'app-public-economy-profile', templateUrl: './public-economy-profile.component.html', styleUrls: ['./economy.component.css'] })
export class PublicEconomyProfileComponent implements OnInit {
  profile?: PublicProfileView; error = '';
  constructor(private route: ActivatedRoute, private economy: EconomyService) {}
  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('profileId'));
    this.economy.publicProfile(id).subscribe({ next: profile => this.profile = profile,
      error: error => this.error = error?.error?.message || 'Profile not found.' });
  }
  money(value: number): string { return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value); }
}
