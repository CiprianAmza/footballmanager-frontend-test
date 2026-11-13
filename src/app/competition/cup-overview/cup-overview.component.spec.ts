import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SharedModule } from '../../shared/shared.module';

import { CupOverviewComponent } from './cup-overview.component';

describe('CupOverviewComponent', () => {
  let component: CupOverviewComponent;
  let fixture: ComponentFixture<CupOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CupOverviewComponent],
      imports: [SharedModule, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CupOverviewComponent);
    component = fixture.componentInstance;
    component.competitionId = '4';
    component.season = '1';
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(request =>
      request.url.endsWith('/competition/cupBracket/4/1')
    ).flush({ cupId: 4, cupName: 'Khess Cup', season: 1, rounds: [] });
  });

  it('shows an empty bracket once the request completes', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No fixtures scheduled');
    TestBed.inject(HttpTestingController).verify();
  });
});
