import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { listCards, listPublicFolders, retryGet } from '../api/client';
import type { DataCard as DataCardModel, PublicFolder } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import FolderTree from '../components/FolderTree';
import SearchBar from '../components/SearchBar';
import Spinner from '../components/Spinner';
import { btnNeutral, btnPrimary, selectCls } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';
import { flattenFolders, folderOptionLabel } from '../lib/folders';
import { useAutoRefresh } from '../lib/useAutoRefresh';

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

  // A named loader so a saved edit can refresh the cards it changed.
  // `silent` is used by the auto-refresh poll: it leaves `loading` untouched
  // (no spinner flicker), keeps the current query/folders/scroll, and swallows
  // transient errors instead of replacing the visible list with the error
  // state. Ordering is decided by `lastAppliedSeq`: any successful response
  // newer than the last one applied is used, and an older one is dropped —
  // crucially, a duplicate StrictMode mount request whose twin already
  // succeeded is not treated as "stale". A failure only sets the error
  // banner, and the banner is rendered only when there is no data to keep
  // (`cards.length === 0` below), so one transient blip never hides good
  // cards. The first load retries twice (1s/3s) before showing the banner.
  const reqSeq = useRef(0);
  const lastAppliedSeq = useRef(0);
  const load = useCallback((silent = false) => {
    const seq = ++reqSeq.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const run = () =>
      Promise.all([listPublicFolders(), listCards(q ? { q } : {})]);
    (silent ? run() : retryGet(run))
      .then(([folderList, cardList]) => {
        if (seq < lastAppliedSeq.current) return;
        lastAppliedSeq.current = seq;
        setFolders(folderList.items);
        setCards(cardList.items);
        setTotal(cardList.total);
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

  // Newly published units appear without a manual refresh. The hook pauses
  // while the tab is hidden and refetches the moment it is visible again.
  const poll = useCallback(() => {
    load(true);
  }, [load]);
  useAutoRefresh(poll, { intervalMs: 15_000 });

  return (
    <div className="mx-auto grid max-w-content gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[16rem_1fr]">
      <section className="min-w-0 lg:order-2">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="break-words font-display text-2xl font-bold text-fg">
            {q ? `Results for “${q}”` : 'All units'}
          </h1>
          <SearchBar
            id="dataset-search"
            value={q}
            onSubmit={(query) => navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')}
            className="order-last basis-full sm:order-none sm:basis-auto sm:w-56"
          />
          <span
            className="ml-auto font-mono text-xs text-faint"
            aria-live="polite"
            aria-atomic="true"
          >
            {total} units
          </span>
        </div>

        {loading ? (
          <Spinner label="Loading dataset…" />
        ) : error && cards.length === 0 ? (
          <EmptyState
            title="We couldn't load the dataset"
            action={
              <button type="button" className={btnPrimary} onClick={() => load()}>
                Try again
              </button>
            }
          >
            {/* The failed load is announced without moving focus: the button
                beside it is the recovery path. */}
            <span aria-live="polite">
              Something went wrong while loading. Check your connection and try again.
            </span>
          </EmptyState>
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

      {/* Source order puts the results first — on a phone the picker and the
          passcode promo sit below what they filter. On lg: the order classes
          restore the sidebar to the left, so desktop is unchanged. */}
      <aside className="lg:sticky lg:top-24 lg:self-start lg:order-1">
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
            value=""
            onChange={(e) => navigate(e.target.value || '/')}
            className={selectCls}
          >
            <option value="">All units · {total}</option>
            {flattenFolders(folders).map((f) => (
              <option key={f.id} value={`/folder/${f.id}`}>
                {'\u00A0\u00A0'.repeat(f.depth)}
                {folderOptionLabel(f)}
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