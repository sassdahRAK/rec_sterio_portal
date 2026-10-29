/**
 * Wire types for the portal.
 *
 * Field names mirror `docs/API_CONTRACT.md` and the backend Pydantic schemas
 * exactly (snake_case). Nothing here invents a field the API does not return.
 */

export type Role = 'viewer' | 'commenter' | 'editor';
export type Badge = 'raw' | 'cleaned';
export type Visibility = 'public' | 'private';
export type CloudBackend = 'google' | 'onedrive';

export interface DataCard {
  video_id: string;
  title: string | null;
  source_url?: string | null;
  status: string;
  duration_seconds: number | null;
  thumbnail_url?: string | null;
  folder_id?: string | null;
  folder_name?: string | null;
  badge: Badge;
  transcript_id?: string | null;
  transcript_preview?: string | null;
  audio_available: boolean;
  media_url: string;
  audio_url: string;
  transcript_url: string;
  /** Where the bytes live; null means server disk. */
  storage_backend?: CloudBackend | null;
  /** False when a cloud drive is disconnected — the unit is listed but can't play. */
  storage_available?: boolean;
}

export interface DriveLink {
  id: string;
  provider: CloudBackend;
  account_email: string;
  connected_at: string;
}

export interface CloudProviders {
  google: boolean;
  onedrive: boolean;
}

export interface CloudUpload {
  video_id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_at?: string | null;
}

export interface PublicFolder {
  id: string;
  name: string;
  description?: string | null;
  visibility: Visibility;
  /** The caller's effective role, so the UI never guesses an edit permission. */
  my_role?: Role | null;
  cards: DataCard[];
  children: PublicFolder[];
}

export interface PublicFolderList {
  items: PublicFolder[];
  total: number;
}

export interface DatasetCardList {
  items: DataCard[];
  total: number;
  page: number;
  page_size: number;
}

export interface FolderSummary {
  id: string;
  name: string;
  description?: string | null;
  visibility: Visibility;
  owner_id: string;
  owner_email?: string | null;
  parent_id?: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  video_count: number;
  my_role?: Role | null;
  children: FolderSummary[];
}

export interface GuestToken {
  token: string;
  expires_at: string;
  folder_id: string;
  /** Always "guest" — the session kind. */
  role: 'guest';
  /** The permission the passcode or share link granted. */
  folder_role: Role;
  access: 'passcode' | 'share' | 'public';
  folder?: FolderSummary | null;
}

export interface GuestSession {
  token: string;
  role: 'guest';
  expires_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  email: string;
  expires_at: string;
  role: string;
  name?: string | null;
}

export interface ErrorDetail {
  field?: string;
  issue?: string;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[] | Record<string, unknown> | null;
  };
}

export interface Video {
  id: string;
  source_url: string;
  platform: string;
  title?: string | null;
  notes?: string | null;
  folder_id?: string | null;
  status: string;
  progress: number;
  error?: string | null;
  file_size?: number | null;
  duration_seconds?: number | null;
  mime_type?: string | null;
  thumbnail_url?: string | null;
  /** Present when the bytes live on the contributor's own cloud, not server disk. */
  storage_backend?: CloudBackend | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Transcript {
  id: string;
  video_id: string;
  version: number;
  source: string;
  language?: string | null;
  content: string;
  segments?: { start: number; end: number; text: string; language?: string | null }[] | null;
  status: string;
  cleaned: boolean;
  error?: string | null;
  created_by: string;
  created_at: string;
}

export interface VideoDetail extends Video {
  transcripts: Transcript[];
  jobs: { id: string; kind: string; status: string }[];
}

export interface ShareLink {
  id: string;
  folder_id: string;
  token: string;
  role: Role;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_by: string;
  created_at: string;
}

export interface FolderComment {
  id: string;
  folder_id: string;
  author_id?: string | null;
  author_label: string;
  body: string;
  created_at: string;
}
