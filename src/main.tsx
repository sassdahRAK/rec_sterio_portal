import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { setMockEnabled } from './api/client';
import './index.css';

// `?mock=1` sticks for the whole session so the demo works without a backend.
if (new URLSearchParams(window.location.search).get('mock') === '1') {
  setMockEnabled(true);
}

const container = document.getElementById('root');
if (!container) throw new Error('RecSterio portal: #root element is missing.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
