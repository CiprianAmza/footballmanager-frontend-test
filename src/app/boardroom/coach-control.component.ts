import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { urlApp } from '../app.component';

type BoolKey =
  | 'canBuyPlayers' | 'canSellPlayers' | 'canNegotiateContracts' | 'canPickXI'
  | 'canChangeFormationTactics' | 'canSetTraining' | 'canSetSetPieces';

interface CoachPermissions {
  teamId: number;
  canBuyPlayers: boolean;
  canSellPlayers: boolean;
  canNegotiateContracts: boolean;
  canPickXI: boolean;
  canChangeFormationTactics: boolean;
  canSetTraining: boolean;
  canSetSetPieces: boolean;
  transferBudgetCap: number;
  lockedSlots?: string;
}

@Component({
  selector: 'app-coach-control',
  templateUrl: './coach-control.component.html',
  styleUrls: ['./coach-control.component.css']
})
export class CoachControlComponent implements OnInit {
  teamId = 0;
  perms?: CoachPermissions;
  ownerHumanId: number | null = null;
  loading = false;
  saving = false;
  message = '';

  readonly toggles: { key: BoolKey; label: string }[] = [
    { key: 'canBuyPlayers', label: 'Buy players' },
    { key: 'canSellPlayers', label: 'Sell players' },
    { key: 'canNegotiateContracts', label: 'Negotiate contracts' },
    { key: 'canPickXI', label: 'Pick the XI' },
    { key: 'canChangeFormationTactics', label: 'Change formation & tactics' },
    { key: 'canSetTraining', label: 'Set training' },
    { key: 'canSetSetPieces', label: 'Set set-pieces' },
  ];

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => {
      this.teamId = +(p.get('teamId') || 0);
      if (this.teamId > 0) this.fetch();
    });
  }

  load(): void {
    if (this.teamId > 0) this.fetch();
  }

  private fetch(): void {
    this.loading = true;
    this.http.get<CoachPermissions>(`${urlApp}/boardroom/permissions/${this.teamId}`).subscribe({
      next: (p) => { this.perms = p; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Could not load permissions.'; }
    });
  }

  asBool(v: any): boolean { return !!v; }

  save(): void {
    if (!this.perms) return;
    if (this.ownerHumanId == null) { this.message = 'Enter the owner human id to save (only the club owner may change these).'; return; }
    this.saving = true; this.message = '';
    const body: any = { ownerHumanId: this.ownerHumanId };
    for (const t of this.toggles) body[t.key] = (this.perms as any)[t.key];
    body['transferBudgetCap'] = this.perms.transferBudgetCap;
    this.http.post(`${urlApp}/boardroom/permissions/${this.teamId}`, body).subscribe({
      next: (res: any) => {
        this.saving = false;
        if (res && res.success === false) { this.message = res.message || 'Save rejected.'; }
        else { this.message = 'Saved.'; this.perms = res; }
      },
      error: (err) => {
        this.saving = false;
        this.message = err?.error?.message || 'Save failed (are you the owner?).';
      }
    });
  }
}
