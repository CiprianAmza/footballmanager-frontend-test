import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { urlApp } from '../app.component';
import { TeamService } from '../services/team.service';
import { FriendlyComponent } from './friendly.component';

describe('FriendlyComponent Phase 1A', () => {
  let fixture: ComponentFixture<FriendlyComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FriendlyComponent],
      imports: [FormsModule, HttpClientTestingModule, RouterTestingModule],
      providers: [{ provide: TeamService, useValue: { teamId: 5, currentSeason: 2 } }]
    }).compileComponents();
    fixture = TestBed.createComponent(FriendlyComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders both known teams as semantic links', () => {
    fixture.detectChanges();
    http.expectOne(urlApp + '/friendly/matches/5/2').flush([{
      matchId: 9,
      day: 4,
      status: 'SCHEDULED',
      homeTeamId: 5,
      homeTeamName: 'Cluj Orbit',
      awayTeamId: 8,
      awayTeamName: 'Nova FC'
    }]);
    fixture.detectChanges();

    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.team-link'))
      .map(link => link.getAttribute('href'));
    expect(hrefs).toEqual(['/team/5', '/team/8']);
  });
});
