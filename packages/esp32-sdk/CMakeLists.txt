idf_component_register(
  SRCS "src/iot_sdk.c"
  INCLUDE_DIRS "include"
  PRIV_REQUIRES app_update esp_event esp_http_client esp_hw_support esp_netif esp_wifi mbedtls mqtt nvs_flash
)
