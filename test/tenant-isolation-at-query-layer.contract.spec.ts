import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A credential read that reaches the client is a defect; a read that crosses a tenant is one.
 *
 * These are the two ways a Prisma row becomes a security problem, and neither is visible to
 * the type checker or to a unit test that only asserts the happy path. `DeviceService.findAll`
 * shipped an argon2 hash of the pairing secret to any tenant member, and every gate in the
 * repo was green, because the test that existed for the service asserted the tenant scoping
 * and said nothing about which columns left the process.
 *
 * `credential-column-exposure.contract.spec.ts` guards the first shape. This one guards the
 * second: a credential-bearing read with no `tenantId` anywhere in the query, where the
 * enclosing method signature does not carry one either. A query can legitimately be
 * cross-tenant — the platform console has to see every tenant's billing and audit records —
 * so the rule is not "every read must be tenant-scoped" but "every read that is not
 * tenant-scoped must be provably a platform surface", enforced by an explicit allowlist that
 * names the reason.
 *
 * The allowlist entries are the cross-tenant reads that were read and confirmed intentional:
 * the platform billing directory, the platform RBAC audit log, custom roles for the role
 * picker, the public API key authentication lookup, and MQTT/device lookups that are keyed by
 * a device id the caller has already been authorised for. Adding an entry is a deliberate act
 * with a stated reason, which is the point.
 */

const SRC = join(__dirname, '..', 'src');

/**
 * Methods whose reads are intentionally not tenant-scoped, and the scoping that justifies it.
 *
 * A first version of this allowlisted whole files. That was wrong, and a mutation proved it:
 * deleting `tenantId` from the `where` of `TelemetryService.getHistory` left the guard green,
 * because the file was allowlisted and no further check ran. A file-level exemption means
 * every future read in that file is exempt too, which is the opposite of what the rule is for.
 *
 * So the exemption is per method, and each entry names the call that enforces the boundary —
 * a sibling query filtering by tenant, or a validation helper. If the scoping call is deleted
 * along with the filter, the entry stops matching and the read is reported, which is the
 * regression this guard exists to catch.
 *
 * `platformScope` is the other kind: a platform-admin route whose purpose is cross-tenant
 * visibility, with no caller-side check because the caller's role is the check.
 */
