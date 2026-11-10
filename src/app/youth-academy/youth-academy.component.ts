import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AcademyIntelligenceService, AcademyOverview, AcademyProspect, AcademyRank, YouthFacilityOption } from '../services/academy-intelligence.service';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';

type AcademyTab = 'overview' | 'prospects' | 'facilities';
type AcademyRankingSort = 'rank' | 'club' | 'score' | 'academy' | 'training' | 'prospects' | 'graduates';

@Component({
  selector: 'app-youth-academy',
  templateUrl: './youth-academy.component.html',
  styleUrls: ['./youth-academy.component.css']
})
export class YouthAcademyComponent implements OnInit, OnDestroy {
  data?: AcademyOverview;
  tab: AcademyTab = 'overview';
  loading = true;
  error = '';
  message = '';
  query = '';
  filter = 'ALL';
  sort = 'POTENTIAL';
  selected?: AcademyProspect;
  acting = false;
  upgrading = '';
  rankingScope: 'league' | 'world' = 'league';
  rankingSort: AcademyRankingSort = 'rank';
  rankingSortDirection: 'asc' | 'desc' = 'asc';
  private rankingLoaded = false;
  private requestId = 0;
  private sub = new Subscription();

  constructor(private api: AcademyIntelligenceService, public team: TeamService,
              private events: GameEventsService, private feedback: UiFeedbackService,
              private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.sub.add(this.route.queryParamMap.subscribe(params => {
      const requested = params.get('tab');
      this.tab = requested === 'prospects' || requested === 'facilities' ? requested : 'overview';
      if (this.tab === 'facilities' && this.data && !this.rankingLoaded) this.load(true);
    }));
    this.sub.add(this.team.teamId$.subscribe(id => {
      if (id > 0) this.load(this.tab === 'facilities');
    }));
    this.sub.add(this.events.on('youth').subscribe(() => this.load(this.tab === 'facilities')));
    this.sub.add(this.team.refresh$.subscribe(() => this.load(this.tab === 'facilities')));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  setTab(tab: AcademyTab): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: tab === 'overview' ? {} : { tab },
      queryParamsHandling: '', replaceUrl: false });
  }

  load(includeRanking = false): void {
    if (!this.team.teamId) return;
    const request = ++this.requestId;
    this.loading = !this.data;
    this.error = '';
    this.api.overview(this.team.teamId, includeRanking).subscribe({
      next: data => {
        if (request !== this.requestId) return;
        this.data = data;
        this.rankingLoaded = includeRanking;
        this.selected = data.prospects.find(player => player.id === this.selected?.id) || data.prospects[0];
        this.loading = false;
      },
      error: () => {
        if (request !== this.requestId) return;
        this.error = 'Academy data could not be loaded. Please try again.';
        this.loading = false;
      }
    });
  }

  get prospects(): AcademyProspect[] {
    let rows = [...(this.data?.prospects || [])];
    const query = this.query.trim().toLowerCase();
    if (query) rows = rows.filter(player => `${player.name} ${player.position}`.toLowerCase().includes(query));
    if (this.filter !== 'ALL') rows = rows.filter(player => player.recommendation === this.filter);
    if (this.sort === 'ABILITY') rows.sort((a, b) => b.currentAbility - a.currentAbility);
    else if (this.sort === 'READINESS') rows.sort((a, b) => b.readinessPercent - a.readinessPercent);
    else if (this.sort === 'AGE') rows.sort((a, b) => a.age - b.age);
    else rows.sort((a, b) => b.potentialAbility - a.potentialAbility);
    return rows;
  }

  get priorityProspects(): AcademyProspect[] {
    return (this.data?.prospects || []).filter(player => player.recommendation === 'READY' ||
      player.recommendation === 'PRIORITY' || player.recommendation === 'REVIEW').slice(0, 4);
  }

  get ranking(): AcademyRank[] {
    const rows = [...(this.data?.ranking || [])];
    const visible = this.rankingScope === 'league'
      ? rows.filter(row => row.leagueRank > 0) : rows;
    const value = (row: AcademyRank): number | string => {
      switch (this.rankingSort) {
        case 'rank': return this.rankingScope === 'league' ? row.leagueRank : row.worldRank;
        case 'club': return row.teamName;
        case 'score': return row.score;
        case 'academy': return row.academyLevel;
        case 'training': return row.trainingLevel;
        case 'prospects': return row.activeProspects;
        case 'graduates': return row.graduates;
      }
    };
    const direction = this.rankingSortDirection === 'asc' ? 1 : -1;
    return visible.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const difference = typeof left === 'string' && typeof right === 'string'
        ? left.localeCompare(right, undefined, { sensitivity: 'base' })
        : Number(left) - Number(right);
      return direction * difference
        || (this.rankingScope === 'league' ? a.leagueRank - b.leagueRank : a.worldRank - b.worldRank)
        || a.teamName.localeCompare(b.teamName);
    });
  }

  sortRanking(column: AcademyRankingSort): void {
    if (this.rankingSort === column) {
      this.rankingSortDirection = this.rankingSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.rankingSort = column;
      this.rankingSortDirection = column === 'rank' || column === 'club' ? 'asc' : 'desc';
    }
  }

  rankingSortIndicator(column: AcademyRankingSort): string {
    return this.rankingSort === column ? (this.rankingSortDirection === 'asc' ? '▲' : '▼') : '↕';
  }

  rankingAriaSort(column: AcademyRankingSort): string | null {
    if (this.rankingSort !== column) return null;
    return this.rankingSortDirection === 'asc' ? 'ascending' : 'descending';
  }

  get nextReportLabel(): string {
    if (this.nextReportDay == null) return 'No further report scheduled';
    const days = Math.max(0, this.nextReportDay - this.currentDay);
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  }

  get nextReportHint(): string {
    return this.nextReportDay == null ? 'Check again next season' :
      `Season ${this.data?.season || this.team.currentSeason} · day ${this.nextReportDay}`;
  }

  get currentDay(): number { return this.data?.currentDay || this.team.currentDay; }

  get nextReportDay(): number | null {
    if (this.data && this.data.nextReportDay !== undefined) return this.data.nextReportDay;
    // Older running servers do not expose the scheduled event yet. Their fixture
    // generator uses these report days; this keeps the live save usable without a restart.
    return [30, 90, 180, 270, 340].find(day => day >= this.currentDay) ?? null;
  }

  get positionEntries(): [string, number][] {
    return Object.entries(this.data?.positionCoverage || {});
  }

  get intakePotentialBonus(): number {
    return Math.max(0, (this.data?.academyLevel || 1) - 1) * 2;
  }

  select(player: AcademyProspect): void { this.selected = player; this.message = ''; }

  promote(): void {
    const player = this.selected;
    if (!player || this.acting) return;
    this.acting = true;
    this.api.promote(player.id).subscribe({
      next: () => {
        this.acting = false;
        this.message = `${player.name} was promoted to the first team.`;
        this.events.emit('squad', 'youth');
        this.selected = undefined;
        this.load(this.tab === 'facilities');
      },
      error: () => { this.acting = false; this.message = 'Promotion could not be completed.'; }
    });
  }

  async release(): Promise<void> {
    const player = this.selected;
    if (!player || this.acting) return;
    const confirmed = await this.feedback.confirm(`Release ${player.name} from the academy?`,
      { title: 'Release prospect', confirmLabel: 'Release', tone: 'error' });
    if (!confirmed) return;
    this.acting = true;
    this.api.release(player.id).subscribe({
      next: () => {
        this.acting = false;
        this.message = `${player.name} was released.`;
        this.selected = undefined;
        this.load(this.tab === 'facilities');
      },
      error: () => { this.acting = false; this.message = 'Release could not be completed.'; }
    });
  }

  upgrade(facility: YouthFacilityOption): void {
    if (!this.data || !facility.canUpgrade || facility.upgrading ||
        this.data.clubFinances < facility.upgradeCost || this.upgrading) return;
    this.upgrading = facility.type;
    this.message = '';
    this.api.upgrade(facility.type).subscribe({
      next: result => {
        this.upgrading = '';
        this.message = result ? `${facility.name} upgrade started.` : 'Upgrade could not be started. Check club funds.';
        if (result) {
          this.events.emit('stadium', 'finances');
          this.load(true);
        }
      },
      error: () => { this.upgrading = ''; this.message = 'Upgrade could not be started.'; }
    });
  }

  daysRemaining(facility: YouthFacilityOption): number {
    if (!this.data || !facility.upgrading) return 0;
    const elapsed = facility.startSeason < this.data.season
      ? (365 - facility.startDay) + this.data.currentDay
      : this.data.currentDay - facility.startDay;
    return Math.max(0, facility.durationDays - elapsed);
  }

  money(value: number): string {
    return value >= 1e6 ? `€${(value / 1e6).toFixed(1)}m` :
      value >= 1e3 ? `€${(value / 1e3).toFixed(0)}k` : `€${value}`;
  }

  width(value: number): number { return Math.max(0, Math.min(100, value)); }
}
