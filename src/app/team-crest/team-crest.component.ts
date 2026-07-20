import { Component, Input } from '@angular/core';

/**
 * Deterministic procedural club crest. The team id selects one of several
 * silhouettes/patterns, so a crest remains stable across pages and reloads.
 */
@Component({
  selector: 'app-team-crest',
  templateUrl: './team-crest.component.html',
  styleUrls: ['./team-crest.component.css']
})
export class TeamCrestComponent {
  @Input() teamId = 0;
  @Input() teamName = '';
  @Input() color1: string | null | undefined;
  @Input() color2: string | null | undefined;
  @Input() size = 42;

  private readonly palette = [
    ['#d9443f', '#f0c541'], ['#2d6cdf', '#f5f7ff'], ['#159a77', '#12233f'],
    ['#7b4ed8', '#ef8f2f'], ['#202938', '#48b8e8'], ['#9b1d35', '#f2d27a'],
    ['#ef6b35', '#25215d'], ['#2f8a3e', '#ece7d1']
  ];

  get variant(): number {
    const seed = Math.abs(Math.trunc(this.teamId || this.hashName()));
    return seed % 8;
  }

  get primary(): string {
    return this.validColor(this.color1) ? this.color1! : this.palette[this.variant][0];
  }

  get secondary(): string {
    const fallback = this.palette[this.variant][1];
    if (!this.validColor(this.color2)) return fallback;
    return this.color2!.toLowerCase() === this.primary.toLowerCase() ? fallback : this.color2!;
  }

  get initials(): string {
    const words = (this.teamName || 'FC').trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    return (words[0] || 'FC').slice(0, 2).toUpperCase();
  }

  get title(): string {
    return `${this.teamName || 'Club'} crest`;
  }

  private validColor(value: string | null | undefined): value is string {
    if (!value) return false;
    const color = value.trim();
    return /^#[0-9a-f]{3,8}$/i.test(color)
      || /^[a-z]+$/i.test(color)
      || /^rgba?\([^)]*\)$/i.test(color)
      || /^hsla?\([^)]*\)$/i.test(color);
  }

  private hashName(): number {
    return Array.from(this.teamName || 'crest').reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 7);
  }
}
