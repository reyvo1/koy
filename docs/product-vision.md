# IoT Platform - Product Vision

## Product Vision

Build a modern, secure, vendor-neutral IoT and smart home platform that provides one unified experience for monitoring, managing, and controlling connected devices.

The platform is intended to bring devices from different manufacturers and protocols into a consistent application experience.

Users should not need to understand the underlying device protocol, vendor API, or transport mechanism to use their devices.

The long-term product experience should allow users to open one application and see their cameras, sensors, switches, and other connected devices in one place.

## Core Product Experience

The application should provide a modern and premium smart home experience.

The primary user experience should be room-centric.

Users should be able to organize devices by locations such as:

* Home
* Office
* Building
* Floor
* Room
* Area

A room or area may contain multiple device types.

For example, a living room may contain:

* CCTV or security camera
* Temperature sensor
* Humidity sensor
* Motion sensor
* Smart switch
* Smart light
* Smart plug

The application should present these devices through a unified interface.

## Unified Device Platform

The platform should support multiple device categories without designing the core architecture around one specific device type.

Examples include:

* Security cameras
* Environmental sensors
* Motion sensors
* Smart switches
* Smart lights
* Smart plugs
* Future IoT devices

The core platform must remain protocol-neutral and vendor-neutral.

Device behavior should be represented through capabilities rather than hardcoded vendor-specific logic.

## Capability-Driven Device Model

Devices expose capabilities that describe what the device can report or control.

A capability may describe:

* Capability key
* Data type
* Semantic meaning
* Unit
* Constraints
* Whether the value is readable
* Whether the value is writable
* Whether the value is reportable

Examples of capabilities include:

* Temperature
* Humidity
* Motion state
* Power state
* Brightness
* Battery level
* Camera online status

The platform should support dynamic capability schemas.

The architecture should allow capability schema versioning and future custom capabilities without redesigning the entire device model.

## Multi-Brand Compatibility

Multi-brand device compatibility is a core product requirement.

The platform must not be permanently coupled to a single hardware manufacturer.

Vendor-specific integration should be isolated behind adapters or connectors.

The core platform should operate on normalized devices, capabilities, telemetry, and commands.

Vendor and protocol adapters are responsible for translating external device behavior into the platform's internal model.

Potential integration mechanisms include:

* MQTT
* HTTP APIs
* Vendor cloud APIs
* Local network protocols
* ONVIF
* RTSP
* Future protocol adapters

Adding a new device brand should ideally require a new adapter rather than major changes to the core domain architecture.

## CCTV and Security Camera Vision

Security cameras are an important future device category in the platform.

The long-term application should allow users to see cameras from multiple supported brands in one unified security camera experience.

The camera platform should consider multiple integration paths.

### ONVIF

ONVIF may be used for compatible camera discovery and standardized camera operations.

### RTSP

RTSP may be used as a camera stream source when supported by the device.

### Vendor Connectors

Some camera manufacturers may require vendor-specific APIs or cloud integrations.

These integrations should be implemented as isolated vendor connectors.

The platform should normalize camera information before exposing it to the application.

The core application should not directly depend on one camera vendor's data model.

## Camera Onboarding

Camera onboarding should eventually provide a simple consumer-friendly pairing experience.

QR code or barcode scanning is a preferred onboarding pattern when supported by the integration flow.

The intended experience is similar to modern consumer camera applications where a user can scan a device code and continue through a guided pairing process.

A scanned code may provide or help resolve information such as:

* Device serial number
* Device identifier
* Vendor
* Model
* Pairing information

Scanning a QR code does not automatically guarantee universal camera integration.

The platform must still determine the correct vendor or protocol adapter and perform the required authentication or pairing process.

## Security Camera Dashboard

The future security camera experience should provide a modern dashboard.

Potential experiences include:

* Camera grid
* Live camera view
* Online and offline status
* Camera location or room
* Camera identity
* Device health information
* Fast navigation between cameras

The camera experience should remain consistent even when cameras are connected through different adapters.

## Telemetry

Telemetry represents data reported by devices.

Telemetry ingestion must preserve:

* Tenant isolation
* Device identity
* Capability validation
* Payload validation
* Idempotency
* Reliability

MQTT and other messaging systems may deliver the same event more than once.

Telemetry events therefore require duplicate protection.

The current platform uses eventId-based telemetry idempotency as part of this reliability model.

## Commands and Device Control

Commands represent instructions sent to devices.

Examples include:

* Turn a switch on
* Turn a switch off
* Change brightness
* Change a supported device setting
* Trigger a supported device operation

Command processing must preserve:

* Tenant isolation
* Capability validation
* Idempotency
* Lifecycle state
* Acknowledgement handling
* Timeout handling

The command architecture should remain independent from a specific hardware vendor.

Adapters may translate normalized platform commands into vendor-specific operations.

## Real-Time Experience

The future application should provide real-time or near-real-time device updates.

Examples include:

* Sensor value changes
* Device online or offline changes
* Command status changes
* Camera status changes

The backend architecture should eventually support real-time delivery to the application.

The exact delivery technology should be selected based on platform requirements and scalability.

## User Interface Direction

The future user interface should feel modern, clean, and premium.

The application should avoid exposing unnecessary protocol or infrastructure complexity to normal users.

The UI should focus on:

* Rooms and locations
* Device status
* Camera visibility
* Sensor information
* Simple device controls
* Clear online and offline state

Technical device details may be available in advanced views but should not dominate the primary smart home experience.

## Security and Isolation

Security is a core platform requirement.

The architecture must preserve:

* Tenant isolation
* Device identity validation
* Revoked device rejection
* Controlled webhook access
* Authoritative tenant and device context
* Secure authentication
* Input validation

Payload data must not be allowed to override authoritative tenant or device identity derived from trusted context.

## Reliability Principles

The platform should be designed with production reliability in mind.

Important principles include:

* Idempotent event processing
* Database consistency
* Race condition protection
* Structured logging
* Observability
* Automated testing
* Continuous integration
* Migration validation

Reliability should be built into the platform as it grows rather than added only at the end.

## Architecture Principle

The platform core should remain:

* Vendor-neutral
* Protocol-neutral
* Capability-driven
* Tenant-isolated
* Testable
* Observable
* Extensible

Device-specific complexity should be isolated behind adapters and connectors.

## Development Principle

The platform should be developed incrementally.

Each implementation step should preserve existing behavior and pass automated validation.

The current development workflow is:

1. Review architecture and project state.
2. Select one focused engineering task.
3. Implement the smallest coherent change.
4. Build the application.
5. Run automated tests.
6. Review the Git diff.
7. Commit the checkpoint.
8. Push and verify CI.

Large future features such as the complete CCTV experience and final smart home UI should not be forced into an earlier backend module before the required platform foundations are ready.

## Long-Term Goal

The long-term goal is a unified IoT and smart home platform where users can monitor cameras, understand sensor data, and control supported devices from one modern application.

The platform should be able to grow across device types and manufacturers without requiring the core architecture to be rebuilt for every new integration.
