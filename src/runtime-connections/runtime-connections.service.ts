import {
  Injectable,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFileSync, statSync } from 'fs';

/** Operator-mounted connections; no secret is accepted from a product request or returned by it. */
@Injectable()
export class RuntimeConnectionsService {
  resolve(
    tenantId: string,
    reference: string,
    kind: 'CAMERA' | 'MQTT_BRIDGE' | 'HOME_ASSISTANT',
  ): Record<string, unknown> {
    const file = process.env.IOT_RUNTIME_CONNECTIONS_FILE;
    if (!file)
      throw new ServiceUnavailableException(
        'Konfigurasi koneksi belum tersedia.',
      );
    try {
      const stat = statSync(file);
      if (
        !stat.isFile() ||
        stat.size > 1024 * 1024 ||
        (process.platform !== 'win32' && stat.mode & 0o077)
      )
        throw new Error('unsafe file');
      const entries: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(entries)) throw new Error('invalid registry');
      const matches = entries.filter(
        (row) =>
          row &&
          row.tenantId === tenantId &&
          row.reference === reference &&
          row.kind === kind,
      );
      if (
        matches.length !== 1 ||
        !matches[0].config ||
        typeof matches[0].config !== 'object' ||
        Array.isArray(matches[0].config)
      )
        throw new Error('missing or ambiguous');
      return matches[0].config;
    } catch {
      throw new ServiceUnavailableException(
        'Koneksi belum dikonfigurasi dengan aman untuk tenant ini.',
      );
    }
  }
}
@Module({
  providers: [RuntimeConnectionsService],
  exports: [RuntimeConnectionsService],
})
export class RuntimeConnectionsModule {}
