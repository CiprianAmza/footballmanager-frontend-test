import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlApp } from '../app.component';
import { AdminService } from './admin.service';
import { CsrfTokenService } from './csrf-token.service';

describe('AdminService authentication', () => {
  let service: AdminService;
  let http: HttpTestingController;
  let csrf: CsrfTokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
    csrf = TestBed.inject(CsrfTokenService);
    localStorage.removeItem('fm_admin_token');
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('fm_admin_token');
  });

  it('checks the server session instead of trusting the stored admin token', () => {
    service.storeToken('stored-token');
    service.checkSession().subscribe();
    const request = http.expectOne(urlApp + '/admin/session');
    expect(request.request.headers.get('X-Admin-Token')).toBe('stored-token');
    request.flush({ authenticated: true });
  });

  it('refreshes CSRF before extending contracts', () => {
    service.storeToken('stored-token');
    service.extendContracts({ seasons: 3, allTeams: true }).subscribe();
    http.expectOne(urlApp + '/api/auth/csrf').flush({ token: 'fresh-csrf' });
    expect(csrf.token).toBe('fresh-csrf');
    const request = http.expectOne(urlApp + '/admin/contracts/extend');
    expect(request.request.headers.get('X-Admin-Token')).toBe('stored-token');
    expect(request.request.body).toEqual({ seasons: 3, allTeams: true });
    request.flush({ contractsExtended: 1, seasonsAdded: 3, teamsAffected: 1 });
  });
});
