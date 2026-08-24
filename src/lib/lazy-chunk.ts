/**
 * Loading a code-split chunk that may have been deployed out from under us.
 *
 * The app is served from Cloudflare's asset store, where each build's files
 * carry a content hash and the previous build's files stop existing. A tab left
 * open across a deploy is still running the old entry script, so the first time
 * it lazily imports something — the map — it asks for a filename that is gone.
 *
 * Worse, it doesn't get a 404: the SPA fallback answers every unknown path with
 * index.html, so the browser is handed HTML where it expected a module and
 * reports a MIME type error. The page then blanks, with nothing on screen to
 * explain it.
 *
 * One reload fixes it, because the fresh entry script names files that exist.
 */

const KEY = 'sabretooth-chunk-reload';

/** Wraps a dynamic import so a stale chunk reloads the page instead of dying. */
export function lazyChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const mod = await load();
      // Loaded cleanly, so any earlier reload did its job and the next deploy
      // is allowed its own attempt.
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      let reloadedAlready = true;
      try {
        reloadedAlready = sessionStorage.getItem(KEY) === '1';
        if (!reloadedAlready) sessionStorage.setItem(KEY, '1');
      } catch {
        // No sessionStorage (private mode): reloading blind could loop, so
        // treat it as already tried and let the error surface instead.
      }

      if (reloadedAlready) throw err;

      window.location.reload();
      // The reload takes over; resolving would render against a dead module.
      return new Promise<T>(() => {});
    }
  };
}
