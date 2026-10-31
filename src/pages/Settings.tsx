import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  cloudProviders,
  connectDrive,
  disconnectDrive,
  listDriveLinks,
  publicConfig,
} from '../api/client';
import type { CloudBackend, CloudProviders, DriveLink } from '../api/types';
import { useIsSignedIn, useSession } from '../store/auth';
import ConfirmDialog from '../components/ConfirmDialog';
import Spinner from '../components/Spinner';
import {
  btnDanger,
  btnNeutral,
  btnPrimary,
  inputCls,
  labelCls,
} from '../components/ui';

/**
 * Settings (instruction.txt #2, #4).
 *
 * One surface today: connecting a personal cloud (Google Drive / OneDrive) so
 * a contributor can keep their own video bytes on their own storage instead of
 * the server disk. The per-upload choice to use it lives on the Scrape page's
 * upload dialog; this page only manages the connection.
 *
 * The OAuth handshake: clicking Connect remembers the provider in sessionStorage
 * (`recsterio.cloud.pending`) and opens the provider consent screen in a new
 * tab. The provider sends that tab back to /settings?code=… (it never echoes a
 * `provider` param, which is why the pending key exists); on landing we
 * exchange the code and strip every provider param from the URL so a reload
 * does not reuse it. If the popup never lands here (blocked, or the user
 * authorized on another device) the "Paste the link" dialog closes the loop:
 * the user pastes the address-bar URL (or just the code) and we exchange it.
 */

const PENDING_KEY = 'recsterio.cloud.pending';

/** Cross-tab signal: one tab completed the handshake, every other tab should
 * re-read /cloud/links. `storage` events only fire in *other* tabs, which is
 * exactly the direction we need. */
const CONNECTED_SIGNAL_KEY = 'recsterio.cloud.connected';

/** (provider, code) pairs already exchanged this page lifecycle. OAuth codes
 * are single-use, so deduping is semantically correct — and it keeps the
 * StrictMode dev double-mount from POSTing the same code twice (the second
 * POST would fail `cloud_auth_rejected` and flash a spurious error strip
 * after an otherwise successful connect). Module scope survives the remount;
 * a useRef would not. Cleared naturally on full page reload. */
const exchangedCodes = new Set<string>();

/** One shared constant — the consent URL and the exchange POST body must send
 * the byte-identical redirect_uri or the provider rejects the token call. */
function cloudRedirectUri(): string {
  return `${window.location.origin}/settings`;
}

/** Provider/auth params to scrub from the URL after the handshake, whatever
 * the provider happened to append (Google: scope/authuser/prompt/hd,
 * Microsoft: session_state, plus our own leftovers). */
const PROVIDER_PARAMS = [
  'provider',
  'code',
  'scope',
  'state',
  'session_state',
  'authuser',
  'prompt',
  'hd',
  'error',
  'error_description',
];

function scrubProviderParams(): void {
  const search = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of PROVIDER_PARAMS) {
    if (search.has(key)) {
      search.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const qs = search.toString();
  history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
}

function readPending(): CloudBackend | null {
  const v = sessionStorage.getItem(PENDING_KEY);
  return v === 'google' || v === 'onedrive' ? v : null;
}

const providerLabel = (p: CloudBackend): string => (p === 'google' ? 'Google Drive' : 'OneDrive');

/**
 * Map a failed code exchange onto a sentence the contributor can act on.
 * Shared by the landing handler and the paste dialog.
 */
function cloudErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'cloud_auth_rejected') {
      return 'That authorization link was already used or has expired. Start Connect again.';
    }
    if (err.code === 'provider_not_configured') {
      return "This provider isn't configured on the server. Ask the operator.";
    }
    if (err.code === 'cloud_token_key_required') {
      return "The server can't store drive tokens securely yet. Ask the operator to set CLOUD_TOKEN_KEY.";
    }
    if (err.code === 'upstream_error') {
      return 'The provider rejected the handshake. Start Connect again. If it repeats, ask the operator.';
    }
    const details = Array.isArray(err.details)
      ? (err.details as { field?: string; issue?: string }[])
      : [];
    if (
      err.code === 'validation_failed' &&
      details.some((d) => d.field === 'redirect_uri' && d.issue === 'foreign_origin')
    ) {
      return "That link doesn't match this site. Paste the full URL from the address bar after you authorized.";
    }
    const issue = details[0]?.issue;
    return issue ? `${err.message} (${issue})` : err.message;
  }
  return 'Could not reach the server. Check your connection and try again.';
}

