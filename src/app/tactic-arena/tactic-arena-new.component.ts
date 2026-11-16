import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ArenaProgressComponent } from './arena-progress.component';
import { ArenaResultsComponent } from './arena-results.component';
import { TacticArenaEditorComponent } from './tactic-arena-editor.component';
import {
  ArenaClub, ArenaLeague, ArenaSetup, ArenaTestDetail, TacticArenaService, isActive
} from './tactic-arena.service';

/**
 * /tactic-arena/new — pick any club, set its tactic on the game's tactics page, name the
 * test and start it. The running test is kept in the URL (?test=id), so progress survives
 * a page reload.
 */
@Component({
  selector: 'app-tactic-arena-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TacticArenaEditorComponent, ArenaProgressComponent, ArenaResultsComponent],
  styleUrls: ['./tactic-arena.css'],
  template: `
    <div class="ta-page">
      <div class="ta-head">
        <div>
          <span class="ta-eyebrow">Tactic Arena</span>
          <h1>Test a tactic</h1>
          <p class="ta-sub">Four full seasons are simulated on a copy of the world: the chosen club, then the same tactic on
            the highest, median and lowest reputation clubs of its league. Your career is not changed.</p>
        </div>
        <div class="ta-actions"><a class="ta-btn" routerLink="/tactic-arena">Leaderboard</a></div>
      </div>

      <!-- RUNNING / FINISHED TEST -->
      <ng-container *ngIf="testId">
        <p class="ta-error" *ngIf="testError">{{ testError }}</p>
        <app-arena-progress *ngIf="test" [test]="test" [cancelling]="cancelling" (cancel)="cancelTest()"></app-arena-progress>
        <section class="ta-card" *ngIf="test && !active">
          <h2>{{ test.name }}</h2>
          <app-arena-results *ngIf="test.results" [results]="test.results" title="Reference clubs"></app-arena-results>
          <div class="ta-actions">
            <a class="ta-btn primary" [routerLink]="['/tactic-arena', test.id]">Open the test page</a>
            <button type="button" class="ta-btn" (click)="newTest()">Test another tactic</button>
          </div>
        </section>
      </ng-container>

      <!-- LAUNCH -->
      <ng-container *ngIf="!testId">
        <section class="ta-card">
          <h2>1 · Club</h2>
          <p class="ta-error" *ngIf="clubsError">{{ clubsError }}</p>
          <div class="ta-form">
            <label class="ta-field">
              <span>League</span>
              <select [(ngModel)]="leagueId" (ngModelChange)="clubQuery = ''">
                <option [ngValue]="null" disabled>Choose a league</option>
                <option *ngFor="let league of leagues" [ngValue]="league.competitionId">
                  {{ league.nationName }} · {{ league.name }} (tier {{ league.tier }})
                </option>
              </select>
            </label>
            <label class="ta-field">
              <span>Search club</span>
              <input type="search" [(ngModel)]="clubQuery" placeholder="Club name (all leagues)">
            </label>
          </div>
          <div class="ta-club-list" *ngIf="visibleClubs.length">
            <button type="button" class="ta-club" *ngFor="let club of visibleClubs; trackBy: trackClub"
                    [class.active]="club.teamId === selectedTeamId" (click)="pickClub(club)">
              <span class="ta-swatch" [style.background]="club.color1 || '#555'"></span>
              <span>{{ club.name }}</span>
              <span class="ta-rep">{{ club.reputation }}</span>
            </button>
          </div>
          <p class="ta-muted" *ngIf="!leagues.length && !clubsError">Loading clubs…</p>
        </section>

        <section class="ta-card" *ngIf="selectedTeamId">
          <h2>2 · Tactic and starting XI — {{ setup?.team?.name || selectedClubName }}</h2>
          <p class="ta-small">The game's tactics page for this club. SAVE (or Start) only keeps the tactic for the test.</p>
          <p class="ta-error" *ngIf="setupError">{{ setupError }}</p>
          <p class="ta-muted" *ngIf="!setup && !setupError">Loading squad and tactic…</p>
        </section>
        <app-tactic-arena-editor *ngIf="setup" [setup]="setup"></app-tactic-arena-editor>

        <section class="ta-card" *ngIf="setup" style="margin-top: 16px">
          <h2>3 · Name and start</h2>
          <div class="ta-form">
            <label class="ta-field">
              <span>Test name</span>
              <input type="text" [(ngModel)]="name" maxlength="80" placeholder="e.g. Gegenpress 4-2-3-1">
            </label>
            <div class="ta-actions">
              <button type="button" class="ta-btn primary" [disabled]="starting || !name.trim()" (click)="start()">
                {{ starting ? 'Starting…' : 'Start test' }}
              </button>
            </div>
          </div>
          <p class="ta-error" *ngIf="startError">{{ startError }}</p>
        </section>
      </ng-container>
    </div>
  `
})
export class TacticArenaNewComponent implements OnInit, OnDestroy {
  @ViewChild(TacticArenaEditorComponent) editor?: TacticArenaEditorComponent;

