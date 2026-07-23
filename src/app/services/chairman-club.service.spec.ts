import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { urlApp } from '../app.component';
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

  it('uses principal-scoped typed club endpoints without owner or price fields', () => {
    service.clubs().subscribe();
    http.expectOne(urlApp + '/api/clubs').flush([]);
    service.dashboard(7).subscribe();
    http.expectOne(urlApp + '/api/clubs/7/chairman-dashboard').flush({});

    service.quote(7, 'quote-key').subscribe();
    const quote = http.expectOne(urlApp + '/api/clubs/7/takeover-quotes');
    expect(quote.request.body).toEqual({ idempotencyKey: 'quote-key' });
    expect(quote.request.body.ownerId).toBeUndefined();
    expect(quote.request.body.price).toBeUndefined();
    quote.flush({});

    service.execute(7, 'quote-id', 'execute-key').subscribe();
    const execute = http.expectOne(urlApp + '/api/clubs/7/takeovers');
    expect(execute.request.body).toEqual({ quoteId: 'quote-id', idempotencyKey: 'execute-key' });
    execute.flush({});

    service.transfer(7, 'WITHDRAWAL', 123, 'transfer-key').subscribe();
    const transfer = http.expectOne(urlApp + '/api/clubs/7/treasury-transfers');
    expect(transfer.request.body).toEqual({ direction: 'WITHDRAWAL', amount: 123,
      idempotencyKey: 'transfer-key' });
    expect(transfer.request.body.accountId).toBeUndefined();
    transfer.flush({});
  });
});
