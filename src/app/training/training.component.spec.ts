import { TrainingComponent } from './training.component';

describe('TrainingComponent Phase 1A', () => {
  it('exposes only implemented training areas', () => {
    const component = new TrainingComponent({} as any, {} as any, {} as any);
    expect(component.tabs).toEqual(['Overview', 'Calendar', 'Individual']);
    expect(component.tabs).not.toContain('Schedules');
    expect(component.tabs).not.toContain('Units');
    expect(component.tabs).not.toContain('Mentoring');
    expect(component.tabs).not.toContain('Coaches');
  });
});
