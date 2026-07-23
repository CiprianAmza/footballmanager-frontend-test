import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  it('provides a back action', () => {
    const location = jasmine.createSpyObj('Location', ['back']);
    const component = new NotFoundComponent(location);
    component.goBack();
    expect(location.back).toHaveBeenCalled();
  });
});
