import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService, UpcomingMatch } from '../../services/admin.service';

interface EditableMatch extends UpcomingMatch {
  editTeam1Score: number;
  editTeam2Score: number;
  saving?: boolean;
  saveStatus?: 'ok' | 'err' | null;
  saveMessage?: string;
}

@Component({
  selector: 'app-admin-scores',
  templateUrl: './admin-scores.component.html',
  styleUrls: ['../admin.component.css']
})
export class AdminScoresComponent implements OnInit {

  matches: EditableMatch[] = [];
  loadingMatches = false;
  loadError = '';

  filterCompetitionId: number | null = null;
  filterText = '';

  constructor(public adminService: AdminService, private router: Router) {}

  ngOnInit(): void {
    if (!this.adminService.isAuthenticated) {
      this.router.navigate(['/admin']);
      return;
    }
    this.loadMatches();
  }

  loadMatches(): void {
    this.loadingMatches = true;
    this.loadError = '';
    this.adminService.getUpcomingMatches().subscribe({
      next: (data) => {
        this.matches = data.map(m => ({
          ...m,
          editTeam1Score: m.predeterminedTeam1Score ?? 0,
          editTeam2Score: m.predeterminedTeam2Score ?? 0
        }));
        this.loadingMatches = false;
      },
      error: (err) => {
        this.loadingMatches = false;
        if (err.status === 401) {
          this.loadError = 'Session expired. Please log in again.';
          this.adminService.logout();
          this.router.navigate(['/admin']);
        } else {
          this.loadError = err?.error?.error || 'Failed to load matches';
        }
      }
    });
  }

  saveMatch(m: EditableMatch): void {
    if (m.editTeam1Score < 0 || m.editTeam2Score < 0) {
      m.saveStatus = 'err';
      m.saveMessage = 'Scores must be non-negative';
      return;
    }
    m.saving = true;
    m.saveStatus = null;
    m.saveMessage = '';
    this.adminService.setScore({
      competitionId: m.competitionId,
      seasonNumber: m.seasonNumber,
      roundNumber: m.roundNumber,
      team1Id: m.team1Id,
      team2Id: m.team2Id,
      team1Score: m.editTeam1Score,
      team2Score: m.editTeam2Score
    }).subscribe({
      next: (res) => {
        m.saving = false;
        m.saveStatus = 'ok';
        m.saveMessage = `Saved (#${res.id})`;
        m.predeterminedId = res.id;
        m.predeterminedTeam1Score = m.editTeam1Score;
        m.predeterminedTeam2Score = m.editTeam2Score;
      },
      error: (err) => {
        m.saving = false;
        m.saveStatus = 'err';
        m.saveMessage = err?.error?.error || 'Save failed';
      }
    });
  }

  clearMatch(m: EditableMatch): void {
    if (!m.predeterminedId) return;
    const id = m.predeterminedId;
    this.adminService.deletePredetermined(id).subscribe({
      next: () => {
        m.predeterminedId = undefined;
        m.predeterminedTeam1Score = undefined;
        m.predeterminedTeam2Score = undefined;
        m.editTeam1Score = 0;
        m.editTeam2Score = 0;
        m.saveStatus = 'ok';
        m.saveMessage = 'Cleared';
      },
      error: (err) => {
        m.saveStatus = 'err';
        m.saveMessage = err?.error?.error || 'Delete failed';
      }
    });
  }

  get competitions(): { id: number; name: string }[] {
    const seen = new Map<number, string>();
    this.matches.forEach(m => {
      if (!seen.has(m.competitionId)) seen.set(m.competitionId, m.competitionName);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get filteredMatches(): EditableMatch[] {
    const txt = this.filterText.trim().toLowerCase();
    return this.matches.filter(m => {
      if (this.filterCompetitionId && m.competitionId !== Number(this.filterCompetitionId)) return false;
      if (txt) {
        const hay = `${m.team1Name} ${m.team2Name} ${m.competitionName}`.toLowerCase();
        if (!hay.includes(txt)) return false;
      }
      return true;
    });
  }
}
