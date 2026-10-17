import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The console's ten uncovered UI surfaces all share one invariant that nothing was holding
 * them to, and it is the invariant that has caused real defects on this codebase before:
 * **a failed read must not look like an empty read.**
 *
 * An operator looking at "0 pengguna" or "Belum ada subscription" has no way to tell that
 * answer from a genuine zero — so a backend outage reads as "your tenant is empty", and the
 * first person to act on that is the one who escalates to the wrong team. The pattern that
 * prevents it is `null` meaning "not known" and `[]`/`0` meaning "known to be empty", with
 * the render branching on that distinction. `rescue:validate` already enforces this on the
 * directories that had shipped a bug for it; this pins the ten surfaces it does not cover.
 *
 * The checks are source-level on purpose. These are the same ten files that were audited
 * manually to find no live defect — the point of the spec is to keep it that way, so the
 * next edit that reaches for `useState([])` is caught by a test rather than by the next
 * incident review.
 */

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const ADMIN_WEB = 'apps/admin-web/components';
const USER_WEB = 'apps/user-web/components';

/**
 * Every surface in scope, with how it obtains its data.
 *
 * `data` surfaces read from the API and therefore have to be able to say "this failed".
 * `presentational` surfaces render only from props and read nothing, so the failed-versus-empty
 * distinction does not exist for them — what matters instead is that they stay that way, since
 * a banner that quietly started fetching would need an error channel it does not have today.
 * `action` surfaces issue a write and render no data of their own; the invariant for those is
 * that a failed write cannot be reported as a successful one.
 */
const DATA_SURFACES: Array<{ file: string; label: string }> = [
  { file: `${ADMIN_WEB}/super-capability-versions-panel.tsx`, label: 'capability versions' },
  { file: `${ADMIN_WEB}/super-command-dispatch-panel.tsx`, label: 'command dispatch' },
  { file: `${ADMIN_WEB}/super-roles-content.tsx`, label: 'super roles' },
  { file: `${ADMIN_WEB}/super-subscriptions-content.tsx`, label: 'subscriptions' },
  { file: `${ADMIN_WEB}/super-workers-panel.tsx`, label: 'worker liveness' },
  { file: `${ADMIN_WEB}/tenant-users-content.tsx`, label: 'tenant users' },
  { file: `${USER_WEB}/device-detail-experience.tsx`, label: 'device detail' },
  { file: `${USER_WEB}/room-workspace-experience.tsx`, label: 'room workspace' },
];

const PRESENTATIONAL_SURFACES: Array<{ file: string; label: string }> = [
  { file: `${ADMIN_WEB}/quarantine-banner.tsx`, label: 'quarantine banner' },
];

/** Issues a write but holds no fetched data — its only fetch is the write itself. */
const ACTION_SURFACES: Array<{ file: string; label: string }> = [
  { file: `${USER_WEB}/user-shell.tsx`, label: 'user shell' },
];

const SURFACES = [
  ...DATA_SURFACES,
  ...PRESENTATIONAL_SURFACES,
  ...ACTION_SURFACES,
];

