import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { downloadFolderZip, getPublicFolder } from '../api/client';
import type { PublicFolder } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { btnNeutral, btnPrimary } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';

/**
 * One folder: its units as cards, its sub-folders, and the ZIP export that
 * packages the whole subtree as video + audio + transcript (#5, #6).
 */
export default function FolderDetail() {
  const { id = '' } = useParams();
  const session = useSession();
  const folderRoles = useFolderRoles();
  const [folder, setFolder] = useState<PublicFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
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

  async function downloadZip() {
    if (!folder) return;
    setZipping(true);
    try {
      await downloadFolderZip(folder.id, folder.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the ZIP.');
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
        <EmptyState
          title="This folder isn't available"
          action={
            <div className="flex flex-wrap justify-center gap-2">
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
          {error ?? 'It may be private. Unlock it with the passcode or link the owner shared.'}
        </EmptyState>
      </div>
    );
  }

  const editable = canEditFolder(session, folder.id, folderRoles);

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:px-6">
      <nav className="mb-3 text-xs text-faint" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-accent-strong">
          Dataset
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-dim">{folder.name}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">{folder.name}</h1>
          {folder.description ? <p className="mt-1 text-sm text-dim">{folder.description}</p> : null}
          <span
            className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${
              folder.visibility === 'public'
                ? 'border-ok/25 bg-ok-soft text-ok'
                : 'border-line bg-surface-2 text-dim'
            }`}
          >
            {folder.visibility}
          </span>
        </div>
        <button type="button" className={btnPrimary} onClick={downloadZip} disabled={zipping}>
          {zipping ? 'Building ZIP…' : 'Download dataset (.zip)'}
        </button>
      </div>

      {folder.children.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
            Sub-folders
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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