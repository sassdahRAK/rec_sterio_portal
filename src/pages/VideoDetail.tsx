import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listCards } from '../api/client';
import type { DataCard } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { btnNeutral, btnPrimary } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';

/**
 * One unit, addressable by its own URL.
 *
 * The dataset and folder pages show units as cards, but the bot needs somewhere
 * to send a user whose video is too large for Telegram to carry (and a link
 * that works for a unit that is not in any folder). `?video_id=` on the cards
 * endpoint resolves exactly one unit under the same visibility rules as the
 * lists, so this page can never show more than the visitor may already read.
 */
export default function VideoDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const folderRoles = useFolderRoles();
  const [card, setCard] = useState<DataCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCards({ video_id: id })
      .then((res) => {
        if (!cancelled) setCard(res.items[0] ?? null);
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

  if (loading) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <Spinner label="Loading unit…" />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div aria-live="polite">
        <EmptyState
          title="This unit isn't available"
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
              {/* The bot links here for a unit too large to send through
                  Telegram, and such a unit is often the visitor's own — unfiled
                  units are visible only to their creator, so signing in is the
                  usual way through. Nothing here says whether the id exists. */}
              <Link to="/login" className={btnPrimary}>
                Sign in
              </Link>
              <Link to="/passcode" className={btnNeutral}>
                Have a passcode?
              </Link>
            </div>
          }
        >
          {error
            ? 'We could not load this unit. Check your connection and try again.'
            : 'Sign in if it is your own unit (an unfiled one is visible only to its creator), or unlock it with the passcode or share link the owner sent.'}
        </EmptyState>
        </div>
      </div>
    );
  }

  const folderLink = card.folder_id ? (
    <Link to={`/folder/${card.folder_id}`} className="hover:text-accent-strong">
      {card.folder_name ?? 'Folder'}
    </Link>
  ) : (
    <span className="text-dim">Unfiled</span>
  );

  return (
    // A focused column, not the full dataset width: one unit is the whole page,
    // and a card stretched across a wide screen reads as a broken grid.
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <nav className="mb-3 text-xs text-faint" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-accent-strong">
          Dataset
        </Link>
        <span className="mx-1.5">/</span>
        {folderLink}
      </nav>

      <div className="mb-5">
        <h1 className="break-words font-display text-2xl font-bold text-fg">
          {card.title?.trim() || 'Untitled unit'}
        </h1>
        <p className="mt-1 text-xs text-faint">
          Play the video here, download the audio, or read the transcript. Every
          unit is also listed in its folder.
        </p>
      </div>

      <div className="grid gap-5">
        <DataCardView
          card={card}
          canEdit={canEditFolder(session, card.folder_id ?? '', folderRoles)}
          onChanged={load}
          onDeleted={() => navigate('/', { replace: true })}
        />
      </div>
    </div>
  );
}
