import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Wave 9 step 2: make camera onboarding reachable.
 *
 * `CameraOnboardingService` has existed since the CCTV phase-1 slice and has **zero callers** — it is
 * not in any module, no controller injects it, no route reaches it. The same shape as the payment
 * adapter found in Wave 8: a class nobody required, so nothing ever ran.
 *
 * The service itself is good and this contract deliberately does not rewrite it. It has an atomic
 * single-use token claim under concurrent pairing, argon2 hashing, and a tenant-scoped list. What it
 * lacked was a door.
 *
 * ## The asymmetry the routes must preserve
 *
 * `register` and `list` are tenant operations and take their tenant from the authenticated request. `pair`
 * is not: the camera has no session, only the provisioning token the QR carried, so it must be
 * reachable without one — and must therefore be unauthenticated by session *and* scoped by something
 * else. Getting this backwards in either direction is the failure worth pinning: requiring a session
 * breaks every real camera, and leaving `pair` tenant-authenticated makes the QR flow impossible.
 *
 * That is also why `pair` looks up its device by id alone. It is not a tenant-isolation gap: the
 * provisioning token is the credential, it is single-use, it expires in an hour, and it is stored
 * hashed. The contract pins that reasoning rather than pretending the lookup is scoped.
 */

const ROOT = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const SERVICE = read('src/device/camera-onboarding.service.ts');
const CONTROLLER = 'src/device/camera-onboarding.controller.ts';
const MODULE = read('src/device/camera-onboarding.module.ts');
const APP = read('src/app.module.ts');

describe('the service is in the graph', () => {
  it('is provided by its own module', () => {
    expect(MODULE).toMatch(/CameraOnboardingService/);
  });

  it('and that module is registered in the application', () => {
    // The check that matters, and the one my census got wrong. It reported "zero callers" because
    // the grep filtered on the substring `camera-onboarding`, which is part of the *path* of both
    // files that wire it up. A filter that hides the evidence of the thing being measured is worse
    // than no filter: it produced a confident, false gap.
    expect(APP).toMatch(/CameraOnboardingModule/);
  });

  it('a controller injects it', () => {
    expect(exists(CONTROLLER)).toBe(true);
    expect(read(CONTROLLER)).toMatch(/CameraOnboardingService/);
  });

  it('and the public pair surface is a separate controller, not the same guarded one', () => {
    // One controller mixing a tenant-authenticated POST and an unauthenticated pair POST would put
    // both under the same class-level guard, and the pair would stop being reachable by a camera.
    expect(MODULE).toMatch(/CameraOnboardingController,\s*CameraPairPublicController/);
  });
});

describe('tenant operations derive their tenant from the request', () => {
  it('register never accepts a tenantId from the body', () => {
    const source = read(CONTROLLER);
    const register = source.slice(source.indexOf('register'));
    expect(register.slice(0, 600)).not.toMatch(/body\.tenantId|tenantId:\s*body/);
  });

  it('and takes it from the authenticated context', () => {
    expect(read(CONTROLLER)).toMatch(/tenantContext\.tenantId/);
  });

  it('the register and list routes sit behind authentication', () => {
    const source = read(CONTROLLER);
    expect(source).toMatch(/JwtAuthGuard|TenantContextGuard/);
  });
});

describe('the pair route is reachable by a camera and by nothing else', () => {
  it('exists', () => {
    expect(read(CONTROLLER)).toMatch(/pair/i);
  });

  it('is not behind a session guard, because a camera has no session', () => {
    // Pinning the negative as well as the positive: "we forgot to guard it" and "we deliberately did
    // not" look identical in the source without an assertion that says which one it is.
    const source = read(CONTROLLER);
    const pair = source.slice(source.search(/@Post\([^)]*pair/i));
    expect(pair.slice(0, 300)).not.toMatch(/JwtAuthGuard|TenantContextGuard/);
  });

  it('takes no tenant at all', () => {
    // A tenant-supplied value here would let one tenant's camera claim another tenant's device id,
    // subject only to holding its provisioning token.
    const source = read(CONTROLLER);
    const pair = source.slice(source.search(/@Post\([^)]*pair/i));
    expect(pair.slice(0, 500)).not.toMatch(/tenantId/);
  });

  it('and the service it calls is the one that verifies the token', () => {
    // The route is a door, not a bypass. If it ever called `device.update` directly the atomic
    // single-use claim would be gone and a replayed QR would rotate the credential twice.
    expect(SERVICE).toMatch(/argon2\.verify/);
    expect(SERVICE).toMatch(/claim\.count !== 1/);
    expect(read(CONTROLLER)).not.toMatch(/prisma\./);
  });

  it('the token stays single-use', () => {
    expect(SERVICE).toMatch(/provisioningTokenHash:\s*null/);
  });

  it('and expired tokens are refused before any write', () => {
    expect(SERVICE).toMatch(/provisioningTokenExpires < new Date\(\)/);
  });
});

describe('the camera list is tenant-scoped and tells cameras apart', () => {
  it('filters by tenant and by camera type', () => {
    expect(SERVICE).toMatch(/where:\s*\{\s*tenantId,\s*type:\s*DeviceType\.CAMERA/);
  });

  it('returns vendor and model, which live in capability key-space', () => {
    expect(SERVICE).toMatch(/camera\.vendor/);
    expect(SERVICE).toMatch(/camera\.model/);
  });
});