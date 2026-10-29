import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, redeemPasscode } from '../api/client';
import { btnNeutral, btnPrimary, inputCls } from '../components/ui';
import { deviceKey, useAuthStore } from '../store/auth';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'wrong' }
  | { kind: 'error'; message: string };

/**
 * The door to a private folder (instruction.txt #4). The passcode is the
 * capability; the folder is named by the visitor or fixed by the link they
 * were sent.
 *
 * Deliberately no folder list: publishing one would tell every visitor how many
 * folders exist and what they are called, which is precisely what a private
 * folder must not disclose.
 */
export default function Passcode() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // `?folder=` arrives from a folder link and fixes the folder; then only the
  // code is needed.
  const requested = params.get('folder') ?? '';

  const [folderName, setFolderName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || (!requested && !folderName.trim())) return;
    setStatus({ kind: 'busy' });
    try {
      const res = await redeemPasscode(code.trim(), deviceKey(), {
        folderId: requested || undefined,
        folderName: requested ? undefined : folderName.trim(),
      });
      useAuthStore.getState().setSession({
        token: res.token,
        role: 'guest',
        email: null,
        name: null,
        folderIds: [res.folder_id],
        folderRole: res.folder_role,
        access: 'passcode',
        expiresAt: res.expires_at,
      });
      navigate(`/folder/${res.folder_id}`, { replace: true });
    } catch (err) {
      // The API answers 401 for a wrong, expired, exhausted or unknown code
      // alike, so a rejected code must not reveal whether the folder exists.
      // Only that rejection is a "wrong code"; a transport failure or a 500 is
      // a different problem and must not be misreported as one.
      if (err instanceof ApiError && err.status === 401) {
        setStatus({ kind: 'wrong' });
      } else {
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'That passcode did not work.',
        });
      }
    }
  }

  const busy = status.kind === 'busy';

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <form onSubmit={submit} className="card mx-auto max-w-md p-6">
        <h1 className="font-display text-lg font-semibold text-fg">Have a passcode?</h1>
        <p className="mt-1 text-sm text-dim">
          A passcode opens one private folder. Pick the folder the code was made
          for, then type the code.
        </p>

        {requested ? null : (
          <>
            <label
              htmlFor="folder-name"
              className="mt-4 block text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
            >
              Folder name
            </label>
            <input
              id="folder-name"
              type="text"
              autoComplete="off"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setStatus({ kind: 'idle' });
              }}
              className={inputCls}
              placeholder="The folder your host named"
            />
          </>
        )}

        <label htmlFor="passcode" className="mt-4 block text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Passcode
        </label>
        <input
          id="passcode"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setStatus({ kind: 'idle' });
          }}
          className={inputCls}
          placeholder="e.g. ABCD-2345"
        />

        {status.kind === 'wrong' ? (
          <p className="mt-3 text-xs text-bad" role="alert">
            That passcode is not valid. Check the code and the folder it belongs to, then try again.
          </p>
        ) : null}
        {status.kind === 'error' ? (
          <p className="mt-3 text-xs text-bad" role="alert">
            {status.message}
          </p>
        ) : null}

        <button
          type="submit"
          className={`${btnPrimary} mt-4 w-full`}
          disabled={busy || !code.trim() || (!requested && !folderName.trim())}
        >
          {busy ? 'Checking…' : 'Open folder'}
        </button>

        {/* Only a link knows the folder id; without one there is nothing to
            link to, so the shortcut would point at a folder that is not set. */}
        {requested ? (
          <p className="mt-3 text-center text-xs text-faint">
            Opened this folder before?{' '}
            <Link
              to={`/folder/${requested}`}
              className="tap-pad inline-flex items-center rounded px-1 text-accent hover:underline"
            >
              Go to it directly
            </Link>
          </p>
        ) : null}
      </form>

      <div className="mx-auto mt-6 flex max-w-md justify-center">
        <Link to="/" className={btnNeutral}>
          Back to the dataset
        </Link>
      </div>
    </div>
  );
}
