import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScorerLeaderboardComponent } from './scorer-leaderboard.component';

describe('ScorerLeaderboardComponent', () => {
  let component: ScorerLeaderboardComponent;
  let fixture: ComponentFixture<ScorerLeaderboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ScorerLeaderboardComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScorerLeaderboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
