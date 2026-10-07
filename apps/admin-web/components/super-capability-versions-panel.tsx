'use client';

/**
 * Capability version drift — read from `GET /admin/platform-capabilities/versions`.
 *
 * Blueprint §1 asks for a Capability Registry with Templates, Definitions and Versioning.
 * Definitions existed. Templates did not, and this panel said so honestly: it reported which
 * `schemaVersion` each capability key is actually declared at, across how many devices, and
 * which keys disagree — labelled as per-device observed metadata rather than dressed up as a
 * template publication lifecycle the backend did not have.
 *
 * That was the right call then and it is incomplete now. `CapabilityTemplate` and
 * `CapabilityTemplateVersion` exist, so a drift finding here has an answer: publish a version,
 * then apply it. The panel still reports drift as observed per-device metadata, because that is
 * what it reads; the Apply control below is what connects the finding to the template.
 *
 * The lifecycle note rendered at the bottom comes from the API's `lifecycleContract`, so it
 * states the backend's own wording rather than a second copy that can drift.
 */

import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, GitBranch, Layers } from 'lucide-react';

interface VersionRow {
  schemaVersion: string;
  deviceCount: number;
  deviceIds: string[];
  tenantNames: string[];
}

interface DriftRow {
  key: string;
  semanticTypes: string[];
  dataTypes: string[];
  units: string[];
  deviceCount: number;
  versions: VersionRow[];
  versionCount: number;
  hasVersionDrift: boolean;
  hasTypeDrift: boolean;
}

interface VersionsPayload {
  total: number;
  bounded: boolean;
  items: DriftRow[];
  lifecycleContract: {
    source: string;
    templateEntity: string;
    note: string;
  };
}

interface TemplateVersionRow {
  id: string;
  version: string;
  status: string;
}

interface TemplateRow {
  id: string;
  key: string;
  semanticType: string;
  dataType: string;
  unit?: string | null;
  publishedVersion: string | null;
  versions: TemplateVersionRow[];
}

interface Refusal {
  deviceName: string;
  fromVersion: string;
  bindingCount: number;
  automationCount: number;
}

interface ApplyResult {
  key: string;
  targetVersion: string;
  updated?: number;
  wouldUpdate?: number;
  wouldRefuse?: number;
  alreadyOnTarget?: boolean;
  refused: Refusal[];
  dryRun: boolean;
}

