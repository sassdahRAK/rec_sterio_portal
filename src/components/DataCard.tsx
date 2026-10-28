import { useRef, useState } from 'react';
import type { DataCard as DataCardModel } from '../api/types';
import {
  deleteVideo,
  downloadAudio,
  playableMediaUrl,
  putTranscript,
  ApiError,
} from '../api/client';
import Badge from './Badge';
import Waveform from './Waveform';
import { formatDuration } from '../lib/format';
import { btnDanger, btnNeutral, btnPrimary, iconBtn, inputCls } from './ui';

/**
 * One dataset unit: media, audio and transcript, with the Raw/Cleaned badge.
 *
 * This is the page's workhorse and the design's signature surface — the media
 * area sits in a soft crimson halo, and the audio row is a real waveform.
 */
export default function DataCardView({
  card,
  canEdit,
  onChanged,
  onDeleted,
}: {
  card: DataCardModel;
  canEdit: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stop() {
    audioRef.current?.pause();
    setPlaying(false);
    setProgress(0);
  }

  async function togglePlay() {
    if (playing) {
      stop();
      return;
    }
    setError(null);
    try {
      const url = await playableMediaUrl(card.audio_url);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not play this audio.');
    }
  }

  function startEdit() {
    setDraft(card.transcript_preview ?? '');
    setEditing(true);
    setError(null);
  }

  async function saveEdit() {
    setBusy(true);
    setError(null);
    try {
      // A manual correction always creates a NEW version and is marked cleaned
      // (instruction.txt #8): the raw ASR output stays retrievable.
      await putTranscript(card.video_id, { content: draft, cleaned: true });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the edit.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteVideo(card.video_id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this card.');
      setBusy(false);
    }
  }

  const title = card.title || card.folder_name || 'Untitled clip';

  return (
    <article className="card halo flex flex-col gap-4 p-5 animate-fade-up">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-fg" title={title}>
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-faint">
            {card.duration_seconds != null ? formatDuration(card.duration_seconds) : 'no duration'}
            {card.folder_name ? ` · ${card.folder_name}` : ''}
            {card.status !== 'transcribed' ? ` · ${card.status}` : ''}
          </p>
        </div>
        <Badge kind={card.badge} className="shrink-0" />
      </header>

      {/* Media: a real player when the bytes are streamable, otherwise a poster. */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {card.thumbnail_url ? (
          <img
            src={card.thumbnail_url}
            alt={title}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? `Pause ${title}` : `Play ${title}`}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-halo transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/60"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>
        )}
      </div>

      {/* Audio artifact. */}
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
        <Waveform seed={card.video_id} progress={playing ? progress : 0} className="flex-1" />
        <span className="font-mono text-xs text-faint">{formatDuration(card.duration_seconds)}</span>
        <button
          type="button"
          className={iconBtn}
          onClick={() => downloadAudio(card.video_id, card.title ?? undefined)}
          aria-label={`Download audio for ${title}`}
          title="Download audio (.wav)"
        >
          <DownloadIcon />
        </button>
      </div>

      {/* Transcript. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
            Transcript
          </span>
          {canEdit && !editing ? (
            <button
              type="button"
              className={iconBtn}
              onClick={startEdit}
              aria-label={`Edit transcript for ${title}`}
              title="Edit transcript"
            >
              <PencilIcon />
            </button>
          ) : null}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className={`${inputCls} min-h-[7rem] resize-y font-mono text-xs leading-relaxed`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Edit transcript for ${title}`}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className={btnNeutral} onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} onClick={saveEdit} disabled={busy}>
                {busy ? 'Saving…' : 'Save as cleaned'}
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-dim">
            {card.transcript_preview || (
              <span className="text-faint">No transcript yet — this clip is still processing.</span>
            )}
          </p>
        )}

        {canEdit && !editing ? (
          <div className="flex justify-end">
            <button
              type="button"
              className={`${btnDanger} px-2 py-1 text-xs`}
              onClick={remove}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete card'}
            </button>
          </div>
        ) : null}

        {error ? <p className="text-xs text-bad">{error}</p> : null}
      </div>
    </article>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}