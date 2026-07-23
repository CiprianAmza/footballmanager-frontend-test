import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { CompetitionsListComponent } from './competition-list.component';

describe('CompetitionsListComponent', () => {
  let component: CompetitionsListComponent;
  let fixture: ComponentFixture<CompetitionsListComponent>;
  let httpController: HttpTestingController;
  let router: Router;

  const teamService = { teamId: 6, currentSeason: 3 };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CompetitionsListComponent],
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: TeamService, useValue: teamService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompetitionsListComponent);
    component = fixture.componentInstance;
    httpController = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpController.verify());

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
    expect(hrefs).toContain('/comp/20');
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
});
