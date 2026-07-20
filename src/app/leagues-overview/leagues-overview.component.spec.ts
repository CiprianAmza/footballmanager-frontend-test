import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { LeaguesOverviewComponent } from './leagues-overview.component';

describe('LeaguesOverviewComponent', () => {
  let component: LeaguesOverviewComponent;
  let fixture: ComponentFixture<LeaguesOverviewComponent>;
  let httpController: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  const teamService = {
    currentSeason: 3,
    refresh$: new Subject<void>()
  };

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [LeaguesOverviewComponent],
      imports: [FormsModule, HttpClientTestingModule],
      providers: [
        { provide: TeamService, useValue: teamService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LeaguesOverviewComponent);
    component = fixture.componentInstance;
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  function flushPage(catalog: any[]): void {
    httpController.expectOne(urlApp + '/competition/getAllCompetitions').flush(catalog);
    httpController.expectOne(urlApp + '/competition/leaguesOverview?topN=5').flush({
      season: 3,
      topN: 5,
      leagues: []
    });
    httpController.expectOne(urlApp + '/competition/cupsOverview').flush({ season: 3, cups: [] });
  }

  it('opens on the global catalog and loads every competition', () => {
    fixture.detectChanges();
    flushPage([
      { id: 2, nationId: 1, typeId: 2, name: 'Zeta Cup' },
      { id: 1, nationId: 1, typeId: 1, name: 'Alpha League' },
      { id: 10, nationId: 0, typeId: 4, name: 'League of Champions' }
    ]);

    expect(component.view).toBe('all');
    expect(component.competitions.map(competition => competition.name)).toEqual([
      'Alpha League',
      'League of Champions',
      'Zeta Cup'
    ]);

    component.competitionSearch = 'champions';
    expect(component.filteredCompetitions.map(competition => competition.name)).toEqual(['League of Champions']);
  });

  it('navigates from Overview to domestic and European competition pages', () => {
    fixture.detectChanges();
    flushPage([]);

    component.openCompetition({ competitionId: 4, nationId: 3, typeId: 2, name: 'Khess Cup' });
    component.openCompetition({ competitionId: 10, nationId: 0, typeId: 4, name: 'League of Champions' });

    expect(router.navigate.calls.argsFor(0)).toEqual([['/comp', 4]]);
    expect(router.navigate.calls.argsFor(1)).toEqual([['/european-rounds', 10, 3]]);
  });

  it('labels the focus cup round instead of the last played round', () => {
    const staleBackendCup = {
      totalRounds: 4,
      lastPlayedRound: 3,
      focusRound: 4,
      currentRoundName: 'Semi-Final'
    } as any;

    expect(component.cupRoundName(staleBackendCup)).toBe('Final');
  });

  it('loads season rankings only when the Statistics tab is opened', () => {
    fixture.detectChanges();
    flushPage([]);

    component.setView('statistics');
    const request = httpController.expectOne(urlApp + '/stats/overview/3?limit=10&scope=LEAGUE');
    request.flush({
      season: 3,
      scope: 'LEAGUE',
      scopeLabel: 'Domestic leagues',
      scoringTitle: 'Golden Boot',
      goldenBootRule: 'First League goal = 1.0 point; Second League goal = 0.5 points',
      categoriesScope: 'Domestic leagues',
      goldenBoot: [{ playerId: 1, weightedGoals: 8 }],
      categories: []
    });

    expect(component.view).toBe('statistics');
    expect(component.statistics?.goldenBoot[0].weightedGoals).toBe(8);

    component.setStatisticsScope('CUP');
    httpController.expectOne(urlApp + '/stats/overview/3?limit=10&scope=CUP').flush({
      season: 3,
      scope: 'CUP',
      scopeLabel: 'Domestic cups',
      scoringTitle: 'Cup top scorers',
      goldenBootRule: 'Only domestic cup matches are included.',
      categoriesScope: 'Domestic cups',
      goldenBoot: [],
      categories: []
    });
    expect(component.statisticsScope).toBe('CUP');
    expect(component.statistics?.scope).toBe('CUP');
  });
});
