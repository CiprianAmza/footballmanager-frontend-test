import {
  isFrameableUrl, match2dErrorMessage, match2dPreviewUrl, match2dReplayErrorMessage, match2dReplayUrl
} from './match2d';

describe('match2d helpers', () => {
  it('builds the backend address from the two teams, the seed and the length', () => {
    expect(match2dPreviewUrl('http://localhost:8086', 12, 7, 3, 90))
      .toBe('http://localhost:8086/match/2d/preview?teamId1=12&teamId2=7&seed=3&minutes=90');
  });

  it('builds the replay address from competition, season, round and the two teams', () => {
    expect(match2dReplayUrl('http://localhost:8086', 4, 2, 11, 12, 7))
      .toBe('http://localhost:8086/match/2d/replay/4/2/11/12/7');
  });

  it('frames only http and https pages', () => {
    expect(isFrameableUrl('http://127.0.0.1:8790/view/abc')).toBeTrue();
    expect(isFrameableUrl('https://engine.example/view/abc')).toBeTrue();
    expect(isFrameableUrl('javascript:alert(1)')).toBeFalse();
    expect(isFrameableUrl('data:text/html,<p>x</p>')).toBeFalse();
    expect(isFrameableUrl('/view/abc')).toBeFalse();
    expect(isFrameableUrl(undefined)).toBeFalse();
  });

  it('shows the reason the backend gave, when there is one', () => {
    expect(match2dErrorMessage({ status: 503, error: { error: 'The 2D engine is not running.' } }))
      .toBe('The 2D engine is not running.');
    expect(match2dErrorMessage({ status: 0 })).toBe('The game server did not answer.');
    expect(match2dErrorMessage({ status: 500, error: {} })).toBe('The 2D match could not be played.');
  });

  it('explains replay errors by status', () => {
    expect(match2dReplayErrorMessage({ status: 404 })).toContain('not played with the 2D engine');
    expect(match2dReplayErrorMessage({ status: 502 })).toContain('not answering');
    expect(match2dReplayErrorMessage({ status: 503, error: { error: 'down' } })).toContain('not answering');
    expect(match2dReplayErrorMessage({ status: 0 })).toBe('The game server did not answer.');
  });
});
