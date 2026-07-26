import { of } from 'rxjs';
import { MultiplayerContinueComponent } from './multiplayer-continue.component';
import { MultiplayerState } from './multiplayer.models';

describe('MultiplayerContinueComponent state emission', () => {
  const state = (liveMatchKey?: string): MultiplayerState => ({
    currentUserId: 8, currentMember: { userId: 8, teamId: 22, ready: true, fastForwardEnabled: false },
    status: 'ACTIVE', roomId: 1, hostUserId: 1, continueThresholdPercent: 50,
    dayTimeoutSeconds: 300, majorityTimeoutSeconds: 60, maxPlayers: 2, forceContinue: false,
    members: [{ userId: 1, teamId: 11, ready: true, fastForwardEnabled: false }, { userId: 8, teamId: 22, ready: true, fastForwardEnabled: false }],
    votes: 0, totalPlayers: 2, requiredVotes: 1, currentUserVoted: false,
    fastForwardCount: 0, allFastForward: false, season: 1, day: 10, blocker: { code: 'NONE' }, liveMatchKey,
  });

  it('emits once for a new continue response, not for the same poll key, and again for a new key', () => {
    const first = state('fixture-1');
    const next = state('fixture-2');
    const room: any = { continue: () => of(first), fastForward: () => of(first), state: () => of(first) };
    const team: any = { loadGameState: jasmine.createSpy('loadGameState') };
    const component = new MultiplayerContinueComponent(room, team);
    const emissions: unknown[] = [];
    component.liveMatchKeyChange.subscribe(value => emissions.push(value));
    component.continueDay();
    component.applyState(first);
    component.applyState(next);
    expect(emissions.length).toBe(2);
    expect(emissions[0]).toEqual({ key: 'fixture-1', interactive: false });
    expect(emissions[1]).toEqual({ key: 'fixture-2', interactive: false });
  });
});
