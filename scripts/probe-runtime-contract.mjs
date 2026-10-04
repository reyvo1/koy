#!/usr/bin/env node

export function mqttPublisherRecoveryState(snapshot) {
  const clients = Array.isArray(snapshot?.clients) ? snapshot.clients : [];
  const prefix = typeof snapshot?.platformPublisherPrefix === 'string'
    ? snapshot.platformPublisherPrefix
    : '';
  const publisherClients = prefix
    ? clients.filter((client) => String(client?.clientId ?? '').startsWith(prefix))
    : [];
  const publisherReady = publisherClients.some(
    (client) => Boolean(client?.username) && Boolean(client?.connectedAt),
  );
  const advertisedCount = Number(snapshot?.platformPublisherCount ?? 0);

  return {
    brokerReachable: snapshot?.brokerReachable === true,
    publisherReady:
      advertisedCount >= 1 &&
      publisherClients.length >= 1 &&
      publisherReady,
    advertisedCount,
    matchedClients: publisherClients.length,
    detail: `brokerReachable=${String(snapshot?.brokerReachable)} ` +
      `platformPublisherCount=${String(snapshot?.platformPublisherCount)} ` +
      `matchedClients=${publisherClients.length}`,
  };
}
