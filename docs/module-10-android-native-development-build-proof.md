# Module 10 Slice 10.11 — Android Native Development-Build Proof

## Result

**LOCAL GREEN**

## Repository and application

- Source remote-green commit: 24e8b2f31dfb6c88c186f40aa681d25ed4329c15
- Application ID: com.reyvo.iotplatform
- Node: v22.23.1
- npm: 10.9.8
- Java: openjdk version "17.0.19" 2026-04-21 OpenJDK Runtime Environment Temurin-17.0.19+10 (build 17.0.19+10) OpenJDK 64-Bit Server VM Temurin-17.0.19+10 (build 17.0.19+10, mixed mode, sharing)
- javac: javac 17.0.19

## Physical-device evidence

- Timestamp: 2026-07-28T17:41:13.6143754+08:00
- Serial: 3a8ebb16
- Model: 2312DRA50G
- Android: 16
- Build fingerprint: Redmi/garnet_id/garnet:16/BP2A.250605.031.A3/OS3.0.301.0.WNRIDXM:user/release-keys
- Installed package: package:/data/app/~~o4BU2aWE6VMxOQfhCyySiQ==/com.reyvo.iotplatform-aO0lKJyvU9I5dJAxRuHPQQ==/base.apk
- Process ID: 6427
- Foreground activity: topResumedActivity=ActivityRecord{108260269 u0 com.reyvo.iotplatform/expo.modules.devlauncher.launcher.errors.DevLauncherErrorActivity t29894}
- APK SHA-256: 80BB31C088425AFB6622E8823F26659616EC0BA5665ACC0EDB1A12F3954E80DE
- Screenshot SHA-256: 211DDCC741503D6F20849D8CFBB1797D3685B5720F07CFDA4A9FE5B3C216CCD3
- Fatal application logcat patterns: not detected

## Validation

- Expo public configuration: reused from unchanged exact remote-green validation
- Mobile TypeScript: reused from unchanged exact remote-green validation
- Focused native preparation contract: reused from unchanged exact remote-green validation
- Previous v1.0.3 clean prebuild and Gradle compilation: passed
- Existing APK identity, size, age, and application ID: verified
- Existing exact-serial ADB installation: verified
- Direct local Expo CLI startup through Node: passed
- Official /_expo/open custom-runtime endpoint: verified
- Metro over USB: passed
- Physical-device process and foreground launch: passed
- Screenshot and logcat capture: passed

## Scope retained

This closes only the Android native development-build and physical-device
launch gate for Module 10 Slice 10.11. Dashboard mutation, commands, realtime,
notifications, barcode/QR, CCTV/RTSP/ONVIF, Slice 10.12, Module 11, and
production deployment remain inactive or unapproved.