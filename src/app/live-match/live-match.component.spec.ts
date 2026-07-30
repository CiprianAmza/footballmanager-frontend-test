import { NEVER, throwError } from 'rxjs';
import { LiveMatchComponent } from './live-match.component';

describe('LiveMatchComponent interactive advance', () => {
  it('shows an advance error and retries the same engine minute', () => {
    const liveMatch = jasmine.createSpyObj('LiveMatchService', ['advance', 'commit', 'reset']);
    liveMatch.advanceInFlight = false;
    liveMatch.advanceTargetMinute = 0;
    liveMatch.advance.and.returnValue(throwError(() => ({ status: 500 })));
    const zone = { runOutsideAngular: (fn: () => void) => fn(), run: (fn: () => void) => fn() };
    const component = new LiveMatchComponent({} as any, liveMatch, zone as any);
    component.interactive = true;
    component.matchKey = '1_1_1_10_20';
    component.liveMatchData = {
      currentMinute: 0,
      firstHalfStoppage: 0,
      secondHalfStoppage: 0,
      finished: false,
      timeline: [{ minute: 0, eventType: 'kickoff' }]
    } as any;
    spyOn(component, 'startLiveMatchTimer');

    (component as any).tickInteractive();

    expect(liveMatch.advance).toHaveBeenCalledWith(1);
    expect(component.liveAdvanceError).toContain('could not advance');

    liveMatch.advance.and.returnValue(NEVER);
    component.retryLiveAdvance();

    expect(liveMatch.advance).toHaveBeenCalledTimes(2);
    expect(liveMatch.advance.calls.mostRecent().args).toEqual([1]);
    expect(component.liveAdvanceError).toBeNull();
  });
});
