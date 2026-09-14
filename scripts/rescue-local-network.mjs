export const DEFAULT_RESCUE_MQTT_HOST = '127.0.0.1';
export const DEFAULT_RESCUE_MQTT_HOST_PORT = 18884;

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }
  return port;
}

export function resolveRescueMqttHostPort(env = {}) {
  const explicit = String(env.RESCUE_MQTT_HOST_PORT ?? '').trim();
  if (explicit) return parsePort(explicit, 'RESCUE_MQTT_HOST_PORT');

  const explicitUrl = String(env.RESCUE_MQTT_BROKER_URL ?? '').trim();
  if (explicitUrl) {
    let parsed;
    try {
      parsed = new URL(explicitUrl);
    } catch {
      throw new Error('RESCUE_MQTT_BROKER_URL must be a valid MQTT URL.');
    }
    if (!['mqtt:', 'mqtts:'].includes(parsed.protocol)) {
      throw new Error('RESCUE_MQTT_BROKER_URL must use mqtt:// or mqtts://.');
    }
    if (parsed.port) return parsePort(parsed.port, 'RESCUE_MQTT_BROKER_URL port');
    return parsed.protocol === 'mqtts:' ? 8883 : 1883;
  }

  return DEFAULT_RESCUE_MQTT_HOST_PORT;
}

export function resolveRescueMqttBrokerUrl(env = {}) {
  const explicit = String(env.RESCUE_MQTT_BROKER_URL ?? '').trim();
  const port = resolveRescueMqttHostPort(env);

  if (explicit) {
    const parsed = new URL(explicit);
    const explicitPort = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === 'mqtts:'
        ? 8883
        : 1883;
    if (explicitPort !== port) {
      throw new Error(
        `RESCUE_MQTT_BROKER_URL port ${explicitPort} does not match RESCUE_MQTT_HOST_PORT ${port}.`,
      );
    }
    return explicit;
  }

  return `mqtt://${DEFAULT_RESCUE_MQTT_HOST}:${port}`;
}

export function withLocalRescueNetworkEnv(env = {}) {
  const port = resolveRescueMqttHostPort(env);
  const brokerUrl = resolveRescueMqttBrokerUrl({
    ...env,
    RESCUE_MQTT_HOST_PORT: String(port),
  });
  return {
    ...env,
    RESCUE_MQTT_HOST_PORT: String(port),
    RESCUE_MQTT_BROKER_URL: brokerUrl,
  };
}
