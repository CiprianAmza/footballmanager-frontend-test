import { SquadPlannerComponent } from './squad-planner.component';

describe('SquadPlannerComponent Phase 1A', () => {
  it('does not activate unsupported future-season plans', () => {
    const component = new SquadPlannerComponent({} as any, {} as any);
    component.setTab('next');
    expect(component.activeTab).toBe('current');
    component.setTab('after');
    expect(component.activeTab).toBe('current');
  });
});