  leagues: ArenaLeague[] = [];
  leagueId: number | null = null;
  clubQuery = '';
  clubsError = '';
  selectedTeamId: number | null = null;
  selectedClubName = '';
  setup: ArenaSetup | null = null;
  setupError = '';
  name = '';
  starting = false;
  startError = '';

  testId: number | null = null;
  test: ArenaTestDetail | null = null;
  testError = '';
  cancelling = false;

  private setupSub?: Subscription;
  private poll?: Subscription;
  private querySub?: Subscription;
  private initialised = false;

  constructor(private api: TacticArenaService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe(params => {
      const id = Number(params.get('test')) || null;
      // The first emission must always run: without ?test= the id equals the initial null.
      if (this.initialised && id === this.testId) return;
      this.initialised = true;
      this.testId = id;
      this.test = null;
      this.poll?.unsubscribe();
      if (id) this.watch(id);
      else if (!this.leagues.length) this.loadClubs();
    });
  }

  ngOnDestroy(): void {
    this.setupSub?.unsubscribe();
    this.poll?.unsubscribe();
    this.querySub?.unsubscribe();
  }

  get active(): boolean { return isActive(this.test?.status); }

  get visibleClubs(): ArenaClub[] {
    const query = this.clubQuery.trim().toLowerCase();
    if (query) {
      return this.leagues.flatMap(league => league.teams)
        .filter(club => club.name.toLowerCase().includes(query)).slice(0, 60);
    }
    return this.leagues.find(league => league.competitionId === this.leagueId)?.teams || [];
  }

  trackClub(_: number, club: ArenaClub): number { return club.teamId; }

  private loadClubs(): void {
    this.api.clubs().subscribe({
      next: data => {
        this.leagues = data?.leagues || [];
        if (this.leagueId === null && this.leagues.length) this.leagueId = this.leagues[0].competitionId;
      },
      error: error => this.clubsError = error?.error?.error || 'The clubs could not be loaded.'
    });
  }

  pickClub(club: ArenaClub): void {
    if (club.teamId === this.selectedTeamId) return;
    this.selectedTeamId = club.teamId;
    this.selectedClubName = club.name;
    this.setup = null;
    this.setupError = '';
    this.setupSub?.unsubscribe();
    this.setupSub = this.api.setup(club.teamId).subscribe({
      next: setup => this.setup = setup,
      error: error => this.setupError = error?.error?.error || 'The club could not be loaded.'
    });
  }

  start(): void {
    if (!this.setup || this.starting) return;
    const tactic = this.editor?.buildTactic();
    if (!tactic) { this.startError = 'Pick exactly 11 starters on the pitch first.'; return; }
    this.starting = true;
    this.startError = '';
    this.api.start(this.name.trim(), this.setup.team.teamId, tactic).subscribe({
      next: response => {
        this.starting = false;
        void this.router.navigate([], { relativeTo: this.route, queryParams: { test: response.id } });
      },
      error: error => {
        this.starting = false;
        this.startError = error?.error?.error || 'The test could not be started.';
      }
    });
  }

  cancelTest(): void {
    if (!this.testId || this.cancelling) return;
    this.cancelling = true;
    this.api.cancel(this.testId).subscribe({
      next: () => this.cancelling = false,
      error: error => { this.cancelling = false; this.testError = error?.error?.error || 'The test could not be cancelled.'; }
    });
  }

  newTest(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  private watch(id: number): void {
    this.poll = timer(0, 2000).pipe(switchMap(() => this.api.test(id).pipe(
      catchError(error => {
        this.testError = error?.status === 404 ? 'This test no longer exists.' : (error?.error?.error || 'The test could not be loaded.');
        return EMPTY;
      })
    ))).subscribe(test => {
      this.test = test;
      this.testError = '';
      if (!isActive(test.status)) this.poll?.unsubscribe();
    });
  }
}
