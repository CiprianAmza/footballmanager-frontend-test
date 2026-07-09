import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataHubComponent } from './data-hub.component';

describe('DataHubComponent', () => {
  let component: DataHubComponent;
  let fixture: ComponentFixture<DataHubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DataHubComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DataHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
