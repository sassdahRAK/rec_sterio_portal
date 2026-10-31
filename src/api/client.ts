/**
 * Typed fetch wrapper for the recsterio API.
 *
 * - Attaches `Authorization: Bearer <token>` when a session exists. A portal
 *   visitor is anonymous by default, which the API treats as a guest — public
 *   folders are readable without any token at all.
 * - Unwraps the frozen error envelope `{ error: { code, message, details } }`
 *   into an `ApiError`, so no raw payload or stack trace reaches the UI.
 * - Media and ZIP endpoints need the bearer token even for guests with a
 *   passcode or share link, so they are fetched as blobs rather than linked
 *   directly (a raw URL would 401 in an `<audio>` element).
 */
import { MockBlobError, mockBlob, mockRequest } from './mock';
import type {
  CloudProviders,
  CloudUpload,
  DatasetCardList,
  DriveLink,
  FolderComment,
  FolderSummary,
  GuestSession,
  GuestToken,
  LoginRequest,
  LoginResponse,
  PublicFolder,
  PublicFolderList,
  Transcript,
  Video,
  VideoDetail,
} from './types';

// Relative by default: the dev server proxies `/api` (vite.config.ts) and in
// production the portal is served from the same origin as the API. Set
// VITE_API_BASE_URL to an absolute URL only when the two are on different hosts.
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  '/api/v1';

/* ------------------------------------------------------------- mock toggle */

export const MOCK_STORAGE_KEY = 'recsterio.portal.mock';

/**
 * Demo mode: every request is answered from `api/mock.ts` with no network at
 * all. The same convention the admin console uses — open the portal with
 * `?mock=1` (persisted to localStorage) or set VITE_USE_MOCK=1.
 */
export function isMockEnabled(): boolean {
  if (String(import.meta.env.VITE_USE_MOCK ?? '') === '1') return true;
  try {
    return localStorage.getItem(MOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMockEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(MOCK_STORAGE_KEY, '1');
    else localStorage.removeItem(MOCK_STORAGE_KEY);
  } catch {
    /* storage unavailable — demo mode stays off */
  }
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Emitted when the API rejects our token so the app can drop the session. */
export const UNAUTHORIZED_EVENT = 'recsterio:portal-unauthorized';

let tokenProvider: () => string | null = () => null;

/** The auth store registers itself here so the client never imports the store. */
export function setTokenProvider(fn: () => string | null): void {
  tokenProvider = fn;
}

function currentToken(): string | null {
  try {
    return tokenProvider();
  } catch {
    return null;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function parseError(res: Response): Promise<never> {
  let code = 'request_failed';
  // A 5xx with no error envelope is almost always the dev proxy failing to
  // reach the API, so name that rather than just echoing the status.
  let message =
    res.status >= 500
      ? 'The API is not responding. Check that the backend is running.'
      : `Request failed (${res.status}).`;
  let details: unknown = null;
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
      detail?: unknown;
    };
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? null;
    } else if (body?.detail) {
      message = String(body.detail);
    }
  } catch {
    // Non-JSON error body: keep the status-derived message.
  }
  throw new ApiError(code, message, res.status, details);
}

/**
 * `authToken` overrides the session bearer for this one call. It is how the
 * bot's `?t=` single-video guest token authenticates without replacing the
 * visitor's own session: omit it to use the session (the default), or pass a
 * token string to scope just this request. A 401 on an overridden request does
 * not fire the session-expired event, because it was not the session that
 * failed — the guest link was.
 */
/* ---------------------------------------------------- GET dedupe/timeout */

/** Abort a GET that has not answered in this long. */
const GET_TIMEOUT_MS = 10_000;

/**
 * In-flight GETs, keyed by `method+url+bearer`. React StrictMode double-
 * invokes mount effects, so every page load issues two identical requests;
 * a second identical GET issued while one is pending joins the same promise
 * instead of hitting the network twice. The entry is removed as soon as the
 * request settles, so polls and retries still get fresh responses.
 */
const inflightGets = new Map<string, Promise<unknown>>();

async function request<T>(
  path: string,
  init: RequestInit = {},
  authToken?: string | null,
): Promise<T> {
  const sessionToken = currentToken();
  const token = authToken === undefined ? sessionToken : authToken;
  const tokenOverridden = authToken !== undefined && authToken !== sessionToken;
  if (isMockEnabled()) {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const result = mockRequest(init.method ?? 'GET', path, body, token);
    if (result.status >= 400) {
      const envelope = result.data as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      throw new ApiError(
        envelope?.error?.code ?? 'request_failed',
        envelope?.error?.message ?? `Request failed (${result.status}).`,
        result.status,
        envelope?.error?.details ?? null,
      );
    }
    return result.data as T;
  }
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = `${API_BASE}${path}`;
  const isGet = (init.method ?? 'GET') === 'GET';
  const key = `${url}::${token ?? ''}`;

  const run = async (): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GET_TIMEOUT_MS);
    const onCallerAbort = () => ctrl.abort();
    init.signal?.addEventListener('abort', onCallerAbort);
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    } catch (err) {
      if (ctrl.signal.aborted && !init.signal?.aborted) {
        throw new ApiError('timeout', 'The request timed out. Please try again.', 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onCallerAbort);
    }
    if (res.status === 401 && !tokenOverridden) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    if (!res.ok) return parseError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };

  if (!isGet) return run();

  const pending = inflightGets.get(key);
  if (pending) return pending as Promise<T>;
  const p = run().finally(() => inflightGets.delete(key));
  inflightGets.set(key, p);
  return p;
}

