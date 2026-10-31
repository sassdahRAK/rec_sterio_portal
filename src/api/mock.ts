/**
 * A small in-memory mock of the recsterio public API, used when the portal is
 * opened with `?mock=1` (or VITE_USE_MOCK=1) so every screen can be exercised
 * without the real backend — the same convention the admin console uses.
 *
 * Shapes mirror `docs/API_CONTRACT.md` exactly (snake_case, the error
 * envelope, the tri-state `cleaned` filter), and the media endpoints return
 * *generated* bytes rather than failing: audio playback synthesizes a short
 * WAV, and the ZIP export builds a real archive laid out like the backend's
 * (`<folder>/<unit>/{video,audio,transcript}`), so a capstone demo works
 * end-to-end offline.
 *
 * Demo entry points (all relative to the portal origin):
 *   /?mock=1                                  public dataset
 *   /passcode?folder=<private-id>&mock=1      passcode TVNA-2026
 *   /share/demo-viewer?mock=1                 share link, viewer role
 *   /share/demo-editor?mock=1                 share link, editor role (shows edit controls)
 *   /login                                    any valid email + 4+ char password
 */
import type {
  DataCard,
  DatasetCardList,
  FolderComment,
  FolderSummary,
  GuestSession,
  GuestToken,
  LoginResponse,
  PublicFolder,
  PublicFolderList,
  Role,
  Transcript,
  Video,
  VideoDetail,
} from './types';

const now = Date.now();
const iso = (offsetMs: number): string => new Date(now - offsetMs).toISOString();

const uid = (seed: number): string => {
  const hex = seed.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
};

/* --------------------------------------------------------------- folders */

interface MockFolder {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  parent_id: string | null;
  position: number;
}

const F1 = uid(0xf1);
const F2 = uid(0xf2);
const F3 = uid(0xf3);
const F4 = uid(0xf4);
const F5 = uid(0xf5);

/** Connected drives in demo mode; mutable so Connect/Disconnect visibly work. */
const mockDriveLinks: { id: string; provider: 'google' | 'onedrive'; account_email: string; connected_at: string }[] = [];

const mockFolders: MockFolder[] = [
  { id: F1, name: 'TvNa Phnom Penh: places', description: 'The public demo dataset: places around the capital, recorded and transcribed.', visibility: 'public', parent_id: null, position: 0 },
  { id: F2, name: 'Cafés & study spots', description: 'Laptop-friendly corners students actually work in.', visibility: 'public', parent_id: F1, position: 0 },
  { id: F3, name: 'Street & market', description: 'Food, noise and the real volume of the city.', visibility: 'public', parent_id: F1, position: 1 },
  { id: F4, name: 'Classroom & campus audio', description: null, visibility: 'public', parent_id: null, position: 1 },
  { id: F5, name: 'Reviewer set: not yet public', description: 'Unverified clips. Demo passcode: TVNA-2026', visibility: 'private', parent_id: null, position: 2 },
];

/* ---------------------------------------------------------------- videos */

