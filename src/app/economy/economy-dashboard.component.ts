import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { EconomyService } from '../services/economy.service';
import { CatalogItemView, LedgerEntryView, OwnedAssetView, PublicProfileView } from './economy.models';

@Component({
  selector: 'app-economy-dashboard',
  templateUrl: './economy-dashboard.component.html',
  styleUrls: ['./economy.component.css']
})
export class EconomyDashboardComponent implements OnInit {
  profile?: PublicProfileView;
  catalog: CatalogItemView[] = [];
  assets: OwnedAssetView[] = [];
  ledger: LedgerEntryView[] = [];
  loading = true;
  busyId: number | null = null;
  error = '';

  constructor(private economy: EconomyService) {}
  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.loading = true;
    forkJoin({ profile: this.economy.myProfile(), catalog: this.economy.catalog(),
      assets: this.economy.myAssets(), ledger: this.economy.myLedger() }).subscribe({
      next: data => {
        this.profile = data.profile; this.catalog = data.catalog;
        this.assets = data.assets; this.ledger = data.ledger.content; this.loading = false;
      },
      error: error => { this.error = error?.error?.message || 'Personal economy could not be loaded.'; this.loading = false; }
    });
  }

  buy(item: CatalogItemView): void {
    if (this.busyId !== null) return;
    this.busyId = item.id; this.error = '';
    this.economy.purchase(item.id, this.key('purchase', item.id)).subscribe({
      next: () => { this.busyId = null; this.reload(); },
      error: error => { this.busyId = null; this.error = error?.error?.message || 'Purchase failed.'; }
    });
  }

  sell(asset: OwnedAssetView): void {
    if (this.busyId !== null) return;
    this.busyId = -asset.id; this.error = '';
    this.economy.sell(asset.id, this.key('sell', asset.id)).subscribe({
      next: () => { this.busyId = null; this.reload(); },
      error: error => { this.busyId = null; this.error = error?.error?.message || 'Sale failed.'; }
    });
  }

  money(amount?: number): string {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
      .format(amount || 0);
  }

  private key(action: string, id: number): string {
    const random = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `ui-${action}-${id}-${random}`;
  }
}
