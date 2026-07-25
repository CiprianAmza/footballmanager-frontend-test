import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MultiplayerRoomComponent } from './multiplayer-room.component';

describe('MultiplayerRoomComponent', () => {
  let fixture: ComponentFixture<MultiplayerRoomComponent>;
  beforeEach(async () => { await TestBed.configureTestingModule({ declarations: [MultiplayerRoomComponent], imports: [FormsModule, HttpClientTestingModule] }).compileComponents(); fixture = TestBed.createComponent(MultiplayerRoomComponent); fixture.detectChanges(); });
  it('renders a room entry', () => expect(fixture.nativeElement.textContent).toContain('Multiplayer room'));
});
