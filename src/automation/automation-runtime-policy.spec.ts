import { isAutomationRuntimeEnabled } from './automation-runtime-policy';

describe('automation runtime policy', () => {
  it('fails closed unless AUTOMATION_RUNTIME_ENABLED is explicitly true', () => {
    expect(isAutomationRuntimeEnabled({})).toBe(false);
    expect(isAutomationRuntimeEnabled({ AUTOMATION_RUNTIME_ENABLED: 'false' })).toBe(false);
    expect(isAutomationRuntimeEnabled({ AUTOMATION_RUNTIME_ENABLED: '1' })).toBe(false);
    expect(isAutomationRuntimeEnabled({ AUTOMATION_RUNTIME_ENABLED: ' TRUE ' })).toBe(true);
  });
});
