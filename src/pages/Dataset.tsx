import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listCards, listPublicFolders } from '../api/client';
import type { DataCard as DataCardModel, PublicFolder } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import FolderTree from '../components/FolderTree';
import Spinner from '../components/Spinner';
import { canEditFolder } from '../store/auth';

/**
 * The public dataset: everything a visitor may read, organised by folder and
 * shown as cards. This is the page's single job — answer "what is in this
 * dataset, and can I trust it?".
 */
export default function Dataset() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';

  const [folders, setFolders] = useState<PublicFolder[]>([]);
  const [cards, setCards] = useState<DataCardModel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listPublicFolders(), listCards(q ? { q } : {})])
      .then(([folderList, cardList]) => {
        if (cancelled) return;
        setFolders(folderList.items);
        setCards(cardList.items);
        setTotal(cardList.total);
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

  return (
    <div className="mx-auto grid max-w-content gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[16rem_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <h2 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Folders
        </h2>
        <div className="card p-2">
          {loading ? <Spinner label="Loading folders…" className="p-2" /> : <FolderTree nodes={folders} />}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-fg">
            {q ? `Results for “${q}”` : 'My Folder'}
          </h1>
          <span className="font-mono text-xs text-faint">{total} units</span>
        </div>

        {loading ? (
          <Spinner label="Loading dataset…" />
        ) : error ? (
          <EmptyState title="We couldn't load the dataset">{error}</EmptyState>
        ) : cards.length === 0 ? (
          <EmptyState title="Nothing here yet">
            {q
              ? 'No unit matches that search. Try a different title or link.'
              : 'This dataset is empty. Public folders will appear here once an operator publishes them.'}
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <DataCardView
                key={card.video_id}
                card={card}
                canEdit={canEditFolder(card.folder_id ?? '')}
                onChanged={() => undefined}
                onDeleted={() => setCards((prev) => prev.filter((c) => c.video_id !== card.video_id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}