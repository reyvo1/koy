/**
 * A receiver that accepts the connection and never answers.
 *
 * The counterpart to `receiver-in-container.mjs`: where that one proves a delivery by
 * answering 200, this one produces the failure an operator actually meets when a receiver
 * process is wedged rather than stopped. The connection succeeds — so it is not a refused
 * one — and then hangs, which is the case `ok: false, statusCode: null` with no reason is
 * least able to describe.
 *
 * Sockets are tracked so the process can be torn down cleanly; an unclosed socket keeps the
 * event loop alive and `docker exec -d` would leave it behind on every run.
 *
 * Usage: node wedged-receiver.mjs <port>
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 0);
const open = new Set();

const server = createServer((req) => {
  // Accept the request and never write a response. The socket is deliberately left open.
  open.add(req.socket);
  req.socket.on('close', () => open.delete(req.socket));
  req.resume();
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`READY ${server.address().port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const socket of open) {
      socket.destroy();
    }
    server.close();
    process.exit(0);
  });
}