import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { urlApp } from '../app.component';
import { AuthService } from '../services/auth.service';
import { ChairmanClubService } from '../services/chairman-club.service';
import { TeamService } from '../services/team.service';
import { CompetitionsListComponent } from './competition-list.component';

describe('CompetitionsListComponent', () => {
  let component: CompetitionsListComponent;
  let fixture: ComponentFixture<CompetitionsListComponent>;
  let httpController: HttpTestingController;
  let router: Router;

  const teamService = { teamId: 6, currentSeason: 3, teamId$: new BehaviorSubject(6), currentSeason$: new BehaviorSubject(3) };
  const authService = { careerRole: 'MANAGER' };
  const chairmanClubService = jasmine.createSpyObj<ChairmanClubService>('ChairmanClubService', ['clubs']);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CompetitionsListComponent],
      imports: [FormsModule, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: TeamService, useValue: teamService },
        { provide: AuthService, useValue: authService },
        { provide: ChairmanClubService, useValue: chairmanClubService }
      ]
    }).compileComponents();

    authService.careerRole = 'MANAGER';
    teamService.teamId = 6;
    teamService.teamId$.next(6);
    chairmanClubService.clubs.calls.reset();

    fixture = TestBed.createComponent(CompetitionsListComponent);
    component = fixture.componentInstance;
    httpController = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    // Dashboard enrichment is optional for navigation and membership tests.
    httpController.match(request => /\/objectives\/|\/competition-leaders$|\/getTeams\/|\/getMatchesByCompetitionAndSeason\//.test(request.url))
      .forEach(request => request.flush([]));
    httpController.verify();
  });

  it('loads only the current team competitions and removes duplicates', () => {
    fixture.detectChanges();

    const request = httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6');
    expect(request.request.method).toBe('GET');
    request.flush([
      { competitionId: 1, typeId: 1, name: 'Gallactick League' },
      { competitionId: 1, typeId: 1, name: 'Gallactick League' },
      { competitionId: 2, typeId: 2, name: 'Gallactick Cup' }
    ]);

    expect(component.competitions.length).toBe(2);
    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toBe('');
  });

  it('highlights the active club and renders real objectives, leaders and shortcuts', () => {
    fixture.detectChanges();
    httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6').flush([
      { competitionId: 3, typeId: 1, name: 'Khess First League', games: 1, position: 1 }
    ]);
    httpController.expectOne(urlApp + '/objectives/6/3').flush([
      { competitionId: 3, objectiveType: 'league_position', description: 'Finish in the top 3', targetValue: 3, status: 'active' }
    ]);
    httpController.expectOne(urlApp + '/stats/team/6/season/3/competition-leaders').flush([
      { competitionId: 3, goals: [{ playerId: 21, playerName: 'Ari Forward', value: 2 }], assists: [], rating: [] }
    ]);
    httpController.expectOne(urlApp + '/competition/getTeams/3').flush([
      { teamId: 6, name: 'Home FC', position: 1, points: 3 },
      { teamId: 7, name: 'Away FC', position: 2, points: 0 }
    ]);
    httpController.expectOne(urlApp + '/competition/getMatchesByCompetitionAndSeason/3/3').flush([
      { roundId: 1, team1Id: 6, team2Id: 7, score: '2 - 0' }
    ]);
    fixture.detectChanges();

    const card = (fixture.nativeElement as HTMLElement).querySelector('.comp-card')!;
    expect(card.querySelector('.current-club')?.textContent).toContain('Home FC');
    expect(card.querySelector('.position-chart')).not.toBeNull();
    expect(card.querySelector('.objective-status')?.textContent).toContain('On track');
    expect(card.querySelector('.club-leaders a')?.getAttribute('href')).toBe('/player/21');
    expect(card.querySelector('.card-shortcuts a')?.getAttribute('href')).toBe('/competition/3/stats?view=team-overview');
  });

  it('uses the group table and qualifying outcome from the club campaign', () => {
    fixture.detectChanges();
    httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6').flush([{
      competitionId: 10, typeId: 4, name: 'League of Champions', groupNumber: 2, currentRound: 7,
      groupStandings: [
        { teamId: 6, teamName: 'Home FC', position: 1, played: 6, wins: 4, draws: 2, losses: 0,
          points: 14, goalDifference: 8, qualificationFinal: true, qualificationRoute: 'DIRECT' }
      ]
    }]);
    fixture.detectChanges();
    const group = (fixture.nativeElement as HTMLElement).querySelector('.campaign-table')!;
    expect(group.querySelector('.current-club')?.textContent).toContain('Qualified');
    expect(group.querySelector('h3')?.textContent).toBe('Group 2');
    expect(group.querySelector(':scope > a')?.getAttribute('href')).toContain('/european-rounds/10/3?view=groups&group=2');
  });

  it('opens a team competition on its dedicated page', () => {
    fixture.detectChanges();
    httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6').flush([]);

    const navigate = spyOn(router, 'navigate');
    component.openCompetition({ competitionId: 10, typeId: 4, name: 'League of Champions' });
    expect(navigate).toHaveBeenCalledWith(['/european-rounds', 10, 3]);
  });

  it('renders semantic links for competitions, opponents and eliminators', () => {
    fixture.detectChanges();
    httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6').flush([{
      competitionId: 20,
      typeId: 2,
      name: 'National Cup',
      nextMatch: { round: 2, stage: 'Quarter-final', opponentTeamId: 31, opponentTeamName: 'Orbit FC', venue: 'HOME' },
      elimination: { round: 3, stage: 'Semi-final', byTeamId: 32, byTeamName: 'Nova FC' }
    }]);
    fixture.detectChanges();

    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a'))
      .map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/competition/20');
    expect(hrefs).toContain('/team/31');
    expect(hrefs).toContain('/team/32');
  });

  it('distinguishes empty data from a retryable request error', () => {
    fixture.detectChanges();
    httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6')
      .flush('failed', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toContain('could not be loaded');
    expect((fixture.nativeElement as HTMLElement).querySelector('.error-state button')?.textContent)
      .toContain('Retry');
  });

  it('loads the controlled club competitions for a chairman instead of requesting team zero', () => {
    authService.careerRole = 'CHAIRMAN';
    teamService.teamId = 0;
    chairmanClubService.clubs.and.returnValue(of([{
      teamId: 19,
      name: 'Shadows',
      controlledByPrincipal: true
    } as any]));

    fixture.detectChanges();

    expect(chairmanClubService.clubs).toHaveBeenCalledOnceWith('CONTROLLED');
    const request = httpController.expectOne(urlApp + '/competition/getTeamCompetitions/19');
    expect(request.request.method).toBe('GET');
    request.flush([{ competitionId: 3, typeId: 1, name: 'Gallactick League' }]);
    fixture.detectChanges();

    expect(component.selectedTeamId).toBe(19);
    expect(component.selectedTeamName).toBe('Shadows');
    expect(component.competitions.length).toBe(1);
  });
});
