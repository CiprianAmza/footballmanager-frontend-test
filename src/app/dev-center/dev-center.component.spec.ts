import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DevCenterComponent } from './dev-center.component';

describe('DevCenterComponent', () => {
  let component: DevCenterComponent;
  let fixture: ComponentFixture<DevCenterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DevCenterComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DevCenterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
