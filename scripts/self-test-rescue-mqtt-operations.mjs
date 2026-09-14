#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  MqttOperationTimeoutError,
  expectSubscribeDeniedBounded,
  mqttPublishBounded,
  mqttSubscribeBounded,
} from './lib/rescue-mqtt-operations.mjs';

const fastTimeout = 60;

const subscribeOk = {
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(null, [{ qos: 1 }]), 5);
  },
};
assert.deepEqual(
  await mqttSubscribeBounded(subscribeOk, 'ok/topic', 1, fastTimeout),
  [{ qos: 1 }],
);
console.log('PASS  bounded subscribe resolves normal callback');

const subscribeDenied = {
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(null, [{ qos: 128, reasonCode: 135 }]), 5);
  },
};
assert.equal(
  await expectSubscribeDeniedBounded(
    subscribeDenied,
    'denied/topic',
    1,
    fastTimeout,
  ),
  true,
);
console.log('PASS  explicit denied subscription is recognized');

const subscribeError = {
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(new Error('not authorized')), 5);
  },
};
assert.equal(
  await expectSubscribeDeniedBounded(
    subscribeError,
    'error/topic',
    1,
    fastTimeout,
  ),
  true,
);
console.log('PASS  explicit subscribe error is recognized as denial');

const subscribeHang = { subscribe() {} };
await assert.rejects(
  () =>
    expectSubscribeDeniedBounded(
      subscribeHang,
      'hang/topic',
      1,
      fastTimeout,
    ),
  (error) =>
    error instanceof MqttOperationTimeoutError &&
    error.code === 'MQTT_OPERATION_TIMEOUT',
);
console.log('PASS  subscribe timeout fails closed and is not misreported as denial');

const publishOk = {
  publish(_topic, _payload, _opts, cb) {
    setTimeout(() => cb(null, { reasonCode: 0 }), 5);
  },
};
assert.deepEqual(
  await mqttPublishBounded(
    publishOk,
    'ok/topic',
    { value: 1 },
    1,
    fastTimeout,
  ),
  { reasonCode: 0 },
);
console.log('PASS  bounded publish resolves normal callback');

const publishHang = { publish() {} };
await assert.rejects(
  () =>
    mqttPublishBounded(
      publishHang,
      'hang/topic',
      { value: 1 },
      1,
      fastTimeout,
    ),
  (error) =>
    error instanceof MqttOperationTimeoutError &&
    error.code === 'MQTT_OPERATION_TIMEOUT',
);
console.log('PASS  publish timeout fails closed with operation context');

console.log('RESCUE MQTT BOUNDED-OPERATION SELF-TEST PASS');
