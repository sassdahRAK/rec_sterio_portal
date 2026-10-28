import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Cleaned from './pages/Cleaned';
import Dataset from './pages/Dataset';
import FolderDetail from './pages/FolderDetail';
import Login from './pages/Login';
import Passcode from './pages/Passcode';
import Scrape from './pages/Scrape';
import Share from './pages/Share';

/**
 * The public portal.
 *
 * Every route here is reachable by an anonymous visitor — that is the point of
 * the surface. Access control lives in the API, not in the router: a private
 * folder answers 404 until a passcode or share link has scoped the visitor's
 * token to it.
 */
export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Dataset />} />
          <Route path="/cleaned" element={<Cleaned />} />
          <Route path="/scrape" element={<Scrape />} />
          <Route path="/folder/:id" element={<FolderDetail />} />
          <Route path="/passcode" element={<Passcode />} />
          <Route path="/share/:token" element={<Share />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-line px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3">
          <p className="text-2xs text-faint">
            RecSterio — Khmer–English speech dataset. Video, audio and transcript, cleaned by hand.
          </p>
          <p className="font-mono text-2xs text-faint">Media Ingestion &amp; Download Automation</p>
        </div>
      </footer>
    </div>
  );
}
