import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const review = read('docs/module-10-completion-review.md');
const sliceReview = read(
  'docs/module-10-security-observability-accessibility-e2e-review.md',
);

const normalizedReview = review.replace(/\s+/g, ' ').trim();

describe('Module 10 Completion Review immutable evidence contract', () => {
  it('records the exact remote-green review base and transition proof', () => {
    for (const evidence of [
      'ead0692b516f6795455ad53c23a13c17f7185bbe',
      '30602246816',
      '109 of 109 suites and 761 of 761 tests',
      '8782371086',
      'f94d327dba3bb39302cac9b58cbd332d56ee43c718d8521de236adf95eb49ff0',
      '317 entries',
      'Module 11 Slice 11.1',
    ]) {
      expect(review).toContain(evidence);
    }
  });

  it('preserves the immutable Slice 10.13 closure evidence', () => {
    for (const evidence of [
      'c775ca01151fbc6811a4994f46e096e004285ce9',
      '30545421357',
      '108 of 108 suites and 762 of 762 tests',
      '8760574266',
      'c4a88fc990892a454360402829d72d90ca0a27c3fb47ed575109d8233283f3bb',
    ]) {
      expect(review).toContain(evidence);
    }

    for (const evidence of [
      'c775ca01151fbc6811a4994f46e096e004285ce9',
      '30545421357',
      '108/108',
      '762/762',
      '8760574266',
      'c4a88fc990892a454360402829d72d90ca0a27c3fb47ed575109d8233283f3bb',
    ]) {
      expect(sliceReview).toContain(evidence);
    }
  });

  it('records the completed capability set and backend authority boundaries', () => {
    for (const capability of [
      'tenant-isolated dashboard persistence and API boundaries',
      'capability-driven widget resolution',
      'bounded read-only telemetry widget query integration',
      'read-only User Web dynamic dashboard behavior',
      'bounded Admin Web operational-summary behavior',
      'versioned secure mobile session storage',
      'bounded read-only mobile dashboard listing',
      'remote-green Android native development-build proof',
      'CCTV UI compatibility boundaries',
    ]) {
      expect(review).toContain(capability);
    }

    expect(review).toContain('The backend remains authoritative');
    expect(review).toContain(
      'Web and mobile clients do not connect directly to MQTT',
    );
    expect(review).toContain('raw RTSP URLs');
  });

  it('records honest residual boundaries instead of synthetic completion claims', () => {
    for (const boundary of [
      'SWITCH command publication',
      'MAP semantics',
      'full browser user-journey automation',
      'native-device user-journey automation',
      'formal security certification',
      'formal WCAG conformance',
      'barcode scanning, pairing, provisioning, camera discovery',
      'environment-specific production deployment verification',
    ]) {
      expect(review).toContain(boundary);
    }
  });

  it('keeps Completion Review closure separate from completion and activation', () => {
    for (const boundary of [
      'Module 10 remains the active module',
      'Module 10 is not completed by this document',
      'Module 11 remains inactive',
      'production deployment remains **NOT APPROVED**',
      'before a separate `module:complete 10` gate may be considered',
    ]) {
      expect(review).toContain(boundary);
    }

    expect(normalizedReview).toContain(
      'Module 10 completion, Module 11 activation, and production deployment each require separate explicit approval',
    );
  });

  it('keeps this closure documentation, lifecycle metadata, and contract only', () => {
    for (const boundary of [
      'does not change application runtime behavior',
      'dependencies, lockfiles, Prisma schema or migrations',
      'PostgreSQL behavior, Redis behavior, MQTT behavior',
      'CI workflow, generated native projects',
      'security boundaries, tenant isolation',
    ]) {
      expect(review).toContain(boundary);
    }
  });
});