interface MockVideo {
  id: string;
  source_url: string;
  platform: string;
  title: string | null;
  notes: string | null;
  folder_id: string | null;
  status: string;
  progress: number;
  error: string | null;
  duration_seconds: number | null;
  file_size: number | null;
  thumbnail_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const videoSeed: Array<Partial<MockVideo> & { seed: number }> = [
  {
    seed: 1, folder_id: F2, title: 'Six Mile Coffee: owner interview',
    source_url: 'https://www.youtube.com/watch?v=mock01', platform: 'youtube',
    status: 'transcribed', progress: 100, duration_seconds: 38.2, file_size: 8_412_001,
    created_at: iso(8_600_000),
  },
  {
    seed: 2, folder_id: F2, title: 'Brown Coffee study corner walk-through',
    source_url: 'https://www.tiktok.com/@tvcamodia/video/7312049881', platform: 'tiktok',
    status: 'transcribed', progress: 100, duration_seconds: 21.4, file_size: 4_120_332,
    created_at: iso(7_200_000),
  },
  {
    seed: 3, folder_id: F3, title: 'Orussey market: lunch stall banter',
    source_url: 'https://www.facebook.com/watch/?v=8823410291', platform: 'facebook',
    status: 'transcribed', progress: 100, duration_seconds: 47.8, file_size: 11_204_552,
    created_at: iso(5_400_000),
  },
  {
    seed: 4, folder_id: F3, title: 'Night market food reel: code-switching',
    source_url: 'https://www.instagram.com/reel/Cmock04/', platform: 'instagram',
    status: 'transcribed', progress: 100, duration_seconds: 15.9, file_size: 3_020_448,
    created_at: iso(3_600_000),
  },
  {
    seed: 5, folder_id: F4, title: 'RUCA study group: campus café',
    source_url: 'https://www.youtube.com/watch?v=mock05', platform: 'youtube',
    status: 'transcribed', progress: 100, duration_seconds: 62.5, file_size: 15_402_112,
    created_at: iso(2_400_000),
  },
  {
    seed: 6, folder_id: F1, title: 'Bridge Island coworking: afternoon',
    source_url: 'https://www.youtube.com/watch?v=mock06', platform: 'youtube',
    status: 'transcribed', progress: 100, duration_seconds: 29.1, file_size: 6_890_221,
    created_at: iso(1_200_000),
  },
  {
    seed: 7, folder_id: F3, title: 'Student hub interview: Diamond Island',
    source_url: 'https://www.tiktok.com/@phnompenhwalks/video/7312049882', platform: 'tiktok',
    status: 'transcribing', progress: 72, duration_seconds: 33.6, file_size: 7_120_880,
    created_at: iso(400_000),
  },
  {
    seed: 8, folder_id: F5, title: 'Unverified: rooftop bar price check',
    source_url: 'https://www.youtube.com/watch?v=mock08', platform: 'youtube',
    status: 'transcribed', progress: 100, duration_seconds: 12.2, file_size: 2_712_004,
    created_at: iso(900_000),
  },
];

let videos: MockVideo[] = videoSeed.map((seed) => ({
  id: uid(seed.seed),
  source_url: seed.source_url ?? 'https://example.invalid/clip.mp4',
  platform: seed.platform ?? 'direct',
  title: seed.title ?? null,
  notes: seed.notes ?? null,
  folder_id: seed.folder_id ?? null,
  status: seed.status ?? 'pending',
  progress: seed.progress ?? 0,
  error: seed.error ?? null,
  duration_seconds: seed.duration_seconds ?? null,
  file_size: seed.file_size ?? null,
  thumbnail_url: seed.thumbnail_url ?? null,
  created_by: 'admin:demo@recsterio.test',
  created_at: seed.created_at ?? iso(0),
  updated_at: seed.created_at ?? iso(0),
}));

/* ------------------------------------------------------------ transcripts */

interface Segment {
  start: number;
  end: number;
  text: string;
  language?: string | null;
}

interface MockTranscriptRow {
  id: string;
  video_id: string;
  version: number;
  source: string;
  language: string | null;
  content: string;
  segments: Segment[] | null;
  status: string;
  cleaned: boolean;
  created_by: string;
  created_at: string;
}

const seg = (start: number, end: number, language: string, text: string): Segment => ({
  start, end, language, text,
});

const flat = (segments: Segment[]): string =>
  segments.map((s) => `[${s.language}] ${s.text}`).join(' ');

function t(seed: number, video_id: string, version: number, cleaned: boolean,
           source: string, segments: Segment[]): MockTranscriptRow {
  return {
    id: uid(seed), video_id, version, source, language: null,
    content: flat(segments), segments, status: 'ready', cleaned,
    created_by: cleaned ? 'admin:demo@recsterio.test' : 'whisper:small',
    created_at: iso(600_000 - seed * 1000),
  };
}

let transcripts: MockTranscriptRow[] = [
  t(101, uid(1), 1, false, 'whisper', [
    seg(0, 4.2, 'km', 'សួស្តី! នេះគឺកាហ្វេ Six Mile នៅ BKK1។'),
    seg(4.2, 9.8, 'en', 'We opened in 2021 and students basically run the place.'),
    seg(9.8, 15.4, 'km', 'ភ្ញៀវភាគច្រើនមកអង្គេន ការងារ។'),
    seg(15.4, 21.2, 'en', 'The wifi holds up for video calls, which is rare here.'),
  ]),
  t(102, uid(2), 1, false, 'whisper', [
    seg(0, 5.1, 'en', 'This is the second floor. It is quiet after ten.'),
    seg(5.1, 11.6, 'km', 'កន្លែងអង្គេនស្អាត ប៉ុន្តែពេលថ្ងៃចន្ទ គេពេញ។'),
    seg(11.6, 16.0, 'en', 'Iced latte is thirty-five hundred riel.'),
  ]),
  t(103, uid(3), 1, false, 'whisper', [
    seg(0, 6.3, 'km', 'បងអើយ ម្ហូបអីពិសេសថ្ងៃនេះ?'),
    seg(6.3, 13.8, 'en', 'Try the bai cha. Ah sorry, the fish amok is fresh today.'),
    seg(13.8, 22.4, 'km', 'តម្លៃបួនរយរៀល ហើយមានបាយផង។'),
  ]),
  t(104, uid(4), 1, true, 'merged', [
    seg(0, 3.9, 'en', 'Night market, stall forty-two, skewers are the move.'),
    seg(3.9, 9.2, 'km', 'រាត្រីនេះអ្នកចម្រៀងផង នៅចុងផ្សារ។'),
    seg(9.2, 14.8, 'en', 'Come before nine or you will queue for an hour.'),
  ]),
  t(105, uid(5), 1, false, 'whisper', [
    seg(0, 7.4, 'en', 'We book the corner table every Monday after class.'),
    seg(7.4, 14.1, 'km', 'គ្រូបង្រៀនក៏មកអង្គេន ធ្វើការជាមួយនិស្សិត។'),
  ]),
  t(106, uid(6), 1, true, 'manual', [
    seg(0, 5.6, 'en', 'Two power sockets per table. That is the whole review.'),
    seg(5.6, 12.8, 'km', 'តែស្ករត្នោតអรសណាស់ តម្លៃសមរម្យ។'),
    seg(12.8, 18.4, 'en', 'And the staff will not kick you out at closing time.'),
  ]),
  t(108, uid(8), 1, false, 'whisper', [
    seg(0, 5.9, 'en', 'Cocktails are nine dollars, coffee six. Rooftop over the river.'),
    seg(5.9, 11.0, 'km', 'ទេសភាពល្អ ប៉ុន្តែតម្លៃខ្ពស់សម្រាប់និស្សិត។'),
  ]),
];

/* ------------------------------------------------------------- comments */

let comments: FolderComment[] = [
  {
    id: uid(201), folder_id: F1, author_id: null,
    author_label: 'user:sokha@test.local',
    body: 'Transcript 3 has one number wrong (four hundred, not four thousand riel). Flagged for cleaning.',
    created_at: iso(2_000_000),
  },
];

/* -------------------------------------------------- mock auth / sessions */

/** token -> the folder it unlocks, and the role the door granted. */
const guestTokens = new Map<string, { folderId: string; role: Role }>();
const ADMIN_TOKEN = 'mock.session.admin@recsterio.test';

function isSignedInToken(token: string | null): boolean {
  return !!token && token.startsWith('mock.session.');
}

function unlockedFolders(token: string | null): Set<string> {
  const set = new Set<string>();
  if (!token) return set;
  const guest = guestTokens.get(token);
  if (guest) set.add(guest.folderId);
  return set;
}

function canSee(folder: MockFolder, token: string | null): boolean {
  if (folder.visibility === 'public') return true;
  if (isSignedInToken(token)) return true;
  return unlockedFolders(token).has(folder.id);
}

function roleFor(token: string | null, folderId: string): Role {
  if (isSignedInToken(token)) return 'editor';
  const guest = token ? guestTokens.get(token) : undefined;
  if (guest && guest.folderId === folderId) return guest.role;
  return 'viewer';
}

/* --------------------------------------------------------------- builders */

function currentTranscript(videoId: string): MockTranscriptRow | null {
  const rows = transcripts
    .filter((row) => row.video_id === videoId && row.status === 'ready')
    .sort((a, b) => b.version - a.version);
  return rows[0] ?? null;
}

function cardFor(video: MockVideo): DataCard {
  const transcript = currentTranscript(video.id);
  const folder = mockFolders.find((item) => item.id === video.folder_id) ?? null;
  return {
    video_id: video.id,
    title: video.title,
    source_url: video.source_url,
    status: video.status,
    progress: video.progress,
    error: video.error,
    duration_seconds: video.duration_seconds,
    thumbnail_url: video.thumbnail_url,
    folder_id: video.folder_id,
    folder_name: folder?.name ?? null,
    badge: transcript?.cleaned ? 'cleaned' : 'raw',
    transcript_id: transcript?.id ?? null,
    transcript_preview: transcript?.content ? transcript.content.slice(0, 240) : null,
    audio_available: video.status === 'transcribed',
    media_url: `/api/v1/videos/${video.id}/media`,
    audio_url: `/api/v1/videos/${video.id}/audio`,
    transcript_url: `/api/v1/videos/${video.id}/transcript`,
  };
}

function publicFolderNode(folder: MockFolder, token: string | null): PublicFolder {
  const children = mockFolders
    .filter((item) => item.parent_id === folder.id && canSee(item, token))
    .sort((a, b) => a.position - b.position)
    .map((child) => publicFolderNode(child, token));
  const cards = videos
    .filter((video) => video.folder_id === folder.id)
    .map(cardFor);
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    visibility: folder.visibility,
    my_role: roleFor(token, folder.id),
    cards,
    children,
  };
}

