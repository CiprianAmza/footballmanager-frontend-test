import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlApp } from '../app.component';
import { ClubCatalogScope } from '../chairman-club/chairman-club.models';
import { ChairmanClubService } from './chairman-club.service';

describe('ChairmanClubService', () => {
  let service: ChairmanClubService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ChairmanClubService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  (['ALL', 'HELD', 'CONTROLLED'] as ClubCatalogScope[]).forEach(scope => {
    it(`requests the ${scope} catalog scope without actor ids`, () => {
      service.clubs(scope).subscribe();
      const request = http.expectOne(value => value.url === urlApp + '/api/clubs'
        && value.params.get('scope') === scope);

      expect(request.request.method).toBe('GET');
      expect(request.request.urlWithParams).toBe(`${urlApp}/api/clubs?scope=${scope}`);
      expect(request.request.body).toBeNull();
      expect(request.request.params.has('profileId')).toBeFalse();
      expect(request.request.params.has('accountId')).toBeFalse();
      expect(request.request.params.has('ownerId')).toBeFalse();
      expect(request.request.params.has('humanId')).toBeFalse();
      request.flush([]);
    });
  });

  it('defaults the catalog request to ALL', () => {
    service.clubs().subscribe();
    const request = http.expectOne(urlApp + '/api/clubs?scope=ALL');
    request.flush([]);
  });

  it('keeps takeover endpoints server-priced and actor-free', () => {
    service.quote(7, 'quote-key').subscribe();
    const quote = http.expectOne(urlApp + '/api/clubs/7/takeover-quotes');
    expect(quote.request.body).toEqual({ idempotencyKey: 'quote-key' });
    quote.flush({});

    service.execute(7, 'quote-id', 'execute-key').subscribe();
    const execute = http.expectOne(urlApp + '/api/clubs/7/takeovers');
    expect(execute.request.body).toEqual({ quoteId: 'quote-id', idempotencyKey: 'execute-key' });
    execute.flush({});
  });

  it('posts the treasury transfer body exactly and sends no actor ids', () => {
    service.transfer(7, 'WITHDRAWAL', 123, 'transfer-key').subscribe();
    const request = http.expectOne(urlApp + '/api/clubs/7/treasury-transfers');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      direction: 'WITHDRAWAL', amount: 123, idempotencyKey: 'transfer-key'
    });
    expect(request.request.body.accountId).toBeUndefined();
    expect(request.request.body.profileId).toBeUndefined();
    expect(request.request.body.ownerId).toBeUndefined();
    request.flush({});
  });
});
