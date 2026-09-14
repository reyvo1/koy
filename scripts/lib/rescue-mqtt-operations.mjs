export class MqttOperationTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'MqttOperationTimeoutError';
    this.code = 'MQTT_OPERATION_TIMEOUT';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export function isMqttOperationTimeout(error) {
  return error?.code === 'MQTT_OPERATION_TIMEOUT';
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

export async function expectSubscribeDeniedBounded(
  client,
  topic,
  qos = 1,
  timeoutMs = 8_000,
) {
  try {
    const granted = await mqttSubscribeBounded(client, topic, qos, timeoutMs);
    return (
      granted.length === 0 ||
      granted.every(
        (item) =>
          item.qos === 128 ||
          item.reasonCode === 128 ||
          item.reasonCode === 135,
      )
    );
  } catch (error) {
    // Timeout is not evidence that ACL denied the operation.
    if (isMqttOperationTimeout(error)) throw error;
    // Explicit broker/client error is valid denial evidence.
    return true;
  }
}
