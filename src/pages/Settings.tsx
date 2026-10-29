import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ApiError,
  cloudProviders,
  connectDrive,
  disconnectDrive,
  listDriveLinks,
  publicConfig,
} from '../api/client';
import type { CloudBackend, DriveLink } from '../api/types';
import { useIsSignedIn, useSession } from '../store/auth';
import { btnDanger, btnNeutral, btnPrimary } from '../components/ui';

/**
 * Settings (instruction.txt #2, #4).
 *
 * One surface today: connecting a personal cloud (Google Drive / OneDrive) so
 * a contributor can keep their own video bytes on their own storage instead of
 * the server disk. The per-upload choice to use it lives on the Scrape page's
 * upload dialog; this page only manages the connection.
 *
 * The OAuth redirect returns here with `?provider=google&code=…`; we exchange
 * the code and strip it from the URL so a reload does not reuse it.
 */
export default function Settings() {
  const session = useSession();
  const signedIn = useIsSignedIn();
  const [params, setParams] = useSearchParams();
  const [available, setAvailable] = useState<{ google: boolean; onedrive: boolean } | null>(null);
  const [links, setLinks] = useState<DriveLink[]>([]);
  const [googleClientId, setGoogleClientId] = useState('');
  const [busy, setBusy] = useState<false | CloudBackend>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      setGoogleClientId(config.google_client_id || '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your storage settings.');
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  // Handle the OAuth redirect: exchange the code, then drop it from the URL.
  useEffect(() => {
    const provider = params.get('provider') as CloudBackend | null;
    const code = params.get('code');
    if (!provider || !code) return;
    params.delete('provider');
    params.delete('code');
    setParams(params, { replace: true });
    setBusy(provider);
    setError(null);
    connectDrive(provider, code, `${window.location.origin}/settings`)
      .then((link) => {
        setNotice(`Connected ${provider === 'google' ? 'Google Drive' : 'OneDrive'} (${link.account_email}).`);
        return load();
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Connecting your drive failed.'),
      )
      .finally(() => setBusy(false));
  }, [params, setParams, load]);

  async function disconnect(provider: CloudBackend) {
    setBusy(provider);
    setError(null);
    setNotice(null);
    try {
      await disconnectDrive(provider);
      setNotice(
        `Disconnected ${provider === 'google' ? 'Google Drive' : 'OneDrive'}. Videos already there stay listed but can't play until you reconnect.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Disconnecting failed.');
    } finally {
      setBusy(false);
    }
  }

  const connectUrl = (provider: CloudBackend) => {
    // Redirect straight back here; the backend exchanges the code on return.
    const redirect = encodeURIComponent(`${window.location.origin}/settings`);
    if (provider === 'google') {
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
      return (
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId)}` +
        `&redirect_uri=${redirect}&response_type=code&scope=${scope}` +
        `&access_type=offline&prompt=consent`
      );
    }
    return ''; // OneDrive uses its own authority; configured server-side.
  };

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
        upload a clip — the file goes straight to your drive and the dataset catalogues it.
      </p>

      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-ok">{notice}</p> : null}

      <div className="mt-6 space-y-3">
        {PROVIDERS.map((p) => {
          const connected = links.find((l) => l.provider === p.key);
          const offered = available?.[p.key];
          return (
            <div key={p.key} className="card flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <h2 className="font-display text-sm font-semibold text-fg">{p.label}</h2>
                <p className="mt-0.5 text-xs text-dim">{p.hint}</p>
                {connected ? (
                  <p className="mt-1 truncate text-xs text-faint">Connected as {connected.account_email}</p>
                ) : null}
              </div>
              {connected ? (
                <button
                  type="button"
                  onClick={() => disconnect(p.key)}
                  disabled={busy === p.key}
                  className={`${btnDanger} shrink-0`}
                >
                  {busy === p.key ? 'Working…' : 'Disconnect'}
                </button>
              ) : offered === false || offered === undefined ? (
                /* Provider not enabled on the server — show a clear setup hint */
                <span
                  className={`${btnNeutral} shrink-0 cursor-not-allowed opacity-50`}
                  title={`Ask the operator to set ${p.key === 'google' ? 'GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET' : 'ONEDRIVE_CLIENT_ID + ONEDRIVE_CLIENT_SECRET'} in the server .env and restart.`}
                >
                  Not configured
                </span>
              ) : p.key === 'google' && googleClientId ? (
                <a href={connectUrl('google')} className={`${btnPrimary} shrink-0`}>
                  Connect
                </a>
              ) : p.key === 'google' && !googleClientId ? (
                /* Server reports google=true but client id not exposed via publicConfig */
                <a
                  href={connectUrl('google')}
                  className={`${btnPrimary} shrink-0`}
                  onClick={(e) => {
                    if (!googleClientId) {
                      e.preventDefault();
                      setError(
                        'Google Client ID is not exposed to the portal. Set GOOGLE_CLIENT_ID in the server .env (it must match the Drive OAuth app) and restart.',
                      );
                    }
                  }}
                >
                  Connect
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setError(
                      'OneDrive: ask the operator to set ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET in the server .env to enable this provider.',
                    )
                  }
                  className={`${btnNeutral} shrink-0`}
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
