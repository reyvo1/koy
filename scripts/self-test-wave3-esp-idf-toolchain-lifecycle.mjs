import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

const checks = [];
function check(label, ok) {
  if (!ok) throw new Error(`FAIL  ${label}`);
  console.log(`PASS  ${label}`);
  checks.push(label);
}

const start = workflow.indexOf('  esp32-firmware-simulation:');
const end = workflow.indexOf('  rescue-live-emqx:');
check('Wave 3 firmware simulation job exists', start >= 0 && end > start);
const job = workflow.slice(start, end);

check('ESP-IDF action remains the single environment owner',
  job.includes('uses: espressif/install-esp-idf-action@v1'));
check('firmware job never re-sources export.sh after action activation',
  !job.includes('$IDF_PATH/export.sh') && !job.includes('export.sh'));
check('QEMU is installed through the active IDF tool registry',
  job.includes('"$IDF_PYTHON" "$IDF_PATH/tools/idf_tools.py" install "$QEMU_TOOL"'));
check('installer-managed Python venv owns the QEMU tool installation',
  job.includes('IDF_PYTHON="$IDF_PYTHON_ENV_PATH/bin/python"') &&
    job.includes('"$IDF_PYTHON" "$IDF_PATH/tools/idf_tools.py" install "$QEMU_TOOL"'));
check('mandatory QEMU boot does not install or depend on pytest-embedded',
  !job.includes('pytest-embedded') && !job.includes('pytest_wave3.py') && !job.includes('--embedded-services'));
check('target QEMU binary is resolved from IDF_TOOLS_PATH after install',
  job.includes('QEMU_PATH="$(find "$IDF_TOOLS_PATH/tools/$QEMU_TOOL"'));
check('resolved QEMU directory is exported to current and subsequent GitHub steps',
  job.includes('export PATH="$QEMU_DIR:$PATH"') && job.includes('echo "$QEMU_DIR" >> "$GITHUB_PATH"'));
check('ESP32 and ESP32-C3 map to architecture-correct QEMU binaries',
  job.includes('QEMU_BINARY=qemu-system-xtensa') && job.includes('QEMU_BINARY=qemu-system-riscv32'));
check('QEMU install is verified before native boot execution',
  job.indexOf('"$QEMU_PATH" --version') < job.indexOf('run-wave3-qemu-boot.mjs'));
check('QEMU boot uses the repository-native ESP-IDF-compatible runner',
  job.includes('node scripts/run-wave3-qemu-boot.mjs') &&
    job.includes('--target="${{ matrix.target }}"') &&
    job.includes('--app-path=packages/esp32-sdk/test-app'));
check('idf.py remains available from the installer-managed environment',
  job.includes('idf.py --version'));

console.log(`WAVE 3 ESP-IDF TOOLCHAIN LIFECYCLE SELF-TEST PASS (${checks.length}/${checks.length})`);
