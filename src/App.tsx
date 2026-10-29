import { Navigate, Route, Routes } from 'react-router-dom';
import { isMockEnabled, setMockEnabled } from './api/client';
import BottomNav from './components/BottomNav';
import Header from './components/Header';
import Cleaned from './pages/Cleaned';
import Dataset from './pages/Dataset';
import FolderDetail from './pages/FolderDetail';
import Login from './pages/Login';
import Passcode from './pages/Passcode';
import Scrape from './pages/Scrape';
import Settings from './pages/Settings';
import Share from './pages/Share';
import VideoDetail from './pages/VideoDetail';

/**
 * The public portal.
 *
 * Every route here is reachable by an anonymous visitor — that is the point of
 * the surface. Access control lives in the API, not in the router: a private
 * folder answers 404 until a passcode or share link has scoped the visitor's
 * token to it.
 */
/**
 * Demo mode is stored in localStorage, so without an exit a visitor who once
 * opened a `?mock=1` link can never reach the real dataset. This bar names the
 * state and offers the one-click way out.
 */
function DemoBar() {
  if (!isMockEnabled()) return null;
  return (
    <div className="border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-xs text-warn sm:px-6">
      Showing demo data, not your dataset.{' '}
      <button
        type="button"
        className="tap-pad inline-flex items-center font-semibold underline underline-offset-2 hover:text-fg"
        onClick={() => {
          setMockEnabled(false);
          window.location.assign(window.location.pathname);
        }}
      >
        Use live data
      </button>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <DemoBar />
      <Header />
      {/* Fixed phone bar — mounts once at the shell level so it renders on
          every route, like Telegram. sm:pb-0 because it hides at ≥640px. */}
      <BottomNav />
      <main className="min-w-0 flex-1 pb-24 sm:pb-0">
        <Routes>
          <Route path="/" element={<Dataset />} />
          <Route path="/cleaned" element={<Cleaned />} />
          <Route path="/scrape" element={<Scrape />} />
          <Route path="/folder/:id" element={<FolderDetail />} />
          {/* One unit on its own URL — what the bot links to for a video it
              cannot send through Telegram. */}
          <Route path="/video/:id" element={<VideoDetail />} />
          <Route path="/passcode" element={<Passcode />} />
          <Route path="/share/:token" element={<Share />} />
          <Route path="/login" element={<Login />} />
          {/* Connect a personal drive (also the OAuth redirect target). */}
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Extra bottom pad on phones so the footer's last line clears the
          floating bar when the page is scrolled fully to the end. */}
      <footer className="border-t border-line px-4 pb-24 pt-5 sm:px-6 sm:pb-5">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3">
          <p className="text-2xs text-faint">
            RecSterio — Khmer–English speech dataset. Video, audio and transcript, cleaned by hand.
          </p>
        </div>
      </footer>
    </div>
  );
}
