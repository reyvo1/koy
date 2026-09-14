export type DependencyHealthStatus = 'up' | 'down';

export interface DependencyHealthCheck {
  status: DependencyHealthStatus;
  latencyMs: number;
  reason?: string;
}

export interface LivenessResult {
  status: 'ok';
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    postgres: DependencyHealthCheck;
    redis: DependencyHealthCheck;
    mqtt: DependencyHealthCheck;
  };
}
