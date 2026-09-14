Object.assign(process.env, { NODE_ENV: 'test' });
process.env.LOG_LEVEL = 'silent';
process.env.TZ = 'UTC';

for (const key of [
  'DATABASE_URL',
  'TEST_DATABASE_SCHEMA',
  'MQTT_TEST_URL',
  'MQTT_TEST_TOPIC_PREFIX',
  'MQTT_WEBHOOK_SECRET',
  'JWT_SECRET',
]) {
  if (!process.env[key]) {
    throw new Error(`MQTT integration Jest process requires ${key}`);
  }
}
