import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';

/** One master row built from /humans/allPlayers — carries identity, face, rating, team,
 *  nationality AND the 36 detailed attributes (skillNames/skillValues), so every cheap
 *  filter works without per-player calls. The 6 FUT stats + FIFA overall still come from
 *  /humans/{id}/card (fetched lazily, cached). */
interface PlayerLite {
  id: number;
  name: string;
  position: string;
  rating: number;
  age?: number;
  teamId?: number;
  teamName?: string;
  nationId?: number;
  nationName?: string;
  baseFaceId?: number; skinTone?: number; hairStyle?: number; hairColor?: number; eyeColor?: number;
  faceShape?: number; noseShape?: number; eyeShape?: number; mouthShape?: number; browShape?: number;
  skills: { [name: string]: number };
}

interface PlayerCard {
  playerId: number; name: string; position: string; overall: number;
  pac: number; sho: number; pas: number; dri: number; def: number; phy: number;
  age: number; nationId?: number;
}

/** A single stacked filter row in the advanced builder. */
interface GalleryFilter {
  field: string;            // 'rating'|'age'|'position'|'nationality'|'team'|'fut:pac'|'attr:Finishing'…
  op: '<' | '>' | '=';
  value: string;
}

@Component({
  selector: 'app-player-gallery',
  templateUrl: './player-gallery.component.html',
  styleUrls: ['./player-gallery.component.css']
})
export class PlayerGalleryComponent implements OnInit {

  readonly POSITIONS = ['GK', 'DL', 'DC', 'DR', 'DM', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];
  readonly FUT_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  readonly PAGE_SIZE = 40;
  readonly FUT_FETCH_CAP = 400; // bound per-player /card calls when filtering by FUT stats

  teamId!: number;
  mode: 'team' | 'all' = 'team';

  master: PlayerLite[] = [];     // every player (with attributes), loaded once
  filtered: PlayerLite[] = [];
  loadingList = false;
  loadingCards = false;

  attributeNames: string[] = []; // the 36 detailed attribute names (from skillNames)
  nationChoices: string[] = [];
  teamChoices: { id: number; name: string }[] = [];

  cardCache: Map<number, PlayerCard> = new Map();

  // simple top-bar controls
  search = '';
  positionFilter = 'All';
  sortKey: 'ratingDesc' | 'ratingAsc' | 'nameAsc' | 'ageAsc' = 'ratingDesc';
  page = 0;

  // advanced stacked filters
  filters: GalleryFilter[] = [];
  futCapped = false; // true when a FUT filter couldn't be applied to the whole candidate set