/**
 * Pull an authorization code out of what the user pasted: a full address-bar
 * URL (anything containing `code=`), a bare query string, or the raw code.
 */
function extractAuthCode(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes('code=')) {
    try {
      const fromUrl = new URL(text).searchParams.get('code');
      if (fromUrl) return fromUrl;
    } catch {
      // Not a full URL — maybe "/settings?code=…" or just "code=…".
      const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
      const fromQuery = new URLSearchParams(query).get('code');
      if (fromQuery) return fromQuery;
    }
    return null;
  }
  // No `code=` anywhere: only accept the raw text if it looks like a token.
  // OAuth codes are URL-safe token chars — no spaces — so prose like
  // "hello world" falls through to null and the paste dialog shows its
  // no-code alert instead of POSTing the text as a code.
  return /^[A-Za-z0-9_\-\.]+$/.test(text) ? text : null;
}

const GoogleApp = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  // openid email → the backend's userinfo call needs the account email;
  // drive.file alone 502s at the end of the exchange.
  scope: 'openid email https://www.googleapis.com/auth/drive.file',
};

const MicrosoftApp = {
  clientId: ((import.meta.env.VITE_ONEDRIVE_CLIENT_ID as string | undefined) || '').trim(),
  tenant: ((import.meta.env.VITE_ONEDRIVE_TENANT as string | undefined) || '').trim() || 'common',
  // offline_access → the backend demands a refresh token; User.Read → the
  // backend reads the account email from Graph /me after the exchange.
  scope:
    'offline_access https://graph.microsoft.com/Files.ReadWrite.AppFolder ' +
    'https://graph.microsoft.com/User.Read',
};

/** `state` carries the provider across the popup boundary, which sessionStorage
 * cannot: a `noopener` window is a separate browsing context and inherits none.
 * The nonce makes each handshake distinct; the provider prefix is what we read back. */
function makeState(provider: CloudBackend): string {
  const nonce = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${provider}.${nonce}`;
}

function providerFromState(state: string | null): CloudBackend | null {
  const p = state?.split('.')[0];
  return p === 'google' || p === 'onedrive' ? p : null;
}

/** Consent URL builders. `redirect_uri` comes from the one shared constant. */
function consentUrl(
  provider: CloudBackend,
  state: string,
  googleClientId: string,
  onedriveClientId: string,
): string {
  const redirect = encodeURIComponent(cloudRedirectUri());
  const stateParam = encodeURIComponent(state);
  if (provider === 'google') {
    return (
      `${GoogleApp.authUrl}?client_id=${encodeURIComponent(googleClientId)}` +
      `&redirect_uri=${redirect}&response_type=code` +
      `&scope=${encodeURIComponent(GoogleApp.scope)}` +
      `&access_type=offline&prompt=consent` +
      `&state=${stateParam}`
    );
  }
  return (
    `https://login.microsoftonline.com/${encodeURIComponent(MicrosoftApp.tenant)}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(onedriveClientId)}` +
    `&redirect_uri=${redirect}&response_type=code` +
    `&scope=${encodeURIComponent(MicrosoftApp.scope)}` +
    `&prompt=consent` +
    `&state=${stateParam}`
  );
}

