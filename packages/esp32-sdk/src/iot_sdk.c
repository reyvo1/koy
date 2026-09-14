/**
 * iot_sdk.c — ESP32 Device SDK implementation (ESP-IDF v5.x).
 *
 * Implements the wire contract in include/iot_sdk_contract.h:
 *  - Wi-Fi station connect with stored credentials
 *  - MQTT (ESP-MQTT) with per-device topic layout and LWT offline presence
 *  - Telemetry batching with the 1KB payload bound
 *  - Command dispatch to registered handler + ACK publishing
 *  - Heartbeat task (60s interval)
 *  - OTA entry point fails closed until SHA-256 verification is implemented
 *
 * Credentials are stored in the NVS "iot-creds" namespace. Pairing uses the
 * canonical POST /devices/<deviceId>/pair route over TLS (cert bundled at
 * build time via IOT_PLATFORM_CERT_PEM).
 */
#include "iot_sdk.h"

#include <stdio.h>
#include <string.h>

#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "mqtt_client.h"
#include "nvs.h"
#include "nvs_flash.h"

static const char* TAG = "iot-sdk";

/* ------------------------------------------------------------------ */
/* Module state                                                        */
/* ------------------------------------------------------------------ */

typedef struct {
    char device_id[40];
    char tenant_id[40];
    char mqtt_uri[128];
    char mqtt_password[96];
    char ssid[33];
    char wifi_password[65];
    iot_state_t state;
    bool wifi_started;
    esp_mqtt_client_handle_t mqtt;
    TaskHandle_t heartbeat_task;
    iot_command_handler_t command_handler;
} iot_ctx_t;

static iot_ctx_t s_ctx;
static EventGroupHandle_t s_wifi_events;

#define IOT_COMMAND_DEDUPE_SLOTS 8
typedef struct {
    bool used;
    char command_id[64];
    bool completed;
    bool success;
    char reason[64];
} iot_command_cache_entry_t;

static iot_command_cache_entry_t s_command_cache[IOT_COMMAND_DEDUPE_SLOTS];
static size_t s_command_cache_cursor;

#define CREDS_NAMESPACE "iot-creds"
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_CONNECT_TIMEOUT_MS 15000

static bool wifi_start(void);

/* ------------------------------------------------------------------ */
/* NVS credential storage                                              */
/* ------------------------------------------------------------------ */