function folderSummaryNode(folder: MockFolder, token: string | null): FolderSummary {
  const stamp = iso(0);
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    visibility: folder.visibility,
    owner_id: uid(0xa1),
    owner_email: 'demo@recsterio.test',
    parent_id: folder.parent_id,
    position: folder.position,
    created_at: stamp,
    updated_at: stamp,
    video_count: videos.filter((video) => video.folder_id === folder.id).length,
    my_role: roleFor(token, folder.id),
    children: mockFolders
      .filter((child) => child.parent_id === folder.id && canSee(child, token))
      .sort((a, b) => a.position - b.position)
      .map((child) => folderSummaryNode(child, token)),
  };
}

function transcriptOut(row: MockTranscriptRow): Transcript {
  return { ...row };
}

/* ------------------------------------------------------- generated audio */

/**
 * A short, deterministic melody rendered as 16 kHz mono PCM in a WAV header.
 * Seeded from the video id so the same card always "sounds" the same and the
 * `<audio>` element can play it and report a real duration. Sync, so the ZIP
 * builder can embed the bytes too.
 */
export function mockAudioBytes(videoId: string, seconds = 4): Uint8Array {
  const rate = 16_000;
  const scale = [392, 440, 494, 587, 659]; // G A B D E — pentatonic-ish
  let seed = 7;
  for (const ch of videoId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const frames = Math.floor(rate * seconds);
  const pcm = new DataView(new ArrayBuffer(44 + frames * 2));

  const write = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) pcm.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  pcm.setUint32(4, 36 + frames * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true); // PCM
  pcm.setUint16(22, 1, true); // mono
  pcm.setUint32(24, rate, true);
  pcm.setUint32(28, rate * 2, true);
  pcm.setUint16(32, 2, true);
  pcm.setUint16(34, 16, true);
  write(36, 'data');
  pcm.setUint32(40, frames * 2, true);

  for (let i = 0; i < frames; i += 1) {
    const step = Math.floor((i / rate) * 3.2); // note every ~0.31 s
    const freq = scale[(seed + step) % scale.length];
    const t = i / rate;
    const env = Math.exp(-((t % 0.3125) * 3.4)) * 0.6 + 0.08;
    const sample = Math.sin(2 * Math.PI * freq * t) * env;
    pcm.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32_000, true);
  }
  return new Uint8Array(pcm.buffer as ArrayBuffer);
}

