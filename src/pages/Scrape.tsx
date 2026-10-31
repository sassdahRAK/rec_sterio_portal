import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, createVideo, generateTranscript, getVideo, getTranscript } from '../api/client';
import type { Transcript, VideoDetail } from '../api/types';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import Waveform from '../components/Waveform';
import { btnNeutral, btnPrimary, inputCls } from '../components/ui';
import { videoStatusLabel } from '../lib/statusLabels';
import { useIsSignedIn } from '../store/auth';

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; videoId: string; status: string; progress: number }
  | { kind: 'done'; videoId: string }
  /**
   * The API already has this link (a 409). `videoId` is present only when this
   * caller may open the colliding unit — the server redacts it otherwise, so
   * there is nothing to link to and nothing the visitor can do but ask.
   */
  | { kind: 'duplicate'; videoId?: string }
  | { kind: 'error'; message: string };

/**
 * The job id of the scrape in flight. A scrape outlives this screen — the
 * server keeps downloading after the visitor switches tabs — so the id is
 * kept in storage and polling resumes when they come back, instead of the
 * page resetting to an empty form with the work invisible.
 */
const SCRAPE_KEY = 'recsterio.portal.scrape';

function readSavedJob(): string | null {
  try {
    return localStorage.getItem(SCRAPE_KEY);
  } catch {
    return null;
  }
}

function saveJob(videoId: string | null): void {
  try {
    if (videoId) localStorage.setItem(SCRAPE_KEY, videoId);
    else localStorage.removeItem(SCRAPE_KEY);
  } catch {
    /* storage unavailable — the scrape still works, it just cannot resume */
  }
}

/**
 * The ingest tab (instruction.txt #10): paste a link, recsterio downloads it,
 * extracts the audio and transcribes it. Requires a signed-in account — an
 * anonymous visitor can browse but not add to the dataset.
 */
