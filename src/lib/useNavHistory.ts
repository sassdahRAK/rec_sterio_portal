import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/**
 * Browser-style back / forward state for in-app chrome buttons.
 *
 * The trick is never letting `navigate(-1)`/`navigate(1)` walk the user out
 * of (or past) the SPA's own history entries. React Router's history keeps an
 * `idx` (position within the session's entry list) in `window.history.state`,
 * and `useNavigationType()` says whether the last committed navigation was a
 * PUSH/REPLACE or a POP:
 *
 * - On PUSH/REPLACE the browser discards everything ahead of the new entry, so
 *   the current `idx` becomes the forward frontier.
 * - On POP we only read the new `idx`; the frontier stays where it was.
 *
 * `canBack` is therefore `idx > 0` (a fresh landing page has idx 0, so the
 * back button is disabled on first mount and never exits to the referring
 * site), and `canForward` is `idx < frontier` (forward is enabled only while a
 * real in-app entry we navigated back from still exists).
 */
export interface NavHistory {
  goBack: () => void;
  goForward: () => void;
  canBack: boolean;
  canForward: boolean;
}

/** Current position within the SPA's history entries; 0 for a fresh load. */
function readIdx(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' && idx > 0 ? idx : 0;
}

export function useNavHistory(): NavHistory {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const location = useLocation();

  // location.key changes on every committed navigation (push or pop), so this
  // effect re-runs exactly once per navigation — consecutive PUSHes share a
  // navigationType but never share a key.
  const [idx, setIdx] = useState(readIdx);
  const [frontier, setFrontier] = useState(readIdx);
  // Mirror of the frontier for the click-time guard below, so a forward jump
  // is checked against the latest committed value, not a stale closure.
  const frontierRef = useRef(frontier);

  useEffect(() => {
    const next = readIdx();
    setIdx(next);
    setFrontier((f) => {
      const updated =
        navigationType === 'PUSH' || navigationType === 'REPLACE' ? next : Math.max(f, next);
      frontierRef.current = updated;
      return updated;
    });
  }, [navigationType, location.key]);

  const canBack = idx > 0;
  const canForward = idx < frontier;

  const goBack = useCallback(() => {
    if (readIdx() > 0) navigate(-1);
  }, [navigate]);

  const goForward = useCallback(() => {
    // Guarded by the live position at click time, not render-time state, so a
    // navigate(1) can never run past the last known entry.
    if (readIdx() < frontierRef.current) navigate(1);
  }, [navigate]);

  return { goBack, goForward, canBack, canForward };
}

export default useNavHistory;
