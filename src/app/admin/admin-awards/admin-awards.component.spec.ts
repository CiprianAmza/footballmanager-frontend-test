import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { AdminService, BallonDorAdminState } from '../../services/admin.service';
import { AdminAwardsComponent } from './admin-awards.component';

describe('AdminAwardsComponent', () => {
  let fixture: ComponentFixture<AdminAwardsComponent>;
  let component: AdminAwardsComponent;
  let adminService: jasmine.SpyObj<AdminService>;

  const initialState: BallonDorAdminState = {
    season: 3,
    finalized: false,
    recommendedWinnerId: 10,
    overrideWinnerId: null,
    winnerId: null,
    adminSelected: false,
    candidates: [
      {
        rank: 1, playerId: 10, playerName: 'Vote Leader', teamId: 1, teamName: 'Alpha',
        position: 'ST', appearances: 34, goals: 24, assists: 8,
        weightedGoals: 96, weightedAssists: 32, averageRating: 8.11,
        votingPoints: 480, firstPlaceVotes: 72, selected: false,
        baseFaceId: 0, skinTone: 1, hairStyle: 1, hairColor: 1, eyeColor: 1,
        faceShape: 1, noseShape: 1, eyeShape: 1, mouthShape: 1, browShape: 1, species: 'human'
      },
      {
        rank: 2, playerId: 20, playerName: 'Admin Favourite', teamId: 2, teamName: 'Beta',
        position: 'AMC', appearances: 31, goals: 15, assists: 17,
        weightedGoals: 45, weightedAssists: 51, averageRating: 7.88,
        votingPoints: 356, firstPlaceVotes: 20, selected: false,
        baseFaceId: 0, skinTone: 2, hairStyle: 2, hairColor: 2, eyeColor: 2,
        faceShape: 2, noseShape: 2, eyeShape: 2, mouthShape: 2, browShape: 2, species: 'human'
      }
    ]
  };

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>(
      'AdminService',
      ['ballonDorState', 'setBallonDorWinner', 'clearBallonDorWinner', 'logout'],
      { isAuthenticated: true }
    );
    adminService.ballonDorState.and.returnValue(of(initialState));

    await TestBed.configureTestingModule({
      declarations: [AdminAwardsComponent],
      imports: [CommonModule, RouterTestingModule],
      providers: [{ provide: AdminService, useValue: adminService }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAwardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the statistical ranking and allows an admin winner override', () => {
    const overridden = {
      ...initialState,
      overrideWinnerId: 20,
      candidates: initialState.candidates.map(candidate => ({
        ...candidate,
        selected: candidate.playerId === 20
      }))
    };
    adminService.setBallonDorWinner.and.returnValue(of(overridden));
    spyOn(window, 'confirm').and.returnValue(true);

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Statistical leader');

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.choose-button')
    );
    buttons[1].click();
    fixture.detectChanges();

    expect(adminService.setBallonDorWinner).toHaveBeenCalledWith(3, 20);
    expect(component.state?.overrideWinnerId).toBe(20);
    expect(fixture.nativeElement.textContent).toContain('Admin selection');
  });
});
