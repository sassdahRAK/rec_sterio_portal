import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCards } from '../api/client';
import type { DataCard as DataCardModel } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import SearchBar from '../components/SearchBar';
import Spinner from '../components/Spinner';
import { btnNeutral } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';

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

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listCards(q ? { cleaned: true, q } : { cleaned: true })
      .then((res) => {
        if (!cancelled) setCards(res.items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  useEffect(() => load(), [load]);

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
        <span className="ml-auto font-mono text-xs text-faint">{cards.length} units</span>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-dim">
        Transcripts a person has corrected. The raw ASR output is kept alongside each one, so you
        can always compare.
      </p>

      {loading ? (
        <Spinner label="Loading cleaned units…" />
      ) : error ? (
        <EmptyState title="We couldn't load this view">{error}</EmptyState>
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