import { TestBed } from '@angular/core/testing';
import { UiFeedbackService } from './ui-feedback.service';

describe('UiFeedbackService', () => {
  let service: UiFeedbackService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UiFeedbackService);
  });

  it('resolves a shared confirmation', async () => {
    const result = service.confirm('Proceed?');
    service.resolveDialog(true);
    await expectAsync(result).toBeResolvedTo(true);
  });

  it('publishes and dismisses notifications', () => {
    let count = 0;
    const sub = service.toasts$.subscribe(toasts => count = toasts.length);
    service.success('Saved');
    expect(count).toBe(1);
    service.dismissToast(1);
    expect(count).toBe(0);
    sub.unsubscribe();
  });
});