export default function Scrape() {
  const isSignedIn = useIsSignedIn();
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const pollRef = useRef<number | null>(null);
  /** Last status observed for the saved job, so retry cannot resume a dead one. */
  const lastStatusRef = useRef<{ id: string; status: string } | null>(null);
  /** Synchronous submit guard: the `busy` state lags a fast double click. */
  const submittingRef = useRef(false);

  function watch(videoId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    saveJob(videoId);

    const tick = async () => {
      try {
        const next = await getVideo(videoId);
        lastStatusRef.current = { id: videoId, status: next.status };
        setDetail(next);
        setPhase({ kind: 'working', videoId, status: next.status, progress: next.progress });
        if (next.status === 'transcribed' || next.status === 'failed') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          // Keep the id: coming back to this tab should still show the last
          // result, not an empty form. It is replaced on the next scrape.
          if (next.status === 'transcribed') {
            try {
              setTranscript(await getTranscript(videoId));
            } catch {
              setTranscript(null);
            }
          }
          if (next.status === 'failed') {
            // A dead job must not stay saved: "Try again" would re-watch it forever.
            saveJob(null);
            setPhase({ kind: 'error', message: next.error ?? 'That unit could not be processed.' });
          } else {
            setPhase({ kind: 'done', videoId: next.id });
          }
        }
      } catch (err) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        // A saved job that no longer exists is stale, not a network problem —
        // clear it and leave a usable form rather than a permanent error.
        if (err instanceof ApiError && err.status === 404) {
          saveJob(null);
          setPhase({ kind: 'idle' });
          return;
        }
        setPhase({
          kind: 'error',
          message: 'Lost contact with the server. Check your connection and try again.',
        });
      }
    };

    // Read once immediately so a resumed job shows its current state at once.
    void tick();
    pollRef.current = window.setInterval(tick, 2000);
  }

  // Resume an unfinished scrape after a tab switch or a reload.
  useEffect(() => {
    const saved = readSavedJob();
    if (saved) watch(saved);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(source: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase({ kind: 'working', videoId: '', status: 'pending', progress: 0 });
    setDetail(null);
    setTranscript(null);
    try {
      const video = await createVideo({ source_url: source });
      watch(video.id);
    } catch (err) {
      // A link already in the dataset comes back as a 409. It carries the
      // existing unit's id only when this caller could open that unit; the
      // server redacts it otherwise. Either way the link is taken, so name that
      // state — and never fall through to "Try again", which cannot succeed.
      if (err instanceof ApiError && err.status === 409) {
        const details = (err.details ?? []) as { video_id?: string }[];
        const existingId = details.find((d) => d?.video_id)?.video_id;
        saveJob(null);
        setPhase({ kind: 'duplicate', videoId: existingId });
        setUrl('');
        return;
      }
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not add that link. Try again.',
      });
    } finally {
      submittingRef.current = false;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const source = url.trim();
    if (!source) return;
    void start(source);
  }

  /**
   * Recovery for either failure path: a job that is still known to the server
   * is watched again, otherwise the link in the field is re-submitted.
   */
  function retry() {
    if (phase.kind === 'working' || submittingRef.current) return;
    const saved = readSavedJob();
    // Only resume a job that is plausibly still running. A job whose last known
    // status was terminal (failed or already transcribed) is not something to
    // watch again — drop the saved id and re-submit the link in the field.
    const last = lastStatusRef.current;
    const terminal = last !== null && last.id === saved && (last.status === 'failed' || last.status === 'transcribed');
    if (saved && !terminal) {
      setPhase({ kind: 'working', videoId: saved, status: 'pending', progress: 0 });
      watch(saved);
      return;
    }
    if (saved) saveJob(null);
    const source = url.trim();
    if (source) void start(source);
    else setPhase({ kind: 'idle' });
  }

  async function regenerate(engine: 'whisper' | 'gemini' | 'both') {
    if (!detail) return;
    try {
      await generateTranscript(detail.id, engine);
      watch(detail.id);
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Could not start transcription.' });
    }
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <h1 className="font-display text-xl font-bold text-fg">Sign in to add to the dataset</h1>
          <p className="mt-2 text-sm text-dim">
            Adding a link creates a new unit in the dataset. Browsing public datasets needs no
            account. Only adding does.
          </p>
          <Link to="/login" className={`${btnPrimary} mt-4`}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const busy = phase.kind === 'working';

  return (
    <div className="mx-auto max-w-content px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-fg">Add a unit</h1>
      <p className="mb-4 text-sm text-dim">
        Paste a link to a video. RecSterio downloads it, extracts the audio and transcribes it.
      </p>

      <form onSubmit={submit} className="mb-6 flex flex-wrap gap-2">
        <input
          id="scrape-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Video link"
          placeholder="Paste a video link"
          className={`${inputCls} min-w-0 basis-64 flex-1`}
        />
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? 'Working…' : 'Add'}
        </button>
      </form>

      {phase.kind === 'idle' ? (
        <div className="card flex aspect-video w-full items-center justify-center text-faint">
          <span className="text-sm">Your unit will appear here once it's added.</span>
        </div>
      ) : null}

      {busy ? (
        <div className="card mb-5 flex items-center gap-3 p-4">
          <Spinner label="" />
          <div className="min-w-0">
            {/* Announce only the short status line, not the card: the progress
                bar mutates on every poll and would spam the live region. */}
            <p className="text-sm font-medium text-fg" aria-live="polite">
              {videoStatusLabel(phase.status)}
            </p>
            <div className="mt-1 h-1.5 w-56 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.max(4, phase.progress)}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div
          role="alert"
          className="card mb-5 flex flex-wrap items-center justify-between gap-3 border-bad/40 bg-bad-soft p-4 text-sm text-bad"
        >
          <span>{phase.message || 'That link could not be added.'}</span>
          <button type="button" className={btnNeutral} onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}

      {phase.kind === 'duplicate' ? (
        <div
          role="status"
          className="card mb-5 border-warn/40 bg-warn-soft p-4 text-sm text-warn"
        >
          <p className="font-medium">This link is already in the dataset.</p>
          <p className="mt-1">
            {phase.videoId
              ? "You don't need to add it twice. The unit is ready to open."
              : 'Ask whoever added it for access, or open the folder it was filed into.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {phase.videoId ? (
              <Link to={`/video/${phase.videoId}`} className={btnPrimary}>
                Open the existing unit
              </Link>
            ) : null}
            <button
              type="button"
              className={btnNeutral}
              onClick={() => setPhase({ kind: 'idle' })}
            >
              Add a different link
            </button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="font-display text-base font-semibold text-fg">
              {detail.title || 'Untitled unit'}
            </h2>
            <div className="flex aspect-video items-center justify-center rounded-lg border border-line bg-surface-2 text-faint">
              Media
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
              <Waveform seed={detail.id} className="flex-1" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} onClick={() => regenerate('whisper')} disabled={busy}>
                Transcribe again
              </button>
              {detail.status === 'transcribed' ? (
                <Badge kind={transcript?.cleaned ? 'cleaned' : 'raw'} />
              ) : null}
            </div>
          </div>

          <div className="card flex flex-col gap-2 p-5">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
              Transcript
            </span>
            <p className="max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-dim">
              {transcript?.content || 'No transcript yet.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}