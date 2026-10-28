import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, listPublicFolders, redeemPasscode } from '../api/client';
import type { PublicFolder } from '../api/types';
import { btnNeutral, btnPrimary, inputCls } from '../components/ui';
import { deviceKey, useAuthStore } from '../store/auth';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'wrong' }
  | { kind: 'error'; message: string }
  | { kind: 'need-folder' };

/** Flatten the forest into one selectable level. */
function flatten(nodes: PublicFolder[], depth = 0): { node: PublicFolder; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flatten(node.children, depth + 1),
  ]);
}

/**
 * The door to a private folder (instruction.txt #4). The folder is the
 * capability and the passcode is the proof, so both are needed — a visitor who
 * only has the code picks the folder they were sent to.
 *
 * This page is also the dataset's own entry point for a passcode. It is linked
 * from `FolderDetail`'s "locked" message and from a locked folder's sidebar,
 * which is the "Have a passcode?" affordance the console advertises.
 */
export default function Passcode() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // `?folder=` arrives from a folder link. It preselects the folder and is not
  // required: a visitor may arrive with only the code.
  const requested = params.get('folder') ?? '';

  const [folders, setFolders] = useState<PublicFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState(requested);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPublicFolders()
      .then((res) => {
        if (!cancelled) setFolders(res.items);
      })
      .catch(() => {
        // A folder list failure is not fatal: the input still accepts a folder
        // id from the visitor's own link.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => flatten(folders), [folders]);
  // A private folder is deliberately absent from the public list, so a link
  // carrying `?folder=<private id>` would leave the select with no matching
  // option — the visitor would see "Choose a folder…" and have no way to
  // re-pick the one they were sent to. Keep the requested folder selectable.
  const selectable = useMemo(() => {
    if (!folderId || options.some(({ node }) => node.id === folderId)) return options;
    return [{ node: { id: folderId, name: 'Private folder', visibility: 'private', cards: [], children: [] }, depth: 0 }, ...options];
  }, [options, folderId]);
  const chosen = selectable.find(({ node }) => node.id === folderId)?.node ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!folderId || !code.trim()) return;
    setStatus({ kind: 'busy' });
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

        <label htmlFor="folder" className="mt-4 block text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Folder
        </label>
        <select
          id="folder"
          value={folderId}
          onChange={(e) => {
            setFolderId(e.target.value);
            setStatus({ kind: 'idle' });
          }}
          className={inputCls}
        >
          <option value="">Choose a folder…</option>
          {loading ? <option disabled>Loading folders…</option> : null}
          {selectable.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {depth > 0 ? `${'— '.repeat(depth)}` : ''}
              {node.name}
            </option>
          ))}
        </select>

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
          disabled={busy || !folderId || !code.trim()}
        >
          {busy ? 'Checking…' : 'Open folder'}
        </button>

        <p className="mt-3 text-center text-xs text-faint">
          Opened this folder before?{' '}
          <Link to={`/folder/${folderId}`} className="text-accent hover:underline">
            Go to it directly
          </Link>
        </p>
      </form>

      {chosen ? (
        <p className="mx-auto mt-4 max-w-md text-center text-xs text-faint">
          Opens <span className="font-medium text-dim">{chosen.name}</span> —{' '}
          {chosen.visibility === 'private' ? 'private' : 'public'}.
        </p>
      ) : null}

      <div className="mx-auto mt-6 flex max-w-md justify-center">
        <Link to="/" className={btnNeutral}>
          Back to the dataset
        </Link>
      </div>
    </div>
  );
}