export function mockAudioBlob(videoId: string, seconds = 4): Blob {
  return new Blob([mockAudioBytes(videoId, seconds).buffer as ArrayBuffer], {
    type: 'audio/wav',
  });
}

/* --------------------------------------------------------- generated ZIP */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A valid STORE-only archive. `entries` must have unique names. */
function buildZip(entries: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    // The local header is exactly 30 bytes; the name and data are separate
    // parts appended after it. Allocating 30+name.length here would insert
    // zero padding between the header and the name and corrupt the archive.
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    // Bit 11 (0x0800) marks the name as UTF-8. Without it every tool decodes
    // non-ASCII names as CP437, so "Cafés" extracts as "Caf+?s" and macOS
    // refuses the entry outright ("Illegal byte sequence").
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, entry.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true); // UTF-8 name, matching the local header
    dir.setUint32(16, crc, true);
    dir.setUint32(20, entry.data.length, true);
    dir.setUint32(24, entry.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + entry.data.length; // local header + name + data
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts: ArrayBuffer[] = [];
  for (const chunk of [...chunks, ...central, new Uint8Array(end.buffer as ArrayBuffer)]) {
    parts.push(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
  }
  return new Blob(parts, { type: 'application/zip' },
  );
}

function safeName(name: string, fallback: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/g, '');
  return cleaned.slice(0, 120) || fallback;
}

