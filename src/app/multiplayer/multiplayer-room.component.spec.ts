import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MultiplayerRoomComponent } from './multiplayer-room.component';

describe('MultiplayerRoomComponent', () => {
  let fixture: ComponentFixture<MultiplayerRoomComponent>;
  beforeEach(async () => { await TestBed.configureTestingModule({ declarations: [MultiplayerRoomComponent], imports: [FormsModule, HttpClientTestingModule] }).compileComponents(); fixture = TestBed.createComponent(MultiplayerRoomComponent); fixture.detectChanges(); });
  afterEach(() => fixture.destroy());
  it('renders a room entry', () => expect(fixture.nativeElement.textContent).toContain('Multiplayer room'));
  it('resolves the current manager from currentMember, not the host', () => {
    const component = fixture.componentInstance;
    component.state = { currentUserId: 8, currentMember: { userId: 8, teamId: 22, ready: false, fastForwardEnabled: false }, status: 'LOBBY', roomId: 1, hostUserId: 1, continueThresholdPercent: 50, dayTimeoutSeconds: 300, majorityTimeoutSeconds: 60, maxPlayers: 2, forceContinue: false, members: [{ userId: 1, teamId: 11, ready: true, fastForwardEnabled: false }, { userId: 8, teamId: 22, ready: false, fastForwardEnabled: false }], votes: 0, totalPlayers: 2, requiredVotes: 1, currentUserVoted: false, fastForwardCount: 0, allFastForward: false, season: 1, day: 1, blocker: { code: 'NONE' } };
    expect(component.me()?.userId).toBe(8);
  });
});
