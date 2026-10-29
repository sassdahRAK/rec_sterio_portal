import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { signOut, useIsSignedIn, useSession } from '../store/auth';
import ConfirmDialog from './ConfirmDialog';
import ThemeToggle from './ThemeToggle';

const TABS = [
  { to: '/scrape', label: 'Add' },
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
  const isSignedIn = useIsSignedIn();
  const session = useSession();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50 ${
      isActive
        ? 'bg-surface font-semibold text-fg shadow-card'
        : 'font-medium text-dim hover:text-fg'
    }`;

  return (
    <>
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
          <ThemeToggle />
          {isSignedIn ? (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `tap-pad hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50 ${
                  isActive
                    ? 'font-semibold text-fg'
                    : 'font-medium text-dim hover:text-fg'
                }`
              }
              title="Connect your own Google Drive / OneDrive"
              aria-label="My storage"
            >
              <CloudIcon />
              <span className="hidden sm:inline">My storage</span>
            </NavLink>
          ) : null}
          {isSignedIn ? (
            <button
              type="button"
              className="tap-pad inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-dim transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50"
              onClick={() => setSignOutOpen(true)}
              title={session?.email ?? 'Sign out'}
              aria-label="Sign out"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <Link
              to="/login"
              className="tap-pad inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-dim transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50"
              title="Sign in"
              aria-label="Sign in"
            >
              <LogInIcon />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}
        </div>
      </div>

      {/* Tabs repeat below the fold line between sm and md only — below 640px
          the phone moves to the floating <BottomNav /> bar instead. */}
      <nav
        className="mx-auto mt-2 hidden max-w-content items-center gap-1 rounded-full border border-line bg-surface-2 p-1 sm:flex md:hidden"
        aria-label="Sections"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              // min-h-[44px] is unconditional: `tap-pad` only lifts the hit
              // area on coarse pointers, and this row is the tablet-width
              // touch target between 640 and 767px.
              `tap-pad min-h-[44px] flex flex-1 items-center justify-center text-center ${tabClass({ isActive })}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </header>

    <ConfirmDialog
      open={signOutOpen}
      destructive
      title="Sign out?"
      message="You'll need to sign in again to get back."
      confirmLabel="Sign out"
      onConfirm={() => {
        setSignOutOpen(false);
        signOut();
        navigate('/');
      }}
      onCancel={() => setSignOutOpen(false)}
    />
    </>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16 17 5-5-5-5M21 12H8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m10 17 5-5-5-5M15 12H2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
    </svg>
  );
}
