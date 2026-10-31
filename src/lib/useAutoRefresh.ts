import { useEffect, useRef } from 'react';

/**
 * Poll a page's loader on an interval, but never while the tab is hidden, and
 * catch up the moment the user looks at the page again.
 *
 * - While the tab is hidden the interval keeps ticking but the callback is
 *   skipped, so a backgrounded tab does not hammer the API.
 * - On `visibilitychange` back to visible, and on window `focus`, a refetch
 *   fires immediately (the two events usually arrive together, so a short
 *   de-dupe window keeps that to one request).
 * - The `refetch` callback is held in a ref: passing a fresh closure every
 *   render does not restart the timer.
 *
 * Keep the call sites cheap and stable (`useCallback` around the loader) so
 * pause/resume behaves predictably; the hook itself never re-renders.
 */
export interface UseAutoRefreshOptions {
  /** Interval between background poll ticks. Default 15000 ms. */
  intervalMs?: number;
  /** Set false to stop polling entirely (e.g. an inactive flow). Default true. */
  enabled?: boolean;
}

/** Minimum gap between two immediate (focus/visibility) refetches. */
const IMMEDIATE_DEDUPE_MS = 1000;

export function useAutoRefresh(
  refetch: () => void,
  { intervalMs = 15_000, enabled = true }: UseAutoRefreshOptions = {},
): void {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    let lastImmediateAt = 0;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refetchRef.current();
    }, intervalMs);

    const runImmediate = () => {
      const now = Date.now();
      if (now - lastImmediateAt < IMMEDIATE_DEDUPE_MS) return;
      lastImmediateAt = now;
      refetchRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') runImmediate();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', runImmediate);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', runImmediate);
    };
  }, [intervalMs, enabled]);
}

export default useAutoRefresh;
