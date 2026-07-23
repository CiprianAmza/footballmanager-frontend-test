import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  it('routes admin credentials through the administration login', () => {
    const authService = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'register']);
    const adminService = jasmine.createSpyObj<AdminService>('AdminService', ['login', 'storeToken']);
    const router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    adminService.login.and.returnValue(of({ success: true, token: 'admin-token' }));
    router.navigateByUrl.and.returnValue(Promise.resolve(true));
    const component = new LoginComponent(authService, adminService, router);
    component.username = 'admin';
    component.password = 'admin';

    component.submit();

    expect(adminService.login).toHaveBeenCalledOnceWith('admin', 'admin');
    expect(adminService.storeToken).toHaveBeenCalledOnceWith('admin-token');
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/admin');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('keeps career accounts on the normal authentication flow', () => {
    const authService = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'register']);
    const adminService = jasmine.createSpyObj<AdminService>('AdminService', ['login', 'storeToken']);
    const router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    authService.login.and.returnValue(of({ success: true } as any));
    const component = new LoginComponent(authService, adminService, router);
    component.username = 'manager';
    component.password = 'career-password';

    component.submit();

    expect(authService.login).toHaveBeenCalledOnceWith('manager', 'career-password');
    expect(adminService.login).not.toHaveBeenCalled();
  });
});
