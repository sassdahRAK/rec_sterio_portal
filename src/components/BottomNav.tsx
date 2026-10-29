import { NavLink } from 'react-router-dom';
import { useIsSignedIn } from '../store/auth';

/**
 * Telegram-style bottom navigation for phones only (<sm). Desktop and tablet
 * keep the header's pill nav; between 640 and 767px the header tab row still
 * shows, and at <640 this floating bar replaces it.
 *
 * Items are a solid glyph above a 10px label; the active item is tinted with
 * the accent token (label included), matching how Telegram marks the current
 * tab — no per-item pill here, since the bar itself is the pill.
 */

const ITEM_BASE =
  'tap-pad flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `${ITEM_BASE} ${isActive ? 'font-semibold text-accent' : 'font-medium text-dim hover:text-fg'}`;

export default function BottomNav() {
  const isSignedIn = useIsSignedIn();

  return (
    <nav
      aria-label="Mobile sections"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 sm:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch gap-1 rounded-full border border-line bg-surface/90 px-1.5 py-0.5 shadow-card backdrop-blur">
        <NavLink to="/scrape" className={itemClass}>
          <FunnelIcon />
          <span className="max-w-full truncate">Add</span>
        </NavLink>
        <NavLink to="/" end className={itemClass}>
          <DatabaseIcon />
          <span className="max-w-full truncate">Dataset</span>
        </NavLink>
        <NavLink to="/cleaned" className={itemClass}>
          <CheckCircleIcon />
          <span className="max-w-full truncate">Cleaned</span>
        </NavLink>
        {isSignedIn ? (
          <NavLink
            to="/settings"
            className={itemClass}
            title="Connect your own Google Drive / OneDrive"
          >
            <CloudIcon />
            <span className="max-w-full truncate">Storage</span>
          </NavLink>
        ) : (
          <NavLink to="/login" className={itemClass} title="Sign in">
            <SignInIcon />
            <span className="max-w-full truncate">Sign in</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}

/* Solid 24-viewBox glyphs (Material-style, Apache-2.0 path data), fill =
 * currentColor so the active tint applies to icon and label together. */

const GLYPH = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true } as const;

function FunnelIcon() {
  // Material `filter_alt` solid — the data-harvesting metaphor for scraping.
  return (
    <svg {...GLYPH} fill="currentColor">
      <path d="M4.25 5.61C6.27 8.2 10 13 10 13l.04.04C8.99 15.67 8 18.83 8 22h8c0-3.17-.99-6.33-2.04-8.96l.04-.04s3.72-4.79 5.75-7.39H4.25M3 3h18l-7.5 9.46V19l-3 4v-10.54L3 3z" />
    </svg>
  );
}

function DatabaseIcon() {
  // Stacked cylinders — the dataset.
  return (
    <svg {...GLYPH} fill="currentColor">
      <path d="M12 2C7.58 2 4 3.79 4 6v12c0 2.21 3.58 4 8 4s8-1.79 8-4V6c0-2.21-3.58-4-8-4zm6 16c0 .93-2.68 2-6 2s-6-1.07-6-2v-2.48c1.43.95 3.86 1.48 6 1.48s4.57-.53 6-1.48V18zm0-5c0 .93-2.68 2-6 2s-6-1.07-6-2v-2.48c1.43.95 3.86 1.48 6 1.48s4.57-.53 6-1.48V13zm-6-3c-3.32 0-6-1.07-6-2s2.68-2 6-2 6 1.07 6 2-2.68 2-6 2z" />
    </svg>
  );
}

function CheckCircleIcon() {
  // Filled check-circle — human-cleaned units.
  return (
    <svg {...GLYPH} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function CloudIcon() {
  // Same solid cloud-upload path as Header's account cluster.
  return (
    <svg {...GLYPH} fill="currentColor">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
    </svg>
  );
}

function SignInIcon() {
  // Door with arrow pointing in.
  return (
    <svg {...GLYPH} fill="currentColor">
      <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z" />
    </svg>
  );
}

