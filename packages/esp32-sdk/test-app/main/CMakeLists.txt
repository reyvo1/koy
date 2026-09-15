# The ESP-IDF `main` component automatically depends on every component
# discovered for the project. The SDK component directory is named
# `esp32-sdk`, so do not invent a separate REQUIRES alias such as `iot_sdk`.
idf_component_register(SRCS "app_main.c")
