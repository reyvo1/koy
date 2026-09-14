// Starts an in-memory Redis for local staging and prints the port.
const { RedisMemoryServer } = require('redis-memory-server');

async function main() {
  const server = new RedisMemoryServer({
    instance: {
      port: Number(process.env.REDIS_LOCAL_PORT) || 6399,
      ip: '127.0.0.1',
    },
  });
  const host = await server.getHost();
  const port = await server.getPort();
  console.log(`REDIS_READY host=${host} port=${port}`);
  // Keep running until killed.
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error('redis-memory-server failed:', error.message);
  process.exit(1);
});
