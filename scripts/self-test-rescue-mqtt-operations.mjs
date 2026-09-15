#!/usr/bin/env node
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  MqttOperationClosedError,
  MqttOperationTimeoutError,
  expectPublishDeniedBounded,
  expectSubscribeDeniedBounded,
  mqttPublishBounded,
  mqttSubscribeBounded,
  observeSubscribeDenialBounded,
} from './lib/rescue-mqtt-operations.mjs';

const fastTimeout = 80;

function emitterClient(methods = {}) {
  const client = new EventEmitter();
  Object.assign(client, methods);
  return client;
}

const subscribeOk = emitterClient({
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(null, [{ qos: 1, reasonCode: 1 }]), 5);
  },
});
assert.deepEqual(
  await mqttSubscribeBounded(subscribeOk, 'ok/topic', 1, fastTimeout),
  [{ qos: 1, reasonCode: 1 }],
);
console.log('PASS  bounded subscribe resolves normal callback');

const subscribeDenied = emitterClient({
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(null, [{ qos: 128, reasonCode: 135 }]), 5);
  },
});
assert.equal(
  await expectSubscribeDeniedBounded(
    subscribeDenied,
    'denied/topic',
    1,
    fastTimeout,
  ),
  true,
);
console.log('PASS  SUBACK not-authorized is recognized as denial');

const subscribeDisconnectDenied = emitterClient({
  subscribe() {
    setTimeout(
      () => this.emit('disconnect', { reasonCode: 0x87 }),
      5,
    );
  },
});
assert.deepEqual(
  await observeSubscribeDenialBounded(
    subscribeDisconnectDenied,
    'disconnect-denied/topic',
    1,
    fastTimeout,
  ),
  {
    denied: true,
    signal: 'disconnect-not-authorized',
    reasonCode: 0x87,
  },
);
console.log('PASS  MQTT v5 not-authorized disconnect proves subscribe denial');

const subscribeGenericErrorThenDenied = emitterClient({
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(new Error('client disconnecting')), 3);
    setTimeout(() => this.emit('disconnect', { reasonCode: 0x87 }), 8);
  },
});
assert.equal(
  await expectSubscribeDeniedBounded(
    subscribeGenericErrorThenDenied,
    'generic-then-denied/topic',
    1,
    fastTimeout,
  ),
  true,
);
console.log('PASS  generic subscribe callback error cannot preempt later explicit denial');

const subscribeError = emitterClient({
  subscribe(_topic, _opts, cb) {
    setTimeout(() => cb(new Error('Not authorized')), 5);
  },
});
assert.equal(
  await expectSubscribeDeniedBounded(
    subscribeError,
    'error/topic',
    1,
    fastTimeout,
  ),
  true,
);
console.log('PASS  explicit subscribe authorization error is recognized');

const subscribeCloseOnly = emitterClient({
  subscribe() {
    setTimeout(() => this.emit('close'), 5);
  },
});
await assert.rejects(
  () =>
    expectSubscribeDeniedBounded(
      subscribeCloseOnly,
      'close/topic',
      1,
      fastTimeout,
    ),
  (error) =>
    error instanceof MqttOperationClosedError &&
    error.code === 'MQTT_OPERATION_CLOSED',
);
console.log('PASS  close-only subscribe path fails closed as ambiguous');

const subscribeHang = emitterClient({ subscribe() {} });
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
console.log('PASS  subscribe timeout fails closed and is not denial evidence');

const publishOk = emitterClient({
  publish(_topic, _payload, _opts, cb) {
    setTimeout(() => cb(null, { reasonCode: 0 }), 5);
  },
});
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

const publishPubackDenied = emitterClient({
  publish(_topic, _payload, _opts, cb) {
    setTimeout(() => cb(null, { reasonCode: 0x87 }), 5);
  },
});
assert.deepEqual(
  await expectPublishDeniedBounded(
    publishPubackDenied,
    'puback-denied/topic',
    { value: 1 },
    1,
    fastTimeout,
  ),
  {
    denied: true,
    signal: 'puback-not-authorized',
    reasonCode: 0x87,
  },
);
console.log('PASS  PUBACK not-authorized proves publish denial');

const publishDisconnectDenied = emitterClient({
  publish() {
    setTimeout(
      () => this.emit('disconnect', { reasonCode: 0x87 }),
      5,
    );
  },
});
assert.deepEqual(
  await expectPublishDeniedBounded(
    publishDisconnectDenied,
    'disconnect-denied/topic',
    { value: 1 },
    1,
    fastTimeout,
  ),
  {
    denied: true,
    signal: 'disconnect-not-authorized',
    reasonCode: 0x87,
  },
);
console.log('PASS  MQTT v5 not-authorized disconnect proves publish denial');

const publishGenericErrorThenDenied = emitterClient({
  publish(_topic, _payload, _opts, cb) {
    setTimeout(() => cb(new Error('client disconnecting')), 3);
    setTimeout(() => this.emit('disconnect', { reasonCode: 0x87 }), 8);
  },
});
assert.equal(
  (
    await expectPublishDeniedBounded(
      publishGenericErrorThenDenied,
      'generic-then-denied/topic',
      { value: 1 },
      1,
      fastTimeout,
    )
  ).denied,
  true,
);
console.log('PASS  generic publish callback error cannot preempt later explicit denial');

const publishAccepted = emitterClient({
  publish(_topic, _payload, _opts, cb) {
    setTimeout(() => cb(null, { reasonCode: 0 }), 5);
  },
});
assert.deepEqual(
  await expectPublishDeniedBounded(
    publishAccepted,
    'accepted/topic',
    { value: 1 },
    1,
    fastTimeout,
  ),
  {
    denied: false,
    signal: 'puback-accepted',
    reasonCode: 0,
  },
);
console.log('PASS  accepted PUBACK cannot be misreported as denial');

const publishCloseOnly = emitterClient({
  publish() {
    setTimeout(() => this.emit('close'), 5);
  },
});
await assert.rejects(
  () =>
    expectPublishDeniedBounded(
      publishCloseOnly,
      'close/topic',
      { value: 1 },
      1,
      fastTimeout,
    ),
  (error) =>
    error instanceof MqttOperationClosedError &&
    error.code === 'MQTT_OPERATION_CLOSED',
);
console.log('PASS  close-only publish path fails closed as ambiguous');

const publishHang = emitterClient({ publish() {} });
await assert.rejects(
  () =>
    expectPublishDeniedBounded(
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

console.log('RESCUE MQTT ACL-OBSERVATION SELF-TEST PASS');
