import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { AuthService } from './services/auth.service';
import { TeamService } from './services/team.service';
import { CareerService } from './services/career.service';

describe('AppComponent', () => {
  const auth = {
    isLoggedIn: true,
    careerRole: 'MANAGER',
    chairmanEnabled: true,
    currentUsername: 'test-user',
    sessionRestored$: of(null)
  } as any;
  const team = {
    setupComplete: true,
    setupComplete$: of(true),
    setupChecked: true,
    lastEvents$: of([]),
    dayOfWeek: 'Monday', dateDisplay: '1 Jan', currentPhase: 'MORNING',
    seasonPhase: 'REGULAR', currentSeason: 1, alwaysContinue: true,
    managerFired: false, teamId: 1
  } as any;
  const career = { pendingOffers$: of([]), refresh: jasmine.createSpy('refresh') } as any;

  beforeEach(async () => {
    auth.careerRole = 'MANAGER';
    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule
        , HttpClientTestingModule
        , CommonModule
        , FormsModule
      ],
      declarations: [
        AppComponent
      ],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: TeamService, useValue: team },
        { provide: CareerService, useValue: career }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'footballmanagersimulator-frontend'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('footballmanagersimulator-frontend');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders the common simulation shell for a manager', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.simulationStopMessage = 'Simulation stopped';
    auth.careerRole = 'MANAGER';
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.continue-btn').length).toBe(1);
    expect(root.querySelectorAll('.fast-forward-btn').length).toBe(1);
    expect(root.querySelector('.continue-btn')?.textContent).toContain('CONTINUE');
    expect(root.querySelector('.fast-forward-btn')?.textContent).toContain('FAST FORWARD');
    expect(root.querySelectorAll('.simulation-stop-banner').length).toBe(1);
    expect(root.querySelector('.chairman-save-load')).toBeNull();
  });

  it('renders the common simulation shell plus Save/Load for a chairman', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.simulationStopMessage = 'Simulation stopped';
    auth.careerRole = 'CHAIRMAN';
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.continue-btn').length).toBe(1);
    expect(root.querySelectorAll('.fast-forward-btn').length).toBe(1);
    expect(root.querySelector('.continue-btn')?.textContent).toContain('CONTINUE');
    expect(root.querySelector('.fast-forward-btn')?.textContent).toContain('FAST FORWARD');
    expect(root.querySelectorAll('.simulation-stop-banner').length).toBe(1);
    expect(root.querySelector('.chairman-save-load')?.textContent).toContain('Save Game');
    expect(root.querySelector('.chairman-save-load')?.textContent).toContain('Load Game');
  });

  it('uses the authoritative live formation instead of inferring it from natural positions', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.lineupPreviewData = {
      homeTeamId: 1,
      awayTeamId: 2,
      homeFormation: '4231',
      awayFormation: '4411',
      players: [
        { teamId: 1, position: 'GK' },
        { teamId: 1, position: 'DC' },
        { teamId: 1, position: 'AMC' },
        { teamId: 1, position: 'ST' }
      ]
    };

    expect(app.formationOf(1)).toBe('4-2-3-1');
    expect(app.formationOf(2)).toBe('4-4-1-1');
  });

  it('carries authoritative formations into the interactive lineup preview', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance as any;

    const preview = app.buildLineupFromMatch({
      homeTeamId: 1,
      awayTeamId: 2,
      homeTeamName: 'Home',
      awayTeamName: 'Away',
      homeFormation: '352',
      awayFormation: '433',
      homePitch: [{ playerId: 10, position: 'ST' }],
      awayPitch: [{ playerId: 20, position: 'DC' }]
    });

    expect(preview.homeFormation).toBe('352');
    expect(preview.awayFormation).toBe('433');
  });
});
