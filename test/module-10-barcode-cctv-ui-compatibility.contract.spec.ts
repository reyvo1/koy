import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const implementation = read(
  'docs/module-10-barcode-cctv-ui-compatibility-contract.md',
);
const normalizedImplementation = implementation.replace(/\s+/g, ' ').trim();
const mobileGitignore = read('apps/user-mobile/.gitignore');
const trackedRepositoryTree = read('repository-tree.txt');

const packages = [
  'apps/admin-web/package.json',
  'apps/user-web/package.json',
  'apps/user-mobile/package.json',
].map((path) =>
  readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path),
);

const hasDependency = (name: string): boolean =>
  packages.some(
    (packageJson) =>
      packageJson.dependencies?.[name] !== undefined ||
      packageJson.devDependencies?.[name] !== undefined,
  );

describe('Module 10 Slice 10.12 Barcode and CCTV UI Compatibility Contract', () => {
  it('records immutable Slice 10.12 lifecycle and remote-green evidence', () => {
    for (const evidence of [
      'f92075d66c5518d4e0f9b9a9dae7a8e092c55c12',
      '30361802672',
      '8689205481',
      'eac72d0d858fc664cf9cf825ff2f000a1876cf055a2b01e153f52ee853aebaf3',
      '3a07d9f8c9e40ee135f93a9ffdb1d96c94e285c2',
      '30517667137',
      '107/107 Jest suites',
      '755/755 tests',
      '8749562325',
      'cd75fe1829794279593c5d3219a49a94710561a245fbc5492589462d9f1303db',
    ]) {
      expect(implementation).toContain(evidence);
    }
    expect(normalizedImplementation).toContain(
      'They do not freeze the mutable `projectConfig.development.activeSlice` or current lifecycle evidence',
    );
    expect(normalizedImplementation).toContain(
      'Slice 10.13 lifecycle selection remains a separate bounded step',
    );
  });

  it('keeps barcode scanning as untrusted onboarding input rather than a protocol', () => {
    for (const boundary of [
      'an onboarding mechanism, not a universal device or camera protocol',
      'A scanned code is untrusted input',
      'must never establish tenant membership, ownership, authorization, or credential access by itself',
      'does not define an endpoint, DTO, persistence model, scanner dependency, native permission, or pairing workflow',
    ]) {
      expect(implementation).toContain(boundary);
    }
  });

  it('keeps camera protocols, credentials, and vendor details behind backend boundaries', () => {
    for (const boundary of [
      'ONVIF, RTSP, and vendor camera APIs remain isolated behind future adapter boundaries',
      'stream availability as a platform decision, not a raw RTSP URL',
      'raw RTSP URLs, ONVIF credentials, vendor access tokens, device passwords, MQTT topics',
      'tenant isolation and resource authorization are derived server-side',
    ]) {
      expect(implementation).toContain(boundary);
    }
  });

  it('adds no scanner, camera, playback, ONVIF, or streaming dependency', () => {
    for (const forbidden of [
      'expo-camera',
      'expo-barcode-scanner',
      'react-native-vision-camera',
      'react-native-video',
      'react-native-webrtc',
      'react-native-rtsp-player',
      'hls.js',
      'video.js',
      'onvif',
      'node-onvif',
    ]) {
      expect(hasDependency(forbidden)).toBe(false);
    }
    expect(mobileGitignore.split(/\r?\n/)).toEqual(
      expect.arrayContaining(['android/', 'ios/']),
    );
    expect(trackedRepositoryTree).not.toMatch(
      /^apps\/user-mobile\/(android|ios)\//m,
    );
  });

  it('keeps UI behavior read-only and fail-closed', () => {
    for (const boundary of [
      'no scanner button or camera navigation is activated by this contract',
      'no live-view component is introduced',
      'no camera-control or PTZ action is exposed',
      'no synthetic stream, device, telemetry, or pairing success is displayed',
      'Existing MAP and SWITCH fail-closed behavior remains unchanged',
    ]) {
      expect(implementation).toContain(boundary);
    }
  });

  it('keeps the compatibility boundary documentation-only', () => {
    expect(implementation).toContain(
      'This checkpoint adds no runtime dependency and changes no lockfile, application source, backend module, Prisma schema, migration, PostgreSQL behavior, Redis behavior, MQTT behavior, CI workflow, native project, Android permission, iOS permission, or deployment configuration.',
    );
  });

  it('keeps Module 11 and production deployment outside the exit gate', () => {
    for (const boundary of [
      'Module 11 activation',
      'production deployment',
      'No later slice, Module 11, or production deployment is activated by this document',
    ]) {
      expect(implementation).toContain(boundary);
    }
  });
});
