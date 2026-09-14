# iOS Final Release Proof Policy

## Status

This policy defers native iOS proof until the final release gate after the planned
Module 01-30 lifecycle. It does not remove iOS compatibility requirements from
the shared Expo and React Native codebase.

IOS_RELEASE_POLICY_SCHEMA=1
IOS_NATIVE_PROOF_MODE=deferred-until-final-release
IOS_PROOF_BLOCKS_MODULE_LIFECYCLE=false
IOS_SHARED_CODE_COMPATIBILITY_REQUIRED=true
IOS_FINAL_RELEASE_GATE_AFTER_MODULE=30
IOS_CLOUD_BUILD_ALLOWED=true
IOS_PREFERRED_BUILD_PROVIDER=Expo_EAS
IOS_APPLE_SIGNING_REQUIRED_AT_FINAL_RELEASE=true
IOS_TESTFLIGHT_REQUIRED_AT_FINAL_RELEASE=true
IOS_PHYSICAL_DEVICE_PROOF_REQUIRED_AT_FINAL_RELEASE=true
IOS_APP_STORE_APPROVAL_SEPARATE=true

## Current Development Rule

Modules 11 through 30 must not be blocked by the absence of a local Mac or
iPhone. The repository must continue to validate the shared mobile source,
Expo configuration, TypeScript compatibility, secure-session behavior, and
mobile contracts on the normal cross-platform validation path.

Current module profiles must not require:

- `expo run:ios`;
- Xcode;
- CocoaPods;
- Apple signing credentials;
- an `.ipa` artifact;
- TestFlight;
- an iPhone or iOS simulator.

## Final Release Gate

After Module 30 is completed and remote-green, a separately approved final
release package must prove:

1. native iOS compilation on a macOS cloud runner;
2. Apple signing and provisioning;
3. a signed build submitted through TestFlight;
4. install, launch, authentication, secure-session, and dashboard smoke proof
   on a real iPhone owned by an external tester;
5. release-artifact traceability and checksums;
6. explicit App Store release approval.

Expo EAS is the preferred cloud build provider. Another approved macOS CI
provider may be used when it preserves the same signing, audit, and artifact
requirements.

## Safety Boundary

This policy does not claim that an iOS binary currently exists. It does not
approve App Store submission, production deployment, automation activation, or
a change to the active Module 11 runtime scope.
