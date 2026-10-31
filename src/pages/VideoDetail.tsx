import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, listCards, retryGet } from '../api/client';
import type { DataCard } from '../api/types';
import DataCardView from '../components/DataCard';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { btnNeutral, btnPrimary } from '../components/ui';
import { canEditFolder, useSession } from '../store/auth';
import { useFolderRoles } from '../lib/access';
import { videoStatusLabel } from '../lib/statusLabels';
import { useAutoRefresh } from '../lib/useAutoRefresh';

/**
 * Statuses that are still moving. While a unit is in one of these the page
 * polls every two seconds and shows live progress; `transcribed` means the
 * full card is ready, and `failed`/`quarantined` are terminal.
 */
const PROCESSING_STATUSES = new Set([
  'pending',
  'downloading',
  'downloaded',
  'uploading',
  'transcribing',
]);

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? Math.round(value) : 0));

/** The site a unit was scraped from, when the URL names one we recognise. */
function sourceName(url?: string | null): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
  if (lower.includes('instagram.com')) return 'Instagram';
  return null;
}

/** The line under the stage label: what is happening, in the visitor's words. */
function processingDetail(status: string, percent: number, sourceUrl?: string | null): string {
  switch (status) {
    case 'pending':
      return 'Your link is queued. Processing starts in a moment.';
    case 'downloading': {
      const where = sourceName(sourceUrl);
      return where
        ? `Downloading from ${where}… ${percent}%`
        : `Downloading the video… ${percent}%`;
    }
    case 'downloaded':
      return 'The video is downloaded. Next we extract and transcribe the audio.';
    case 'uploading':
      return `Saving the media… ${percent}%`;
    case 'transcribing':
      return `Transcribing the audio… ${percent}%. This usually takes a minute.`;
    default:
      return 'Working on it…';
  }
}

/** The quieter line under the bar: what to do (which is: wait, it is live). */
function processingHint(status: string): string {
  switch (status) {
    case 'transcribing':
      return 'Keep this page open. The transcript appears here the moment it is ready.';
    case 'downloaded':
      return 'Keep this page open. It updates on its own.';
    default:
      return 'Keep this page open. It updates on its own. You can also come back later.';
  }
}

/**
 * One unit, addressable by its own URL.
 *
 * The dataset and folder pages show units as cards, but the bot needs somewhere
 * to send a user whose video is too large for Telegram to carry (and a link
 * that works for a unit that is not in any folder). `?video_id=` on the cards
 * endpoint resolves exactly one unit under the same visibility rules as the
 * lists, so this page can never show more than the visitor may already read.
 *
 * The bot's link carries `?t=<guest-token>`: a seven-day bearer scoped to this
 * one video. It is passed to `listCards` for this request only, so an unfiled
 * unit opens for its owner without touching the visitor's own session.
 */
