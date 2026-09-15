import { isSchedulerRuntimeEnabled } from './scheduler-runtime-policy';

describe('scheduler runtime policy', () => {
  it('fails closed unless SCHEDULER_RUNTIME_ENABLED is explicitly true', () => {
    expect(isSchedulerRuntimeEnabled({})).toBe(false);
    expect(isSchedulerRuntimeEnabled({ SCHEDULER_RUNTIME_ENABLED: 'false' })).toBe(false);
    expect(isSchedulerRuntimeEnabled({ SCHEDULER_RUNTIME_ENABLED: '1' })).toBe(false);
    expect(isSchedulerRuntimeEnabled({ SCHEDULER_RUNTIME_ENABLED: ' TRUE ' })).toBe(true);
  });
});
