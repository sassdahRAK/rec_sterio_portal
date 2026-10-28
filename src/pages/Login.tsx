import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, isMockEnabled, login, setMockEnabled } from '../api/client';
import GoogleButton from '../components/GoogleButton';
import { useAuthStore } from '../store/auth';
import { btnPrimary, inputCls, labelCls } from '../components/ui';

/**
 * Sign in (instruction.txt #2).
 *
 * Two ways in: an operator account, or Google. Both end the same way — a bearer
 * token in the portal session. Google is rendered only when the server reports
 * it as configured, so a self-hosted deployment without OAuth shows no dead
 * button.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demo, setDemo] = useState(isMockEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function finish(token: string, role: string, mail: string, name: string | null) {
    useAuthStore.getState().setSession({
      token,
      role: role === 'admin' ? 'admin' : 'member',
      email: mail,
      name,
      folderIds: [],
      folderRole: null,
      access: null,
      expiresAt: null,
    });
    const back = location.state?.from;
    navigate(back && back.startsWith('/') ? back : '/', { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      setMockEnabled(demo);
      const res = await login({ email: email.trim(), password });
      finish(res.token, res.role, res.email, res.name ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-content justify-center px-4 py-12 sm:px-6">
      <div className="card w-full max-w-sm p-6">
        <h1 className="font-display text-xl font-bold text-fg">Sign in</h1>
        <p className="mt-1 text-sm text-dim">
          Operators and invited members sign in here. Visitors need no account to browse public folders.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="login-email" className={labelCls}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="login-password" className={labelCls}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-dim">
            <input
              type="checkbox"
              checked={demo}
              onChange={(e) => setDemo(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line bg-surface text-accent focus:ring-accent/40"
            />
            Use demo data (mock API, no backend required)
          </label>

          {error ? (
            <p className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>
          ) : null}

          <button type="submit" disabled={busy || !email.trim() || !password} className={`${btnPrimary} w-full`}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {demo ? (
          <p className="mt-3 text-center text-2xs text-faint">
            Demo mode accepts any valid email with a 4+ character password.
          </p>
        ) : null}

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-2xs uppercase tracking-[0.14em] text-faint">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <GoogleButton onDone={() => navigate('/', { replace: true })} />
      </div>
    </div>
  );
}
