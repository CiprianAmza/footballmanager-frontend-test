import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MediaPredictionComponent } from './media-prediction.component';

describe('MediaPredictionComponent', () => {
  let component: MediaPredictionComponent;
  let fixture: ComponentFixture<MediaPredictionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MediaPredictionComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MediaPredictionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
