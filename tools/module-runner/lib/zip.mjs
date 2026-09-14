import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

const crcTable = createCrcTable();

export async function createStoredZip(outputPath, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = normalizeZipName(entry.name);
    const nameBytes = Buffer.from(name, 'utf8');
    const data = entry.data ?? (await readFile(entry.path));
    const crc = crc32(data);
    const { date, time } = dosDateTime(entry.mtime ?? new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBytes, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await writeFile(
    outputPath,
    Buffer.concat([...localParts, centralDirectory, end]),
  );
}

export async function extractZip(archivePath, destinationRoot) {
  const bytes = await readFile(archivePath);
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  let cursor = centralOffset;
  const extracted = [];

  await mkdir(destinationRoot, { recursive: true });

  for (let index = 0; index < entryCount; index += 1) {
    assertSignature(bytes, cursor, 0x02014b50, 'central directory');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString(flags & 0x0800 ? 'utf8' : 'utf8');
    const normalizedName = normalizeZipName(name);

    if (flags & 0x0001) {
      throw new Error(`Encrypted ZIP entries are not supported: ${name}`);
    }
    if (![0, 8].includes(method)) {
      throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    }

    cursor += 46 + nameLength + extraLength + commentLength;

    if (normalizedName.endsWith('/')) {
      await mkdir(resolveSafe(destinationRoot, normalizedName), {
        recursive: true,
      });
      continue;
    }

    assertSignature(bytes, localOffset, 0x04034b50, 'local header');
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const data =
      method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);

    if (data.length !== uncompressedSize) {
      throw new Error(
        `ZIP size mismatch for ${name}. Expected ${uncompressedSize}, actual ${data.length}.`,
      );
    }
    if (crc32(data) !== expectedCrc) {
      throw new Error(`ZIP CRC mismatch for ${name}.`);
    }

    const outputPath = resolveSafe(destinationRoot, normalizedName);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, data);
    extracted.push(normalizedName);
  }

  return extracted.sort();
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('ZIP end-of-central-directory record was not found.');
}

function assertSignature(bytes, offset, expected, label) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new Error(`ZIP ${label} offset is out of range.`);
  }
  const actual = bytes.readUInt32LE(offset);
  if (actual !== expected) {
    throw new Error(`Invalid ZIP ${label} signature.`);
  }
}

function resolveSafe(root, name) {
  const target = resolve(root, ...name.split('/'));
  const prefix = `${resolve(root)}${sep}`;
  if (target !== resolve(root) && !target.startsWith(prefix)) {
    throw new Error(`Unsafe ZIP entry path: ${name}`);
  }
  return target;
}

function normalizeZipName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('ZIP entry name is required.');
  }
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    normalized.includes('\0') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    throw new Error(`Unsafe ZIP entry name: ${name}`);
  }
  return normalized;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value) {
  const year = Math.max(value.getFullYear(), 1980);
  const date =
    ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
  const time =
    (value.getHours() << 11) |
    (value.getMinutes() << 5) |
    Math.floor(value.getSeconds() / 2);
  return { date, time };
}
