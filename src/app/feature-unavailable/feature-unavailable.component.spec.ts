import { FeatureUnavailableComponent } from './feature-unavailable.component';

describe('FeatureUnavailableComponent', () => {
  it('names the unavailable feature from route data', () => {
    const component = new FeatureUnavailableComponent({
      snapshot: { data: { featureName: 'Development Centre' } }
    } as any);
    component.ngOnInit();
    expect(component.featureName).toBe('Development Centre');
  });
});
