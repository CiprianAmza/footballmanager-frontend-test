import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { urlApp } from '../app.component';
import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';
import { ClubCompetition, ClubInfoComponent } from './club-info.component';

describe('ClubInfoComponent Phase 1A', () => {
  let component: ClubInfoComponent;
  let fixture: ComponentFixture<ClubInfoComponent>;
  let http: HttpTestingController;
  let teamService: jasmine.SpyObj<TeamService>;

  beforeEach(async () => {
    teamService = jasmine.createSpyObj<TeamService>('TeamService', ['getTeamCompetitions']);
    teamService.getTeamCompetitions.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [ClubInfoComponent],
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ teamId: '9' }) } },
        { provide: TeamService, useValue: teamService },
        { provide: GameEventsService, useValue: { on: () => EMPTY } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ClubInfoComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushSuccess(history: any[] = []): void {
    http.expectOne(urlApp + '/competition/getCurrentSeason').flush(3);
    http.expectOne(urlApp + '/teams/info/9').flush({ id: 9, name: 'Cluj Orbit', color1: '#123', color2: '#456' });
    http.expectOne(urlApp + '/history/teamCompetitionWins/9').flush(history);
    http.expectOne(urlApp + '/managers/current/team/9').flush({ found: false });
    http.expectOne(urlApp + '/game/facilities/9').flush({});
    http.expectOne(urlApp + '/stats/team/9/competitionBreakdown').flush([]);
    fixture.detectChanges();
  }

  it('classifies every real membership and builds canonical semantic links', () => {
    const memberships: ClubCompetition[] = [
      { competitionId: 11, name: 'Romanian First League', typeId: 1 },
      { competitionId: 12, name: 'National Cup', typeId: 2 },
      { competitionId: 13, name: 'League of Champions', typeId: 4 }
    ];
    teamService.getTeamCompetitions.and.returnValue(of(memberships));

    fixture.detectChanges();
    flushSuccess();

    expect(teamService.getTeamCompetitions).toHaveBeenCalledOnceWith(9);
    expect(component.domesticLeagues.map(item => item.competitionId)).toEqual([11]);
    expect(component.domesticCups.map(item => item.competitionId)).toEqual([12]);
    expect(component.europeanCompetitions.map(item => item.competitionId)).toEqual([13]);
    expect(component.competitionLink(memberships[2])).toEqual(['/european-rounds', 13, '3']);

    const page = fixture.nativeElement as HTMLElement;
    const text = page.textContent || '';
    expect(text).not.toContain('Premier League');
    expect(text).toContain('N/A');
    const hrefs = Array.from(page.querySelectorAll<HTMLAnchorElement>('.membership-group a'))
      .map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/comp/11');
    expect(hrefs).toContain('/comp/12');
    expect(hrefs).toContain('/european-rounds/13/3');
  });

  it('shows an honest empty membership state instead of selecting a fallback competition', () => {
    fixture.detectChanges();
    flushSuccess();
    expect(component.hasActiveMemberships).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('No active competition membership');
  });

  it('links Stadium only when the viewed club is the controlled team', () => {
    teamService.teamId = 4;
    fixture.detectChanges();
    flushSuccess();

    const page = fixture.nativeElement as HTMLElement;
    expect(component.isControlledClub).toBeFalse();
    expect(page.querySelector<HTMLAnchorElement>('a[href="/stadium"]')).toBeNull();

    teamService.teamId = 9;
    fixture.detectChanges();
    expect(component.isControlledClub).toBeTrue();
    expect(page.querySelector<HTMLAnchorElement>('a[href="/stadium"]')).not.toBeNull();
  });

  it('distinguishes an unavailable manager lookup from a valid vacant role and retries it', () => {
    fixture.detectChanges();
    http.expectOne(urlApp + '/competition/getCurrentSeason').flush(3);
    http.expectOne(urlApp + '/teams/info/9').flush({ id: 9, name: 'Cluj Orbit', color1: '#123', color2: '#456' });
    http.expectOne(urlApp + '/history/teamCompetitionWins/9').flush([]);
    http.expectOne(urlApp + '/managers/current/team/9')
      .flush('failed', { status: 503, statusText: 'Unavailable' });
    http.expectOne(urlApp + '/game/facilities/9').flush({});
    http.expectOne(urlApp + '/stats/team/9/competitionBreakdown').flush([]);
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(component.managerUnavailable).toBeTrue();
    expect(page.querySelector('.people-list')?.textContent).toContain('Manager data unavailable');
    expect(page.querySelector('.people-list')?.textContent).not.toContain('Vacant');

    component.retryManager();
    http.expectOne(urlApp + '/managers/current/team/9').flush({ found: false });
    fixture.detectChanges();
    expect(component.managerUnavailable).toBeFalse();
    expect(page.querySelector('.people-list')?.textContent).toContain('Vacant');
  });

  it('distinguishes unavailable competition records from a valid empty result and retries them', () => {
    fixture.detectChanges();
    http.expectOne(urlApp + '/competition/getCurrentSeason').flush(3);
    http.expectOne(urlApp + '/teams/info/9').flush({ id: 9, name: 'Cluj Orbit', color1: '#123', color2: '#456' });
    http.expectOne(urlApp + '/history/teamCompetitionWins/9').flush([]);
    http.expectOne(urlApp + '/managers/current/team/9').flush({ found: false });
    http.expectOne(urlApp + '/game/facilities/9').flush({});
    http.expectOne(urlApp + '/stats/team/9/competitionBreakdown')
      .flush('failed', { status: 503, statusText: 'Unavailable' });
    component.switchTab('stats');
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(component.competitionBreakdownUnavailable).toBeTrue();
    expect(page.textContent).toContain('Competition records are unavailable');
    expect(page.textContent).not.toContain('No competition records yet');

    component.loadCompetitionBreakdown();
    http.expectOne(urlApp + '/stats/team/9/competitionBreakdown').flush([]);
    fixture.detectChanges();
    expect(component.competitionBreakdownUnavailable).toBeFalse();
    expect(page.textContent).toContain('No competition records yet');
  });

  it('shows a retryable error when critical club data fails', () => {
    fixture.detectChanges();
    http.expectOne(urlApp + '/competition/getCurrentSeason').flush(3);
    const teamRequest = http.expectOne(urlApp + '/teams/info/9');
    http.expectOne(urlApp + '/history/teamCompetitionWins/9').flush([]);
    http.expectOne(urlApp + '/managers/current/team/9').flush({ found: false });
    teamRequest.flush('failed', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(component.errorMessage).toContain('could not be loaded');
    expect(page.querySelector('button')?.textContent).toContain('Retry');
  });
});