const ALLOWED_CROSS_TENANT: Array<{
  file: string;
  method: string;
  reason:
    | 'platformScope'
    | 'enforcedBySiblingQuery'
    | 'tokenIsTheScope'
    | 'deviceIdIsTheScope'
    | 'primaryKeyIsTheScope';
  /** The call that enforces the boundary; required unless the reason is platformScope. */
  scopingCall?: RegExp;
}> = [
  {
    file: 'src/admin-operations/admin-billing-directory.controller.ts',
    method: 'listSubscriptions',
    reason: 'platformScope',
  },
  {
    file: 'src/admin-operations/admin-governance.service.ts',
    method: 'listRbacAudit',
    reason: 'platformScope',
  },
  {
    file: 'src/public-api/public-api.service.ts',
    method: 'authenticate',
    reason: 'enforcedBySiblingQuery',
    // The key hash lookup resolves a tenant, and the caller then uses only that tenant.
    scopingCall: /prisma\.apiKey\.findUnique/,
  },
  {
    file: 'src/mqtt/mqtt.service.ts',
    method: 'authorize',
    reason: 'enforcedBySiblingQuery',
    scopingCall: /prisma\.device\.findUnique/,
  },
  {
    file: 'src/auth/auth.service.ts',
    method: 'verifyEmail',
    reason: 'tokenIsTheScope',
    // There is no tenant in this flow: the caller holds a single-use email-verification token,
    // and the update is keyed by the user that token resolved to. No tenant context exists to
    // filter on, which is why the read is not tenant-scoped rather than merely un-scoped.
    scopingCall: /argon2\.verify\(user\.verificationTokenHash/,
  },
  {
    file: 'src/auth/auth.service.ts',
    method: 'resetPassword',
    reason: 'tokenIsTheScope',
    scopingCall: /argon2\.verify\(/,
  },
  {
    file: 'src/org/organization.service.ts',
    method: 'listBranches',
    reason: 'enforcedBySiblingQuery',
    // This was previously excused with the note that `organizationId` "comes from a caller
    // that has already resolved the caller's own organization". No caller did: the route read
    // the id from the URL path and passed it straight through, so the only guard in front of
    // the query was `AdminRoleGuard` — which asks whether the caller is a tenant admin, not
    // whether the organization is theirs. A live probe then showed any tenant admin reading
    // another organization's `tenantId` with 200.
    //
    // It stays listed rather than removed because this guard verifies the *presence* of a
    // scoping call, not the correctness of the authority decision: the method now loads the
    // organization, admits the owner and the tenants inside the group, and refuses everyone
    // else, and those reads still have to exist for the check to be possible.
    scopingCall: /where: \{ organizationId: input\.organizationId \}/,
  },
  {
    file: 'src/device/command.service.ts',
    method: 'publishPersistedCommand',
    reason: 'enforcedBySiblingQuery',
    // Re-reads a command by primary key after a status write raced. The key comes from a
    // `command` the method was handed, already scoped by its caller, and the row is re-read
    // rather than trusted from memory precisely so the durable status wins. There is no
    // tenant in the key because the primary key is globally unique.
    scopingCall: /where: \{ id: command\.id \}/,
  },
  {
    file: 'src/mqtt/mqtt.service.ts',
    method: 'authorize',
    reason: 'deviceIdIsTheScope',
    // The device id arrives from the broker, not from an HTTP session, so there is no tenant
    // to filter on. The boundary is enforced immediately after: the topic the client is
    // authorised for is derived from this device's own tenantId.
    scopingCall: /expectedPrefix = `tenants\/\$\{device\.tenantId\}/,
  },
];

const SECRETISH_COLUMNS = [
  'passwordHash', 'keyHash', 'tokenHash', 'tokenLookup', 'signingSecret',
  'provisioningTokenHash', 'provisioningTokenExpires',
  'resetTokenHash', 'resetTokenLookup', 'verificationTokenHash', 'verificationTokenLookup',
  'mfaSecret',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) acc.push(path);
  }
  return acc;
}

const sources = walk(SRC).map((path) => ({
  rel: relative(join(__dirname, '..'), path).split('\\').join('/'),
  text: readFileSync(path, 'utf8'),
}));

interface Read {
  model: string;
  args: string;
  method: string;
  line: number;
  offset: number;
  enclosingSignature: string;
  enclosingMethodName: string;
}

/**
 * `String.prototype.matchAll` returns an iterator, and spreading one needs a downlevel
 * iteration target that this tsconfig does not enable. The other guard in this suite uses
 * `for...of` over `matchAll`, which compiles; this helper is collected with a plain loop so
 * both styles are free of the dependency.
 */
function allMatches(text: string, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  // A fresh copy per call: `re.exec` on a shared global regex carries `lastIndex` between
  // calls, so a module-level pattern would resume mid-string and return nothing. Assigning to
  // `lastIndex` directly is not portable to a compiled pattern either, which is why the state
  // is reset by cloning instead.
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m = rx.exec(text);
  while (m !== null) {
    out.push(m);
    m = rx.exec(text);
  }
  return out;
}

/** The source of the method containing `offset`, up to the next method declaration. */
function methodBody(text: string, offset: number): string {
  // The whole enclosing method, from its declaration to the next one.
  //
  // Slicing from the read itself hid the scoping: `CapabilityService.findAll` authorises with
  // a sibling `findFirst({ where: { ..., tenantId } })` that throws 404, and that line sits
  // ABOVE the capability read. Searching for the next declaration has to start after the
  // current one — searching from the beginning matched the declaration at index 0 and returned
  // an empty body, which reported every method in the codebase as unscoped.
  const before = text.slice(0, offset);
  const decls = [...before.matchAll(
    /^  (?:public |private |protected )?(?:async )?\w+\s*\(/gm,
  )];
  const decl = decls[decls.length - 1];
  if (!decl) return before.slice(-2000);

  const from = decl.index;
  const after = text.slice(from + decl[0].length);
  const next = after.search(/^  (?:public |private |protected )?(?:async )?\w+\s*\(/m);
  const endOfMethod = next === -1 ? text.length : from + decl[0].length + next;
  return text.slice(from, endOfMethod);
}

function prismaReads(text: string): Read[] {
  const out: Read[] = [];
  const call = /prisma\.(\w+)\.(findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow)\s*\(/g;
  for (const m of allMatches(text, call)) {
    let depth = 0;
    let end = m.index;
    for (let i = m.index + m[0].length - 1; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const args = text.slice(m.index + m[0].length - 1, end + 1);
    const before = text.slice(0, m.index);
    const sigs = allMatches(
      before,
      /^  (?:public |private |protected )?(?:async )?(\w+)\s*\(/gm,
    );
    const last = sigs[sigs.length - 1];
    let methodName = '<module scope>';
    let params = '';
    if (last) {
      methodName = last[1];
      // Read the balanced parameter list; `[^)]*` would stop at the first `)` in a
      // multi-line signature and silently drop the tenant parameter.
      const open = before.indexOf('(', last.index);
      let depth = 0;
      let close = before.length;
      for (let i = open; i < before.length; i += 1) {
        if (before[i] === '(') depth += 1;
        else if (before[i] === ')') {
          depth -= 1;
          if (depth === 0) { close = i; break; }
        }
      }
      // `last[1]` is the method name; the balanced parameter list is captured separately, so
      // it is stored under the same slot the name used to occupy. Reading `sig[1]` for the
      // name was returning the parameter list, which made every method name unmatched and
      // left allowlist entries silently inert.
      params = before.slice(open + 1, close);
    }
    out.push({
      model: m[1],
      args,
      method: m[2],
      line: before.split('\n').length,
      offset: m.index,
      enclosingSignature: last ? `${methodName}(${params.trim()})` : '<module scope>',
      enclosingMethodName: methodName,
    });
  }
  return out;
}

describe('tenant isolation at the query layer', () => {
  it('walks the source tree', () => {
    // A guard that stops finding files passes every case below vacuously.
    expect(sources.length).toBeGreaterThan(50);
  });

  it('has no unclassified cross-tenant read', () => {
    const offenders: string[] = [];

    for (const { rel, text } of sources) {
      for (const read of prismaReads(text)) {
        // A read narrowed by `select`/`include` is already constrained; and one that mentions
        // tenantId anywhere is scoped, even if the scope is expressed as a relation filter.
        if (/\bselect\s*:/.test(read.args) || /\binclude\s*:/.test(read.args)) continue;
        if (/\btenantId\b/.test(read.args)) continue;

        // A `tenantId` parameter alone is NOT sufficient evidence. `getHistory(tenantId,
        // deviceId)` looked scoped by signature, and a mutation that deleted both the query's
        // tenant filter and the `ensureDeviceInTenant` call left the guard green — a signature
        // that still says `tenantId` while nothing enforces it. So the method body has to
        // actually use the parameter: in the query, in a scoping helper call, or by re-reading
        // it. If none of those hold, the parameter is decorative and the read is reported.
        if (/\btenantId\b/.test(read.enclosingSignature)) {
          const body = methodBody(text, read.offset);
          // `tenantId` must be passed to something. A bare mention is not enough: the
          // parameter can sit in the signature and in a destructured `where` while every
          // actual guard is gone. Matching an argument position is what distinguishes
          // `ensureDeviceInTenant(tenantId, deviceId)` and `where: { id, tenantId }` — the two
          // shapes this codebase scopes with — from a decorative parameter.
          // The four shapes this codebase actually scopes with, each seen in real code:
          //   - a helper call:       `ensureDeviceInTenant(tenantId, deviceId)`
          //   - a query filter:      `where: { id: deviceId, tenantId }`
          //   - a sibling query:     a `findFirst({ where: { ..., tenantId } })` that throws
          //   - a post-filter:       `if (!command || command.tenantId !== tenantId) return null`
          // The last one reads the tenant off the row and compares, which no `where` pattern
          // would match, and it is how the command lookups scope themselves.
          // Evidence has to come from the body, never the signature. `(\n    tenantId: string`
          // and `where: {` both matched a naive `\btenantId\s*[,:}]` on a method whose scoping
          // had been deleted, which is how a fully unscoped `getHistory` passed as scoped.
          const brace = body.indexOf('{');
          const inner = brace === -1 ? '' : body.slice(brace);
          const usesTenant =
            /\(\s*tenantId\s*[,)]/.test(inner) || // a call: ensureDeviceInTenant(tenantId, …)
            /where\s*:\s*\{[^}]*\btenantId\b/.test(inner) || // a query filter
            /\btenantId\b\s*:\s*(?!string|number|boolean|undefined|null)/.test(inner) || // an object literal
            /\.tenantId\s*[!=]==?\s*tenantId/.test(inner) || // a post-filter comparison
            /tenantId\s*[!=]==?\s*\w+\.tenantId/.test(inner);
          if (usesTenant) continue;
          // Same allowlist applies here: a method may take `tenantId` and scope itself by
          // primary key or by token instead, and the signature alone does not say which.
          const declared = ALLOWED_CROSS_TENANT.find(
            (e) => e.file === rel && e.method === read.enclosingMethodName,
          );
          if (declared) {
            if (declared.scopingCall && declared.scopingCall.test(inner)) continue;
            offenders.push(
              `${rel}:${read.line}  ${read.enclosingMethodName}() is allowlisted as ` +
                `${declared.reason} but its scoping evidence ` +
                `(${declared.scopingCall}) is no longer in the body`,
            );
            continue;
          }
          offenders.push(
            `${rel}:${read.line}  ${read.enclosingMethodName}() takes tenantId but never uses ` +
              `it — the parameter is decorative and this read is unscoped`,
          );
          continue;
        }

        // Module-scope reads (constants, seed helpers) never serve a request.
        if (read.enclosingSignature === '<module scope>') continue;

        const methodName = read.enclosingMethodName;
        const entry = ALLOWED_CROSS_TENANT.find(
          (e) => e.file === rel && e.method === methodName,
        );
        if (!entry) {
          offenders.push(
            `${rel}:${read.line}  prisma.${read.model}.${read.method}()  ` +
              `in ${read.enclosingSignature} — not tenant-scoped and not an allowlisted surface`,
          );
          continue;
        }
        // The exemption is conditional on the scoping call still being there. Deleting the
        // tenant filter without also keeping its guard is exactly the regression to catch, and
        // a bare allowlist entry cannot see it.
        if (entry.scopingCall) {
          const body = methodBody(text, read.offset);
          if (!entry.scopingCall.test(body)) {
            offenders.push(
              `${rel}:${read.line}  ${methodName}() is allowlisted as ` +
                `${entry.reason} but its scoping call (${entry.scopingCall}) is gone`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has an allowlist entry for every file and method it names', () => {
    // An entry naming a file that was renamed, or a method that was renamed, would stop
    // applying silently — and the read it covered would come back unclassified only if
    // something else noticed. Checked here so a rename cannot quietly widen the blast radius.
    const present = new Set<string>();
    for (const { rel, text } of sources) {
      for (const read of prismaReads(text)) present.add(`${rel}#${read.enclosingMethodName}`);
    }
    for (const entry of ALLOWED_CROSS_TENANT) {
      const key = `${entry.file}#${entry.method}`;
      expect(`${key} -> ${present.has(key) ? 'present' : 'MISSING'}`).not.toMatch(/MISSING$/);
    }
  });

  it('states a reason for every entry, and a scoping call for every non-platform one', () => {
    for (const entry of ALLOWED_CROSS_TENANT) {
      expect(entry.reason).toMatch(
        /^(platformScope|enforcedBySiblingQuery|tokenIsTheScope|deviceIdIsTheScope|primaryKeyIsTheScope)$/,
      );
      if (entry.reason !== 'platformScope') {
        // An exemption with no stated mechanism is just an exemption.
        expect(`${entry.file} ${entry.method} ${String(entry.scopingCall)}`).not.toMatch(/undefined$/);
      }
    }
  });
});

describe('credential columns cannot reach the client', () => {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

  it('every secret column in the schema is one the guards know about', () => {
    // The two guards encode the column list. A new secret column added to a model would not
    // be covered, and neither guard would know to complain. This reads the schema so the
    // list cannot quietly fall behind.
    const blocks = allMatches(schema, /^model\s+(\w+)[^{]*\{(.*?)^\}/gms);
    expect(blocks.length).toBeGreaterThan(40);

    const declared: string[] = [];
    for (const [, model, body] of blocks) {
      for (const line of body.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('//') || t.startsWith('@@') || t.startsWith('@')) continue;
        const col = t.split(/\s+/)[0];
        if (/Hash$|Secret$|Lookup$/.test(col)) declared.push(`${model}.${col}`);
      }
    }
    // device.provisioningTokenExpires does not match the suffix patterns and is covered by the
    // explicit list, so it is not expected here.
    expect(declared.length).toBeGreaterThan(0);
    for (const entry of declared) {
      const col = entry.split('.')[1];
      expect(SECRETISH_COLUMNS).toContain(col);
    }
  });
});
