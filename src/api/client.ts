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
  DatasetCardList,
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
  let message = `Request failed (${res.status}).`;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = currentToken();
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

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) return parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ public */

export const listPublicFolders = (): Promise<PublicFolderList> =>
  request<PublicFolderList>('/public/folders');

export const getPublicFolder = (folderId: string): Promise<PublicFolder> =>
  request<PublicFolder>(`/public/folders/${folderId}`);

export interface CardQuery {
  folder_id?: string;
  cleaned?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}

export const listCards = (query: CardQuery = {}): Promise<DatasetCardList> =>
  request<DatasetCardList>(`/dataset/cards${qs(query as Query)}`);

export const guestSession = (): Promise<GuestSession> =>
  request<GuestSession>('/auth/guest', { method: 'POST' });

export const redeemPasscode = (
  folderId: string,
  code: string,
  deviceKey?: string,
): Promise<GuestToken> =>
  request<GuestToken>('/public/passcodes/redeem', {
    method: 'POST',
    body: JSON.stringify({ folder_id: folderId, code, device_key: deviceKey }),
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

/* ------------------------------------------------------- binary / blobs */

/**
 * Fetch a file as a blob, attaching the bearer token. Used for the ZIP export
 * and for media that lives behind a passcode or share link.
 */
async function fetchBlob(path: string): Promise<Blob> {
  const token = currentToken();
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

export async function downloadAudio(videoId: string, title?: string | null): Promise<void> {
  const blob = await fetchBlob(`/videos/${videoId}/audio`);
  const safe = (title ?? 'audio').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'audio';
  saveBlob(blob, `${safe}.wav`);
}

/**
 * Media URLs come back from the API as full paths (`/api/v1/videos/{id}/audio`),
 * but `fetchBlob` and the streaming branch both want a base-relative one. Strip
 * a leading base when it is there — otherwise the two get concatenated into
 * `/api/v1/api/v1/...` and the request 404s.
 */
function toApiRelative(url: string): string {
  return url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url;
}

/**
 * A URL an `<audio>`/`<video>` element can actually play.
 *
 * With no token the URL is public and streams directly (so the browser can
 * range-request it). With a token — a passcode or share link — the request
 * must carry the header, so the bytes are fetched once as a blob. The caller
 * owns revoking the returned object URL.
 */
export async function playableMediaUrl(mediaUrl: string): Promise<string> {
  const path = toApiRelative(mediaUrl);
  const token = currentToken();
  // Demo mode has no streamable origin: synthesize the audio as a blob so the
  // player, the seek bar and the duration all behave like the real thing.
  if (!token && !isMockEnabled()) return `${API_BASE}${path}`;
  const blob = await fetchBlob(path);
  return URL.createObjectURL(blob);
}
