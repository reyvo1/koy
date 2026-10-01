import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A secret column must not be readable through an HTTP response.
 *
 * `DeviceService.findAll` called Prisma with no `select`, so every scalar column on the
 * `Device` model went out — including `provisioningTokenHash`, an argon2 hash of the pairing
 * secret, on a route whose only job is to list devices. No type checker sees that, no unit
 * test failed, and every gate in the repo was green.
 *
 * This is a source-level guard for the whole class. It cannot see a Prisma response, so it
 * works by reading the code: for each model that carries a credential, it finds the reads
 * that do not restrict columns, and requires that any of them which can reach a controller is
 * either explicitly selecting columns or explicitly mapping the result to a narrower object.
 *
 * The alternative — a test per service — is how `device.service` ended up wrong in the first
 * place: the test that existed for it asserted the tenant scoping and said nothing about the
 * response shape, so adding a `select` or removing one both kept it green.
 */

/** Columns whose presence in a response is a defect, and the models that carry them. */
const SECRET_COLUMNS: Record<string, string[]> = {
  Device: ['provisioningTokenHash', 'provisioningTokenExpires'],
  User: ['resetTokenHash', 'resetTokenLookup', 'verificationTokenHash', 'verificationTokenLookup'],
  UserCredential: ['passwordHash'],
  DeviceCredential: ['passwordHash'],
  ApiKey: ['keyHash'],
  RefreshToken: ['tokenHash', 'tokenLookup'],
  WebhookEndpoint: ['signingSecret'],
};

const SRC = join(__dirname, '..', 'src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) acc.push(path);
  }
  return acc;
}

const sources = walk(SRC).map((path) => ({
  path,
  rel: relative(join(__dirname, '..'), path),
  text: readFileSync(path, 'utf8'),
}));

/** The text from just after the null guard on `name` to the end of its method. */
function methodTail(text: string, offset: number, name: string): string | null {
  const rest = text.slice(offset);
  // If there is a null guard, start after it; otherwise start at the read.
  const guard = new RegExp(`if\\s*\\(\\s*!${name}\\b`).exec(rest);
  const after = guard ? rest.slice(guard.index) : rest;
  const next = after.slice(1).search(
    /^  (?:public |private |protected )?(?:async )?\w+\s*\(/m,
  );
  return next === -1 ? after : after.slice(0, next + 1);
}

/**
 * Collect every match. `String.prototype.matchAll` returns an iterator, and this tsconfig has
 * no downlevel-iteration target, so the spread below does not compile; the guard written later
 * uses this same helper for the same reason.
 */
function allMatches(text: string, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m = rx.exec(text);
  while (m !== null) {
    out.push(m);
    m = rx.exec(text);
  }
  return out;
}

/** The text of a call, from its opening paren to the matching close paren. */
function sliceCall(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return text.slice(openIndex);
}

/**
 * Whether an offset sits inside a `private` class member.
 *
 * A private method is not reachable from a controller, so a full-row read inside one is not
 * an HTTP leak. This looks backwards for the nearest member declaration at class-body
 * indentation, which is enough for this codebase's formatting.
 */
function isInsidePrivateMember(text: string, offset: number): boolean {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    // Skip blank lines and lines that are plainly inside a body.
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) return false;
    if (indent === 2 && /^\s{2}(public |protected |private )?(async )?\w+\s*[(<]/.test(line)) {
      return /^\s{2}private\s/.test(line);
    }
  }
  return false;
}

