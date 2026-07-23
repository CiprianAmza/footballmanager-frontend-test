import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlApp } from '../app.component';
import { GameSetupComponent } from './game-setup.component';

describe('GameSetupComponent', () => {
  let component: GameSetupComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      declarations: [GameSetupComponent]
    });
    component = TestBed.createComponent(GameSetupComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows the backend reason when manager setup is rejected', () => {
    component.managerName = 'Alice';
    component.selectedTeamId = 7;

    component.submit();

    const request = http.expectOne(urlApp + '/api/career/manager/setup');
    request.flush({ error: 'Team is controlled by another user' }, {
      status: 409,
      statusText: 'Conflict'
    });

    expect(component.error).toBe('Team is controlled by another user');
    expect(component.submitting).toBeFalse();
  });

  it('explains an expired session instead of showing a generic setup failure', () => {
    component.managerName = 'Alice';
    component.selectedTeamId = 7;

    component.submit();

    const request = http.expectOne(urlApp + '/api/career/manager/setup');
    request.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(component.error).toBe('Your session has expired. Please log in again.');
  });
});