/**
 * The folder subtree as an archive, laid out like the backend's ZIP export.
 * Visibility is checked by the caller (`mockBlob`), not here.
 */
export function mockZipBlob(folderId: string): Blob {
  const root = mockFolders.find((folder) => folder.id === folderId);
  if (!root) {
    throw new MockBlobError('not_found', 'Folder not found.', 404);
  }
  const text = new TextEncoder();
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  const rootName = safeName(root.name, root.id.slice(0, 8));

  entries.push({
    name: `${rootName}/README.txt`,
    data: text.encode(
      'recsterio demo export. Generated in the browser with ?mock=1.\n' +
      'Audio is a synthesized tone; there are no video bytes in demo data.\n' +
      'The folder layout mirrors the real export: <folder>/<unit>/{video,audio,transcript}.\n',
    ),
  });

  const walk = (folder: MockFolder, prefix: string): void => {
    for (const video of videos.filter((item) => item.folder_id === folder.id)) {
      const unit = `${safeName(video.title ?? 'clip', video.id.slice(0, 8))}-${video.id.slice(0, 8)}`;
      const base = `${prefix}/${unit}`;
      const transcript = currentTranscript(video.id);
      entries.push({
        name: `${base}/audio/audio.wav`,
        data: mockAudioBytes(video.id, 1.5),
      });
      entries.push({
        name: `${base}/transcript/${unit}.txt`,
        data: text.encode(transcript ? transcript.content : '(no transcript yet)\n'),
      });
      entries.push({
        name: `${base}/video/media.note.txt`,
        data: text.encode(
          `demo archive: media bytes (${video.source_url}) are not included.\n`,
        ),
      });
    }
    for (const child of mockFolders.filter((item) => item.parent_id === folder.id)) {
      walk(child, `${prefix}/${safeName(child.name, child.id.slice(0, 8))}`);
    }
  };
  walk(root, rootName);
  return buildZip(entries);
}

/* ------------------------------------------------------------- the router */

export interface MockResponse {
  status: number;
  data: unknown;
}

const err = (status: number, code: string, message: string): MockResponse => ({
  status,
  data: { error: { code, message, details: null } },
});

/**
 * Routes a mock request. `path` is relative to the API base, e.g.
 * "/dataset/cards?page=1". `token` is the bearer the real request would carry.
 */