describe('console surfaces distinguish a failed read from an empty read', () => {
  describe.each(SURFACES)('$label', ({ file }) => {
    const source = read(file);

    it('does not initialise a data state to an empty array or zero', () => {
      // `useState([])` makes "not loaded yet" and "loaded, nothing there" the same value, so
      // the first render after a mount and the render after an outage are indistinguishable.
      const emptyArrayState = source.match(/useState<[^>]*>\(\[\]\)|useState\(\[\]\)/g);
      expect(emptyArrayState ?? []).toEqual([]);
    });
  });

  describe.each(DATA_SURFACES)('$label (data surface)', ({ file }) => {
    const source = read(file);

    it('reads from the API', () => {
      expect(source).toMatch(/fetch\(/);
    });

    it('carries an error channel rather than only a data channel', () => {
      // A surface with no way to say "this failed" can only render the data it has.
      expect(source).toMatch(/setError|catch|kind: 'error'/);
    });
  });

  describe.each(PRESENTATIONAL_SURFACES)('$label (presentational)', ({ file }) => {
    const source = read(file);

    it('renders from props and fetches nothing', () => {
      // These read no data, so the failed-versus-empty distinction does not apply to them.
      // The invariant is that they stay prop-driven: the moment one starts fetching, it owes
      // the console an error channel, and the data-surface cases above are where to look.
      expect(source).not.toMatch(/fetch\(/);
    });
  });

  describe.each(ACTION_SURFACES)('$label (action surface)', ({ file }) => {
    const source = read(file);

    it('does not report a failed write as a successful one', () => {
      // The shell's only fetch is logout. Swallowing the error and reloading anyway is the
      // correct behaviour here — a logout whose request failed must still leave the
      // authorized payload off the screen, and staying on the page would be the fail-open.
      // What would be wrong is the opposite: continuing as though the session were intact.
      expect(source).toMatch(/\.catch\(\(\) => null\)/);
      expect(source).toMatch(/location\.assign/);
    });
  });

  describe('a non-ok response is never treated as a result', () => {
    it.each([
      `${ADMIN_WEB}/super-capability-versions-panel.tsx`,
      `${ADMIN_WEB}/super-command-dispatch-panel.tsx`,
      `${ADMIN_WEB}/super-roles-content.tsx`,
      `${ADMIN_WEB}/super-subscriptions-content.tsx`,
      `${ADMIN_WEB}/super-workers-panel.tsx`,
      `${ADMIN_WEB}/tenant-users-content.tsx`,
    ])('%s checks response.ok', (file) => {
      expect(read(file)).toMatch(/!\w*[Rr]es(ponse)?\.ok|\w*[Rr]es(ponse)?\.ok/);
    });

    it.each([
      `${USER_WEB}/device-detail-experience.tsx`,
      `${USER_WEB}/room-workspace-experience.tsx`,
    ])('%s branches on response.ok rather than on a parsed body alone', (file) => {
      const source = read(file);
      expect(source).toMatch(/!response\.ok/);
    });
  });

  describe('the RBAC surface keeps a real null-versus-empty distinction', () => {
    // This one is the most intricate of the ten: it loads four resources and degrades each
    // independently, so the audit log can be unavailable while users and roles are fine.
    // `null` per resource is what makes that partial state representable, and the render
    // has to consume it — three separate sections branch on it.
    const source = read(`${ADMIN_WEB}/super-roles-content.tsx`);

    it('starts each of the three optional resources as null, not empty', () => {
      expect(source).toMatch(/useState<AuditRow\[\] \| null>\(null\)/);
      expect(source).toMatch(/useState<UserRow\[\] \| null>\(null\)/);
    });

    it('sets a resource to null when its own request failed', () => {
      expect(source).toMatch(/if \(auditRes\.ok\)[\s\S]{0,220}?\n\s*\} else \{\s*setAudit\(null\)/);
      expect(source).toMatch(/if \(usersRes\.ok\)[\s\S]{0,220}?\n\s*\} else \{\s*setUsers\(null\)/);
    });

    it('renders each of the three sections against that null', () => {
      // Without these branches, `null` and `[]` reach the same JSX and the distinction the
      // loader works to preserve is thrown away one layer down.
      expect(source).toMatch(/users === null/);
      expect(source).toMatch(/roles === null/);
      expect(source).toMatch(/audit === null/);
    });
  });

  describe('the dispatch surface will not act on a failed directory read', () => {
    const source = read(`${ADMIN_WEB}/super-command-dispatch-panel.tsx`);

    it('nulls the directory when the read failed, rather than defaulting it', () => {
      // The default matters: a device list that silently became empty on failure would leave
      // the operator with a disabled form and no explanation of why.
      expect(source).toMatch(/setDevices\(null\)/);
    });

    it('cannot send unless a tenant and a device are actually selected', () => {
      expect(source).toMatch(/Boolean\(tenantId\) && Boolean\(deviceId\)/);
    });
  });
});

/**
 * One more failure mode the blocks above do not reach: the device-detail command
 * reconciliation. It polls `/api/device-command` after a write, and its first version
 * collapsed *every* non-terminal ending — a 401, a 5xx, a network drop, or a command
 * genuinely still in flight — into one `null`, which the caller rendered as
 * "Command masih PENDING/SENT". A poll that failed observes nothing, so an operator
 * reading that sentence was told the device was mid-command when the dashboard simply
 * could not check. The invariant now is the same one the mobile reconciliation already
 * keeps: state claims only from observed statuses.
 */
describe('the device-detail command reconciliation never reports an unobserved status as pending', () => {
  const source = read(`${USER_WEB}/device-detail-experience.tsx`);

  it('returns a discriminated outcome instead of collapsing failure and in-flight into null', () => {
    expect(source).toContain("outcome: 'terminal'");
    expect(source).toContain("outcome: 'pending'");
    expect(source).toContain("outcome: 'failed'");
    // The old collapse: one message that claimed PENDING/SENT no matter what cut polling short.
    expect(source).not.toContain('Command masih PENDING/SENT setelah batas rekonsiliasi');
  });

  it('names the last observed status when it says the command is still in flight', () => {
    // `pending` is returned only after a successful poll saw a non-terminal status, and
    // the sentence carries that status rather than hard-coding PENDING/SENT.
    expect(source).toContain('Command masih ${reconciliation.status} setelah batas rekonsiliasi');
    expect(source).toContain('return { outcome: \'pending\', status: lastStatus');
  });

  it('reports a failed poll as a reconciliation failure with the backend reason', () => {
    expect(source).toContain('Rekonsiliasi status command gagal');
    // The endpoint answers errors as { message }, and a non-JSON error body must still
    // produce a reason rather than a status claim.
    expect(source).toMatch(/HTTP \$\{response\.status\}/);
    expect(source).toContain("outcome: 'failed', reason: 'endpoint status command tidak dapat dihubungi'");
  });

  it('keeps the device-state disclaimer on every non-terminal ending', () => {
    expect(source).toContain('setelah batas rekonsiliasi; state fisik tidak diasumsikan.');
    expect(source).toContain('); state fisik tidak diasumsikan.');
  });
});

/**
 * W4 applies the same discipline one layer up, to response *bodies*. Three user-web
 * surfaces parsed JSON before checking (or without checking) `response.ok`, so an HTML
 * crash page or an empty gateway body became a thrown SyntaxError: the routines panel
 * lost its intended "Aksi gagal." message to the raw parser text, the profile form
 * showed a browser parse error, and the dashboard classified an unreadable body as a
 * connectivity failure ("Tidak dapat menghubungi User Web") even though the gateway had
 * answered. A body that cannot be read is a failed read, not data -- and not proof of
 * offline. The pin is structural: in these files every `.json()` must be paired with
 * `.catch(`, so a future unguarded parse cannot slip back in.
 */
describe('user-web surfaces never treat an unreadable response body as data', () => {
  const guardedFiles = [
    `${USER_WEB}/dashboard-experience.tsx`,
    `${USER_WEB}/device-routines-panel.tsx`,
    `${USER_WEB}/profile-experience.tsx`,
  ];

  it.each(guardedFiles)('%s guards every response body parse', (file) => {
    const fileSource = read(file);
    const calls = fileSource.match(/\.json\(\)/g) ?? [];
    const guarded = fileSource.match(/\.json\(\)\.catch\(/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBe(guarded.length);
  });

  it('dashboard reports an unreadable body as an error, not as offline', () => {
    const fileSource = read(`${USER_WEB}/dashboard-experience.tsx`);
    expect(fileSource).toContain(
      'Backend dashboard mengembalikan respons yang tidak dapat dibaca.',
    );
    // offline is still the label for a genuine fetch rejection (the catch block).
    expect(fileSource).toContain('Tidak dapat menghubungi User Web saat ini.');
  });

  it('routines keeps its operator-facing failure vocabulary when the body is unreadable', () => {
    const fileSource = read(`${USER_WEB}/device-routines-panel.tsx`);
    expect(fileSource).toContain('Backend mengembalikan respons yang tidak valid.');
    expect(fileSource).toContain("?? 'Aksi gagal.'");
  });

  it('profile rejects an unreadable body instead of showing parser text', () => {
    const fileSource = read(`${USER_WEB}/profile-experience.tsx`);
    expect(fileSource).toContain('Respons profil tidak valid.');
  });
});
