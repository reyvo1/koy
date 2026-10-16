/**
 * Session handling for the k6 function stress suite.
 *
 * Every declared function is authenticated, because an anonymous stress run would exercise the
 * login wall rather than the product. Three identities come from the stress baseline that
 * `scripts/seed-stress-baseline.mjs` provisions, plus one API key created by the suite itself and
 * deleted again in teardown — a stress run must never leave a credential behind.
 *
 * Credentials arrive through the environment (STRESS_*) and, when absent, are read from the
 * git-ignored `.stress-credentials` file the seeder writes, so the suite never needs a password to
 * be pasted into a document or a command line. A `.uat-credentials` file is still honoured, so an
 * operator can point the suite at the standard UAT baseline instead.
 */

const CREDENTIAL_PATTERN = /^\s{2,}password\s*:\s*(\S+)\s*$/;
const ROLE_PATTERN = /^\s{2,}role\s*:\s*(\S+)\s*$/;
const TENANT_PATTERN = /^\s{2,}tenant\s*:\s*(\S+)\s*$/;

const DEFAULT_ACCOUNTS = {
  'tenant-admin': {
    emailVar: 'STRESS_ADMIN_EMAIL',
    passwordVar: 'STRESS_ADMIN_PASSWORD',
    tenantVar: 'STRESS_ADMIN_TENANT',
    defaults: {
      email: 'stress.admin@iot.local',
      tenant: '77777777-7777-4777-8777-777777777777',
      role: 'ADMIN',
    },
  },
  member: {
    emailVar: 'STRESS_MEMBER_EMAIL',
    passwordVar: 'STRESS_MEMBER_PASSWORD',
    tenantVar: 'STRESS_MEMBER_TENANT',
    defaults: {
      email: 'stress.member@iot.local',
      tenant: '77777777-7777-4777-8777-777777777777',
      role: 'MEMBER',
    },
  },
  'super-admin': {
    emailVar: 'STRESS_SUPER_EMAIL',
    passwordVar: 'STRESS_SUPER_PASSWORD',
    tenantVar: 'STRESS_SUPER_TENANT',
    defaults: {
      email: 'stress.superadmin@iot.local',
      tenant: '88888888-8888-4888-8888-888888888888',
      role: 'PLATFORM_ADMIN',
    },
  },
};

/**
 * The seeder writes a plain block per account:
 *
 *   stress.admin@iot.local
 *     tenant    : 7777...
 *     role      : ADMIN
 *     password  : <generated>
 *
 * Parsed by pairing an email line with the first following `tenant:`, `role:` and `password:`
 * lines. A file that exists but cannot be parsed is an error rather than an empty result, because
 * silently running unauthenticated would turn a setup problem into a false green.
 */
const CREDENTIALS_CANDIDATES = [
  __ENV.STRESS_CREDENTIALS_FILE,
  '.stress-credentials',
  '../../../.stress-credentials',
  '../../../.uat-credentials',
].filter(Boolean);

/**
 * k6's `open()` is only available in the INIT stage (global scope), not inside setup() -- reading the
 * file lazily there fails with "the open function is only available in the init stage". So the file
 * is parsed once at module load, which is also the correct semantics: the suite's identity set is
 * fixed for the whole run, not re-read per VU.
 */
function parseCredentials(raw) {
  const found = {};
  let current = null;
  for (const line of String(raw).split('\n')) {
    const passwordMatch = CREDENTIAL_PATTERN.exec(line);
    if (passwordMatch && current) {
      found[current] = Object.assign({ password: passwordMatch[1] }, found[current] || {});
      continue;
    }
    const tenantMatch = TENANT_PATTERN.exec(line);
    if (tenantMatch && current) {
      found[current] = Object.assign({ tenant: tenantMatch[1] }, found[current] || {});
      continue;
    }
    const roleMatch = ROLE_PATTERN.exec(line);
    if (roleMatch && current) {
      found[current] = Object.assign({ role: roleMatch[1] }, found[current] || {});
      continue;
    }
    if (/^[^\s#][^\s]*@/.test(line)) current = line.trim();
  }
  return found;
}

function loadCredentials() {
  let raw = null;
  for (const candidate of CREDENTIALS_CANDIDATES) {
    try {
      raw = open(candidate);
      break;
    } catch {
      // try the next spelling
    }
  }
  if (raw === null) {
    if (__ENV.STRESS_CREDENTIALS_FILE) {
      throw new Error(
        `explicit credentials file ${__ENV.STRESS_CREDENTIALS_FILE} could not be read (tried ` +
          `${CREDENTIALS_CANDIDATES.join(', ')})`,
      );
    }
    return {};
  }
  return parseCredentials(String(raw));
}

const CREDENTIALS = loadCredentials();

export function resolveAccount(role) {
  const config = DEFAULT_ACCOUNTS[role];
  if (!config) throw new Error(`no account configuration for role ${role}`);

  const email = __ENV[config.emailVar] || config.defaults.email;
  const password = __ENV[config.passwordVar] || CREDENTIALS[email]?.password;

  if (!password) {
    throw new Error(
      `no password for ${role} identity ${email}. Provide ${config.passwordVar}, or run ` +
        '`npm run stress:seed` so .stress-credentials exists (or point STRESS_CREDENTIALS_FILE at ' +
        'a UAT baseline credentials file).',
    );
  }

  const tenant = __ENV[config.tenantVar] || CREDENTIALS[email]?.tenant || config.defaults.tenant;
  return { email, password, tenant };
}

/** Auth headers for a bearer session. */
export function bearerHeaders(token, extra) {
  return Object.assign({ authorization: `Bearer ${token}` }, extra || {});
}

export function apiKeyHeaders(apiKey, extra) {
  return Object.assign({ 'x-api-key': apiKey }, extra || {});
}

/**
 * Replaces `:name` placeholders with context values and appends query parameters. Query values may
 * themselves reference context (`:deviceId`), which is how matrix entries stay declarative while
 * still hitting entity-scoped paths.
 */
/**
 * k6's runtime (goja) has no WHATWG `URL` and no `URLSearchParams`, so the query string is built by
 * hand: each declared value may itself reference a context entity (`:deviceId`), and every
 * component is percent-encoded on the way out.
 */
export function buildUrl(origin, path, query, ctx) {
  let resolved = path;
  for (const [key, value] of Object.entries(ctx || {})) {
    resolved = resolved.split(`:${key}`).join(String(value));
  }
  if (/:/.test(resolved.replace(/^https?:\/\//, ''))) {
    throw new Error(`unresolved path parameter in ${resolved}; the setup stage must supply it`);
  }

  let url = origin + resolved;
  const pairs = [];
  for (const [key, value] of Object.entries(query || {})) {
    const substituted = String(value).replace(/:([a-zA-Z]+)/g, (m, name) => (ctx || {})[name]);
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(substituted)}`);
  }
  if (pairs.length > 0) url += `?${pairs.join('&')}`;
  return url;
}

/** Replaces `:name` placeholders inside a JSON body (the idempotent profile update uses this). */
export function buildBody(template, ctx) {
  const body = {};
  for (const [key, value] of Object.entries(template || {})) {
    body[key] = String(value).replace(/:([a-zA-Z]+)/g, (m, name) => {
      if (!(name in (ctx || {}))) throw new Error(`unresolved body placeholder :${name}`);
      return ctx[name];
    });
  }
  return JSON.stringify(body);
}
