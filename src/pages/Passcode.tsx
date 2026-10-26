import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { redeemPasscode } from '../api/client';
import { btnPrimary, inputCls } from '../components/ui';
import { deviceKey, useAuthStore } from '../store/auth';

/**
 * The door to a private folder (instruction.txt #4). The folder URL is the
 * capability; the passcode is the proof. On success the visitor holds a token
 * scoped to that folder and nothing else.
 */
export default function Passcode() {
  const [params] = useSearchParams();
  const folderId = params.get('folder') ?? '';
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!folderId || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await redeemPasscode(folderId, code.trim(), deviceKey());
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
      setError(err instanceof Error ? err.message : 'That passcode did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (!folderId) {
    return (
      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <div className="card mx-auto max-w-md p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-fg">Which folder?</h1>
          <p className="mt-2 text-sm text-dim">
            A passcode opens one folder, and the folder is named in the link the owner sent you.
          </p>
          <Link to="/" className={`${btnPrimary} mt-4`}>
            Back to the dataset
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <form onSubmit={submit} className="card mx-auto max-w-sm p-6">
        <h1 className="font-display text-lg font-semibold text-fg">Enter passcode</h1>
        <p className="mt-1 text-sm text-dim">
          This folder is private. Type the passcode the owner gave you to open it.
        </p>

        <label htmlFor="passcode" className="mt-4 block text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Passcode
        </label>
        <input
          id="passcode"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={inputCls}
          placeholder="e.g. blue-42"
          autoFocus
        />

        {error ? <p className="mt-3 text-xs text-bad">{error}</p> : null}

        <button type="submit" className={`${btnPrimary} mt-4 w-full`} disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Open folder'}
        </button>
      </form>
    </div>
  );
}