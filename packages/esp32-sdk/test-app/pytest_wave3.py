import pytest
from pytest_embedded_idf.utils import idf_parametrize


@pytest.mark.qemu
@idf_parametrize('target', ['esp32', 'esp32c3'], indirect=['target'])
def test_wave3_sdk_boots_in_qemu(dut):
    dut.expect_exact('WAVE3_QEMU_BOOT_OK')
    dut.expect('WAVE3_SDK_LINK_OK version=2.1.0 state=0')
    dut.expect_exact('WAVE3_OTA_SHA256_REQUIRED')
