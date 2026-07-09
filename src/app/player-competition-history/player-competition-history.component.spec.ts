import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayerCompetitionHistoryComponent } from './player-competition-history.component';

describe('PlayerCompetitionHistoryComponent', () => {
  let component: PlayerCompetitionHistoryComponent;
  let fixture: ComponentFixture<PlayerCompetitionHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PlayerCompetitionHistoryComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayerCompetitionHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
