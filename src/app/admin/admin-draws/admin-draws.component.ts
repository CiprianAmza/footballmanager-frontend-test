import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  AdminDrawStage,
  AdminDrawTeam,
  AdminService
} from '../../services/admin.service';

interface EditablePairing {
  team1Id: number | null;
  team2Id: number | null;
}

interface EditableGroup {
  groupNumber: number;
  teamIds: (number | null)[];
}

@Component({
  selector: 'app-admin-draws',
  templateUrl: './admin-draws.component.html',
  styleUrls: ['../admin.component.css', './admin-draws.component.css']
})
export class AdminDrawsComponent implements OnInit {
  stages: AdminDrawStage[] = [];
  selected: AdminDrawStage | null = null;
  pairings: EditablePairing[] = [];
  groups: EditableGroup[] = [];
  byeTeamId: number | null = null;
  loading = false;
  saving = false;
  error = '';
  message = '';

  constructor(public adminService: AdminService, private router: Router) {}

  ngOnInit(): void {
    if (!this.adminService.isAuthenticated) {
      this.router.navigate(['/admin']);
      return;
    }
    this.load();
  }

  load(selectKey?: string): void {
    this.loading = true;
    this.error = '';
    this.adminService.listManualDraws().subscribe({
      next: stages => {
        this.stages = stages;
        this.loading = false;
        const next = selectKey
          ? stages.find(stage => this.stageKey(stage) === selectKey)
          : stages.find(stage => stage.canEdit) || stages[0];
        if (next) this.selectStage(next);
        else this.selected = null;
      },
      error: err => {
        this.loading = false;
        if (err.status === 401) {
          this.adminService.logout();
          this.router.navigate(['/admin']);
          return;
        }
        this.error = err?.error?.error || 'Could not load competition draws.';
      }
    });
  }

  selectStage(stage: AdminDrawStage): void {
    this.selected = stage;
    this.error = '';
    this.byeTeamId = null;
    this.pairings = [];
    this.groups = [];

    if (stage.drawMode === 'PAIRINGS') {
      const existing = stage.existingPairings || [];
      for (let index = 0; index < stage.expectedPairings; index++) {
        this.pairings.push({
          team1Id: existing[index]?.team1Id ?? stage.participants[index * 2]?.teamId ?? null,
          team2Id: existing[index]?.team2Id ?? stage.participants[index * 2 + 1]?.teamId ?? null
        });
      }
      if (stage.byeSlots === 1) {
        this.byeTeamId = stage.participants[stage.participants.length - 1]?.teamId ?? null;
      }
      return;
    }

    const groupCount = stage.groupCount || 0;
    const groupSize = stage.groupSize || 0;
    const byPot = new Map<number, AdminDrawTeam[]>();
    stage.participants.forEach(team => {
      const pot = team.potNumber || 0;
      byPot.set(pot, [...(byPot.get(pot) || []), team]);
    });
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
      const teamIds: (number | null)[] = [];
      for (let slot = 0; slot < groupSize; slot++) {
        teamIds.push(byPot.get(slot + 1)?.[groupIndex]?.teamId ?? null);
      }
      this.groups.push({ groupNumber: groupIndex + 1, teamIds });
    }
  }

  save(): void {
    if (!this.selected || !this.selected.canEdit || !this.selectionComplete) return;
    const selectedKey = this.stageKey(this.selected);
    this.saving = true;
    this.error = '';
    this.message = '';
    this.adminService.completeManualDraw({
      competitionId: this.selected.competitionId,
      season: this.selected.season,
      round: this.selected.round,
      pairings: this.pairings.map(pairing => ({
        team1Id: Number(pairing.team1Id),
        team2Id: Number(pairing.team2Id)
      })),
      byeTeamId: this.byeTeamId,
      groups: this.groups.map(group => ({
        groupNumber: group.groupNumber,
        teamIds: group.teamIds.map(Number)
      }))
    }).subscribe({
      next: response => {
        this.saving = false;
        this.message = `${response.stageLabel}: draw saved.`;
        this.load(selectedKey);
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.error || 'Could not save this draw.';
      }
    });
  }

  isUnavailable(teamId: number, currentValue: number | null): boolean {
    if (teamId === currentValue) return false;
    return this.selectedTeamIds.has(teamId);
  }

  teamLabel(team: AdminDrawTeam): string {
    const pot = team.potNumber ? `P${team.potNumber} · ` : '';
    const coefficient = team.coefficient == null ? '' : ` · coeff ${team.coefficient}`;
    return `${pot}${team.teamName}${coefficient}`;
  }

  stageKey(stage: AdminDrawStage): string {
    return `${stage.competitionId}:${stage.season}:${stage.round}`;
  }

  get selectedTeamIds(): Set<number> {
    const ids = new Set<number>();
    this.pairings.forEach(pairing => {
      if (pairing.team1Id != null) ids.add(Number(pairing.team1Id));
      if (pairing.team2Id != null) ids.add(Number(pairing.team2Id));
    });
    this.groups.forEach(group => group.teamIds.forEach(id => {
      if (id != null) ids.add(Number(id));
    }));
    if (this.byeTeamId != null) ids.add(Number(this.byeTeamId));
    return ids;
  }

  get selectionComplete(): boolean {
    if (!this.selected) return false;
    const values: number[] = [];
    if (this.selected.drawMode === 'PAIRINGS') {
      for (const pairing of this.pairings) {
        if (pairing.team1Id == null || pairing.team2Id == null) return false;
        values.push(Number(pairing.team1Id), Number(pairing.team2Id));
      }
      if (this.selected.byeSlots === 1) {
        if (this.byeTeamId == null) return false;
        values.push(Number(this.byeTeamId));
      }
    } else {
      for (const group of this.groups) {
        if (group.teamIds.some(id => id == null)) return false;
        values.push(...group.teamIds.map(Number));
      }
    }
    return values.length === this.selected.participants.length
      && new Set(values).size === values.length;
  }
}
