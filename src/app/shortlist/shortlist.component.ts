import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../app.component';

@Component({
  selector: 'app-shortlist',
  templateUrl: './shortlist.component.html',
  styleUrls: ['./shortlist.component.css']
})
export class ShortlistComponent implements OnInit {

  players: any[] = [];
  loading: boolean = true;
  editingNotes: number | null = null;
  editNotesText: string = '';

  sortColumn: string = 'rating';
  sortDirection: 'asc' | 'desc' = 'desc';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadShortlist();
  }

  loadShortlist(): void {
    this.loading = true;
    this.http.get<any[]>(urlApp + '/shortlist/all').subscribe({
      next: (data) => {
        this.players = data;
        this.sort(this.sortColumn, true);
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  removePlayer(playerId: number): void {
    this.http.delete(urlApp + `/shortlist/remove/${playerId}`).subscribe(() => {
      this.players = this.players.filter(p => p.playerId !== playerId);
    });
  }

  startEditNotes(entry: any): void {
    this.editingNotes = entry.id;
    this.editNotesText = entry.notes || '';
  }

  saveNotes(entry: any): void {
    this.http.post(urlApp + `/shortlist/updateNotes/${entry.id}`, { notes: this.editNotesText }).subscribe(() => {
      entry.notes = this.editNotesText;
      this.editingNotes = null;
    });
  }

  cancelEditNotes(): void {
    this.editingNotes = null;
  }

  sort(column: string, keepDirection: boolean = false): void {
    if (!keepDirection) {
      if (this.sortColumn === column) {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortColumn = column;
        this.sortDirection = 'desc';
      }
    }
    this.players.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '\u25B2' : '\u25BC';
  }
}
