import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { setMockEnabled } from './api/client';
import './index.css';

// `?mock=1` sticks so the demo works without a backend; `?mock=0` is the way
// back out, since the flag lives in localStorage and would otherwise be
// permanent for anyone who once opened a demo link.
const mockParam = new URLSearchParams(window.location.search).get('mock');
if (mockParam === '1') setMockEnabled(true);
if (mockParam === '0') setMockEnabled(false);

const container = document.getElementById('root');
if (!container) throw new Error('RecSterio portal: #root element is missing.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// The worker is installed only for built output. During `vite dev` it would
// sit in front of the dev server and serve stale shells after every edit, so
// registration stays off there. A failed install is never fatal: the app is
// fully usable without it, offline support is an enhancement.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {
      // An install failure must never break the app.
    });
  });
}
