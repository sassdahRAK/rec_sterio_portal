/** Shared status labels — keep portal and admin byte-identical. */

/**
 * The UI must never render a raw backend status enum. Each domain has its own
 * resolver — `videoStatusLabel()`, `jobStatusLabel()` and
 * `transcriptStatusLabel()` — plus `humanize()` for anything unknown. They are
 * separate because the enums overlap: `pending` is "Waiting to start" on a
 * video but "Pending" on a transcript, so a single flat lookup cannot serve
 * both. No React, no runtime imports: a new enum member is a one-line addition
 * to the matching map.
 */

/* ------------------------------------------------------------ unit / video */

/** `videos.status` and `DataCard.status` (API_CONTRACT.md §videos). */
export const VIDEO_STATUS_LABELS = {
  pending: 'Waiting to start',
  downloading: 'Downloading',
  downloaded: 'Downloaded',
  uploading: 'Uploading',
  transcribing: 'Transcribing',
  transcribed: 'Transcribed',
  failed: 'Failed',
  quarantined: 'Quarantined',
} as const satisfies Record<string, string>;

/* -------------------------------------------------------------------- jobs */

/** `jobs.status` — the worker queue lifecycle. */
export const JOB_STATUS_LABELS = {
  queued: 'Waiting to start',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  dead: 'Failed permanently',
} as const satisfies Record<string, string>;

/** `jobs.kind` — what the job does, phrased as the activity it performs. */
export const JOB_KIND_LABELS = {
  download: 'Downloading',
  extract_audio: 'Extracting audio',
  transcribe: 'Transcribing',
  gemini_transcribe: 'Gemini transcription',
  merge: 'Merging',
} as const satisfies Record<string, string>;

/* ------------------------------------------------------------- transcripts */

/** `transcripts.status` and `merges.status` share one vocabulary. */
export const TRANSCRIPT_STATUS_LABELS = {
  pending: 'Pending',
  running: 'Running',
  ready: 'Ready',
  failed: 'Failed',
} as const satisfies Record<string, string>;

/* ------------------------------------------------------------------ badges */

/** The Raw/Cleaned provenance badge on dataset cards. */
export const BADGE_LABELS = {
  raw: 'Raw',
  cleaned: 'Cleaned',
} as const satisfies Record<string, string>;

/* ----------------------------------------------------------------- sources */

/** `transcripts.source` — the provenance name people recognise. */
export const SOURCE_LABELS = {
  whisper: 'Whisper',
  gemini: 'Gemini',
  manual: 'Manual',
  merged: 'Merged',
} as const satisfies Record<string, string>;

/** `videos.status` → human words. Never `undefined`, never snake_case. */
export function videoStatusLabel(status: string): string {
  return VIDEO_STATUS_LABELS[status as keyof typeof VIDEO_STATUS_LABELS] ?? humanize(status);
}

/** `jobs.status` → human words. */
export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS] ?? humanize(status);
}

/** `transcripts.status` and `merges.status` → human words. */
export function transcriptStatusLabel(status: string): string {
  return TRANSCRIPT_STATUS_LABELS[status as keyof typeof TRANSCRIPT_STATUS_LABELS] ?? humanize(status);
}

/**
 * Deprecated: use the domain resolver for the row you are rendering.
 *
 * Kept for call sites that still pass a mixed status; it preserves the
 * historical video → job order so no existing label changes. It deliberately
 * does not consult the transcript map, whose `pending` means "Pending" rather
 * than "Waiting to start".
 */
export function statusLabel(status: string): string {
  return (
    VIDEO_STATUS_LABELS[status as keyof typeof VIDEO_STATUS_LABELS] ??
    JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS] ??
    humanize(status)
  );
}

/** `jobs.kind` → human words (`extract_audio` → "Extracting audio"). */
export function jobKindLabel(kind: string): string {
  return JOB_KIND_LABELS[kind as keyof typeof JOB_KIND_LABELS] ?? humanize(kind);
}

/** `badge` → human words (`raw` → "Raw"). */
export function badgeLabel(badge: string): string {
  return BADGE_LABELS[badge as keyof typeof BADGE_LABELS] ?? humanize(badge);
}

/** `transcripts.source` → human words (`whisper` → "Whisper"). */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] ?? source;
}

/** Last-resort fallback: `some_unknown_state` → "Some unknown state". */
function humanize(value: string): string {
  const words = value.trim().replace(/[_\-\s]+/g, ' ').toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unknown status';
}
