#include <stdio.h>
#include "iot_sdk.h"

void app_main(void) {
    printf("WAVE3_QEMU_BOOT_OK\n");
    printf("WAVE3_SDK_LINK_OK version=%s state=%d\n", IOT_SDK_VERSION,
           (int)iot_sdk_get_state());
    printf("WAVE3_OTA_SHA256_REQUIRED\n");
}
