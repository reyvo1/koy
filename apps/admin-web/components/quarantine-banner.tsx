'use client';

/**
 * On-page non-production banner for the QUARANTINE surfaces.
 *
 * These routes already carry an honest group label in the console nav ("Beta · belum
 * produksi" / "Laboratorium · belum produksi"). That label is only visible to someone reading
 * the menu, though: anyone arriving from a bookmark, a shared link or a support ticket sees
 * the page presented as a finished product, with subtitles like "Global operations
 * monitoring" or "Daftarkan & pasangkan via scan QR" that imply capabilities the surface does
 * not have. The grouping was honest; the page itself was not.
 *
 * So each quarantined page states, on the page, what it really reads and what it really does
 * not do. The text is per-surface and factual — derived from the endpoints the page actually
 * calls, not from a generic disclaimer.
 */

export interface QuarantineBannerProps {
  /** What the page genuinely reads or performs today. */
  works: string[];
  /** What a reader might reasonably expect but that is not implemented. */
  doesNotWork: string[];
}

export function QuarantineBanner({ works, doesNotWork }: QuarantineBannerProps) {
  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/[.07] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-inset ring-amber-500/30">
          Laboratorium · belum produksi
        </span>
        <span className="text-[12px] text-amber-200/80">
          Halaman ini sengaja tidak disembunyikan, tetapi jangan diperlakukan sebagai fitur jadi.
        </span>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="m-0 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            Yang benar-benar ada
          </h4>
          <ul className="mb-0 mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-300">
            {works.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="m-0 text-[11px] font-bold uppercase tracking-wider text-amber-400">
            Yang belum ada
          </h4>
          <ul className="mb-0 mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-300">
            {doesNotWork.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
