import { useEffect, useRef, useState } from 'react';
import { googleLogin, publicConfig } from '../api/client';
import { useAuthStore } from '../store/auth';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/**
 * "Continue with Google" (instruction.txt #2).
 *
 * The client id is public by design, so the portal can render the button with
 * no secret. The ID token it produces is verified server-side, where the token
 * audience is checked against the configured client id.
 */
export default function GoogleButton({ onDone }: { onDone: () => void }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    publicConfig()
      .then((cfg) => {
        if (!cancelled && cfg.google_enabled && cfg.google_client_id) {
          setClientId(cfg.google_client_id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const el = containerRef.current;
      if (!window.google || !el) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            setError('Google sign-in was cancelled.');
            return;
          }
          try {
            const res = await googleLogin(response.credential);
            useAuthStore.getState().setSession({
              token: res.token,
              role: ['super_admin', 'admin'].includes(res.role) ? 'admin' : 'user',
              email: res.email,
              name: res.name ?? null,
              folderIds: [],
              folderRole: null,
              access: null,
              expiresAt: res.expires_at,
            });
            onDoneRef.current();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed.');
          }
        },
      });
      window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: 260 });
    };
    document.body.appendChild(script);
  }, [clientId]);

  if (error) return <p className="text-xs text-bad">{error}</p>;
  if (!clientId) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}