export default function Settings() {
  const session = useSession();
  const signedIn = useIsSignedIn();
  const [available, setAvailable] = useState<CloudProviders | null>(null);
  const [links, setLinks] = useState<DriveLink[]>([]);
  const [googleClientId, setGoogleClientId] = useState('');
  const [onedriveClientId, setOnedriveClientId] = useState('');
  const [busy, setBusy] = useState<false | CloudBackend>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pending handshake (set on Connect click; survives the provider redirect).
  const [pending, setPending] = useState<CloudBackend | null>(() => readPending());
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  // A failed landing exchange: show the error and the received code on the
  // pending card so the paste dialog can retry with it.
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  // Paste dialog.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);

  // Disconnect confirmation.
  const [disconnectTarget, setDisconnectTarget] = useState<CloudBackend | null>(null);

  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      const [providers, connected, config] = await Promise.all([
        cloudProviders(),
        listDriveLinks(),
        publicConfig(),
      ]);
      setAvailable(providers);
      setLinks(connected);
      setGoogleClientId(providers.google_client_id || config.google_client_id || '');
      setOnedriveClientId(providers.onedrive_client_id || MicrosoftApp.clientId || '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your storage settings.');
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Exchange one code. Returns an error message or null on success; on
   * success the pending key is gone and the links list needs a refresh.
   */
  const completeExchange = useCallback(
    async (provider: CloudBackend, code: string): Promise<string | null> => {
      setBusy(provider);
      try {
        // Byte-identical redirect_uri with the consent URL, always.
        const link = await connectDrive(provider, code, cloudRedirectUri());
        sessionStorage.removeItem(PENDING_KEY);
        setPending(null);
        setExchangeError(null);
        setLastCode(null);
        setNotice(`Connected as ${link.account_email}`);
        // Tell any other tab showing the pending card that this provider is done.
        try {
          localStorage.setItem(CONNECTED_SIGNAL_KEY, String(Date.now()));
        } catch {
          /* storage unavailable (private mode) — the opener tab just stays stale */
        }
        return null;
      } catch (err) {
        return cloudErrorMessage(err);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Auto-complete on landing: the provider comes back with ?code=… and echoes
  // our `state` (which names the provider). ?provider= and the pending key are
  // fallbacks for links minted before the state handshake existed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const rawState = params.get('state');
    const providerParam = params.get('provider');
    const provider =
      providerFromState(rawState) ??
      (providerParam === 'google' || providerParam === 'onedrive' ? providerParam : null) ??
      readPending();
    if (rawState !== null && providerFromState(rawState) === null) {
      // A state we didn't mint belongs to some unrelated OAuth flow — exchanging
      // its code here would be wrong (and could burn the other app's code).
      console.warn('[cloud] authorization code arrived with a foreign state; ignoring');
      return;
    }
    if (!provider) {
      // A stale OAuth URL with no pending handshake of ours — leave it alone.
      console.warn('[cloud] landed with an authorization code but no pending provider; ignoring');
      return;
    }
    // Exchange each (provider, code) at most once per page lifecycle — the
    // StrictMode double-mount must not re-POST a single-use code.
    const exchangeKey = `${provider}:${code}`;
    if (exchangedCodes.has(exchangeKey)) return;
    exchangedCodes.add(exchangeKey);
    setPending(provider);
    void (async () => {
      const message = await completeExchange(provider, code);
      if (message) {
        // Keep the code visible on the card so "Paste the link" can retry.
        setExchangeError(message);
        setLastCode(code);
      } else {
        scrubProviderParams();
        await load();
      }
    })();
    // Mount-only on purpose: the URL is scrubbed after a success and the code
    // must never be re-posted on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Another tab finished the connect: clear our pending card and re-read links.
  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== CONNECTED_SIGNAL_KEY) return;
      sessionStorage.removeItem(PENDING_KEY);
      setPending(null);
      setPopupBlocked(false);
      setPendingUrl('');
      setExchangeError(null);
      setLastCode(null);
      void load();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  function startConnect(provider: CloudBackend) {
    setError(null);
    setNotice(null);
    setExchangeError(null);
    setLastCode(null);
    // The provider now rides in `state`, which the consent page echoes back, so
    // the tab no longer has to share our sessionStorage. That is why we can
    // keep the opener (no `noopener`) and trust a null handle as "blocked".
    const state = makeState(provider);
    const url = consentUrl(provider, state, googleClientId, onedriveClientId);
    sessionStorage.setItem(PENDING_KEY, provider);
    setPending(provider);
    setPendingUrl(url);
    const win = window.open(url, '_blank');
    setPopupBlocked(win === null);
  }

  function cancelPending() {
    sessionStorage.removeItem(PENDING_KEY);
    setPending(null);
    setPopupBlocked(false);
    setPendingUrl('');
    setExchangeError(null);
    setLastCode(null);
  }

  function openPaste(provider: CloudBackend) {
    setPending(provider); // the dialog only ever works for the pending provider
    setPasteValue('');
    setPasteError(null);
    setPasteOpen(true);
  }

  async function submitPaste() {
    const provider = pending;
    if (!provider) return;
    const code = extractAuthCode(pasteValue);
    if (!code) {
      setPasteError(
        "That text doesn't contain an authorization code (look for ?code=… in the address bar)",
      );
      return;
    }
    setPasteBusy(true);
    setPasteError(null);
    try {
      const message = await completeExchange(provider, code);
      if (message) {
        // Keep the dialog open; the same paste can be retried.
        setPasteError(message);
        return;
      }
      setPasteOpen(false);
      setPasteValue('');
      scrubProviderParams();
      await load();
    } finally {
      setPasteBusy(false);
    }
  }

  async function disconnect(provider: CloudBackend) {
    setBusy(provider);
    setError(null);
    setNotice(null);
    try {
      await disconnectDrive(provider);
      setNotice(
        `Disconnected ${providerLabel(provider)}. Videos already there stay listed but can't play until you reconnect.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Disconnecting failed.');
    } finally {
      setBusy(false);
      setDisconnectTarget(null);
    }
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-xl font-semibold text-fg">Settings</h1>
        <p className="mt-2 text-sm text-dim">
          {session?.role === 'guest'
            ? 'Guests browse with a passcode or share link and have no account storage to connect.'
            : 'Sign in to connect your own Google Drive or OneDrive for video storage.'}
        </p>
      </div>
    );
  }

  const PROVIDERS: { key: CloudBackend; label: string; hint: string }[] = [
    { key: 'google', label: 'Google Drive', hint: 'Store your contributed videos in your own Google Drive.' },
    { key: 'onedrive', label: 'OneDrive', hint: 'Store your contributed videos in your own OneDrive.' },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-xl font-semibold text-fg">Settings</h1>
      <p className="mt-1 text-sm text-dim">
        Keep your contributed video bytes on your own cloud. Connect a drive, then choose it when you
        upload a video. The file goes straight to your drive and the dataset catalogues it.
      </p>
      {available && (!available.google || !available.onedrive) ? (
        <div className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-dim">
          <strong className="font-semibold text-fg">Drive storage isn't enabled yet.</strong>{' '}
          An operator has to connect a storage account first; after that you can link your own
          Google Drive or OneDrive here.
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-ok">{notice}</p> : null}

      <div className="mt-6 space-y-3">
        {PROVIDERS.map((p) => {
          const connected = links.find((l) => l.provider === p.key);
          const offered = available?.[p.key];
          const clientIdMissing = p.key === 'google' ? !googleClientId : !onedriveClientId;
          const isPending = pending === p.key && !connected;
          return (
            <div key={p.key} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-sm font-semibold text-fg">{p.label}</h2>
                  <p className="mt-0.5 text-xs text-dim">{p.hint}</p>
                  {connected ? (
                    <p className="mt-1 truncate text-xs text-faint">Connected as {connected.account_email}</p>
                  ) : null}
                  {!connected && offered === true && clientIdMissing ? (
                    <p className="mt-1 text-xs text-faint">
                      Connecting {p.label} isn't available on this site yet. Ask the operator to
                      enable it.
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0">
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => setDisconnectTarget(p.key)}
                      disabled={busy === p.key}
                      className={`${btnDanger}`}
                    >
                      {busy === p.key ? 'Working…' : 'Disconnect'}
                    </button>
                  ) : isPending ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openPaste(p.key)}
                        disabled={busy === p.key}
                        className={`${btnNeutral}`}
                      >
                        Paste the link
                      </button>
                      <button
                        type="button"
                        onClick={cancelPending}
                        disabled={busy === p.key}
                        className={`${btnNeutral}`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : offered === false ? (
                    /* Provider not enabled on this server. The reason and the next
                       step are visible text — previously they lived only in a
                       hover title, so the dead card read as "the feature is broken". */
                    <div
                      className="max-w-[13rem] text-right"
                      title="Ask the operator to enable this provider for the site."
                    >
                      <p className="text-xs font-medium text-dim">Not available</p>
                      <p className="mt-0.5 text-xs text-faint">Not set up here yet.</p>
                    </div>
                  ) : available === null ? (
                    /* Still loading (or the status call failed): never flash
                       "Not available" for a provider we haven't heard about. */
                    <Spinner label={loading ? 'Checking…' : 'Unavailable'} className="justify-end" />
                  ) : clientIdMissing ? (
                    <button type="button" disabled className={`${btnNeutral}`}>
                      Connect
                    </button>
                  ) : busy === p.key ? (
                    <button type="button" disabled className={`${btnPrimary}`}>
                      Working…
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startConnect(p.key)}
                      className={`${btnPrimary}`}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>

              {isPending ? (
                <div className="mt-3 rounded-md border-l-4 border-warn bg-warn-soft px-3 py-2.5">
                  {busy === p.key ? (
                    <Spinner label="Finishing the connection…" />
                  ) : (
                    <p className="text-sm text-fg">Waiting for you to finish in the browser tab…</p>
                  )}
                  {exchangeError ? (
                    <div role="alert" className="mt-2 rounded-md bg-bad-soft px-3 py-2 text-xs text-bad">
                      <p>{exchangeError}</p>
                      {lastCode ? (
                        <p className="mt-1 break-all text-faint">
                          Authorization code received: <span className="font-mono">{lastCode}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {popupBlocked && pendingUrl ? (
                    <a
                      href={pendingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${btnPrimary} mt-2`}
                    >
                      Open the authorization page
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <PasteCodeDialog
        providerLabel={pending ? providerLabel(pending) : ''}
        open={pasteOpen && pending !== null}
        value={pasteValue}
        error={pasteError}
        busy={pasteBusy}
        onChange={(v) => {
          setPasteValue(v);
          if (pasteError) setPasteError(null);
        }}
        onClose={() => {
          if (!pasteBusy) setPasteOpen(false);
        }}
        onSubmit={() => void submitPaste()}
      />

      <ConfirmDialog
        open={disconnectTarget !== null}
        title={disconnectTarget ? `Disconnect ${providerLabel(disconnectTarget)}?` : ''}
        message="Disconnecting removes the token this site uses to read your files. Videos stored there become unavailable until you reconnect (your transcripts and records stay)."
        confirmLabel="Disconnect"
        destructive
        busy={disconnectTarget !== null && busy === disconnectTarget}
        onConfirm={() => {
          if (disconnectTarget) void disconnect(disconnectTarget);
        }}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}

/**
 * Paste dialog: the fallback for every path where the redirect does not come
 * back to this tab (blocked popup, authorized on another device, expired
 * landing exchange). Opens only from a pending card. Shell follows the
 * ConfirmDialog idiom.
 */
function PasteCodeDialog({
  providerLabel: label,
  open,
  value,
  error,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  providerLabel: string;
  open: boolean;
  value: string;
  error: string | null;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Paste the ${label} authorization link`}
        className="card relative w-full max-w-md animate-fade-up p-5"
      >
        <h2 className="font-display text-base font-semibold text-fg">Connect {label}</h2>
        <label className={`${labelCls} mt-3`} htmlFor="cloud-paste">
          Paste the URL you were sent back to, or just the code
        </label>
        <textarea
          id="cloud-paste"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} resize-y font-mono text-xs`}
        />
        <p className="mt-1.5 text-xs text-faint">
          After you authorize, the browser is sent back to{' '}
          <span className="font-mono">{cloudRedirectUri()}?code=…</span>. Copy the whole address-bar
          URL here.
        </p>
        {error ? (
          <div role="alert" className="mt-3 rounded-md bg-bad-soft px-3 py-2 text-xs text-bad">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnNeutral}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !value.trim()}
            className={btnPrimary}
          >
            {busy ? (
              <>
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent"
                  aria-hidden="true"
                />
                Working…
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
