import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Distinct from the operations console (5173) on purpose: the portal is a
    // public surface, the console is an operator surface, and they are deployed
    // separately. PORTAL_FRONTEND_URL in the backend points here.
    port: 5174,
    // Fail loudly rather than silently moving to another port: two portal dev
    // servers fighting over 5174 is how a browser ends up talking to a stale
    // build, which looks like a phantom app bug.
    strictPort: true,
    // Bind all IPv4 interfaces (0.0.0.0) instead of letting Vite pick ::1 only:
    // a browser that resolves `localhost` to 127.0.0.1 would otherwise get
    // ECONNREFUSED from a server that looks healthy. Binding the LAN is also
    // what makes the bot's "Go to portal" button work — the link it sends is
    // this machine's LAN IP, so a phone on the same Wi-Fi opens this server.
    // `allowedHosts` stays empty: Vite's DNS-rebinding guard still applies to
    // any other Host header.
    host: true,
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
    strictPort: true,
    host: true,
    // `vite preview` serves the built app, so it needs the same /api proxy the
    // dev server uses unless an absolute VITE_API_BASE_URL was baked in.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
});