describe('credential columns cannot reach an HTTP response', () => {
  it('finds the secret-bearing models it is guarding', () => {
    // If the walk ever stops finding files, every case below passes vacuously — which is the
    // failure mode a source-level guard has to defend against.
    expect(sources.length).toBeGreaterThan(50);
  });

  describe.each(Object.keys(SECRET_COLUMNS))('%s', (model) => {
    const prop = model.charAt(0).toLowerCase() + model.slice(1);

    it('has no unselected read whose result is returned or spread out', () => {
      /**
       * The rule has to be about the RESULT, not about the query.
       *
       * A first pass of this file flagged every `prisma.<model>.find*()` that lacked a
       * `select` and reported 16 sites. Reading all 16 showed every one was an existence
       * check — `if (!device) throw`, then the record never leaves the function — or an
       * internal credential verification that returns a message. None of them leaked.
       *
       * Flagging them anyway would have been worse than useless: a guard that fires on correct
       * code is a guard the team learns to satisfy by adding `select` everywhere, and the next
       * real leak arrives in whatever shape the guard was rewired to ignore. So the rule looks
       * for the two shapes that actually put a whole model onto the wire or into another
       * object's spread: returning the call directly, or spreading it.
       */
      const offenders: string[] = [];

      for (const { rel, text } of sources) {
        // `return this.prisma.user.findMany({...})` — the whole read is the response.
        // The method name is a non-capturing group: as a capturing one, `match[1]` was the
        // method name while the interpolation inserted `this.` into the message, which made
        // the first version of this rule report nonsense instead of a site.
        const returned = new RegExp(
          `return\\s+(?:this\\.)?prisma\\.${prop}\\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow)\\s*\\(`,
          'g',
        );
        for (const match of text.matchAll(returned)) {
          // A `select` means the caller already narrowed the read; the projection is in the
          // query, not in this file.
          if (/\bselect\s*:/.test(sliceCall(text, match.index + match[0].length - 1))) {
            continue;
          }
          if (isInsidePrivateMember(text, match.index)) continue;
          const lineNo = text.slice(0, match.index).split('\n').length;
          offenders.push(`${rel}:${lineNo} returns a prisma.${prop} read directly`);
        }

        // `const x = await this.prisma.device.findMany({...}); ... return x;` — the record
        // is read without a select and then leaves the method under a different name, which
        // is the shape that survives a review and the one the device leak actually had.
        const assigned = new RegExp(
          `const\\s+(\\w+)\\s*=\\s*await\\s+this\\.prisma\\.${prop}\\.(findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow)\\s*\\(`,
          'g',
        );
        for (const match of text.matchAll(assigned)) {
          const body = match[1];
          const start = match.index;

          // A `select` or a narrowing `include` anywhere in the call is the fix already
          // applied. `findOneCamera` and `loadCommandDevice` both take this path.
          const call = sliceCall(text, start + match[0].length - 1);
          if (/\bselect\s*:/.test(call) || /\binclude\s*:\s*\{\s*capabilities/.test(call)) {
            continue;
          }

          // A private method is not an HTTP surface. `loadCommandDevice` reads the full row
          // to validate capabilities and status, and never returns it to a caller.
          if (isInsidePrivateMember(text, start)) continue;

          // Is the whole record returned on its own?
          if (new RegExp(`return\s+${body}\s*;`).test(text)) {
            const lineNo = text.slice(0, start).split('\n').length;
            offenders.push(`${rel}:${lineNo} returns the whole ${model} record`);
            continue;
          }
          // Is it spread into a larger object that is returned?
          if (new RegExp(`\.\.\.${body}\b`).test(text)) {
            const lineNo = text.slice(0, start).split('\n').length;
            offenders.push(`${rel}:${lineNo} spreads the whole ${model} record into a response`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });

    it('never returns a whole model object from a controller', () => {
      // A controller that returns `this.prisma.<model>.findX(...)` directly puts whatever
      // that read returned onto the wire, so the shape of the read becomes the shape of the
      // response. Controllers must not do this for a credential-bearing model.
      const offenders: string[] = [];
      for (const { rel, text } of sources) {
        if (!rel.endsWith('.controller.ts')) continue;
        const direct = new RegExp(
          `return\\s+(this\\.)?prisma\\.${prop}\\.(findMany|findFirst|findUnique|findUniqueOrThrow)\\s*\\(`,
        );
        if (direct.test(text)) offenders.push(rel);
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('the allowlist that fixed it is still an allowlist', () => {
    const deviceService = sources.find((s) => s.rel.endsWith('src/device/device.service.ts'));

    it('is present and enumerates columns', () => {
      expect(deviceService).toBeDefined();
      const text = deviceService!.text;
      const start = text.indexOf('PUBLIC_SELECT = {');
      expect(start).toBeGreaterThan(-1);
      const block = text.slice(start, text.indexOf('}', start));

      expect(block).toMatch(/\bid: true/);
      expect(block).toMatch(/\bname: true/);
      expect(block).toMatch(/\btype: true/);
      expect(block).toMatch(/\bstatus: true/);
      expect(block).toMatch(/\blastHeartbeatAt: true/);
      // A denylist would be the wrong fix: the next secret column added to the model would
      // ship again without anyone editing this file. The allowlist has to be exhaustive
      // instead — the column appears nowhere in it.
      expect(block).not.toMatch(/provisioningTokenHash/);
      expect(block).not.toMatch(/tenantId|ownerId/);
    });

    it('never lets a full device row reach a return', () => {
      // `findInternal()` was added next to the allowlist with no caller, and the first version
      // of this file asserted it existed — so the guard was locking in dead code and calling
      // it the deliberate exception. The property worth asserting is about the RESULT.
      //
      // `pair()` reads the full row, without a `select`, on purpose: it has to verify the
      // provisioning token against the stored hash. It is public, and that is fine, because it
      // returns a literal — `{ message, deviceId, tenantId, mqttUri, mqttUsername }` — not the
      // row. `rotateCredential()` reads a full row with the credential included and returns
      // `{ message }`. Neither leaks, so neither should be forced behind a `private`.
      //
      // What must not exist is a read of the full row that is then returned or spread, which
      // is the shape the original leak had. The check is therefore on what leaves the method.
      const text = deviceService!.text;
      const offenders: string[] = [];

      for (const read of allMatches(
        text,
        /prisma\.device\.find(?:Many|First|Unique|UniqueOrThrow|FirstOrThrow)\s*\(/g,
      )) {
        const call = sliceCall(text, read.index + read[0].length - 1);
        if (/\bselect\s*:/.test(call)) continue;

        // Shape A: the read is bound to a variable that is then returned or spread.
        const bind = new RegExp(
          `const\\s+(\\w+)\\s*=\\s*await\\s*this\\.prisma\\.device\\.find(?:Many|First|Unique|UniqueOrThrow|FirstOrThrow)\\s*\\(`,
        ).exec(text.slice(read.index - 40));
        if (!bind) {
          // Shape B: `return this.prisma.device.findX({...})` with no select — the whole read
          // IS the response. The first version of this guard only handled shape A, so
          // reintroducing the original leak in `findAll` left it green. Both shapes are the
          // defect; only checking one of them makes the guard decorative.
          const isReturn = text
            .slice(Math.max(0, read.index - 40), read.index)
            .match(/return\s+(?:this\.)?\s*$/);
          if (isReturn) {
            const line = text.slice(0, read.index).split('\n').length;
            offenders.push(`line ${line}: returns a full device row directly`);
          }
          continue;
        }
        const name = bind[1];

        // Search the tail of the enclosing method. A null guard is not required — `findAll`
        // returns a list and has nothing to guard — but the search has to stop at the end of
        // the method, or `pair()`'s `if (!device) throw` is mistaken for a `return device`.
        const tail = methodTail(text, read.index, name);
        if (tail === null) continue;
        if (new RegExp(`return\\s+${name}\\s*(;|\\n)`).test(tail)) {
          offenders.push(`returns the whole device row (${name})`);
        }
        if (new RegExp(`\\.\\.\\.${name}\\b`).test(tail)) {
          offenders.push(`spreads the whole device row (${name})`);
        }
      }

      expect(offenders).toEqual([]);
    });

    it('is applied to both the list and the single read', () => {
      const text = deviceService!.text;
      const uses = text.match(/select: DeviceService\.PUBLIC_SELECT/g) ?? [];
      expect(uses.length).toBeGreaterThanOrEqual(2);
    });
  });
});