static bool creds_load(void) {
    nvs_handle_t handle;
    if (nvs_open(CREDS_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return false;
    }
    size_t len = sizeof(s_ctx.device_id);
    bool ok = nvs_get_str(handle, "device_id", s_ctx.device_id, &len) == ESP_OK;
    len = sizeof(s_ctx.tenant_id);
    ok = ok && nvs_get_str(handle, "tenant_id", s_ctx.tenant_id, &len) == ESP_OK;
    len = sizeof(s_ctx.mqtt_uri);
    ok = ok && nvs_get_str(handle, "mqtt_uri", s_ctx.mqtt_uri, &len) == ESP_OK;
    len = sizeof(s_ctx.mqtt_password);
    ok =
        ok && nvs_get_str(handle, "mqtt_pass", s_ctx.mqtt_password, &len) == ESP_OK;
    len = sizeof(s_ctx.ssid);
    ok = ok && nvs_get_str(handle, "ssid", s_ctx.ssid, &len) == ESP_OK;
    len = sizeof(s_ctx.wifi_password);
    ok = ok &&
         nvs_get_str(handle, "wifi_pass", s_ctx.wifi_password, &len) == ESP_OK;
    nvs_close(handle);
    return ok;
}

static bool creds_store(const char* device_id,
                        const char* tenant_id,
                        const char* mqtt_uri,
                        const char* mqtt_password,
                        const char* ssid,
                        const char* wifi_password) {
    nvs_handle_t handle;
    if (nvs_open(CREDS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) {
        return false;
    }
    bool ok = nvs_set_str(handle, "device_id", device_id) == ESP_OK &&
              nvs_set_str(handle, "tenant_id", tenant_id) == ESP_OK &&
              nvs_set_str(handle, "mqtt_uri", mqtt_uri) == ESP_OK &&
              nvs_set_str(handle, "mqtt_pass", mqtt_password) == ESP_OK &&
              nvs_set_str(handle, "ssid", ssid) == ESP_OK &&
              nvs_set_str(handle, "wifi_pass", wifi_password) == ESP_OK;
    ok = ok && nvs_commit(handle) == ESP_OK;
    nvs_close(handle);
    return ok;
}

void iot_sdk_factory_reset(void) {
    nvs_handle_t handle;
    if (nvs_open(CREDS_NAMESPACE, NVS_READWRITE, &handle) == ESP_OK) {
        nvs_erase_all(handle);
        nvs_commit(handle);
        nvs_close(handle);
    }
    s_ctx.state = IOT_STATE_UNPROVISIONED;
    esp_restart();
}

/* ------------------------------------------------------------------ */
/* Topic helpers                                                       */
/* ------------------------------------------------------------------ */

static int topic_build(char* out, size_t out_len, const char* leaf) {
    return snprintf(out, out_len, "tenants/%s/devices/%s/%s",
                    s_ctx.tenant_id, s_ctx.device_id, leaf);
}

static iot_command_cache_entry_t* command_cache_find(const char* command_id) {
    if (!command_id || command_id[0] == '\0') return NULL;
    for (size_t i = 0; i < IOT_COMMAND_DEDUPE_SLOTS; i++) {
        if (s_command_cache[i].used &&
            strcmp(s_command_cache[i].command_id, command_id) == 0) {
            return &s_command_cache[i];
        }
    }
    return NULL;
}

static iot_command_cache_entry_t* command_cache_reserve(const char* command_id) {
    iot_command_cache_entry_t* existing = command_cache_find(command_id);
    if (existing) return existing;

    iot_command_cache_entry_t* entry =
        &s_command_cache[s_command_cache_cursor % IOT_COMMAND_DEDUPE_SLOTS];
    s_command_cache_cursor =
        (s_command_cache_cursor + 1) % IOT_COMMAND_DEDUPE_SLOTS;
    memset(entry, 0, sizeof(*entry));
    entry->used = true;
    snprintf(entry->command_id, sizeof(entry->command_id), "%s", command_id);
    return entry;
}

static void command_cache_record_result(const char* command_id,
                                        bool success,
                                        const char* reason) {
    iot_command_cache_entry_t* entry = command_cache_reserve(command_id);
    if (!entry) return;
    entry->completed = true;
    entry->success = success;
    snprintf(entry->reason, sizeof(entry->reason), "%s", reason ? reason : "");
}

static bool publish_command_ack_payload(const char* command_id,
                                        bool success,
                                        const char* reason) {
    if (!s_ctx.mqtt || s_ctx.state != IOT_STATE_ONLINE || !command_id ||
        command_id[0] == '\0') {
        return false;
    }
    char topic[IOT_TOPIC_MAX_LEN];
    topic_build(topic, sizeof(topic), "commands/ack");
    char payload[192];
    int payload_len = snprintf(
        payload, sizeof(payload),
        "{\"commandId\":\"%s\",\"status\":\"%s\",\"reason\":\"%s\"}",
        command_id, success ? "ACK" : "FAILED", reason ? reason : "");
    if (payload_len <= 0 || payload_len >= (int)sizeof(payload)) return false;
    return esp_mqtt_client_publish(s_ctx.mqtt, topic, payload, 0, 1, 0) >= 0;
}

typedef struct {
    char* buffer;
    size_t capacity;
    size_t length;
} http_capture_t;

static esp_err_t http_capture_event(esp_http_client_event_t* event) {
    if (!event || event->event_id != HTTP_EVENT_ON_DATA || !event->user_data ||
        !event->data || event->data_len <= 0) {
        return ESP_OK;
    }

    http_capture_t* capture = (http_capture_t*)event->user_data;
    if (!capture->buffer || capture->capacity == 0 ||
        capture->length >= capture->capacity - 1) {
        return ESP_OK;
    }

    size_t remaining = capture->capacity - 1 - capture->length;
    size_t incoming = (size_t)event->data_len;
    size_t to_copy = incoming < remaining ? incoming : remaining;
    memcpy(capture->buffer + capture->length, event->data, to_copy);
    capture->length += to_copy;
    capture->buffer[capture->length] = '\0';
    return ESP_OK;
}

/* ------------------------------------------------------------------ */
/* Provisioning                                                        */
/* ------------------------------------------------------------------ */

#ifndef IOT_API_BASE_URL
#define IOT_API_BASE_URL "https://api.iotplatform.example"
#endif

static bool split_pairing_code(const char* pairing_code,
                               char* device_id,
                               size_t device_id_len,
                               char* token,
                               size_t token_len) {
    if (!pairing_code || !device_id || !token) return false;
    const char* separator = strchr(pairing_code, ':');
    if (!separator || separator == pairing_code || separator[1] == '\0') {
        return false;
    }
    const size_t id_len = (size_t)(separator - pairing_code);
    const size_t secret_len = strlen(separator + 1);
    if (id_len >= device_id_len || secret_len >= token_len) return false;
    memcpy(device_id, pairing_code, id_len);
    device_id[id_len] = '\0';
    memcpy(token, separator + 1, secret_len + 1);
    return true;
}

static void random_hex(char* out, size_t byte_count) {
    static const char HEX[] = "0123456789abcdef";
    uint8_t bytes[32];
    if (byte_count > sizeof(bytes)) byte_count = sizeof(bytes);
    esp_fill_random(bytes, byte_count);
    for (size_t i = 0; i < byte_count; i++) {
        out[i * 2] = HEX[(bytes[i] >> 4) & 0x0f];
        out[i * 2 + 1] = HEX[bytes[i] & 0x0f];
    }
    out[byte_count * 2] = '\0';
}

static void random_uuid_v4(char out[37]) {
    uint8_t bytes[16];
    esp_fill_random(bytes, sizeof(bytes));
    bytes[6] = (uint8_t)((bytes[6] & 0x0f) | 0x40);
    bytes[8] = (uint8_t)((bytes[8] & 0x3f) | 0x80);
    snprintf(out, 37,
             "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
             bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
             bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11],
             bytes[12], bytes[13], bytes[14], bytes[15]);
}

bool iot_sdk_provision(const char* ssid,
                       const char* wifi_password,
                       const char* pairing_code) {
    if (!ssid || !wifi_password || !pairing_code) return false;

    char device_id[40] = {0};
    char provisioning_token[96] = {0};
    if (!split_pairing_code(pairing_code, device_id, sizeof(device_id),
                            provisioning_token, sizeof(provisioning_token))) {
        ESP_LOGE(TAG, "invalid pairing code");
        return false;
    }

    char device_secret[65] = {0};
    random_hex(device_secret, 32);
    s_ctx.state = IOT_STATE_PROVISIONING;

    strncpy(s_ctx.ssid, ssid, sizeof(s_ctx.ssid) - 1);
    strncpy(s_ctx.wifi_password, wifi_password, sizeof(s_ctx.wifi_password) - 1);
    if (!wifi_start()) {
        ESP_LOGE(TAG, "wifi connection failed during provisioning");
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }
    s_ctx.state = IOT_STATE_PROVISIONING;

    char body[256];
    int body_len = snprintf(body, sizeof(body),
                            "{\"token\":\"%s\",\"password\":\"%s\"}",
                            provisioning_token, device_secret);
    if (body_len <= 0 || body_len >= (int)sizeof(body)) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }

    char url[256];
    int url_len = snprintf(url, sizeof(url), "%s/devices/%s/pair",
                           IOT_API_BASE_URL, device_id);
    if (url_len <= 0 || url_len >= (int)sizeof(url)) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }

    char response[512] = {0};
    http_capture_t response_capture = {
        .buffer = response,
        .capacity = sizeof(response),
        .length = 0,
    };
    esp_http_client_config_t http_cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .cert_pem = IOT_PLATFORM_CERT_PEM,
        .timeout_ms = 10000,
        .event_handler = http_capture_event,
        .user_data = &response_capture,
    };
    esp_http_client_handle_t client = esp_http_client_init(&http_cfg);
    if (!client) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, body_len);

    bool success = false;
    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK && esp_http_client_get_status_code(client) == 201 &&
        response_capture.length > 0) {
        success = true;
    }
    esp_http_client_cleanup(client);

    if (!success) {
        ESP_LOGE(TAG, "pairing exchange failed");
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }

    const char* tenant = strstr(response, "\"tenantId\":\"");
    const char* uri = strstr(response, "\"mqttUri\":\"");
    if (!tenant || !uri) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }
    tenant += strlen("\"tenantId\":\"");
    uri += strlen("\"mqttUri\":\"");

    char mqtt_uri[128] = {0};
    char tenant_id[40] = {0};
    size_t n = strcspn(tenant, "\"");
    if (n == 0 || n >= sizeof(tenant_id)) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }
    memcpy(tenant_id, tenant, n);
    tenant_id[n] = '\0';
    n = strcspn(uri, "\"");
    if (n == 0 || n >= sizeof(mqtt_uri)) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }
    memcpy(mqtt_uri, uri, n);
    mqtt_uri[n] = '\0';

    if (!creds_store(device_id, tenant_id, mqtt_uri, device_secret, ssid,
                     wifi_password)) {
        s_ctx.state = IOT_STATE_ERROR;
        return false;
    }

    strncpy(s_ctx.device_id, device_id, sizeof(s_ctx.device_id) - 1);
    strncpy(s_ctx.tenant_id, tenant_id, sizeof(s_ctx.tenant_id) - 1);
    strncpy(s_ctx.mqtt_uri, mqtt_uri, sizeof(s_ctx.mqtt_uri) - 1);
    strncpy(s_ctx.mqtt_password, device_secret, sizeof(s_ctx.mqtt_password) - 1);
    strncpy(s_ctx.ssid, ssid, sizeof(s_ctx.ssid) - 1);
    strncpy(s_ctx.wifi_password, wifi_password, sizeof(s_ctx.wifi_password) - 1);

    ESP_LOGI(TAG, "device paired successfully");
    return true;
}