export default function SuperCapabilityVersionsPanel() {
  const [pendingDeprecation, setPendingDeprecation] = useState<TemplateRow | null>(null);
  const [payload, setPayload] = useState<VersionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<
    Record<string, { busy: boolean; result?: ApplyResult; message?: string }>
  >({});
  // The drift listing above spans tenants; an apply is scoped to one. So the operator names the
  // tenant, and the template list for that tenant decides which keys can be acted on at all.
  const [tenantId, setTenantId] = useState('');
  // `null` until loaded, not `[]`. An empty array means "this tenant has no templates", which is
  // a claim about the fleet; before the request resolves the console has made no such claim, and
  // `test/console-fail-closed-surfaces.contract.spec.ts` forbids initialising to `[]` for exactly
  // this reason -- a first render and a render after an outage must not look identical.
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({ key: '', semanticType: '', dataType: 'string', unit: '' });
  const [publishVersion, setPublishVersion] = useState<Record<string, string>>({});
  const [supersede, setSupersede] = useState<Record<string, boolean>>({});
  const [rollback, setRollback] = useState<Record<string, boolean>>({});

  const loadTemplates = useCallback(async (nextTenantId: string) => {
    if (!nextTenantId) {
      // Back to "nothing asked" rather than "asked and found nothing".
      setTemplates(null);
      setTemplateError(null);
      return;
    }
    setTemplatesLoading(true);
    setTemplateError(null);
    try {
      const response = await fetch(
        `/api/admin/capability-templates?tenantId=${encodeURIComponent(nextTenantId)}`,
        { cache: 'no-store' },
      );
      const body = (await response.json()) as { templates?: TemplateRow[]; message?: string };
      if (!response.ok) throw new Error(body?.message ?? `backend ${response.status}`);
      setTemplates(body.templates ?? []);
    } catch (cause) {
      setTemplates(null);
      setTemplateError(cause instanceof Error ? cause.message : 'gagal memuat template');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const createTemplate = useCallback(async () => {
    const tenant = tenantId.trim();
    if (!tenant || !newTemplate.key.trim() || !newTemplate.semanticType.trim() || !newTemplate.dataType.trim()) {
      setLifecycleMessage('Tenant, key, semantic type, dan data type wajib diisi.');
      return;
    }
    setLifecycleBusy(true);
    setLifecycleMessage(null);
    try {
      const response = await fetch('/api/admin/capability-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant, ...newTemplate }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? `backend ${response.status}`);
      setNewTemplate({ key: '', semanticType: '', dataType: 'string', unit: '' });
      setLifecycleMessage('Template dibuat dengan draft 1.0.0.');
      await loadTemplates(tenant);
    } catch (cause) {
      setLifecycleMessage(cause instanceof Error ? cause.message : 'gagal membuat template');
    } finally {
      setLifecycleBusy(false);
    }
  }, [loadTemplates, newTemplate, tenantId]);

  const publishTemplateVersion = useCallback(async (template: TemplateRow) => {
    const tenant = tenantId.trim();
    const version = (publishVersion[template.id] ?? '').trim();
    if (!tenant || !/^\d+\.\d+\.\d+$/.test(version)) {
      setLifecycleMessage('Versi wajib MAJOR.MINOR.PATCH.');
      return;
    }
    setLifecycleBusy(true);
    setLifecycleMessage(null);
    try {
      const response = await fetch(`/api/admin/capability-templates/${template.id}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant, version, supersede: supersede[template.id] === true, rollback: rollback[template.id] === true }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? `backend ${response.status}`);
      setPublishVersion((previous) => ({ ...previous, [template.id]: '' }));
      setSupersede((previous) => ({ ...previous, [template.id]: false }));
      setRollback((previous) => ({ ...previous, [template.id]: false }));
      setLifecycleMessage(`Versi ${version} dipublikasikan.`);
      await loadTemplates(tenant);
    } catch (cause) {
      setLifecycleMessage(cause instanceof Error ? cause.message : 'gagal memublikasikan versi');
    } finally {
      setLifecycleBusy(false);
    }
  }, [loadTemplates, publishVersion, rollback, supersede, tenantId]);

  const deprecatePublishedVersion = useCallback(async (template: TemplateRow) => {
    const tenant = tenantId.trim();
    const version = template.publishedVersion;
    if (!tenant || !version) return;

    setLifecycleBusy(true);
    setLifecycleMessage(null);
    try {
      const response = await fetch(`/api/admin/capability-templates/${template.id}/deprecate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant, version, reason: 'Deprecated from platform console' }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? `backend ${response.status}`);
      setPendingDeprecation(null);
      setLifecycleMessage(`Versi ${version} dideprekasi.`);
      await loadTemplates(tenant);
    } catch (cause) {
      setLifecycleMessage(cause instanceof Error ? cause.message : 'gagal mendeprekasi versi');
    } finally {
      setLifecycleBusy(false);
    }
  }, [loadTemplates, tenantId]);

  /**
   * Apply a published template version to one drifting key.
   *
   * Two deliberate acts, not one: the first press previews, the second commits. The preview is
   * not decoration — the backend refuses capabilities that a dashboard widget or an automation
   * already reads, and the operator cannot detach those references without knowing which
   * devices are involved first.
   */

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/super/capabilities/versions', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`backend ${response.status}`);
      setPayload((await response.json()) as VersionsPayload);
    } catch (cause) {
      setPayload(null);
      setError(cause instanceof Error ? cause.message : 'gagal memuat versi');
    }
  }, []);

  const applyVersion = useCallback(
    async (tenantId: string, templateId: string, confirm: boolean) => {
      setApplyState((previous) => ({ ...previous, [templateId]: { busy: true } }));
      try {
        const response = await fetch('/api/admin/capability-versions/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId, templateId, dryRun: !confirm }),
        });
        const body = (await response.json()) as ApplyResult & { message?: string };
        if (!response.ok) {
          setApplyState((previous) => ({
            ...previous,
            [templateId]: {
              busy: false,
              message: body?.message ?? `backend ${response.status}`,
            },
          }));
          return;
        }
        setApplyState((previous) => ({
          ...previous,
          [templateId]: { busy: false, result: body },
        }));
        // Re-read the drift panel: the numbers above are the point of the control, and leaving
        // a stale drift list next to a successful apply reads as "nothing happened".
        if (confirm) void load();
      } catch (cause) {
        setApplyState((previous) => ({
          ...previous,
          [templateId]: {
            busy: false,
            message: cause instanceof Error ? cause.message : 'gagal menerapkan versi',
          },
        }));
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);


  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[.06] px-5 py-4"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div>
          <p className="m-0 text-[13px] font-semibold text-red-200">
            Drift versi capability tidak dapat dimuat ({error})
          </p>
          <p className="mb-0 mt-1 text-[12px] text-red-300/70">
            Ini bukan berarti tidak ada drift — daftar versi tidak dapat dibaca.
          </p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="h-40 animate-pulse rounded-2xl bg-slate-800/50" />
    );
  }

  const drifting = payload.items.filter(
    (item) => item.hasVersionDrift || item.hasTypeDrift,
  );


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-slate-400" strokeWidth={2} />
        <span className="text-[12.5px] text-slate-400">
          {payload.total} capability key · {drifting.length} dengan drift
        </span>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-bold text-amber-400 ring-1 ring-inset ring-amber-500/25">
          {payload.lifecycleContract.source.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Apply control. Only rendered once a tenant is named and that tenant actually has a
          published template for a drifting key -- otherwise the button would refuse on press,
          which is the same "control you cannot use" pattern this panel already had. */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <label
          htmlFor="capability-apply-tenant"
          className="block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400"
        >
          Tenant untuk menerapkan versi
        </label>
        <input
          id="capability-apply-tenant"
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          onBlur={() => void loadTemplates(tenantId.trim())}
          placeholder="UUID tenant"
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[12.5px] text-slate-200 outline-none focus:border-sky-500"
        />
        <p className="mb-0 mt-1.5 text-[11px] text-slate-500">
          Lifecycle nyata: deklarasikan template, publikasikan versi, lalu preview/apply ke perangkat.
          Publikasi sendiri tidak mengubah perangkat; capability yang terikat tetap ditolak saat apply.
        </p>

        {tenantId.trim() ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/35 p-3">
            <div className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Buat template</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <input value={newTemplate.key} onChange={(event) => setNewTemplate((value) => ({ ...value, key: event.target.value }))} placeholder="key" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[12px] text-slate-200" />
              <input value={newTemplate.semanticType} onChange={(event) => setNewTemplate((value) => ({ ...value, semanticType: event.target.value }))} placeholder="semantic type" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[12px] text-slate-200" />
              <input value={newTemplate.dataType} onChange={(event) => setNewTemplate((value) => ({ ...value, dataType: event.target.value }))} placeholder="data type" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[12px] text-slate-200" />
              <input value={newTemplate.unit} onChange={(event) => setNewTemplate((value) => ({ ...value, unit: event.target.value }))} placeholder="unit (opsional)" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[12px] text-slate-200" />
            </div>
            <button type="button" disabled={lifecycleBusy} onClick={() => void createTemplate()} className="mt-2 rounded-lg bg-sky-500/15 px-3 py-1.5 text-[11.5px] font-semibold text-sky-200 disabled:opacity-50">Buat template + draft 1.0.0</button>
          </div>
        ) : null}
        {lifecycleMessage ? <p className="mb-0 mt-2 text-[11.5px] text-sky-300">{lifecycleMessage}</p> : null}

        {tenantId.trim() ? (
          templatesLoading ? (
            <p className="mb-0 mt-3 text-[11.5px] text-slate-500">Memuat template…</p>
          ) : templateError ? (
            <p className="mb-0 mt-3 text-[11.5px] text-red-400">Gagal memuat template: {templateError}</p>
          ) : templates === null ? (
            <p className="mb-0 mt-3 text-[11.5px] text-slate-500">
              Template belum dimuat untuk tenant ini.
            </p>
          ) : templates.length === 0 ? (
            <p className="mb-0 mt-3 text-[11.5px] text-slate-500">
              Tenant ini belum punya template capability. Drift di atas belum bisa diterapkan.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {templates.map((template) => {
                const state = applyState[template.id];
                return (
                  <li
                    key={template.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="mb-2 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input value={publishVersion[template.id] ?? ''} onChange={(event) => setPublishVersion((previous) => ({ ...previous, [template.id]: event.target.value }))} placeholder="versi baru, mis. 1.1.0" className="min-w-[170px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11.5px] text-slate-200" />
                        <label className="flex items-center gap-1.5 text-[10.5px] text-slate-400"><input type="checkbox" checked={supersede[template.id] === true} onChange={(event) => setSupersede((previous) => ({ ...previous, [template.id]: event.target.checked }))} /> supersede versi aktif</label>
                        <label className="flex items-center gap-1.5 text-[10.5px] text-slate-400"><input type="checkbox" checked={rollback[template.id] === true} onChange={(event) => setRollback((previous) => ({ ...previous, [template.id]: event.target.checked }))} /> rollback ke versi lebih rendah</label>
                        <button type="button" disabled={lifecycleBusy} onClick={() => void publishTemplateVersion(template)} className="rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-[10.5px] font-semibold text-teal-200 disabled:opacity-50">Publish</button>
                        {template.publishedVersion ? <button type="button" disabled={lifecycleBusy} onClick={() => { setLifecycleMessage(null); setPendingDeprecation(template); }} className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[10.5px] font-semibold text-red-300 disabled:opacity-50">Deprecate v{template.publishedVersion}</button> : null}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-600">{template.versions?.length ? template.versions.map((version) => `${version.version}:${version.status}`).join(' · ') : 'Belum ada versi terbaca'}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-[12.5px] font-bold text-slate-200">{template.key}</code>
                      {template.publishedVersion ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-bold text-emerald-400">
                          published {template.publishedVersion}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[10.5px] font-bold text-slate-400">
                          belum ada versi published
                        </span>
                      )}
                      {/* Drift here means "devices disagree with the published template", not
                          only "devices disagree with each other". The drift listing above
                          compares `schemaVersion` across devices and knows nothing about
                          templates, so a fleet that is perfectly self-consistent at 1.0.0 while
                          the published template is 2.0.0 reported "tidak terdeteksi drift" and
                          offered no Apply button -- with twenty-one devices silently behind the
                          declared shape. Self-consistency is not conformance.
                          `alreadyOnTarget` is the only trustworthy signal here, and it is a
                          property of the template, not of the drift listing. */}
                      {template.publishedVersion &&
                      applyState[template.id]?.result?.alreadyOnTarget ? (
                        <span className="text-[10.5px] text-emerald-400">
                          seluruh perangkat sudah di versi ini
                        </span>
                      ) : null}
                    </div>

                    {template.publishedVersion ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={state?.busy}
                          onClick={() => void applyVersion(tenantId.trim(), template.id, false)}
                          className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-sky-300 disabled:opacity-50"
                        >
                          {state?.busy ? 'Memeriksa…' : `Terapkan ${template.publishedVersion}`}
                        </button>
                        {state?.result && !state.result.dryRun ? (
                          <span className="text-[11px] text-slate-400">
                            {state.result.updated} perangkat diperbarui
                            {state.result.refused.length > 0
                              ? `, ${state.result.refused.length} ditolak`
                              : ''}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {state?.result?.dryRun ? (
                      <div className="mt-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[.06] p-2.5">
                        <p className="m-0 text-[11.5px] font-semibold text-amber-300">
                          Pratinjau: {(state.result.wouldUpdate ?? 0)} perangkat akan diperbarui,{' '}
                          {state.result.wouldRefuse ?? 0} ditolak
                        </p>
                        {state.result.refused.length > 0 ? (
                          <ul className="mb-0 mt-1.5 space-y-1">
                            {state.result.refused.map((refusal, index) => (
                              <li
                                key={`${refusal.deviceName}-${index}`}
                                className="text-[11px] text-slate-400"
                              >
                                {refusal.deviceName}: versi {refusal.fromVersion} —{' '}
                                {refusal.bindingCount} binding dashboard,{' '}
                                {refusal.automationCount} automation. Lepas referensinya dulu.
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {(state.result.wouldUpdate ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => void applyVersion(tenantId.trim(), template.id, true)}
                            className="mt-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11.5px] font-semibold text-amber-200"
                          >
                            Ya, terapkan sekarang
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {state?.message ? (
                      <p className="mb-0 mt-2 text-[11px] text-red-400">{state.message}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>

      {drifting.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-5 py-6 text-center text-[12.5px] text-slate-500">
          Tidak ada drift versi atau tipe yang terdeteksi pada data yang terbaca.
        </p>
      ) : (
        <div className="space-y-3">
          {drifting.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border border-amber-500/25 bg-[#111c2e] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-[13px] font-bold text-amber-300">
                  {item.key}
                </code>
                <span className="text-[11.5px] text-slate-500">
                  {item.deviceCount} perangkat
                </span>
                {item.hasVersionDrift ? (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-400">
                    {item.versionCount} versi
                  </span>
                ) : null}
                {item.hasTypeDrift ? (
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10.5px] font-bold text-red-400">
                    tipe tidak seragam
                  </span>
                ) : null}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                {item.semanticTypes.map((value) => (
                  <span
                    key={value}
                    className="rounded bg-slate-800/70 px-1.5 py-0.5"
                  >
                    {value}
                  </span>
                ))}
                {item.dataTypes.map((value) => (
                  <span
                    key={value}
                    className="rounded bg-slate-800/70 px-1.5 py-0.5"
                  >
                    {value}
                  </span>
                ))}
                {item.units.map((value) => (
                  <span
                    key={value}
                    className="rounded bg-slate-800/70 px-1.5 py-0.5"
                  >
                    {value}
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {item.versions.map((version) => (
                  <li
                    key={version.schemaVersion}
                    className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-400"
                  >
                    <GitBranch className="h-3.5 w-3.5" strokeWidth={2} />
                    <code className="font-mono text-amber-300/90">
                      {version.schemaVersion}
                    </code>
                    <span>
                      {version.deviceCount} perangkat ·{' '}
                      {version.tenantNames.slice(0, 3).join(', ')}
                      {version.tenantNames.length > 3
                        ? ` +${version.tenantNames.length - 3}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-slate-500">
        {payload.lifecycleContract.note}
      </p>
      <ConfirmationDialog open={pendingDeprecation !== null} title="Deprekasi versi?" description={`Deprekasi ${pendingDeprecation?.key ?? ''} v${pendingDeprecation?.publishedVersion ?? ''}. Perangkat tidak diubah otomatis.`} busy={lifecycleBusy} error={lifecycleMessage} confirmLabel="Deprekasi" onCancel={() => setPendingDeprecation(null)} onConfirm={() => { if (pendingDeprecation) void deprecatePublishedVersion(pendingDeprecation); }} />
    </div>
  );
}
