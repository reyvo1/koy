Object.assign(process.env, { NODE_ENV: 'test' });
process.env.LOG_LEVEL = 'silent';
process.env.TZ = 'UTC';

if (!process.env.DATABASE_URL) {
  throw new Error('Database integration Jest process requires DATABASE_URL');
}

if (!process.env.TEST_DATABASE_SCHEMA) {
  throw new Error(
    'Database integration Jest process requires TEST_DATABASE_SCHEMA',
  );
}
