#!/usr/bin/env bash
# Wave 9 step 4: RTSP->WebRTC, end to end. Brings the runtime up first -- a probe that assumes a
# running container reports a connection refused, which is a fact about the probe, not the product.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
DIR="$(dirname "$0")"
docker compose -f docker-compose.rescue.yml up -d go2rtc >/dev/null
for _ in $(seq 1 20); do
  if docker ps --format '{{.Names}} {{.Status}}' | grep -q '^iot-rescue-go2rtc .*healthy'; then
    break
  fi
  sleep 3
done
docker ps --format '{{.Names}} {{.Status}}' | grep '^iot-rescue-go2rtc' || {
  echo "go2rtc did not become healthy" >&2; exit 2; }
python3 "$DIR/probe-media-runtime.py"
mkdir -p reports/simulated-hardware-uat
cat > reports/simulated-hardware-uat/media.json <<'JSON'
{
  "schemaVersion": 1,
  "gate": "SIMULATED_HARDWARE_UAT",
  "component": "rtsp-webrtc-media",
  "status": "PASS",
  "evidenceClass": "SIMULATED_HARDWARE",
  "boundary": "Synthetic H264 RTSP producer through the real go2rtc/WebRTC runtime; not relabelled as physical camera firmware evidence."
}
JSON
printf '\nWAVE 9 MEDIA RUNTIME PROBE: PASS\n'
