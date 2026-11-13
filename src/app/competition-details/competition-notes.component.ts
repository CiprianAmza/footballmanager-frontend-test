import { Component, Input, OnChanges } from '@angular/core';
import { AuthService } from '../services/auth.service';

interface CompetitionNote {
  title: string;
  body: string;
}

@Component({
  selector: 'app-competition-notes',
  templateUrl: './competition-notes.component.html',
  styleUrls: ['./competition-details.component.css']
})
export class CompetitionNotesComponent implements OnChanges {
  @Input() id = '';
  @Input() create = false;
  notes: CompetitionNote[] = [];
  selected = 0;
  editing: number | null = null;
  draft: CompetitionNote = { title: '', body: '' };
  storageError = false;

  constructor(private auth: AuthService) {}

  private get key(): string {
    return `competition:${this.auth.currentUserId}:${this.id}`;
  }

  ngOnChanges(): void {
    this.notes = [];
    this.selected = 0;
    this.editing = null;
    this.storageError = false;
    try {
      const saved = localStorage.getItem(this.key + ':notes');
      const legacy = localStorage.getItem(this.key + ':note');
      this.notes = saved ? JSON.parse(saved) : legacy ? [{ title: 'Competition note', body: legacy }] : [];
    } catch {
      this.storageError = true;
    }
    if (this.create) this.edit();
  }

  edit(index = -1, copy?: CompetitionNote): void {
    this.editing = index;
    this.draft = { ...(copy || this.notes[index] || { title: '', body: '' }) };
  }

  save(): void {
    if (this.editing == null || !this.draft.title.trim() || !this.draft.body.trim()) return;
    const next = [...this.notes];
    const index = this.editing < 0 ? next.length : this.editing;
    next[index] = { title: this.draft.title.trim(), body: this.draft.body.trim() };
    if (this.persist(next)) {
      this.selected = index;
      this.editing = null;
    }
  }

  remove(index: number): void {
    if (this.persist(this.notes.filter((_, current) => current !== index))) this.selected = 0;
  }

  private persist(notes: CompetitionNote[]): boolean {
    try {
      localStorage.setItem(this.key + ':notes', JSON.stringify(notes));
    } catch {
      this.storageError = true;
      return false;
    }
    this.notes = notes;
    this.storageError = false;
    return true;
  }
}
