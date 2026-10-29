import { useEffect, useRef, useState } from 'react';
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
import { claimPlayback, releasePlayback } from '../lib/playback';
import { videoStatusLabel } from '../lib/statusLabels';
import { btnDanger, btnNeutral, btnPrimary, iconBtn, inputCls } from './ui';

/**
 * One dataset unit: media, audio and transcript, with the Raw/Cleaned badge.
 *
 * This is the page's workhorse — the media area, a real waveform for the audio
 * row, and the transcript with its edit affordance.
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
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const transcriptRef = useRef<HTMLParagraphElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Same rule the admin console uses: the bytes are on disk once the clip has
  // been downloaded, and stay there through transcription.
  // A cloud-stored unit whose drive is disconnected cannot be fetched; the
  // play button would only ever 404, so it is not offered.
  const driveOffline = card.storage_backend != null && card.storage_available === false;
  const videoReady =
    (card.status === 'transcribed' || card.status === 'downloaded') && !driveOffline;

  async function playVideo() {
    stop(); // never let the audio row and the video talk over each other
    setVideoLoading(true);
    setError(null);
    try {
      setVideoUrl(await playableMediaUrl(card.media_url));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not play this video.');
    } finally {
      setVideoLoading(false);
    }
  }

  // The toggle only appears when the clamped text is actually cut off, so
  // short transcripts stay clean. Re-measure after the card is unclamped too.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [card.transcript_preview, expanded, editing]);

  function stop() {
    if (audioRef.current) {
      releasePlayback(audioRef.current);
      audioRef.current.pause();
    }
    videoRef.current?.pause();
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
        releasePlayback(audio);
        setPlaying(false);
        setProgress(0);
      };
      // Another card claiming playback pauses this element; reflect that in the
      // button instead of leaving a Pause icon on a silent clip.
      audio.onpause = () => {
        releasePlayback(audio);
        setPlaying(false);
      };
      // One card at a time: this silences any other card still playing.
      claimPlayback(audio);
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

  const title = card.title || card.folder_name || 'Untitled unit';

  // min-w-0 lets the grid track shrink below the card's min-content width
  // (the truncated title is nowrap, so its min-content is the full title);
  // without it the card pushes 90px of horizontal scroll at 360px.
  return (
    <article className="card flex min-w-0 flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-fg" title={title}>
            {title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-faint">
            {card.duration_seconds != null ? formatDuration(card.duration_seconds) : 'no duration'}
            {card.folder_name ? ` · ${card.folder_name}` : ''}
            {card.status !== 'transcribed' ? ` · ${videoStatusLabel(card.status)}` : ''}
          </p>
        </div>
        <Badge kind={card.badge} className="shrink-0" />
      </header>

      {/* Media: the video player once the bytes are on disk; a poster until then. */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            playsInline
            onPlay={(event) => claimPlayback(event.currentTarget)}
            onPause={(event) => releasePlayback(event.currentTarget)}
            onEnded={(event) => releasePlayback(event.currentTarget)}
            poster={card.thumbnail_url ?? undefined}
            className="aspect-video w-full bg-black object-contain"
          />
        ) : card.thumbnail_url ? (
          <button
            type="button"
            onClick={videoReady ? playVideo : undefined}
            disabled={!videoReady || videoLoading}
            aria-label={
              videoReady ? `Play ${title}` : `Video is not ready yet. Status: ${videoStatusLabel(card.status)}`
            }
            className="group relative block aspect-video w-full disabled:cursor-default"
          >
            <img
              src={card.thumbnail_url}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            {videoReady ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/90 text-white shadow-card transition-transform group-hover:scale-105">
                  {videoLoading ? <Spinner /> : <PlayIcon />}
                </span>
              </span>
            ) : null}
          </button>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center">
            {videoReady ? (
              <button
                type="button"
                onClick={playVideo}
                disabled={videoLoading}
                aria-label={`Play ${title}`}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-card transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/60"
              >
                {videoLoading ? <Spinner /> : <PlayIcon />}
              </button>
            ) : (
              <span className="text-xs text-faint">
                {driveOffline
                  ? "This unit's storage is offline — the contributor disconnected their drive."
                  : card.status === 'failed'
                    ? 'No media on disk.'
                    : `Video is still being prepared (${videoStatusLabel(card.status)}).`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Audio artifact. */}
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={videoLoading}
          aria-label={playing ? `Pause audio for ${title}` : `Play audio for ${title}`}
          title="Play audio"
          className="flex tap-pad p-2 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg transition hover:border-accent/50 disabled:opacity-40"
        >
          {playing ? <PauseIcon small /> : <PlayIcon small />}
        </button>
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
          <div className="flex flex-col gap-1">
            <p
              ref={transcriptRef}
              className={`whitespace-pre-wrap rounded-md border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-dim${
                expanded ? '' : ' line-clamp-6'
              }`}
            >
              {card.transcript_preview || (
                <span className="text-faint">No transcript yet — this unit is still processing.</span>
              )}
            </p>
            {overflowing || expanded ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="self-end rounded px-1 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/60"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </div>
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

function PlayIcon({ small }: { small?: boolean }) {
  return (
    <svg width={small ? 13 : 22} height={small ? 13 : 22} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />;
}

function PauseIcon({ small }: { small?: boolean }) {
  return (
    <svg width={small ? 13 : 22} height={small ? 13 : 22} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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