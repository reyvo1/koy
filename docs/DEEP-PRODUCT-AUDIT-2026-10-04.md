# Deep Product Audit — 2026-10-04

Baseline: `b7b62248ec5fe38973993e981c9b753483cf8e10`
Heavy evidence: GitHub Actions run `37183166252` (`logs_100716783407.zip`) — full automated chain green.

## Scope

Static and contract audit across API/controllers, Admin Web, User Web, canonical navigation, RBAC/ownership, Scene/Schedule authorization, error semantics, capability lifecycle, current-state governance, workflow and Development Kit. The audit does not downgrade live UAT: source changes must still earn the official local pre-push and GitHub heavy acceptance.

## Confirmed root findings and remediation

1. **User Web Dashboard 403 was converted to 401/logout.** A valid session lacking `dashboard.read` lost cookies and was shown login. Fixed so only 401 clears session; 403 remains forbidden and preserves session state.
2. **RBAC audit action mapping was duplicated and one copy used permission prefixes.** `dashboard.delete` could be logged as CREATE. A single suffix-based mapper is now shared by policy evaluation and ownership-bypass audit paths.
3. **Schedule controller masked infrastructure errors.** Create converted every Scene repository failure to 404; member list swallowed every access error as invisibility. Only expected forbidden/not-found outcomes are now hidden/translated; infrastructure failures propagate.
4. **Capability Template lifecycle existed in backend but Admin Web/docs were stale/incomplete.** BFF and UI now expose template create, version publish/deprecate, dry-run/apply and refusal evidence. Publishing remains separate from device mutation.
5. **Directory-dependent UI could show false empty state.** Device sharing now surfaces tenant-directory failure and disables grants; billing surfaces a tenant-name-directory warning while preserving authoritative billing rows/IDs.
6. **`/super/settings` overstated its scope.** The backend only supports profile/session operations, so navigation/docs now say **Profile & Session** rather than inventing platform configuration controls.
7. **Current authority was stale after the all-green run.** Enterprise governance now supports the terminal state `software-closed=1-13; active=none`; no fictitious active Wave is required after software certification closes.

## Menu/function audit result

Canonical Super Admin, Tenant Admin and the seven User Web top-level routes resolve to real pages/components with real API/data paths. No broad class of static placeholder menu pages was found. Quarantined/Beta/Lab routes remain explicitly outside canonical navigation. Scene/Schedule are intentionally not promoted into the seven-entry User Web navigation even though their device VIEW/CONTROL boundary is hardened; there is not yet a declared end-user authoring product surface to expose there.

## Known truthful boundaries — not bugs to hide

- Provider-owned positive settlement/webhook evidence remains external where real provider credentials are absent.
- PHYSICAL/HIL ESP32/camera/site evidence remains separate and non-blocking; `SIMULATED_HARDWARE_LIVE_SERVICE` cannot be relabelled physical.
- `/super/settings` has no platform-configuration API today; the UI therefore does not render cosmetic configuration toggles.

## Regression strategy

`deep-product:contracts:self-test` statically guards the repaired backend↔frontend/docs contracts and is part of local pre-push. Targeted Jest adds RBAC mapper/policy and Schedule error-classification coverage. Any dependency-backed lint/Jest/build result must be produced by the real operator checkout or GitHub; this audit workspace must not fabricate those results.
