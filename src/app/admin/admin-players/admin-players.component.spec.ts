import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AdminService } from '../../services/admin.service';
import { AdminPlayersComponent } from './admin-players.component';

describe('AdminPlayersComponent', () => {
  let component: AdminPlayersComponent;
  let fixture: ComponentFixture<AdminPlayersComponent>;
  let adminService: jasmine.SpyObj<AdminService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>(
      'AdminService',
      ['generatePlayer', 'logout'],
      { isAuthenticated: true }
    );
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [AdminPlayersComponent],
      imports: [FormsModule],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPlayersComponent);
    component = fixture.componentInstance;
  });

  it('sends a 1-300 rating using the backend field name', () => {
    adminService.generatePlayer.and.returnValue(of({ playerId: 42, name: 'Test Player' }));
    component.teamId = 6;
    component.rating = 300;

    component.generate();

    expect(adminService.generatePlayer).toHaveBeenCalledWith(jasmine.objectContaining({
      teamId: 6,
      position: 'MC',
      rating: 300
    }));
    expect(component.resultOk).toBeTrue();
    expect(component.resultMessage).toContain('#42');
  });

  it('does not send ratings outside the supported range', () => {
    component.rating = 301;

    component.generate();

    expect(adminService.generatePlayer).not.toHaveBeenCalled();
    expect(component.resultMessage).toBe('Rating must be between 1 and 300.');
  });

  it('omits an empty optional team id instead of sending null', () => {
    adminService.generatePlayer.and.returnValue(of({ playerId: 43, name: 'Free Agent' }));
    component.teamId = null;
    component.rating = 300;

    component.generate();

    const payload = adminService.generatePlayer.calls.mostRecent().args[0];
    expect(payload.rating).toBe(300);
    expect(Object.prototype.hasOwnProperty.call(payload, 'teamId')).toBeFalse();
  });
});
