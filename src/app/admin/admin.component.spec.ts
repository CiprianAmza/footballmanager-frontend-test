import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminService } from '../services/admin.service';
import { AdminComponent } from './admin.component';

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminComponent],
      imports: [FormsModule, RouterTestingModule],
      providers: [{ provide: AdminService, useValue: { isAuthenticated: false } }]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
  });

  it('does not expose default credentials in the login UI', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).not.toContain('Default credentials');
    expect(text).not.toContain('admin / admin');
  });
});
