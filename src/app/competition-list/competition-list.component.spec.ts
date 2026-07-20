import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { CompetitionsListComponent } from './competition-list.component';

describe('CompetitionsListComponent', () => {
  let component: CompetitionsListComponent;
  let fixture: ComponentFixture<CompetitionsListComponent>;
  let httpController: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  const teamService = { teamId: 6, currentSeason: 3 };

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [CompetitionsListComponent],
      imports: [HttpClientTestingModule],
      providers: [
        { provide: TeamService, useValue: teamService },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompetitionsListComponent);
    component = fixture.componentInstance;
    httpController = TestBed.inject(HttpTestingController);
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
  });

  it('opens a team competition on its dedicated page', () => {
    fixture.detectChanges();
    httpController.expectOne(urlApp + '/competition/getTeamCompetitions/6').flush([]);

    component.openCompetition({ competitionId: 10, typeId: 4, name: 'League of Champions' });
    expect(router.navigate).toHaveBeenCalledWith(['/european-rounds', 10, 3]);
  });
});
