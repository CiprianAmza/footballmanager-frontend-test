import { CommonModule } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';

import { HomeComponent } from './home.component';
import { TeamService } from '../services/team.service';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let httpTestingController: HttpTestingController;
  let teamIdSubject: BehaviorSubject<number>;
  let refreshSubject: Subject<void>;
  let teamService: Pick<TeamService, 'teamId' | 'teamId$' | 'managerFired' | 'managerFired$' | 'refresh$'>;

  beforeEach(async () => {
    teamIdSubject = new BehaviorSubject<number>(0);
    refreshSubject = new Subject<void>();
    teamService = {
      teamId: 0,
      teamId$: teamIdSubject.asObservable(),
      managerFired: false,
      managerFired$: new BehaviorSubject<boolean>(false).asObservable(),
      refresh$: refreshSubject.asObservable()
    };

    await TestBed.configureTestingModule({
      declarations: [HomeComponent],
      imports: [CommonModule, HttpClientTestingModule, RouterTestingModule],
      providers: [{ provide: TeamService, useValue: teamService }],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('waits for a real team id before loading dashboard data', () => {
    expect(teamService.teamId).toBe(0);
    httpTestingController.expectNone(() => true);
  });

  it('maps real form results to their dashboard classes', () => {
    expect(component.getFormClass('W')).toBe('form-win');
    expect(component.getFormClass('D')).toBe('form-draw');
    expect(component.getFormClass('L')).toBe('form-loss');
    expect(component.getFormClass('-')).toBe('');
  });

  it('does not render team or individual talk controls', () => {
    const text = fixture.nativeElement.textContent.toUpperCase();

    expect(text).not.toContain('TEAM TALK');
    expect(text).not.toContain('INDIVIDUAL PLAYER TALK');
    expect(fixture.nativeElement.querySelector('.team-talk-section')).toBeNull();
  });

  it('loads real dashboard widgets without issuing talk requests', () => {
    teamService.teamId = 7;
    teamIdSubject.next(7);

    httpTestingController.expectNone(request =>
      /teamTalk|playerTalk/.test(request.urlWithParams)
      || request.url.endsWith('/tactic/getPlayers/7')
    );

    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/teams/getTeamNameById/7')
    ).flush('Hermes FC');

    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/competition/getTeamCompetitions/7')
    ).flush([{
      typeId: 1,
      competitionId: 99,
      name: 'Test League',
      position: 2,
      points: 10,
      form: 'WWD'
    }]);
    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/competition/getTeams/99')
    ).flush([]);

    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/match/getScheduleForCurrentSeasonAndTeamId/7')
    ).flush([
      { score: '2-1', opponentTeam: 'Old Town', competitionName: 'Test League', homeOrAway: 'H' },
      { score: '-', opponentTeam: 'Next Town', competitionName: 'Test League', homeOrAway: 'A' }
    ]);

    const preview = { homeTeamName: 'Hermes FC', awayTeamName: 'Next Town' };
    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/match/preview/7')
    ).flush(preview);

    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/teams/finances/7')
    ).flush({ transferBudget: 5_000_000, totalFinances: 8_000_000, boardConfidence: 72 });

    const objective = { objectiveType: 'league_position', targetValue: 4, status: 'active' };
    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/objectives/current/7')
    ).flush([objective]);

    const boardRequest = { requestType: 'RESULTS', description: 'Maintain current form', status: 'ACTIVE' };
    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/game/boardRequests/7')
    ).flush([boardRequest]);

    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/competition/getCurrentSeason')
    ).flush(4);
    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.url.endsWith('/game/leagueNews/4')
    ).flush([]);
    httpTestingController.expectOne(request =>
      request.method === 'GET' && request.urlWithParams.endsWith('/stats/team/7/season/4?limit=3')
    ).flush([]);

    expect(component.teamName).toBe('Hermes FC');
    expect(component.form).toBe('WWD');
    expect(component.recentResults.length).toBe(1);
    expect(component.nextMatch?.opponentTeam).toBe('Next Town');
    expect(component.matchPreview).toEqual(preview);
    expect(component.seasonObjectives).toEqual([objective]);
    expect(component.boardRequests).toEqual([boardRequest]);
  });
});
