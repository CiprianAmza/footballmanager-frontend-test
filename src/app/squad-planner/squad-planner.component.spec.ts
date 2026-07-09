import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SquadPlannerComponent } from './squad-planner.component';

describe('SquadPlannerComponent', () => {
  let component: SquadPlannerComponent;
  let fixture: ComponentFixture<SquadPlannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SquadPlannerComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SquadPlannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
