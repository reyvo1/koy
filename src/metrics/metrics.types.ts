export type MetricLabels = Readonly<Record<string, string>>;

export type TelemetryMetricOutcome =
  'accepted' | 'duplicate' | 'rejected' | 'failed';

export type CommandMetricEvent =
  | 'created'
  | 'idempotent_replay'
  | 'sent'
  | 'sent_state_raced'
  | 'sent_persistence_failed'
  | 'publish_failed'
  | 'acknowledged'
  | 'acknowledgement_replayed'
  | 'acknowledgement_rejected'
  | 'timed_out'
  | 'stale_pending'
  | 'retry_replay'
  | 'retry_raced'
  | 'retry_claimed';

export type ReadinessStatus = 'up' | 'down';
export type OverallReadinessStatus = 'ready' | 'not_ready';

export type MqttPublisherState =
  'connecting' | 'connected' | 'disconnected' | 'error' | 'stopping';

export type MqttPublisherPublishOutcome =
  'confirmed' | 'failed' | 'timeout' | 'rejected';
