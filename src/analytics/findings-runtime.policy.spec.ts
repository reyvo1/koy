import {
  FINDINGS_RUNTIME_COOLDOWN_DEFAULT_SECONDS,
  FINDINGS_RUNTIME_COOLDOWN_MAX_SECONDS,
  FINDINGS_RUNTIME_COOLDOWN_MIN_SECONDS,
  findingsRuntimeCooldownSeconds,
  isFindingsRuntimeEnabled,
} from './findings-runtime.policy';

describe('findings runtime policy', () => {
  it('fails closed unless FINDINGS_RUNTIME_ENABLED is explicitly true', () => {
    expect(isFindingsRuntimeEnabled({})).toBe(false);
    expect(isFindingsRuntimeEnabled({ FINDINGS_RUNTIME_ENABLED: 'false' })).toBe(false);
    expect(isFindingsRuntimeEnabled({ FINDINGS_RUNTIME_ENABLED: '1' })).toBe(false);
    expect(isFindingsRuntimeEnabled({ FINDINGS_RUNTIME_ENABLED: 'yes' })).toBe(false);
    expect(isFindingsRuntimeEnabled({ FINDINGS_RUNTIME_ENABLED: ' TRUE ' })).toBe(true);
  });

  describe('cooldown', () => {
    it('defaults when unset or unparseable', () => {
      expect(findingsRuntimeCooldownSeconds({})).toBe(
        FINDINGS_RUNTIME_COOLDOWN_DEFAULT_SECONDS,
      );
      expect(
        findingsRuntimeCooldownSeconds({ FINDINGS_RUNTIME_COOLDOWN_SECONDS: 'soon' }),
      ).toBe(FINDINGS_RUNTIME_COOLDOWN_DEFAULT_SECONDS);
    });

    it('accepts a value inside the approved bounds', () => {
      expect(
        findingsRuntimeCooldownSeconds({ FINDINGS_RUNTIME_COOLDOWN_SECONDS: '45' }),
      ).toBe(45);
    });

    it('clamps instead of letting an out-of-range value disable the throttle', () => {
      // A cooldown below the minimum would make the detector run on nearly every ingest;
      // one above the maximum would silently disable it. Clamping keeps both failure modes
      // inside the designed envelope instead of trusting the operator to read the docs.
      expect(
        findingsRuntimeCooldownSeconds({ FINDINGS_RUNTIME_COOLDOWN_SECONDS: '1' }),
      ).toBe(FINDINGS_RUNTIME_COOLDOWN_MIN_SECONDS);
      expect(
        findingsRuntimeCooldownSeconds({ FINDINGS_RUNTIME_COOLDOWN_SECONDS: '99999' }),
      ).toBe(FINDINGS_RUNTIME_COOLDOWN_MAX_SECONDS);
    });
  });
});
