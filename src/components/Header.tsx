import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut, useIsSignedIn, useSession } from '../store/auth';
import ThemeToggle from './ThemeToggle';
import { btnNeutral } from './ui';

const TABS = [
  { to: '/scrape', label: 'Audio scrape' },
  { to: '/', label: 'Dataset' },
  { to: '/cleaned', label: 'Cleaned' },
];

/**
 * The portal chrome. The three tabs are the product's real modes — ingest,
 * browse everything, browse only human-corrected units — not decoration.
 */
export default function Header() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const isSignedIn = useIsSignedIn();
  const session = useSession();

  // Keep the box in sync when a page sets ?q= itself.
  useEffect(() => {
    setQ(params.get('q') ?? '');
  }, [params]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50 rounded-md">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-full" />
          <span className="font-display text-lg font-bold tracking-tight text-fg">
            RecSterio
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-accent-strong' : 'text-dim hover:bg-surface-2 hover:text-fg'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden w-64 items-center sm:flex" role="search">
          <label htmlFor="portal-search" className="sr-only">
            Search the dataset
          </label>
          <input
            id="portal-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <ThemeToggle />
          {isSignedIn ? (
            <button
              type="button"
              className={btnNeutral}
              onClick={() => {
                signOut();
                navigate('/');
              }}
              title={session?.email ?? 'Sign out'}
            >
              Sign out
            </button>
          ) : (
            <Link to="/login" className={btnNeutral}>
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Tabs repeat below the fold line on small screens. */}
      <nav className="flex items-center gap-1 px-4 pb-2 md:hidden" aria-label="Primary">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-accent-soft text-accent-strong' : 'text-dim'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}