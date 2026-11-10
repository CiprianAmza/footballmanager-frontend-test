import { MatchPhaseData } from '../models/live-match.model';
import { AmbientSlot } from './ambient-synthesizer';
import { phaseToClip } from './phase-clip';

describe('authored phase playback', () => {
  it('keeps the return receiver and the drawn shot position', () => {
    const slots: AmbientSlot[] = [
      { playerId: 1, teamId: 1, shirtNumber: 4, isGoalkeeper: false,
        position: 'DR', baseX: 20, baseY: 50, attacksRight: true },
      { playerId: 2, teamId: 1, shirtNumber: 9, isGoalkeeper: false,
        position: 'ST', baseX: 70, baseY: 50, attacksRight: true },
      { playerId: 3, teamId: 2, shirtNumber: 1, isGoalkeeper: true,
        position: 'GK', baseX: 96, baseY: 50, attacksRight: false }
    ];
    const phase: MatchPhaseData = {
      minute: 30, teamId: 1, attackingRight: true, endEvent: 'goal',
      strategy: 'AUTHORED', scenario: 'Return and finish',
      actions: [
        { type: 'PASS', playerId: 1, targetPlayerId: 2, teamId: 1,
          x: 20, y: 50, endX: 40, endY: 50, durationMs: 600 },
        { type: 'PASS', playerId: 2, targetPlayerId: 1, teamId: 1,
          x: 40, y: 50, endX: 50, endY: 50, durationMs: 600 },
        { type: 'PASS', playerId: 1, targetPlayerId: 2, teamId: 1,
          x: 50, y: 50, endX: 90, endY: 50, durationMs: 900 },
        { type: 'SHOT', playerId: 2, teamId: 1,
          x: 90, y: 50, endX: 99, endY: 50, durationMs: 720 },
        { type: 'GOAL', playerId: 2, teamId: 1,
          x: 99, y: 50, endX: 99, endY: 50, durationMs: 300 }
      ]
    };

    const clip = phaseToClip(phase, slots, { 1: 'Back', 2: 'Striker' });
    const shot = clip.events.find(event => event.type === 'SHOT');
    expect(shot).toBeDefined();
    expect(shot!.fromPlayerId).toBe(2);
    expect(clip.frames[shot!.frame].ball.x).toBeCloseTo(90, 4);
    expect(clip.events.filter(event => event.type === 'PASS').map(event => event.fromPlayerId))
      .toEqual([1, 2, 1]);
  });
});
