#!/usr/bin/env bash
# BROWSER_FIXTURE + SYNTHETIC_MEDIA_TRANSPORT, separate from production auth/HIL evidence.
set -euo pipefail

fixture_name="iot-product-browser-${GITHUB_RUN_ID:-local}-$$"
media_port="${PRODUCT_BROWSER_MEDIA_PORT:-15984}"
rtc_port="${PRODUCT_BROWSER_RTC_PORT:-18555}"
media_image='alexxit/go2rtc@sha256:675c318b23c06fd862a61d262240c9a63436b4050d177ffc68a32710d9e05bae'
cleanup() {
  docker rm -f "$fixture_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# No shared stack, data volume, credential file or production stream is touched.
fixture_config="{api: {listen: \":1984\"}, rtsp: {listen: \":8554\"}, webrtc: {listen: \":8555\", candidates: [\"127.0.0.1:${rtc_port}\"]}, streams: {simulator: \"exec:ffmpeg -re -f lavfi -i testsrc=size=320x240:rate=15 -c:v libx264 -tune zerolatency -preset ultrafast -pix_fmt yuv420p -f rtsp {output}\"}}"
docker run --detach --rm --name "$fixture_name" --label iot.audit=product-browser-ci \
  -p "127.0.0.1:${media_port}:1984" \
  -p "127.0.0.1:${rtc_port}:8555/tcp" -p "127.0.0.1:${rtc_port}:8555/udp" \
  "$media_image" go2rtc -config "$fixture_config" >/dev/null
ready=false
for ((attempt=0; attempt<30; attempt++)); do
  if curl --silent --fail --connect-timeout 1 --max-time 2 "http://127.0.0.1:${media_port}/api/streams" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo 'FAIL synthetic media readiness deadline expired' >&2
  exit 1
fi
PRODUCT_TEST_MEDIA_URL="http://127.0.0.1:${media_port}" \
PRODUCT_TEST_RTSP_URL='rtsp://127.0.0.1:8554/simulator' \
  npm run product:browser:test