export function mockRequest(
  method: string,
  path: string,
  body: unknown,
  token: string | null,
): MockResponse {
  const [rawPath, rawQuery = ''] = path.split('?');
  const query = new URLSearchParams(rawQuery);
  const segments = rawPath.split('/').filter(Boolean);
  const json = <T>(value: T): MockResponse => ({ status: 200, data: value });

  /* ------------------------------------------------------------------ config */
  if (rawPath === '/public/config' && method === 'GET') {
    return json({ google_client_id: '', google_enabled: false, guest_enabled: true });
  }
  if (rawPath === '/auth/guest' && method === 'POST') {
    const res: GuestSession = {
      token: 'mock.guest.anon', role: 'guest',
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    };
    return json(res);
  }
  if (rawPath === '/auth/login' && method === 'POST') {
    const creds = (body ?? {}) as { email?: string; password?: string };
    if (!creds.email?.includes('@') || (creds.password ?? '').length < 4) {
      return err(401, 'invalid_credentials', 'That email and password combination was not recognised.');
    }
    const res: LoginResponse = {
      token: ADMIN_TOKEN,
      email: creds.email,
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      // Any sign-in gets the full operator view: the demo data is public.
      role: 'admin',
      name: 'Demo operator',
    };
    return json(res);
  }
  if (rawPath === '/auth/google' && method === 'POST') {
    return err(400, 'google_disabled', 'Google sign-in is not configured in demo mode.');
  }

  /* ----------------------------------------------------------------- public */
  if (rawPath === '/public/folders' && method === 'GET') {
    const roots = mockFolders
      .filter((folder) => folder.parent_id === null && canSee(folder, token))
      .sort((a, b) => a.position - b.position)
      .map((folder) => publicFolderNode(folder, token));
    const res: PublicFolderList = { items: roots, total: roots.length };
    return json(res);
  }
  if (segments[0] === 'public' && segments[1] === 'folders' && segments[2] && method === 'GET') {
    const folder = mockFolders.find((item) => item.id === segments[2]);
    if (!folder || !canSee(folder, token)) {
      return err(404, 'not_found', 'Folder not found. It may be private. Sign in or unlock it with a passcode.');
    }
    return json(publicFolderNode(folder, token));
  }
  if (rawPath === '/public/passcodes/redeem' && method === 'POST') {
    const payload = (body ?? {}) as { folder_id?: string; folder_name?: string; code?: string };
    // Mirrors the real API: a link names the folder by id, a visitor by name.
    const wanted = payload.folder_name?.trim().toLowerCase();
    const folder = mockFolders.find(
      (item) =>
        (payload.folder_id ? item.id === payload.folder_id : true) &&
        (wanted ? item.name.toLowerCase() === wanted : true),
    );
    // Only F5 has a passcode; every other answer is the uniform 401 the real
    // API gives, so a demo visitor learns nothing about folders that do not
    // match the code.
    if (!folder || folder.id !== F5 || payload.code?.trim().toUpperCase() !== 'TVNA-2026') {
      return err(401, 'unauthorized', 'That passcode is not valid.');
    }
    const mockToken = `mock.guest.${folder.id}.${Date.now().toString(36)}`;
    guestTokens.set(mockToken, { folderId: folder.id, role: 'viewer' });
    const res: GuestToken = {
      token: mockToken,
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      folder_id: folder.id,
      role: 'guest',
      folder_role: 'viewer',
      access: 'passcode',
    };
    return json(res);
  }
  if (segments[0] === 'public' && segments[1] === 'shares' && segments[3] === 'redeem' && method === 'POST') {
    const shareRole: Record<string, Role> = {
      'demo-viewer': 'viewer',
      'demo-editor': 'editor',
    };
    const role = shareRole[segments[2]];
    if (!role) return err(404, 'not_found', 'This share link is not valid.');
    const folderId = F5;
    const mockToken = `mock.guest.${folderId}.${Date.now().toString(36)}`;
    guestTokens.set(mockToken, { folderId, role });
    const res: GuestToken = {
      token: mockToken,
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      folder_id: folderId,
      role: 'guest',
      folder_role: role,
      access: 'share',
    };
    return json(res);
  }

  /* ------------------------------------------------------------------ cards */
  if (rawPath === '/dataset/cards' && method === 'GET') {
    const folderId = query.get('folder_id');
    const videoId = query.get('video_id');
    const cleanedParam = query.get('cleaned');
    const q = (query.get('q') ?? '').toLowerCase();
    const page = Math.max(1, Number(query.get('page') ?? 1) || 1);
    const pageSize = Math.max(1, Number(query.get('page_size') ?? 20) || 20);

    let visible = videos.filter((video) => {
      const folder = mockFolders.find((item) => item.id === video.folder_id);
      return folder ? canSee(folder, token) : false;
    });
    if (folderId) visible = visible.filter((video) => video.folder_id === folderId);
    if (videoId) visible = visible.filter((video) => video.id === videoId);
    if (q) {
      visible = visible.filter(
        (video) =>
          (video.title ?? '').toLowerCase().includes(q) ||
          video.source_url.toLowerCase().includes(q),
      );
    }
    let cards = visible.map(cardFor);
    if (cleanedParam === 'true' || cleanedParam === 'false') {
      const want = cleanedParam === 'true';
      cards = cards.filter((card) => (card.badge === 'cleaned') === want);
    }
    const res: DatasetCardList = {
      items: cards.slice((page - 1) * pageSize, page * pageSize),
      total: cards.length,
      page,
      page_size: pageSize,
    };
    return json(res);
  }

  /* --------------------------------------------------------- personal cloud */
  // Demo mode offers Google Drive only, and "connecting" just records a link
  // for the session so the Settings page has something real to render.
  if (rawPath === '/cloud/providers' && method === 'GET') {
    return json({ google: true, onedrive: false });
  }
  if (rawPath === '/cloud/links' && method === 'GET') {
    return json(mockDriveLinks);
  }
  if (rawPath === '/cloud/links' && method === 'POST') {
    const payload = (body ?? {}) as { provider?: string };
    const link = {
      id: `mock-drive-${mockDriveLinks.length + 1}`,
      provider: (payload.provider ?? 'google') as 'google' | 'onedrive',
      account_email: 'demo@gmail.com',
      connected_at: new Date().toISOString(),
    };
    mockDriveLinks.push(link);
    return json(link);
  }
  if (segments[0] === 'cloud' && segments[1] === 'links' && segments[2] && method === 'DELETE') {
    const index = mockDriveLinks.findIndex((l) => l.provider === segments[2]);
    if (index >= 0) mockDriveLinks.splice(index, 1);
    return { status: 204, data: undefined };
  }

  /* ---------------------------------------------------------------- folders */
  if (rawPath === '/folders' && method === 'GET') {
    const roots = mockFolders
      .filter((folder) => folder.parent_id === null && canSee(folder, token))
      .sort((a, b) => a.position - b.position)
      .map((folder) => folderSummaryNode(folder, token));
    return json({ items: roots, total: roots.length });
  }
  if (segments[0] === 'folders' && segments[1] && segments[2] === 'comments') {
    const folderId = segments[1];
    if (method === 'GET') {
      return json({ items: comments.filter((row) => row.folder_id === folderId) });
    }
    if (method === 'POST') {
      const payload = (body ?? {}) as { body?: string };
      if (!payload.body?.trim()) return err(422, 'validation_failed', 'A comment cannot be empty.');
      const row: FolderComment = {
        id: uid(300 + comments.length),
        folder_id: folderId,
        author_id: null,
        author_label: token?.startsWith('mock.session.') ? 'admin:demo@recsterio.test' : 'guest:demo-device',
        body: payload.body.trim(),
        created_at: new Date().toISOString(),
      };
      comments.push(row);
      return { status: 201, data: row };
    }
  }
  if (segments[0] === 'folders' && segments[1] && segments[2] === 'transcripts' && method === 'GET') {
    const rows = videos
      .filter((video) => video.folder_id === segments[1])
      .map((video) => ({
        video_id: video.id,
        title: video.title,
        status: video.status,
        transcripts: transcripts
          .filter((row) => row.video_id === video.id)
          .sort((a, b) => b.version - a.version)
          .map((row) => ({ id: row.id, version: row.version, source: row.source, cleaned: row.cleaned })),
      }));
    return json({ folder_id: segments[1], videos: rows });
  }

  /* ----------------------------------------------------------------- videos */
  if (rawPath === '/videos' && method === 'POST') {
    const payload = (body ?? {}) as { source_url?: string; title?: string; folder_id?: string };
    if (!payload.source_url) return err(422, 'validation_failed', 'source_url is required.');
    const created: MockVideo = {
      id: uid(400 + videos.length),
      source_url: payload.source_url,
      platform: 'direct',
      title: payload.title ?? `Scraped ${new Date().toLocaleTimeString()}`,
      notes: null,
      folder_id: payload.folder_id ?? F1,
      status: 'downloading',
      progress: 4,
      error: null,
      duration_seconds: 18.4,
      file_size: 4_100_000,
      thumbnail_url: null,
      created_by: 'admin:demo@recsterio.test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    videos.push(created);
    scrapePolls.set(created.id, 0);
    return { status: 201, data: created };
  }
  if (segments[0] === 'videos' && segments[1]) {
    const videoId = segments[1];
    const video = videos.find((item) => item.id === videoId);
    if (!video) return err(404, 'not_found', 'Video not found.');
    const action = segments[2];

    if (!action && method === 'GET') {
      advanceScrape(video);
      const res: VideoDetail = {
        ...(video as Video),
        transcripts: transcripts
          .filter((row) => row.video_id === video.id)
          .sort((a, b) => b.version - a.version)
          .map(transcriptOut),
        jobs: [],
      };
      return json(res);
    }
    if (!action && method === 'DELETE') {
      videos = videos.filter((item) => item.id !== video.id);
      transcripts = transcripts.filter((row) => row.video_id !== video.id);
      return { status: 204, data: null };
    }
    if (action === 'transcript' && !segments[3] && method === 'GET') {
      const row = currentTranscript(video.id);
      if (!row) return err(404, 'not_found', 'This video has no transcript yet.');
      return json(transcriptOut(row));
    }
    if (action === 'transcript' && !segments[3] && method === 'PUT') {
      const payload = (body ?? {}) as { content?: string; segments?: Segment[] | null; language?: string | null; cleaned?: boolean };
      if (!payload.content?.trim()) return err(422, 'validation_failed', 'Transcript content cannot be empty.');
      const nextVersion =
        Math.max(0, ...transcripts.filter((row) => row.video_id === video.id).map((row) => row.version)) + 1;
      const row: MockTranscriptRow = {
        id: uid(500 + transcripts.length),
        video_id: video.id,
        version: nextVersion,
        source: 'manual',
        language: payload.language ?? null,
        content: payload.content.trim(),
        segments: payload.segments ?? null,
        status: 'ready',
        cleaned: payload.cleaned ?? true,
        created_by: 'admin:demo@recsterio.test',
        created_at: new Date().toISOString(),
      };
      transcripts.push(row);
      video.status = 'transcribed';
      return { status: 201, data: transcriptOut(row) };
    }
    if (action === 'transcript' && !segments[3] && method === 'PATCH') {
      const payload = (body ?? {}) as { cleaned?: boolean };
      const row = currentTranscript(video.id);
      if (!row) return err(404, 'not_found', 'This video has no transcript yet.');
      row.cleaned = payload.cleaned ?? row.cleaned;
      return json(transcriptOut(row));
    }
    if (action === 'transcript' && segments[3] === 'generate' && method === 'POST') {
      video.status = 'transcribing';
      video.progress = 40;
      scrapePolls.set(video.id, Math.max(scrapePolls.get(video.id) ?? 0, 2));
      return { status: 202, data: { jobs: [{ id: uid(600), kind: 'transcribe', status: 'queued' }] } };
    }
    if (action === 'media' || action === 'audio') {
      // Binary endpoints are served by `mockBlob`, not through the JSON router.
      return err(404, 'not_found', 'Use the blob endpoint for media.');
    }
  }

  return err(404, 'not_found', `No demo route for ${method} ${rawPath}.`);
}

/* ----------------------------------------------------- scrape simulation */

const scrapePolls = new Map<string, number>();

/** A scraped clip walks downloading -> transcribing -> transcribed as it polls. */
function advanceScrape(video: MockVideo): void {
  if (!scrapePolls.has(video.id)) return;
  const polls = (scrapePolls.get(video.id) ?? 0) + 1;
  scrapePolls.set(video.id, polls);
  if (polls <= 2) {
    video.status = 'downloading';
    video.progress = Math.min(95, 20 + polls * 30);
  } else if (polls <= 4) {
    video.status = 'transcribing';
    video.progress = 60 + (polls - 2) * 15;
  } else {
    video.status = 'transcribed';
    video.progress = 100;
    scrapePolls.delete(video.id);
    if (!currentTranscript(video.id)) {
      const segments = [
        seg(0, 6.2, 'km', 'កំណត់ត្រាសាកល្បង ពីការទាញយក។'),
        seg(6.2, 12.8, 'en', 'This clip was ingested and transcribed inside the demo.'),
      ];
      transcripts.push(
        t(700 + transcripts.length, video.id, 1, false, 'whisper', segments),
      );
    }
  }
}

/* ------------------------------------------------------------ blob router */

/**
 * Raised by the mock blob router. The client converts it into an `ApiError` so
 * the UI cannot tell a demo miss from a real 404 — and so mock.ts never imports
 * client.ts (which imports this module, a cycle otherwise).
 */
export class MockBlobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MockBlobError';
  }
}

