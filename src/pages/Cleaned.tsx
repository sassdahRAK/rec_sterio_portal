import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCards, retryGet } from '../api/client';
import type { DataCard as DataCardModel } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import SearchBar from '../components/SearchBar';
import Spinner from '../components/Spinner';
import { btnNeutral, btnPrimary } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';
import { useAutoRefresh } from '../lib/useAutoRefresh';

/**
 * The human-corrected subset (instruction.txt #8). The badge is the filter:
 * only units a person has edited are shown here, which is what makes this tab
 * trustworthy.
 */
export default function Cleaned() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const session = useSession();
  const folderRoles = useFolderRoles();
  const [cards, setCards] = useState<DataCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `silent` mode for the auto-refresh poll: no `loading` flicker, transient
  // errors are swallowed. Ordering uses `lastAppliedSeq`: any success newer
  // than the last applied is kept (a StrictMode duplicate that lands after
  // its twin succeeded is still a valid success), and a failure only raises
  // the banner when there are no cards to keep — the banner renders behind
  // `cards.length === 0`. First loads retry twice (1s/3s) before erroring.
  const reqSeq = useRef(0);
  const lastAppliedSeq = useRef(0);
  const load = useCallback((silent = false) => {
    const seq = ++reqSeq.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const run = () => listCards(q ? { cleaned: true, q } : { cleaned: true });
    (silent ? run() : retryGet(run))
      .then((res) => {
        if (seq < lastAppliedSeq.current) return;
        lastAppliedSeq.current = seq;
        setCards(res.items);
        setError(null);
      })
      .catch((err: Error) => {
        if (seq < lastAppliedSeq.current) return;
        if (!silent) setError(err.message);
      })
      .finally(() => {
        if (seq === reqSeq.current && !silent) setLoading(false);
      });
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  // Cleaned units edited or newly corrected appear without a manual refresh.
  const poll = useCallback(() => {
    load(true);
  }, [load]);
  useAutoRefresh(poll, { intervalMs: 15_000 });

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Cleaned</h1>
        <SearchBar
          id="cleaned-search"
          value={q}
          onSubmit={(query) => {
            const next = new URLSearchParams(params);
            if (query) next.set('q', query);
            else next.delete('q');
            setParams(next);
          }}
          className="order-last basis-full sm:order-none sm:basis-auto sm:w-56"
        />
        <span
          className="ml-auto font-mono text-xs text-faint"
          aria-live="polite"
          aria-atomic="true"
        >
          {cards.length} units
        </span>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-dim">
        Transcripts a person has corrected. The raw ASR output is kept alongside each one, so you
        can always compare.
      </p>

      {loading ? (
        <Spinner label="Loading cleaned units…" />
      ) : error && cards.length === 0 ? (
        <EmptyState
          title="We couldn't load this view"
          action={
            <button type="button" className={btnPrimary} onClick={() => load()}>
              Try again
            </button>
          }
        >
          <span aria-live="polite">
            Something went wrong while loading. Check your connection and try again.
          </span>
        </EmptyState>
      ) : cards.length === 0 ? (
        <EmptyState
          title="No cleaned units yet"
          action={
            <Link to="/" className={btnNeutral}>
              Browse the whole dataset
            </Link>
          }
        >
          When someone edits a transcript, the new version is marked cleaned and appears here.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <DataCardView
              key={card.video_id}
              card={card}
              canEdit={canEditFolder(session, card.folder_id ?? '', folderRoles)}
              onChanged={load}
              onDeleted={() => setCards((prev) => prev.filter((c) => c.video_id !== card.video_id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}