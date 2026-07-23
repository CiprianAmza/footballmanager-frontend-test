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
});
