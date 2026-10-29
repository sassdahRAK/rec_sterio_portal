import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { downloadFolderZip, getPublicFolder, listPublicFolders } from '../api/client';
import type { PublicFolder } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { btnNeutral, btnPrimary, selectCls } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';
import { flattenFolders, folderOptionLabel } from '../lib/folders';

/**
 * One folder: its units as cards, its sub-folders, and the ZIP export that
 * packages the whole subtree as video + audio + transcript (#5, #6).
 */
export default function FolderDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const folderRoles = useFolderRoles();
  const [folder, setFolder] = useState<PublicFolder | null>(null);
  // The full public tree for the phone jump picker — a convenience, so its
  // failure is swallowed rather than breaking the folder itself.
  const [tree, setTree] = useState<PublicFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  // A failed export is a local problem with one control (the ZIP button), not
  // proof the folder is gone — so it gets its own state and never trips the
  // page-level "This folder isn't available" branch.
  const [zipError, setZipError] = useState<string | null>(null);
  // A 404 from this route means one of two things: the folder does not exist, or
  // it is private and the caller has no token. Only the second case may be
  // advertised, so the door is offered only once the folder is known to exist.
  const [exists, setExists] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPublicFolder(id)
      .then((res) => {
        if (!cancelled) {
          setFolder(res);
          setExists(true);
        }
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
  }, [id]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    let cancelled = false;
    listPublicFolders()
      .then((res) => {
        if (!cancelled) setTree(res.items);
      })
      .catch(() => {
        /* jump picker stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function downloadZip() {
    if (!folder) return;
    setZipping(true);
    setZipError(null);
    try {
      await downloadFolderZip(folder.id, folder.name);
    } catch (err) {
      setZipError(
        err instanceof Error ? err.message : 'The download could not be built. Try again.',
      );
    } finally {
      setZipping(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <Spinner label="Loading folder…" />
      </div>
    );
  }

  if (error || !folder) {
    const known = exists && error !== null;
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div aria-live="polite">
        <EmptyState
          title="This folder isn't available"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {error ? (
                <button type="button" className={btnNeutral} onClick={() => load()}>
                  Try again
                </button>
              ) : null}
              <Link to="/" className={btnNeutral}>
                Back to the dataset
              </Link>
              {/* Only offered for a folder the visitor can already read, which is
                  how a share token leaves them: the folder is visible to them,
                  so pointing at its door leaks nothing an attacker cannot learn
                  by guessing ids. A genuinely unknown id gets no door at all. */}
              {known ? (
                <Link to={`/passcode?folder=${id}`} className={btnPrimary}>
                  Have a passcode?
                </Link>
              ) : null}
            </div>
          }
        >
          {error
            ? 'We could not load this folder. Check your connection and try again.'
            : 'It may be private. Unlock it with the passcode or link the owner shared.'}
        </EmptyState>
        </div>
      </div>
    );
  }

  const editable = canEditFolder(session, folder.id, folderRoles);
  const jumpOptions = flattenFolders(tree);

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:px-6">
      {/* The same phone jump control the dataset page uses: pick any folder
          in one tap. The current folder is always reflected in the box. */}
      <div className="card mb-4 p-2 sm:hidden">
        <label htmlFor="folder-jump" className="sr-only">
          Browse folders
        </label>
        <select
          id="folder-jump"
          value={folder.id}
          onChange={(e) => {
            if (e.target.value !== folder.id) navigate(`/folder/${e.target.value}`);
          }}
          className={selectCls}
        >
          {!jumpOptions.some((f) => f.id === folder.id) ? (
            // A folder reached via a share link or passcode is not in the
            // public tree — name it so the control still shows where you are.
            <option value={folder.id}>{folder.name}</option>
          ) : null}
          {jumpOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {'\u00A0\u00A0'.repeat(f.depth)}
              {folderOptionLabel(f)}
            </option>
          ))}
        </select>
      </div>

      <nav className="mb-3 text-xs text-faint" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-accent-strong">
          Dataset
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-dim">{folder.name}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="break-words font-display text-2xl font-bold text-fg">{folder.name}</h1>
          {folder.description ? <p className="mt-1 text-sm text-dim">{folder.description}</p> : null}
          <span
            className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${
              folder.visibility === 'public'
                ? 'border-ok/25 bg-ok-soft text-ok'
                : 'border-line bg-surface-2 text-dim'
            }`}
          >
            {folder.visibility === 'public' ? 'Public' : 'Private'}
          </span>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <button type="button" className={btnPrimary} onClick={downloadZip} disabled={zipping}>
            {zipping ? 'Building ZIP…' : 'Download dataset (.zip)'}
          </button>
          {/* Local failure: stays beside the control that caused it. */}
          {zipError ? (
            <div
              role="alert"
              className="flex items-start justify-between gap-2 rounded-md border border-bad/40 bg-bad-soft px-2.5 py-1.5 text-xs text-bad"
            >
              <span>{zipError}</span>
              <button
                type="button"
                className="tap-pad shrink-0 rounded px-1 font-medium underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-bad/40"
                onClick={() => setZipError(null)}
                aria-label="Dismiss download error"
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {folder.children.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
            Sub-folders
          </h2>
          {/* Phones get one compact divided list; sm+ keeps the card grid. */}
          <div className="divide-y divide-line rounded-xl border border-line sm:hidden">
            {folder.children.map((child) => (
              <Link
                key={child.id}
                to={`/folder/${child.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-dim transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50"
              >
                <span className="truncate">{child.name}</span>
                <span className="shrink-0 font-mono text-xs text-faint">{child.cards.length}</span>
              </Link>
            ))}
          </div>
          <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {folder.children.map((child) => (
              <Link
                key={child.id}
                to={`/folder/${child.id}`}
                className="card flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-dim transition-colors hover:border-accent/50 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50"
              >
                <span className="truncate">{child.name}</span>
                <span className="font-mono text-xs text-faint">{child.cards.length}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {folder.cards.length === 0 ? (
        <EmptyState title="This folder is empty">
          Units added to this folder will appear here as cards.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {folder.cards.map((card) => (
            <DataCardView
              key={card.video_id}
              card={card}
              canEdit={editable}
              onChanged={load}
              onDeleted={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}