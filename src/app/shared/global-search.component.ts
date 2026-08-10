import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { GlobalPaletteAction, GlobalSearchItem, GlobalSearchResults, GlobalSearchService } from './global-search.service';

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.css']
})
export class GlobalSearchComponent implements OnDestroy {
  @Input() actingTeamId = 0;
  @Input() currentSeason = 1;
  @Input() continueDisabled = false;
  @Input() saveDisabled = false;
  @Input() loadDisabled = false;
  @Output() continueGame = new EventEmitter<void>();
  @Output() saveGame = new EventEmitter<void>();
  @Output() loadGame = new EventEmitter<void>();
  @ViewChild('trigger') trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  open = false;
  query = '';
  loading = false;
  selectedIndex = 0;
  shortcutHint = '';
  results: GlobalSearchResults = { commands: [], pages: [], players: [], clubs: [], competitions: [] };

  private readonly querySubject = new Subject<string>();
  private readonly subscription: Subscription;
  private shortcutTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingNavigationKey = false;

  constructor(private searchService: GlobalSearchService, private router: Router) {
    this.subscription = this.querySubject.pipe(
      debounceTime(160),
      distinctUntilChanged(),
      switchMap(query => this.searchService.search(query, this.actingTeamId, this.currentSeason))
    ).subscribe(results => {
      this.results = results;
      this.loading = false;
      this.resetSelection();
    });
  }

  get groups(): { label: string; items: GlobalSearchItem[] }[] {
    return [
      { label: 'Commands', items: this.results.commands },
      { label: 'Pages', items: this.results.pages },
      { label: 'Players', items: this.results.players },
      { label: 'Clubs', items: this.results.clubs },
      { label: 'Competitions', items: this.results.competitions }
    ].filter(group => group.items.length > 0);
  }

  get flatResults(): GlobalSearchItem[] {
    return this.groups.flatMap(group => group.items);
  }

  get hasResults(): boolean {
    return this.flatResults.length > 0;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.query = '';
    this.results = {
      commands: this.searchService.quickCommands(),
      pages: this.searchService.quickPages(this.actingTeamId, this.currentSeason),
      players: [], clubs: [], competitions: []
    };
    this.resetSelection();
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  close(returnFocus = true): void {
    this.open = false;
    this.loading = false;
    if (returnFocus) setTimeout(() => this.trigger?.nativeElement.focus());
  }

  onQueryChange(value: string): void {
    this.query = value;
    this.loading = value.trim().length >= 2;
    if (!value.trim()) {
      this.results = {
        commands: this.searchService.quickCommands(),
        pages: this.searchService.quickPages(this.actingTeamId, this.currentSeason),
        players: [], clubs: [], competitions: []
      };
      this.loading = false;
      this.resetSelection();
      return;
    }
    this.querySubject.next(value);
  }

  select(item: GlobalSearchItem): void {
    if (this.isItemDisabled(item)) return;
    this.close(false);
    if (item.action) {
      this.executeAction(item.action);
      return;
    }
    if (item.route) this.router.navigateByUrl(item.route);
  }

  isItemDisabled(item: GlobalSearchItem): boolean {
    return item.action === 'CONTINUE' && this.continueDisabled
      || item.action === 'SAVE_GAME' && this.saveDisabled
      || item.action === 'LOAD_GAME' && this.loadDisabled;
  }

  shortcutLabel(key: string): string {
    if (key !== 'MOD') return key;
    return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  }

  isSelected(item: GlobalSearchItem): boolean {
    return this.flatResults.indexOf(item) === this.selectedIndex;
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.open ? this.close() : this.show();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!this.saveDisabled) this.executeAction('SAVE_GAME');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      if (!this.loadDisabled) this.executeAction('LOAD_GAME');
      return;
    }
    if (!this.open && (event.key === '/' || event.key === '?') && !typing) {
      event.preventDefault();
      this.show();
      return;
    }
    if (!this.open) {
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (this.awaitingNavigationKey) {
        event.preventDefault();
        const item = this.searchService.findNavigationShortcut(event.key, this.actingTeamId, this.currentSeason);
        this.clearNavigationChord();
        if (item) this.select(item);
        return;
      }
      if (!event.repeat && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        this.startNavigationChord();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' && this.flatResults.length) {
      event.preventDefault();
      this.moveSelection(1);
    } else if (event.key === 'ArrowUp' && this.flatResults.length) {
      event.preventDefault();
      this.moveSelection(-1);
    } else if (event.key === 'Enter' && this.flatResults[this.selectedIndex]) {
      event.preventDefault();
      this.select(this.flatResults[this.selectedIndex]);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.clearNavigationChord();
  }

  private executeAction(action: GlobalPaletteAction): void {
    if (action === 'CONTINUE') this.continueGame.emit();
    if (action === 'SAVE_GAME') this.saveGame.emit();
    if (action === 'LOAD_GAME') this.loadGame.emit();
  }

  private startNavigationChord(): void {
    this.awaitingNavigationKey = true;
    this.shortcutHint = 'choose a destination';
    if (this.shortcutTimer) clearTimeout(this.shortcutTimer);
    this.shortcutTimer = setTimeout(() => this.clearNavigationChord(), 1400);
  }

  private clearNavigationChord(): void {
    this.awaitingNavigationKey = false;
    this.shortcutHint = '';
    if (this.shortcutTimer) clearTimeout(this.shortcutTimer);
    this.shortcutTimer = null;
  }

  private resetSelection(): void {
    const firstEnabled = this.flatResults.findIndex(item => !this.isItemDisabled(item));
    this.selectedIndex = Math.max(0, firstEnabled);
  }

  private moveSelection(direction: 1 | -1): void {
    const items = this.flatResults;
    if (!items.length) return;
    let next = this.selectedIndex;
    for (let attempts = 0; attempts < items.length; attempts++) {
      next = (next + direction + items.length) % items.length;
      if (!this.isItemDisabled(items[next])) {
        this.selectedIndex = next;
        return;
      }
    }
  }
}
