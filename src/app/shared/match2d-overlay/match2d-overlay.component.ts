import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { isFrameableUrl, Match2dReplay, match2dReplayErrorMessage } from '../match2d';

/**
 * Full-screen window that shows a match from the 2D ratings engine in an iframe.
 * Give it either `replayUrl` (the backend replay route; the component asks it for
 * the page address) or `viewUrl` (a page address already in hand).
 * Extra buttons for the top bar can be projected as content.
 */
@Component({
  selector: 'app-match2d-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match2d-overlay.component.html',
  styleUrls: ['./match2d-overlay.component.css']
})
export class Match2dOverlayComponent implements OnChanges, OnDestroy {
  @Input() replayUrl: string | null = null;
  @Input() viewUrl: string | null = null;
  @Input() heading = '2D match';
  @Input() meta = '';
  @Output() closed = new EventEmitter<void>();

  loading = false;
  error = '';
  versionMismatch = false;
  frameUrl: SafeResourceUrl | null = null;
  private request: Subscription | null = null;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['viewUrl'] || changes['replayUrl']) this.load();
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  load(): void {
    this.request?.unsubscribe();
    this.request = null;
    this.error = '';
    this.versionMismatch = false;
    this.frameUrl = null;
    this.loading = false;

    if (this.viewUrl) {
      this.show(this.viewUrl);
      return;
    }
    if (!this.replayUrl) return;

    this.loading = true;
    this.request = this.http.get<Match2dReplay>(this.replayUrl).subscribe({
      next: data => {
        this.loading = false;
        this.versionMismatch = data?.versionMismatch === true;
        this.show(data?.viewUrl);
      },
      error: err => {
        this.loading = false;
        this.error = match2dReplayErrorMessage(err);
      }
    });
  }

  private show(url: unknown): void {
    if (!isFrameableUrl(url)) {
      this.error = 'The 2D engine returned no page to show.';
      return;
    }
    // The address comes from our own backend and was checked to be plain http(s).
    this.frameUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  close(): void { this.closed.emit(); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }
}