/**
 * Retry a first-load fetch a couple of times with backoff before the caller
 * shows its error state. Used for non-silent loads only — the auto-refresh
 * poll must not stack retries behind a slow backend.
 */
export async function retryGet<T>(
  run: () => Promise<T>,
  delaysMs: readonly number[] = [1000, 3000],
  shouldRetry: (err: unknown) => boolean = () => true,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      // A caller that knows the failure is terminal (e.g. a 401/403 on a
      // token-overridden request) opts out of the backoff instead of paying
      // the retry delays before showing the same error.
      if (!shouldRetry(err) || attempt >= delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      attempt += 1;
    }
  }
}

/* ------------------------------------------------------------------ public */

export const listPublicFolders = (): Promise<PublicFolderList> =>
  request<PublicFolderList>('/public/folders');

export const getPublicFolder = (folderId: string): Promise<PublicFolder> =>
  request<PublicFolder>(`/public/folders/${folderId}`);

export interface CardQuery {
  folder_id?: string;
  /** Exactly one unit — how the per-video page resolves its card. */
  video_id?: string;
  cleaned?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}

/**
 * The cards list. `token` is an optional per-call bearer — the bot's `?t=`
 * single-video guest token — and leaves the visitor's session untouched.
 */
export const listCards = (
  query: CardQuery = {},
  token?: string | null,
): Promise<DatasetCardList> =>
  request<DatasetCardList>(`/dataset/cards${qs(query as Query)}`, {}, token);

export const guestSession = (): Promise<GuestSession> =>
  request<GuestSession>('/auth/guest', { method: 'POST' });

/**
 * Redeem a passcode. The folder is identified by the id from a link or by the
 * name the visitor typed — never by a folder list, which would disclose how
 * many folders exist and what they are called.
 */
export const redeemPasscode = (
  code: string,
  deviceKey?: string,
  folder: { folderId?: string; folderName?: string } = {},
): Promise<GuestToken> =>
  request<GuestToken>('/public/passcodes/redeem', {
    method: 'POST',
    body: JSON.stringify({
      folder_id: folder.folderId,
      folder_name: folder.folderName,
      code,
      device_key: deviceKey,
    }),
  });

export const redeemShare = (token: string, deviceKey?: string): Promise<GuestToken> =>
  request<GuestToken>(`/public/shares/${token}/redeem`, {
    method: 'POST',
    body: JSON.stringify({ device_key: deviceKey }),
  });

export const publicConfig = (): Promise<{ google_client_id: string; google_enabled: boolean; guest_enabled: boolean }> =>
  request('/public/config');

/* ------------------------------------------------------------------- auth */

export const login = (payload: LoginRequest): Promise<LoginResponse> =>
  request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** Verify a Google Identity Services ID token with the backend (instruction.txt #2). */
export const googleLogin = (credential: string): Promise<LoginResponse> =>
  request<LoginResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });

/* ----------------------------------------------------------------- videos */

export interface CreateVideoRequest {
  source_url: string;
  title?: string | null;
  notes?: string | null;
  start_transcription?: boolean;
  folder_id?: string | null;
}

export const createVideo = (payload: CreateVideoRequest): Promise<Video> =>
  request<Video>('/videos', { method: 'POST', body: JSON.stringify(payload) });

export const getVideo = (videoId: string): Promise<VideoDetail> =>
  request<VideoDetail>(`/videos/${videoId}`);

export const deleteVideo = (videoId: string): Promise<void> =>
  request<void>(`/videos/${videoId}`, { method: 'DELETE' });

export const getTranscript = (videoId: string): Promise<Transcript> =>
  request<Transcript>(`/videos/${videoId}/transcript`);

