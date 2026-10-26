import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Distinct from the operations console (5173) on purpose: the portal is a
    // public surface, the console is an operator surface, and they are deployed
    // separately. PORTAL_FRONTEND_URL in the backend points here.
    port: 5174,
    strictPort: false,
    // Talk to the backend through this dev server so API calls are same-origin:
    // no CORS preflight, and the visitor's browser never needs direct access to
    // the API port. Production mounts the portal under the same origin as the
    // API reverse proxy, so the relative base URL works there too.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  preview: {
    port: 4174,
  },
});
