import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { redeemShare } from '../api/client';
import Spinner from '../components/Spinner';
import { deviceKey, useAuthStore } from '../store/auth';

/**
 * A share link, redeemed once into a token scoped to a single folder
 * (instruction.txt #1). The link itself carries no access — redeeming it is
 * what grants the folder role.
 */
export default function Share() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    redeemShare(token, deviceKey())
      .then((res) => {
        useAuthStore.getState().setSession({
          token: res.token,
          role: 'guest',
          email: null,
          name: null,
          folderIds: [res.folder_id],
          folderRole: res.folder_role,
          access: 'share',
          expiresAt: res.expires_at,
        });
        navigate(`/folder/${res.folder_id}`, { replace: true });
      })
      .catch((err: Error) => setError(err.message));
  }, [token, navigate]);

  return (
    <div className="mx-auto flex max-w-content flex-col items-center px-4 py-16 sm:px-6">
      {error ? (
        <div className="card max-w-md p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-fg">This link isn't valid</h1>
          <p className="mt-2 text-sm text-dim">
            {error} It may have expired or been revoked by the owner.
          </p>
        </div>
      ) : (
        <Spinner label="Opening the shared folder…" />
      )}
    </div>
  );
}