export default function VideoDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  // Empty string (a bare `?t=`) is the same as no token: fall back to session.
  const guestToken = params.get('t') || undefined;
  const navigate = useNavigate();
  const session = useSession();
  const folderRoles = useFolderRoles();
  const [card, setCard] = useState<DataCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** A `?t=` link the API rejected — expired, or never valid. */
  const [expired, setExpired] = useState(false);
  /**
   * The bearer that actually opened this unit. Normally the URL's `?t=` token;
   * it drops to `undefined` (the visitor's session) when a signed-in visitor's
   * foreign link is rejected and their own access is used instead. It is what
   * the card's media fetches authenticate with.
   */
  const [mediaToken, setMediaToken] = useState<string | undefined>(guestToken);
  const activeToken = useRef<string | undefined>(guestToken);

  // A new link — or a new unit — starts from the URL's token again.
  useEffect(() => {
    activeToken.current = guestToken;
    setMediaToken(guestToken);
  }, [guestToken]);

  // `silent` mode for the auto-refresh poll: no loading flicker (the card
  // stays on screen while download/transcript status advances underneath),
  // and transient poll errors are swallowed rather than replacing the
  // visible unit. Ordering uses `lastAppliedSeq`, so a StrictMode duplicate
  // that lands after its twin succeeded is still applied instead of dropped;
  // a failure only raises the error state when no card has been loaded (the
  // banner below renders on `!card`), so one blip never hides the unit.
  // First loads retry twice (1s/3s) before erroring. A 401/403 on a guest
  // link is not transient, so it always switches to the expired state.
  const reqSeq = useRef(0);
  const lastAppliedSeq = useRef(0);
  const load = useCallback((silent = false) => {
    const seq = ++reqSeq.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const fetchCard = (token: string | undefined) => () =>
      listCards({ video_id: id }, token);
    // First attempt uses the URL's guest token. A 401/403 on that explicit
    // override is terminal (retrying the same rejected bearer just delays the
    // answer), but a signed-in visitor may still have access of their own, so
    // fall back to their session exactly once before declaring the link dead.
    const run = async () => {
      const token = activeToken.current;
      if (!token) return fetchCard(undefined)();
      try {
        return await fetchCard(token)();
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403) && session) {
          const res = await fetchCard(undefined)();
          activeToken.current = undefined;
          setMediaToken(undefined);
          return res;
        }
        throw err;
      }
    };
    const overridden = activeToken.current !== undefined;
    const terminal = (err: unknown) =>
      !(overridden && err instanceof ApiError && (err.status === 401 || err.status === 403));
    (silent ? run() : retryGet(run, undefined, terminal))
      .then((res) => {
        if (seq < lastAppliedSeq.current) return;
        lastAppliedSeq.current = seq;
        setCard(res.items[0] ?? null);
        setError(null);
        setExpired(false);
      })
      .catch((err: Error) => {
        if (seq < lastAppliedSeq.current) return;
        // Only a failed guest link means "this link expired". A 401 on the
        // normal path is a session problem, handled by the client + auth store.
        if (guestToken && err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setExpired(true);
          setCard(null);
          return;
        }
        if (!silent) setError(err.message);
      })
      .finally(() => {
        if (seq === reqSeq.current && !silent) setLoading(false);
      });
  }, [id, guestToken, session]);

  useEffect(() => {
    load();
  }, [load]);

  // A unit the bot is still processing reaches 'transcribed' (or 'failed')
  // while the visitor watches, so poll every 2s — only while it is moving.
  const processing = card !== null && PROCESSING_STATUSES.has(card.status);
  const poll = useCallback(() => {
    load(true);
  }, [load]);
  useAutoRefresh(poll, { intervalMs: 2000, enabled: processing });

  if (loading) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <Spinner label="Loading unit…" />
      </div>
    );
  }

  // A guest link the API rejected (401/403). This is different from "not
  // found": the video may well exist, the pass just ran out.
  if (expired) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div aria-live="polite">
          <EmptyState
            title="This link has expired"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/login" className={btnPrimary}>
                  Sign in
                </Link>
                <Link to="/" className={btnNeutral}>
                  Back to the dataset
                </Link>
              </div>
            }
          >
            Video links from the bot stay valid for 7 days. Sign in to open it, or
            send the video link to the bot again for a fresh one.
          </EmptyState>
        </div>
      </div>
    );
  }

  // Only show the unavailable/error state when there is no card to keep:
  // a failed poll over a loaded card leaves the card on screen.
  if (!card) {
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

  // Still moving: show the stage, a determinate bar and no editable controls.
  const percent = clampPercent(card.progress);
  const stageLabel = videoStatusLabel(card.status);

  if (PROCESSING_STATUSES.has(card.status)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <nav className="mb-3 text-xs text-faint" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-accent-strong">
            Dataset
          </Link>
          <span className="mx-1.5">/</span>
          {folderLink}
        </nav>

        <div className="card flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words font-display text-xl font-bold text-fg sm:text-2xl">
                {card.title?.trim() || 'Your video'}
              </h1>
              <p className="mt-1 text-xs text-faint">Preparing this unit. It updates on its own.</p>
            </div>
            <Spinner label="" className="shrink-0" />
          </div>

          <div className="min-w-0">
            {/* Only the short stage name is live: the percentage changes on
                every poll and would flood a screen reader. */}
            <p aria-live="polite" className="text-sm font-semibold text-fg">
              {stageLabel}
            </p>
            <p className="mt-1 text-sm text-dim">
              {processingDetail(card.status, percent, card.source_url)}
            </p>
            <div
              role="progressbar"
              aria-label={`${stageLabel} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-faint">{processingHint(card.status)}</p>
          </div>
        </div>
      </div>
    );
  }

  // Terminal, but nothing to play yet: name the reason and the way forward.
  if (card.status === 'failed' || card.status === 'quarantined') {
    const failed = card.status === 'failed';
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div role="alert">
          <EmptyState
            title={failed ? "We couldn't prepare this video" : 'This video is under review'}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/login" className={btnPrimary}>
                  Sign in
                </Link>
                <Link to="/" className={btnNeutral}>
                  Back to the dataset
                </Link>
              </div>
            }
          >
            {failed ? (
              <>
                <p className="text-fg">
                  {card.error?.trim() || 'The download or transcription stopped before it finished.'}
                </p>
                <p className="mt-2">Ask an admin to retry, or send the link to the bot again.</p>
              </>
            ) : (
              'This video was set aside for review. Ask an admin to check it before it can be opened.'
            )}
          </EmptyState>
        </div>
      </div>
    );
  }

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
          authToken={mediaToken}
        />
      </div>
    </div>
  );
}