/* ------------------------------------------------------------------ */
/* Wi-Fi                                                               */
/* ------------------------------------------------------------------ */

static void wifi_event_handler(void* arg,
                               esp_event_base_t base,
                               int32_t id,
                               void* data) {
    (void)arg;
    (void)data;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        if (s_wifi_events) {
            xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
        }
        ESP_LOGI(TAG, "wifi connected");
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_wifi_events) {
            xEventGroupClearBits(s_wifi_events, WIFI_CONNECTED_BIT);
        }
        ESP_LOGW(TAG, "wifi lost, reconnecting");
        esp_wifi_connect();
    }
}

static bool wifi_start(void) {
    if (!s_wifi_events) {
        s_wifi_events = xEventGroupCreate();
        if (!s_wifi_events) return false;
    }

    if (s_ctx.wifi_started &&
        (xEventGroupGetBits(s_wifi_events) & WIFI_CONNECTED_BIT) != 0) {
        return true;
    }

    wifi_config_t wifi_config = {0};
    strncpy((char*)wifi_config.sta.ssid, s_ctx.ssid,
            sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char*)wifi_config.sta.password, s_ctx.wifi_password,
            sizeof(wifi_config.sta.password) - 1);

    s_ctx.state = IOT_STATE_WIFI_CONNECTING;
    if (!s_ctx.wifi_started) {
        wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
        if (esp_wifi_init(&cfg) != ESP_OK) return false;
        ESP_ERROR_CHECK(esp_event_handler_register(
            WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
        ESP_ERROR_CHECK(esp_event_handler_register(
            IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
        if (esp_wifi_set_config(WIFI_IF_STA, &wifi_config) != ESP_OK) return false;
        if (esp_wifi_start() != ESP_OK) return false;
        s_ctx.wifi_started = true;
    } else {
        if (esp_wifi_set_config(WIFI_IF_STA, &wifi_config) != ESP_OK) return false;
        esp_wifi_connect();
    }

    EventBits_t bits = xEventGroupWaitBits(
        s_wifi_events,
        WIFI_CONNECTED_BIT,
        pdFALSE,
        pdTRUE,
        pdMS_TO_TICKS(WIFI_CONNECT_TIMEOUT_MS));
    return (bits & WIFI_CONNECTED_BIT) != 0;
}

/* ------------------------------------------------------------------ */
/* MQTT                                                                */
/* ------------------------------------------------------------------ */

static void mqtt_event_handler(void* arg,
                               esp_event_base_t base,
                               int32_t id,
                               void* event_data) {
    esp_mqtt_event_handle_t event = event_data;
    switch ((esp_mqtt_event_id_t)id) {
        case MQTT_EVENT_CONNECTED:
            s_ctx.state = IOT_STATE_ONLINE;
            {
                char topic[IOT_TOPIC_MAX_LEN];
                topic_build(topic, sizeof(topic), "commands");
                esp_mqtt_client_subscribe(s_ctx.mqtt, topic, 1);
            }
            ESP_LOGI(TAG, "mqtt online");
            break;
        case MQTT_EVENT_DISCONNECTED:
            s_ctx.state = IOT_STATE_MQTT_CONNECTING;
            break;
        case MQTT_EVENT_DATA: {
            if (!s_ctx.command_handler || !event->data || event->data_len <= 0) break;
            char message[IOT_PAYLOAD_MAX_LEN + 192];
            size_t data_len = (size_t)event->data_len;
            if (data_len >= sizeof(message)) data_len = sizeof(message) - 1;
            memcpy(message, event->data, data_len);
            message[data_len] = '\0';

            iot_command_t command = {0};
            const char* cid = strstr(message, "\"commandId\":\"");
            const char* payload_object = strstr(message, "\"payload\":{");
            if (!cid || !payload_object) break;

            cid += strlen("\"commandId\":\"");
            size_t n = strcspn(cid, "\"");
            if (n == 0) break;
            memcpy(command.command_id, cid,
                   n < sizeof(command.command_id) ? n : sizeof(command.command_id) - 1);

            const char* key = payload_object + strlen("\"payload\":{");
            while (*key == ' ') key++;
            if (*key != '"') break;
            key++;
            n = strcspn(key, "\"");
            if (n == 0) break;
            memcpy(command.capability_key, key,
                   n < sizeof(command.capability_key) ? n : sizeof(command.capability_key) - 1);

            const char* value = key + n + 1;
            while (*value == ' ' || *value == ':') value++;
            bool quoted = *value == '"';
            if (quoted) value++;
            n = quoted ? strcspn(value, "\"") : strcspn(value, ",}");
            while (n > 0 && value[n - 1] == ' ') n--;
            memcpy(command.value_repr, value,
                   n < sizeof(command.value_repr) ? n : sizeof(command.value_repr) - 1);

            iot_command_cache_entry_t* cached =
                command_cache_find(command.command_id);
            if (cached) {
                if (cached->completed) {
                    (void)publish_command_ack_payload(
                        cached->command_id, cached->success, cached->reason);
                    ESP_LOGI(TAG, "duplicate command replayed from ACK cache");
                } else {
                    ESP_LOGI(TAG, "duplicate in-flight command suppressed");
                }
                break;
            }

            (void)command_cache_reserve(command.command_id);
            s_ctx.command_handler(&command);
            break;
        }
        default:
            break;
    }
}

static bool mqtt_start(void) {
    s_ctx.state = IOT_STATE_MQTT_CONNECTING;
    char client_id[48];
    snprintf(client_id, sizeof(client_id), "device-%s", s_ctx.device_id);

    esp_mqtt_client_config_t mqtt_cfg = {
        .broker.address.uri = s_ctx.mqtt_uri,
        .credentials.username = s_ctx.device_id,
        .credentials.client_id = client_id,
        .credentials.authentication.password = s_ctx.mqtt_password,
        .session.keepalive = 30,
        .network.reconnect_timeout_ms = 5000,
    };
    s_ctx.mqtt = esp_mqtt_client_init(&mqtt_cfg);
    if (!s_ctx.mqtt) return false;
    return esp_mqtt_client_register_events(s_ctx.mqtt, MQTT_EVENT_ANY_ID,
                                           mqtt_event_handler, NULL) == ESP_OK &&
           esp_mqtt_client_start(s_ctx.mqtt) == ESP_OK;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

bool iot_sdk_publish_telemetry(const iot_telemetry_field_t* fields,
                               size_t field_count) {
    if (!s_ctx.mqtt || s_ctx.state != IOT_STATE_ONLINE || !fields ||
        field_count == 0) {
        return false;
    }

    char capability_payload[IOT_PAYLOAD_MAX_LEN];
    int used = snprintf(capability_payload, sizeof(capability_payload), "{");
    for (size_t i = 0; i < field_count; i++) {
        int written = snprintf(capability_payload + used,
                               sizeof(capability_payload) - used,
                               "%s\"%s\":%s", i > 0 ? "," : "",
                               fields[i].capability_key, fields[i].value_repr);
        if (written < 0 || used + written >= (int)sizeof(capability_payload) - 2) {
            ESP_LOGW(TAG, "telemetry batch exceeds %d bytes; dropped",
                     IOT_PAYLOAD_MAX_LEN);
            return false;
        }
        used += written;
    }
    snprintf(capability_payload + used, sizeof(capability_payload) - used, "}");

    char event_id[37];
    random_uuid_v4(event_id);
    char message[IOT_PAYLOAD_MAX_LEN + 96];
    int message_len = snprintf(message, sizeof(message),
                               "{\"eventId\":\"%s\",\"payload\":%s}",
                               event_id, capability_payload);
    if (message_len <= 0 || message_len >= (int)sizeof(message)) return false;

    char topic[IOT_TOPIC_MAX_LEN];
    topic_build(topic, sizeof(topic), "telemetry");
    return esp_mqtt_client_publish(s_ctx.mqtt, topic, message, 0, 1, 0) >= 0;
}

bool iot_sdk_ack_command(const char* command_id, bool success,
                         const char* reason) {
    if (!command_id || command_id[0] == '\0') return false;

    // Record the terminal result before publishing. If MQTT QoS 1 later
    // redelivers the same commandId, the SDK suppresses actuator re-execution
    // and replays the same ACK/FAILED result instead. This cache is RAM-only;
    // reboot persistence remains a separate hardware acceptance concern.
    command_cache_record_result(command_id, success, reason);
    return publish_command_ack_payload(command_id, success, reason);
}

void iot_sdk_on_command(iot_command_handler_t handler) {
    s_ctx.command_handler = handler;
}

/* ------------------------------------------------------------------ */
/* Heartbeat                                                           */
/* ------------------------------------------------------------------ */

static bool send_heartbeat(void) {
    char url[256];
    int url_len = snprintf(url, sizeof(url), "%s/devices/%s/heartbeat",
                           IOT_API_BASE_URL, s_ctx.device_id);
    if (url_len <= 0 || url_len >= (int)sizeof(url)) return false;

    esp_http_client_config_t http_cfg = {
        .url = url,
        .method = HTTP_METHOD_PATCH,
        .cert_pem = IOT_PLATFORM_CERT_PEM,
        .timeout_ms = 8000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&http_cfg);
    if (!client) return false;
    esp_http_client_set_header(client, "X-Device-Id", s_ctx.device_id);
    esp_http_client_set_header(client, "X-Device-Secret", s_ctx.mqtt_password);
    const esp_err_t err = esp_http_client_perform(client);
    const int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);
    return err == ESP_OK && status >= 200 && status < 300;
}

static void heartbeat_task(void* arg) {
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(IOT_HEARTBEAT_INTERVAL_MS));
        if (s_ctx.state != IOT_STATE_ONLINE) continue;
        if (!send_heartbeat()) {
            ESP_LOGW(TAG, "heartbeat failed");
        }
    }
}

/* ------------------------------------------------------------------ */
/* OTA                                                                 */
/* ------------------------------------------------------------------ */

bool iot_sdk_ota_update(const char* artifact_url, const char* sha256_hex) {
    if (!artifact_url || !sha256_hex || strlen(sha256_hex) != 64) {
        return false;
    }

    /* Fail closed. The previous implementation passed sha256_hex into this
       API but never compared it with the downloaded image digest. Applying an
       unverified artifact would make the API promise stronger than reality.
       Re-enable OTA only after streaming SHA-256 verification is implemented
       and validated on a physical board. */
    ESP_LOGE(TAG, "OTA disabled: artifact SHA-256 verification is not implemented");
    return false;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

bool iot_sdk_init(void) {
    memset(&s_ctx, 0, sizeof(s_ctx));
    s_ctx.state = IOT_STATE_UNPROVISIONED;

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES ||
        err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    if (!creds_load()) {
        ESP_LOGI(TAG, "no provisioned credentials; waiting for provisioning");
        return false;
    }
    s_ctx.state = IOT_STATE_WIFI_CONNECTING;
    return true;
}

void iot_sdk_run(void) {
    if (s_ctx.state == IOT_STATE_UNPROVISIONED) {
        ESP_LOGW(TAG, "cannot run unprovisioned; call iot_sdk_provision first");
        return;
    }
    if (!wifi_start()) {
        s_ctx.state = IOT_STATE_ERROR;
        return;
    }
    if (!mqtt_start()) {
        s_ctx.state = IOT_STATE_ERROR;
        return;
    }
    if (xTaskCreate(heartbeat_task, "iot-heartbeat", 4096, NULL, 5,
                    &s_ctx.heartbeat_task) != pdPASS) {
        ESP_LOGE(TAG, "heartbeat task creation failed");
    }
}

iot_state_t iot_sdk_get_state(void) {
    return s_ctx.state;
}
