import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CupOverviewComponent } from './cup-overview.component';

describe('CupOverviewComponent', () => {
  let component: CupOverviewComponent;
  let fixture: ComponentFixture<CupOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CupOverviewComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CupOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
