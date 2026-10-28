import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { listCards, listPublicFolders } from '../api/client';
import type { DataCard as DataCardModel, PublicFolder } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import FolderTree from '../components/FolderTree';
import Spinner from '../components/Spinner';
import { btnNeutral } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';

/** Folder tree flattened into picker options; depth shows as indentation. */
function flattenFolders(
  nodes: PublicFolder[],
  depth = 0,
): { id: string; name: string; depth: number }[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, depth },
    ...flattenFolders(n.children, depth + 1),
  ]);
}

/**
 * The public dataset: everything a visitor may read, organised by folder and
 * shown as cards. This is the page's single job — answer "what is in this
 * dataset, and can I trust it?".
 */
export default function Dataset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const session = useSession();
  const folderRoles = useFolderRoles();

  const [folders, setFolders] = useState<PublicFolder[]>([]);
  const [cards, setCards] = useState<DataCardModel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A named loader so a saved edit can refresh the cards it changed. The
  // `cancelled` flag also stops an earlier search from overwriting a newer one
  // when two fetches overlap.
  const load = useCallback(() => {
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

  useEffect(() => load(), [load]);

  return (
    <div className="mx-auto grid max-w-content gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[16rem_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Browse
        </h2>
        {/* Phones get the whole tree as one picker — the expanded card pushed
            a screen's worth of links above the first unit. */}
        <div className="card p-2 sm:hidden">
          <label htmlFor="folder-picker" className="sr-only">
            Browse folders
          </label>
          <select
            id="folder-picker"
            defaultValue=""
            onChange={(e) => navigate(e.target.value || '/')}
            className="tap-pad w-full appearance-none rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
          >
            <option value="">All units · {total}</option>
            {flattenFolders(folders).map((f) => (
              <option key={f.id} value={`/folder/${f.id}`}>
                {'\u00A0\u00A0'.repeat(f.depth)}
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card hidden p-2 sm:block">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `tap-pad flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive && !q
                  ? 'bg-surface-2 font-semibold text-fg'
                  : 'text-dim hover:bg-surface-2 hover:text-fg'
              }`
            }
          >
            <GridIcon />
            <span>All units</span>
            <span className="ml-auto font-mono text-xs text-faint">{total}</span>
          </NavLink>
          <div className="my-1.5 border-t border-line" />
          {loading ? <Spinner label="Loading folders…" className="p-2" /> : <FolderTree nodes={folders} />}
        </div>

        {/* The passcode door, reachable from the page the console advertises it
            on. It names no folder: a visitor with a code picks which one it
            opens, and an anonymous caller learns nothing. */}
        <div className="card mt-3 p-3">
          <p className="text-xs text-dim">
            Private folder? The owner can give you a passcode instead of an invite.
          </p>
          <Link to="/passcode" className={`${btnNeutral} mt-2 w-full`}>
            Have a passcode?
          </Link>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-fg">
            {q ? `Results for “${q}”` : 'All units'}
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
                canEdit={canEditFolder(session, card.folder_id ?? '', folderRoles)}
                onChanged={load}
                onDeleted={() => setCards((prev) => prev.filter((c) => c.video_id !== card.video_id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-faint" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}