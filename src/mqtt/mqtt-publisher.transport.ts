export type MqttPublisherReadinessReason =
  | 'publisher_not_configured'
  | 'publisher_connecting'
  | 'publisher_disconnected'
  | 'publisher_error'
  | 'publisher_stopping';

export interface MqttPublisherReadiness {
  ready: boolean;
  reason?: MqttPublisherReadinessReason;
}

export interface MqttPublisherTransport {
  publish(topic: string, message: unknown): Promise<void>;
  getReadiness(): MqttPublisherReadiness;
  shutdown(): Promise<void>;
}

export const MQTT_PUBLISHER_TRANSPORT = Symbol('MQTT_PUBLISHER_TRANSPORT');