export const putTranscript = (
  videoId: string,
  body: { content: string; segments?: Transcript['segments']; language?: string; cleaned?: boolean },
): Promise<Transcript> =>
  request<Transcript>(`/videos/${videoId}/transcript`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const markCleaned = (videoId: string, cleaned: boolean): Promise<Transcript> =>
  request<Transcript>(`/videos/${videoId}/transcript`, {
    method: 'PATCH',
    body: JSON.stringify({ cleaned }),
  });

export const generateTranscript = (
  videoId: string,
  engine: 'whisper' | 'gemini' | 'both' = 'whisper',
): Promise<{ jobs: { id: string; kind: string; status: string }[] }> =>
  request(`/videos/${videoId}/transcript/generate`, {
    method: 'POST',
    body: JSON.stringify({ engine }),
  });

export const listFolderTranscripts = (
  folderId: string,
): Promise<{ folder_id: string; videos: { video_id: string; title: string | null; status: string; transcripts: { id: string; version: number; source: string; cleaned: boolean }[] }[] }> =>
  request(`/folders/${folderId}/transcripts`);

export const listComments = (folderId: string): Promise<{ items: FolderComment[] }> =>
  request(`/folders/${folderId}/comments`);

export const addComment = (folderId: string, body: string): Promise<FolderComment> =>
  request<FolderComment>(`/folders/${folderId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

export const listFolders = (): Promise<{ items: FolderSummary[]; total: number }> =>
  request('/folders');

/* ------------------------------------------------------- personal cloud */

export const cloudProviders = (): Promise<CloudProviders> => request('/cloud/providers');

export const listDriveLinks = (): Promise<DriveLink[]> => request('/cloud/links');

export const connectDrive = (
  provider: string,
  code: string,
  redirectUri?: string,
): Promise<DriveLink> =>
  request<DriveLink>('/cloud/links', {
    method: 'POST',
    body: JSON.stringify({ provider, code, redirect_uri: redirectUri }),
  });

export const disconnectDrive = (provider: string): Promise<void> =>
  request<void>(`/cloud/links/${provider}`, { method: 'DELETE' });

export const startCloudUpload = (
  backend: string,
  filename?: string,
): Promise<CloudUpload> =>
  request<CloudUpload>('/cloud/uploads', {
    method: 'POST',
    body: JSON.stringify({ backend, filename }),
  });

export const completeCloudUpload = (
  videoId: string,
  providerFileId: string,
  meta?: { size?: number; checksum_sha256?: string },
): Promise<Video> =>
  request<Video>(`/cloud/uploads/${videoId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ provider_file_id: providerFileId, ...meta }),
  });

/* ------------------------------------------------------- binary / blobs */

/**
 * Fetch a file as a blob, attaching the bearer token. Used for the ZIP export
 * and for media that lives behind a passcode or share link.
 *
 * `authToken` overrides the session bearer for this one fetch — the same rule
 * as `request`: omit it to use the session, or pass the bot's single-video
 * `?t=` guest token so a logged-out visitor's media request authenticates
 * without touching (or requiring) a session.
 */
async function fetchBlob(path: string, authToken?: string | null): Promise<Blob> {
  const sessionToken = currentToken();
  const token = authToken === undefined ? sessionToken : authToken;
  if (isMockEnabled()) {
    try {
      return mockBlob(path, token);
    } catch (err) {
      if (err instanceof MockBlobError) {
        throw new ApiError(err.code, err.message, err.status);
      }
      throw err;
    }
  }
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) return parseError(res);
  return res.blob();
}

/** Trigger a browser download of a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has definitely been processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFolderZip(folderId: string, folderName: string): Promise<void> {
  const blob = await fetchBlob(`/public/folders/${folderId}/zip`);
  const safe = folderName.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'dataset';
  saveBlob(blob, `${safe}.zip`);
}

export async function downloadAudio(
  videoId: string,
  title?: string | null,
  authToken?: string | null,
): Promise<void> {
  const blob = await fetchBlob(`/videos/${videoId}/audio`, authToken);
  const safe = (title ?? 'audio').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'audio';
  saveBlob(blob, `${safe}.wav`);
}

/** The path every API route lives under, relative to the host. */
const API_PATH = '/api/v1';

/**
 * Media URLs come back from the API as full paths (`/api/v1/videos/{id}/audio`),
 * but `fetchBlob` and the streaming branch both want a base-relative one. Strip
 * the API prefix when it is there — otherwise the two get concatenated into
 * `/api/v1/api/v1/...` and the request 404s.
 *
 * Both shapes are handled the same way: an absolute URL keeps only its path,
 * and whichever prefix is present (the bare `/api/v1` of a same-origin
 * deployment, or an absolute `VITE_API_BASE_URL`) is removed. Matching on
 * `API_BASE` alone missed the second case, because a relative `/api/v1/...`
 * never begins with an absolute base.
 */
function toApiRelative(url: string): string {
  let path = url;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return url;
    }
  }
  for (const prefix of [API_BASE, API_PATH]) {
    if (prefix && path.startsWith(prefix)) return path.slice(prefix.length);
  }
  return path;
}

/**
 * A URL an `<audio>`/`<video>` element can actually play.
 *
 * With no token the URL is public and streams directly (so the browser can
 * range-request it). With a token — a passcode, a share link, or the bot's
 * `?t=` guest token passed as `authToken` — the request must carry the header,
 * so the bytes are fetched once as a blob. The caller owns revoking the
 * returned object URL.
 */
export async function playableMediaUrl(
  mediaUrl: string,
  authToken?: string | null,
): Promise<string> {
  const path = toApiRelative(mediaUrl);
  const sessionToken = currentToken();
  const token = authToken === undefined ? sessionToken : authToken;
  // Demo mode has no streamable origin: synthesize the audio as a blob so the
  // player, the seek bar and the duration all behave like the real thing.
  if (!token && !isMockEnabled()) return `${API_BASE}${path}`;
  const blob = await fetchBlob(path, authToken);
  return URL.createObjectURL(blob);
}
