export class MqttOperationTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'MqttOperationTimeoutError';
    this.code = 'MQTT_OPERATION_TIMEOUT';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class MqttOperationClosedError extends Error {
  constructor(operation, cause = null) {
    super(`${operation} connection closed without an explicit denial signal`);
    this.name = 'MqttOperationClosedError';
    this.code = 'MQTT_OPERATION_CLOSED';
    this.operation = operation;
    this.cause = cause;
  }
}

export function isMqttOperationTimeout(error) {
  return error?.code === 'MQTT_OPERATION_TIMEOUT';
}

const NOT_AUTHORIZED_REASON_CODE = 0x87;

function isExplicitAuthorizationError(error) {
  if (!error) return false;
  if (Number(error.reasonCode) === NOT_AUTHORIZED_REASON_CODE) return true;
  if (Number(error.code) === NOT_AUTHORIZED_REASON_CODE) return true;

  const code = String(error.code ?? '').toUpperCase();
  if (
    code === 'NOT_AUTHORIZED' ||
    code === 'NOT_AUTHORISED' ||
    code === 'MQTT_NOT_AUTHORIZED' ||
    code === 'MQTT_NOT_AUTHORISED'
  ) {
    return true;
  }

  const message = String(error.message ?? error);
  return /not[\s_-]*authori[sz]ed|authorization[^\n]*denied|acl[^\n]*denied/i.test(
    message,
  );
}

function withCallbackTimeout(operation, timeoutMs, register) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const resolveOnce = settle(resolve);
    const rejectOnce = settle(reject);

    const timer = setTimeout(() => {
      rejectOnce(new MqttOperationTimeoutError(operation, timeoutMs));
    }, timeoutMs);

    try {
      register(resolveOnce, rejectOnce);
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function observeAclOperation(client, operation, timeoutMs, register) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let lastNonAuthorizationError = null;

    const cleanup = () => {
      clearTimeout(timer);
      client.removeListener?.('disconnect', onDisconnect);
      client.removeListener?.('error', onError);
      client.removeListener?.('close', onClose);
    };

    const settle = (callback) => (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const resolveOnce = settle(resolve);
    const rejectOnce = settle(reject);

    const onDisconnect = (packet) => {
      const reasonCode = Number(packet?.reasonCode ?? 0);
      if (reasonCode === NOT_AUTHORIZED_REASON_CODE) {
        resolveOnce({
          denied: true,
          signal: 'disconnect-not-authorized',
          reasonCode,
        });
        return;
      }

      rejectOnce(
        new Error(
          `${operation} received MQTT DISCONNECT reason ${reasonCode} instead of explicit not-authorized denial`,
        ),
      );
    };

    const onError = (error) => {
      if (isExplicitAuthorizationError(error)) {
        resolveOnce({
          denied: true,
          signal: 'authorization-error',
          reasonCode: Number(error?.reasonCode ?? error?.code) || null,
        });
        return;
      }

      // A disconnect-on-deny broker may surface a generic transport/client
      // error before the MQTT v5 DISCONNECT packet is observed. Keep waiting
      // for the explicit denial signal; close/timeout still fail closed.
      lastNonAuthorizationError = error;
    };

    const onClose = () => {
      rejectOnce(
        new MqttOperationClosedError(operation, lastNonAuthorizationError),
      );
    };

    client.once?.('disconnect', onDisconnect);
    client.on?.('error', onError);
    client.once?.('close', onClose);

    timer = setTimeout(() => {
      rejectOnce(new MqttOperationTimeoutError(operation, timeoutMs));
    }, timeoutMs);

    try {
      register(resolveOnce, rejectOnce);
    } catch (error) {
      rejectOnce(error);
    }
  });
}

export async function mqttSubscribeBounded(
  client,
  topic,
  qos = 1,
  timeoutMs = 8_000,
) {
  return await withCallbackTimeout(
    `MQTT subscribe ${topic}`,
    timeoutMs,
    (resolve, reject) => {
      client.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(granted ?? []);
      });
    },
  );
}

export async function mqttPublishBounded(
  client,
  topic,
  payload,
  qos = 1,
  timeoutMs = 8_000,
) {
  const message =
    typeof payload === 'string' ? payload : JSON.stringify(payload);

  return await withCallbackTimeout(
    `MQTT publish ${topic}`,
    timeoutMs,
    (resolve, reject) => {
      client.publish(topic, message, { qos }, (error, packet) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(packet ?? null);
      });
    },
  );
}

export async function observeSubscribeDenialBounded(
  client,
  topic,
  qos = 1,
  timeoutMs = 8_000,
) {
  const operation = `MQTT subscribe ${topic}`;
  return await observeAclOperation(
    client,
    operation,
    timeoutMs,
    (resolve) => {
      client.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          if (isExplicitAuthorizationError(error)) {
            resolve({
              denied: true,
              signal: 'subscribe-authorization-error',
              reasonCode: Number(error?.reasonCode ?? error?.code) || null,
            });
          }
          // Generic callback errors are not denial evidence. Keep waiting for
          // an explicit MQTT v5 DISCONNECT; close/timeout remains fail-closed.
          return;
        }

        const items = granted ?? [];
        const deniedItem = items.find(
          (item) =>
            item?.qos === 128 ||
            Number(item?.reasonCode) === NOT_AUTHORIZED_REASON_CODE,
        );
        if (deniedItem) {
          resolve({
            denied: true,
            signal: 'suback-not-authorized',
            reasonCode:
              Number(deniedItem?.reasonCode) ||
              (deniedItem?.qos === 128 ? 128 : null),
          });
          return;
        }

        resolve({
          denied: false,
          signal: 'suback-accepted',
          reasonCode: Number(items[0]?.reasonCode ?? items[0]?.qos ?? 0),
        });
      });
    },
  );
}

export async function expectSubscribeDeniedBounded(
  client,
  topic,
  qos = 1,
  timeoutMs = 8_000,
) {
  return (
    await observeSubscribeDenialBounded(client, topic, qos, timeoutMs)
  ).denied;
}

export async function expectPublishDeniedBounded(
  client,
  topic,
  payload,
  qos = 1,
  timeoutMs = 8_000,
) {
  const message =
    typeof payload === 'string' ? payload : JSON.stringify(payload);
  const operation = `MQTT publish ${topic}`;

  return await observeAclOperation(
    client,
    operation,
    timeoutMs,
    (resolve) => {
      client.publish(topic, message, { qos }, (error, packet) => {
        if (error) {
          if (isExplicitAuthorizationError(error)) {
            resolve({
              denied: true,
              signal: 'publish-authorization-error',
              reasonCode: Number(error?.reasonCode ?? error?.code) || null,
            });
          }
          // Generic callback errors are not denial evidence. Keep waiting for
          // an explicit MQTT v5 DISCONNECT; close/timeout remains fail-closed.
          return;
        }

        const reasonCode = Number(packet?.reasonCode ?? 0);
        resolve({
          denied: reasonCode === NOT_AUTHORIZED_REASON_CODE,
          signal:
            reasonCode === NOT_AUTHORIZED_REASON_CODE
              ? 'puback-not-authorized'
              : 'puback-accepted',
          reasonCode,
        });
      });
    },
  );
}