/**
 * Binary endpoints: media/audio streaming and the ZIP export. Called from
 * `fetchBlob` when demo mode is on.
 */
export function mockBlob(path: string, token: string | null): Blob {
  const segments = path.split('?')[0].split('/').filter(Boolean);

  if (segments[0] === 'videos' && segments[2] === 'audio') {
    const video = videos.find((item) => item.id === segments[1]);
    if (!video) {
      throw new MockBlobError('not_found', 'Media is not available yet for this video.', 404);
    }
    if (video.status !== 'transcribed') {
      throw new MockBlobError('not_found', 'The audio for this clip is still processing.', 404);
    }
    return mockAudioBlob(video.id);
  }
  if (segments[0] === 'public' && segments[1] === 'folders' && segments[3] === 'zip') {
    const folder = mockFolders.find((item) => item.id === segments[2]);
    if (!folder || !canSee(folder, token)) {
      throw new MockBlobError('not_found', 'This folder is not available in demo data.', 404);
    }
    return mockZipBlob(folder.id);
  }
  if (segments[0] === 'folders' && segments[2] === 'download') {
    const folder = mockFolders.find((item) => item.id === segments[1]);
    if (!folder || !canSee(folder, token)) {
      throw new MockBlobError('not_found', 'This folder is not available in demo data.', 404);
    }
    return mockZipBlob(folder.id);
  }
  throw new MockBlobError('not_found', 'This file is not available in demo data.', 404);
}
