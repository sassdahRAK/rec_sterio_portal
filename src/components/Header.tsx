import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut, useIsSignedIn, useSession } from '../store/auth';
import ThemeToggle from './ThemeToggle';
import { btnNeutral } from './ui';

const TABS = [
  { to: '/scrape', label: 'Auto scrape' },
  { to: '/', label: 'Dataset' },
  { to: '/cleaned', label: 'Cleaned' },
];

/**
 * The portal chrome: a pill-shaped bar floating at the top of the page —
 * brand left, the three product modes centred as a segmented control, tools
 * right. The tabs are the product's real modes (ingest, browse everything,
 * browse only human-corrected units), not decoration.
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

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50 ${
      isActive
        ? 'bg-surface font-semibold text-fg shadow-card'
        : 'font-medium text-dim hover:text-fg'
    }`;

  return (
    <header className="sticky top-0 z-30 bg-bg/85 px-4 pb-2 pt-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-content items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-card">
        <Link
          to="/"
          className="tap-pad flex shrink-0 items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50"
        >
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-7 w-7 rounded-full" />
          <span className="font-display text-lg font-bold tracking-tight text-fg">RecSterio</span>
        </Link>

        <nav
          className="mx-auto hidden items-center gap-1 rounded-full bg-surface-2 p-1 md:flex"
          aria-label="Primary"
        >
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={tabClass}>
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden w-56 items-center lg:flex md:ml-0" role="search">
          <label htmlFor="portal-search" className="sr-only">
            Search the dataset
          </label>
          <input
            id="portal-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-full border border-line bg-surface-2 px-4 py-1.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
          <ThemeToggle />
          {isSignedIn ? (
            <button
              type="button"
              className={`${btnNeutral} rounded-full`}
              onClick={() => {
                signOut();
                navigate('/');
              }}
              title={session?.email ?? 'Sign out'}
            >
              Sign out
            </button>
          ) : (
            <Link to="/login" className={`${btnNeutral} rounded-full`}>
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Tabs repeat below the fold line on small screens. */}
      <nav
        className="mx-auto mt-2 flex max-w-content items-center gap-1 rounded-full border border-line bg-surface-2 p-1 md:hidden"
        aria-label="Primary"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `tap-pad flex flex-1 items-center justify-center rounded-full px-3 py-1.5 text-center text-sm ${
                isActive ? 'bg-surface font-semibold text-fg shadow-card' : 'font-medium text-dim'
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
