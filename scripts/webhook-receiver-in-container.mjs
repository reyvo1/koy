/**
 * A loopback webhook receiver, run *inside* the API container.
 *
 * The API refuses a plain-HTTP receiver on any host that is not loopback
 * (`WebhookController.assertTransportAccepted`), which is the rule doing its job. But the
 * container's loopback is unreachable from the host, so a receiver started on the host is
 * either refused at registration or unreachable at delivery. Running it in the same network
 * namespace as the dispatcher is the only placement where the rule can hold *and* a delivery
 * can actually arrive.
 *
 * Each received POST is appended to a JSONL file the probe reads back over `docker exec`.
 * Started detached by the probe, which then polls the file.
 *
 * Usage: node receiver-in-container.mjs <port> <outputFile>
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 0);
const output = process.argv[3] ?? '/tmp/webhook-received.jsonl';

writeFileSync(output, '');
const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    appendFileSync(
      output,
      `${JSON.stringify({
        event: req.headers['x-iot-event'] ?? null,
        signature: req.headers['x-iot-signature'] ?? null,
        contentType: req.headers['content-type'] ?? null,
        body: Buffer.concat(chunks).toString('utf8'),
      })}\n`,
    );
    res.writeHead(200).end('ok');
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`READY ${server.address().port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}