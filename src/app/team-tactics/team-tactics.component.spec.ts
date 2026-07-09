import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeamTacticsComponent } from './team-tactics.component';

describe('TeamTacticsComponent', () => {
  let component: TeamTacticsComponent;
  let fixture: ComponentFixture<TeamTacticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TeamTacticsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeamTacticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
