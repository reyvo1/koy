/**
 * iot_sdk.h — ESP32 Device SDK for IoT Platform
 *
 * Wire contract (see include/iot_sdk_contract.h):
 *  - Identity: platform deviceId + random per-device secret
 *  - Provisioning: Wi-Fi credentials + one-time pairingCode via BLE or serial
 *  - MQTT: tenants/<tenantId>/devices/<deviceId>/{telemetry,commands,commands/ack}
 *  - Telemetry: flat JSON, primitives only, <=1KB
 *  - OTA: verify SHA-256 before flashing; rollback-safe boot partitions
 *
 * Target: ESP-IDF v5.x (ESP32 / ESP32-S3 / ESP32-C3)
 */
#ifndef IOT_SDK_H
#define IOT_SDK_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#define IOT_SDK_VERSION "2.0.0"
#define IOT_TOPIC_MAX_LEN 160
#define IOT_PAYLOAD_MAX_LEN 1024
#define IOT_HEARTBEAT_INTERVAL_MS 60000

#ifdef __cplusplus
extern "C" {
#endif

/** Connection/provisioning state machine. */
typedef enum {
    IOT_STATE_UNPROVISIONED = 0,
    IOT_STATE_PROVISIONING,
    IOT_STATE_WIFI_CONNECTING,
    IOT_STATE_MQTT_CONNECTING,
    IOT_STATE_ONLINE,
    IOT_STATE_ERROR
} iot_state_t;

/** A single telemetry reading. */
typedef struct {
    const char* capability_key;
    char value_repr[64]; /* stringified primitive value */
} iot_telemetry_field_t;

/** Incoming command envelope parsed from .../commands. */
typedef struct {
    char command_id[64];
    char capability_key[64];
    char value_repr[64];
} iot_command_t;

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/**
 * Initialize NVS, network stack, and load stored credentials.
 * Returns true when provisioned credentials were found.
 */
bool iot_sdk_init(void);

/** Runs the SDK event loop (blocking). Call once from app_main task. */
void iot_sdk_run(void);

/** Current state machine value. */
iot_state_t iot_sdk_get_state(void);

/* ------------------------------------------------------------------ */
/* Provisioning                                                        */
/* ------------------------------------------------------------------ */

/**
 * Store provisioning payload received over BLE/serial:
 * Wi-Fi SSID/password + platform pairing code (<deviceId>:<one-time-token>).
 * Calls POST /devices/<deviceId>/pair, generates the device secret locally,
 * and persists the resulting MQTT identity in the encrypted NVS partition.
 */
bool iot_sdk_provision(const char* ssid,
                       const char* wifi_password,
                       const char* pairing_code);

/** Erase all stored credentials (factory reset). */
void iot_sdk_factory_reset(void);

/* ------------------------------------------------------------------ */
/* Telemetry & commands                                                */
/* ------------------------------------------------------------------ */

/**
 * Publish one telemetry batch. Fields must be primitive values already
 * stringified by the caller; the SDK enforces the 1KB payload bound and
 * drops the batch (returning false) when exceeded.
 */
bool iot_sdk_publish_telemetry(const iot_telemetry_field_t* fields,
                               size_t field_count);

/**
 * Register a handler invoked for each new command envelope. MQTT QoS-1
 * duplicates are suppressed by a bounded RAM command-id cache; once an
 * ACK/FAILED result is recorded, a duplicate replays that result instead of
 * invoking the handler again. The cache is not persisted across reboot.
 */
typedef void (*iot_command_handler_t)(const iot_command_t* command);
void iot_sdk_on_command(iot_command_handler_t handler);

/**
 * Acknowledge a command: status "ACK" after acceptance or "FAILED" with a
 * short reason. Published to .../commands/ack referencing the command id.
 */
bool iot_sdk_ack_command(const char* command_id, bool success, const char* reason);

/* ------------------------------------------------------------------ */
/* OTA                                                                 */
/* ------------------------------------------------------------------ */

/**
 * OTA entry point. RESCUE-02 fails closed until the implementation can prove
 * the downloaded image SHA-256 matches sha256_hex on real ESP-IDF hardware.
 * The function currently returns false and does not flash an image.
 */
bool iot_sdk_ota_update(const char* artifact_url, const char* sha256_hex);

#ifdef __cplusplus
}
#endif

#endif /* IOT_SDK_H */
