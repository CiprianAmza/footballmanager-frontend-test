import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TacticPageComponent } from './tactic-page.component';

describe('TacticPageComponent', () => {
  let component: TacticPageComponent;
  let fixture: ComponentFixture<TacticPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TacticPageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TacticPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
