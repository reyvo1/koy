Object.assign(process.env, { NODE_ENV: 'test' });
process.env.LOG_LEVEL = 'silent';
process.env.TZ = 'UTC';
process.env.JWT_SECRET ??= 'e2e-test-jwt-secret';
process.env.MQTT_WEBHOOK_SECRET ??= 'e2e-test-webhook-secret';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.HEALTH_CHECK_TIMEOUT_MS ??= '100';
process.env.COMMAND_ACK_TIMEOUT_MS ??= '1000';
