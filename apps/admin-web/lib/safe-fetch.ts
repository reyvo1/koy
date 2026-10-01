/**
 * Mount-safety for client fetches.
 *
 * 41 admin-web files fetch without any cancellation. The visible failure is a race: the
 * operator navigates away while a list request is in flight, and the response lands on an
 * unmounted component — or, worse, on the *next* page's data if the same component is
 * reused with different state. React no longer warns about `setState` after unmount, so
 * the suite stays green over a real defect.
 *
 * A `cancelled` flag is the same mechanism already used in 37 places in this app, so this
 * helper standardises it rather than introducing a second style. It deliberately does not
 * use `AbortController`: cancelling the request would also abort work the page still wants
 * after a refetch, and the goal here is to stop the *write*, not the transfer.
 *
 * Prefer `useSafeEffect` for effects. For a callback invoked by a user action, use
 * `isCurrent()` before each `setState`.
 */

/** Returns true while the caller is still mounted and has not been superseded. */
export type StillCurrent = () => boolean;

/**
 * Wrap an async loader so its state writes are dropped once the effect is cleaned up.
 *
 *   useEffect(() => runGuarded(async (isCurrent) => {
 *     const res = await fetch(url);
 *     if (!isCurrent()) return;
 *     setRows(await res.json());
 *   }), [deps]);
 */
export function runGuarded(
  task: (isCurrent: StillCurrent) => Promise<void> | void,
): () => void {
  let active = true;
  const isCurrent: StillCurrent = () => active;
  void Promise.resolve()
    .then(() => task(isCurrent))
    .catch(() => undefined);
  return () => {
    active = false;
  };
}

/**
 * Guard a `useCallback` loader that is called both from an effect and from mutation
 * handlers. The returned object exposes the same `isCurrent` check so a caller can skip
 * its own `setState` after an await when the component went away.
 */
export function createLoadGuard() {
  let generation = 0;
  return {
    /** Begin a run; the returned function reports whether that run is still the latest. */
    begin: (): StillCurrent => {
      const mine = ++generation;
      return () => generation === mine;
    },
    /** Invalidate every in-flight run (call from an effect cleanup or unmount). */
    cancel: () => {
      generation += 1;
    },
  };
}
