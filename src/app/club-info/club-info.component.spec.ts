import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClubInfoComponent } from './club-info.component';

describe('ClubInfoComponent', () => {
  let component: ClubInfoComponent;
  let fixture: ComponentFixture<ClubInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ClubInfoComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClubInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