  constructor(private http: HttpClient, private route: ActivatedRoute,
              private router: Router, private teamService: TeamService) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.teamId = Number(params['teamId']) || this.teamService.teamId;
      this.loadMaster();
    });
  }

  setMode(mode: 'team' | 'all'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.page = 0;
    this.applyFilters();
  }

  /** Load the whole player pool ONCE; it carries the 36 attributes so all cheap filters
   *  (attributes / position / nationality / rating / team / age) work in both modes. */
  private loadMaster(): void {
    this.loadingList = true;
    this.http.get<any[]>(`${urlApp}/humans/allPlayers`).subscribe({
      next: (rows) => {
        this.master = (rows || []).map(r => this.mapRow(r));
        this.buildChoices();
        this.loadingList = false;
        this.applyFilters();
      },
      error: () => { this.master = []; this.loadingList = false; this.applyFilters(); }
    });
  }

  private mapRow(r: any): PlayerLite {
    const skills: { [name: string]: number } = {};
    const names: string[] = r.skillNames || [];
    const values: any[] = r.skillValues || [];
    names.forEach((n, i) => { skills[n] = Number(values[i] ?? 0); });
    return {
      id: r.id, name: r.name, position: r.position, rating: r.rating ?? 0, age: r.age,
      teamId: r.teamId, teamName: r.teamName, nationId: r.nationId, nationName: r.nationName,
      baseFaceId: r.baseFaceId, skinTone: r.skinTone, hairStyle: r.hairStyle,
      hairColor: r.hairColor, eyeColor: r.eyeColor, faceShape: r.faceShape,
      noseShape: r.noseShape, eyeShape: r.eyeShape, mouthShape: r.mouthShape, browShape: r.browShape,
      skills
    };
  }

  private buildChoices(): void {
    const sample = this.master.find(p => Object.keys(p.skills).length > 0);
    this.attributeNames = sample ? Object.keys(sample.skills) : [];
    this.nationChoices = Array.from(new Set(
      this.master.map(p => p.nationName).filter((n): n is string => !!n && n !== 'N/A')
    )).sort();
    const teamMap = new Map<number, string>();
    this.master.forEach(p => { if (p.teamId) teamMap.set(p.teamId, p.teamName || ('Team ' + p.teamId)); });
    this.teamChoices = Array.from(teamMap.entries())
      .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- advanced filter builder ----------
  addFilter(): void { this.filters.push({ field: 'rating', op: '>', value: '' }); }
  removeFilter(i: number): void { this.filters.splice(i, 1); this.onFilterChange(); }
  onFieldChange(f: GalleryFilter): void {
    f.value = '';
    if (this.isCategorical(f.field)) f.op = '=';
    this.onFilterChange();
  }
  isCategorical(field: string): boolean {
    return field === 'position' || field === 'nationality' || field === 'team';
  }
  isFut(field: string): boolean { return field.startsWith('fut:'); }

  // ---------- filtering pipeline ----------
  onFilterChange(): void { this.page = 0; this.applyFilters(); }

  applyFilters(): void {
    const base = this.mode === 'team'
      ? this.master.filter(p => p.teamId === this.teamId)
      : this.master;

    const q = this.search.trim().toLowerCase();
    const nonFut = this.filters.filter(f => f.value !== '' && !this.isFut(f.field));
    const futF = this.filters.filter(f => f.value !== '' && this.isFut(f.field));

    let candidates = base.filter(p =>
      (!q || (p.name || '').toLowerCase().includes(q)) &&
      (this.positionFilter === 'All' || p.position === this.positionFilter) &&
      nonFut.every(f => this.matchNonFut(p, f))
    );

    this.futCapped = false;
    if (futF.length === 0) { this.finalize(candidates); return; }

    // FUT filters need per-player card data — fetch (capped) for the candidate set, then filter.
    this.sortInPlace(candidates);
    const cap = candidates.slice(0, this.FUT_FETCH_CAP);
    this.futCapped = candidates.length > this.FUT_FETCH_CAP;
    const missing = cap.filter(p => !this.cardCache.has(p.id));
    if (!missing.length) { this.finalize(cap.filter(p => futF.every(f => this.matchFut(p, f)))); return; }

    this.loadingCards = true;
    forkJoin(missing.map(p =>
      this.http.get<PlayerCard>(`${urlApp}/humans/${p.id}/card`).pipe(
        map(c => ({ id: p.id, card: c })),
        catchError(() => of({ id: p.id, card: null as PlayerCard | null }))
      )
    )).subscribe(res => {
      res.forEach(r => { if (r.card) this.cardCache.set(r.id, r.card); });
      this.loadingCards = false;
      this.finalize(cap.filter(p => futF.every(f => this.matchFut(p, f))));
    });
  }

  private finalize(list: PlayerLite[]): void {
    this.sortInPlace(list);
    this.filtered = list;
    const maxPage = Math.max(0, this.pageCount - 1);
    if (this.page > maxPage) this.page = maxPage;
    this.fetchCardsForPage();
  }

  private sortInPlace(list: PlayerLite[]): void {
    list.sort((a, b) => {
      switch (this.sortKey) {
        case 'ratingAsc': return a.rating - b.rating;
        case 'nameAsc':   return (a.name || '').localeCompare(b.name || '');
        case 'ageAsc':    return (a.age || 0) - (b.age || 0);
        default:          return b.rating - a.rating;
      }
    });
  }

  private cmp(op: string, a: number, b: number): boolean {
    if (isNaN(b)) return true;
    return op === '<' ? a < b : op === '>' ? a > b : a === b;
  }

  private matchNonFut(p: PlayerLite, f: GalleryFilter): boolean {
    switch (f.field) {
      case 'rating':      return this.cmp(f.op, p.rating, Number(f.value));
      case 'age':         return this.cmp(f.op, p.age || 0, Number(f.value));
      case 'position':    return p.position === f.value;
      case 'nationality': return p.nationName === f.value;
      case 'team':        return String(p.teamId) === f.value;
      default:            // attr:<name>
        if (f.field.startsWith('attr:')) {
          const name = f.field.slice(5);
          return this.cmp(f.op, p.skills[name] ?? 0, Number(f.value));
        }
        return true;
    }
  }

  private matchFut(p: PlayerLite, f: GalleryFilter): boolean {
    const c = this.cardCache.get(p.id);
    if (!c) return false;
    const key = f.field.slice(4) as keyof PlayerCard; // fut:pac -> pac
    return this.cmp(f.op, Number(c[key]), Number(f.value));
  }

  // ---------- pagination + per-page card fetch ----------
  get pageItems(): PlayerLite[] {
    const start = this.page * this.PAGE_SIZE;
    return this.filtered.slice(start, start + this.PAGE_SIZE);
  }
  get pageCount(): number { return Math.max(1, Math.ceil(this.filtered.length / this.PAGE_SIZE)); }
  prevPage(): void { if (this.page > 0) { this.page--; this.fetchCardsForPage(); } }
  nextPage(): void { if (this.page < this.pageCount - 1) { this.page++; this.fetchCardsForPage(); } }

  /** Fetch the FUT card (overall + 6 stats) for visible players not yet cached.
   *  Per-request catchError so one failure can't blank the whole page. */
  private fetchCardsForPage(): void {
    const missing = this.pageItems.filter(p => !this.cardCache.has(p.id));
    if (!missing.length) return;
    this.loadingCards = true;
    forkJoin(missing.map(p =>
      this.http.get<PlayerCard>(`${urlApp}/humans/${p.id}/card`).pipe(
        map(c => ({ id: p.id, card: c })),
        catchError(() => of({ id: p.id, card: null as PlayerCard | null }))
      )
    )).subscribe(res => {
      res.forEach(r => { if (r.card) this.cardCache.set(r.id, r.card); });
      this.loadingCards = false;
    });
  }

  card(id: number): PlayerCard | undefined { return this.cardCache.get(id); }
  stat(id: number, key: keyof PlayerCard): number | string {
    const c = this.cardCache.get(id);
    return c ? (c[key] as number) : '—';
  }

  openPlayer(id: number): void { this.router.navigate(['/player', id]); }
}
