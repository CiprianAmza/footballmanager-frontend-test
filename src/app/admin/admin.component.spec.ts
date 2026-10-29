import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminService } from '../services/admin.service';
import { AdminComponent } from './admin.component';
import { throwError } from 'rxjs';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let adminService: { isAuthenticated: boolean; checkSession: jasmine.Spy; logout: jasmine.Spy };

  beforeEach(async () => {
    adminService = {
      isAuthenticated: false,
      checkSession: jasmine.createSpy('checkSession'),
      logout: jasmine.createSpy('logout').and.callFake(() => adminService.isAuthenticated = false)
    };
    await TestBed.configureTestingModule({
      declarations: [AdminComponent],
      imports: [FormsModule, RouterTestingModule],
      providers: [{ provide: AdminService, useValue: adminService }]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
  });

  it('does not expose default credentials in the login UI', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).not.toContain('Default credentials');
    expect(text).not.toContain('admin / admin');
  });

  it('returns to login when the stored token has no server session', () => {
    adminService.isAuthenticated = true;
    adminService.checkSession.and.returnValue(throwError(() => ({ status: 403 })));
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(adminService.logout).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Admin session expired');
  });
});
