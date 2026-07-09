import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MedicalCentreComponent } from './medical-centre.component';

describe('MedicalCentreComponent', () => {
  let component: MedicalCentreComponent;
  let fixture: ComponentFixture<MedicalCentreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MedicalCentreComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MedicalCentreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
