import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Google's OAuth client for this project only has `http://localhost:5174`
// registered as an allowed JavaScript origin, and adding the `127.0.0.1`
// spelling is not something the operator can easily do. A browser that opens
// this dev server as http://127.0.0.1:5174 therefore gets `origin_mismatch`
// from Google even though it is the same server, so the loopback spelling is
// permanently redirected to `localhost` here instead. Only the literal
// 127.0.0.1 host is rewritten: the bot's "Go to portal" link uses this
// machine's LAN IP and has to keep working. 308 rather than 301/302 so the
// method and body of the same-origin `/api` calls made from the page survive.
// The redirect target, `localhost`, is never rewritten, so there is no loop.
//
// The middleware's request/response shape is spelled out locally rather than
// taken from Vite's `Connect` types: those lean on @types/node, so they cannot
// describe `headers`/`url` in an app where that package is not installed.
type LoopbackRequest = { headers: { host?: string }; url?: string };
type LoopbackResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(): void;
};

function redirectLoopbackToLocalhost(): Plugin {
  const toLocalhost = (req: LoopbackRequest, res: LoopbackResponse, next: () => void) => {
    const host = (req.headers.host ?? '').toLowerCase();
    // Split host from port without bracketed-IPv6 handling: 127.0.0.1 is
    // never bracketed, and every other host is passed through untouched.
    const sep = host.lastIndexOf(':');
    const hostname = (sep === -1 ? host : host.slice(0, sep)).replace(/\.$/, '');
    if (hostname !== '127.0.0.1') return next();
    const port = sep === -1 ? '' : host.slice(sep + 1);
    // These are plain-HTTP dev servers, so 80 is the scheme default; 443 is
    // omitted too since an https listener would never reach this middleware.
    const suffix = port === '' || port === '80' || port === '443' ? '' : `:${port}`;
    res.statusCode = 308;
    res.setHeader('Location', `http://localhost${suffix}${req.url ?? '/'}`);
    res.end();
  };
  // At runtime `use` takes an ordinary (req, res, next) handler; the `unknown`
  // handle in this local signature is only here to decouple it from Vite's
  // Connect typings, which cannot express the shape declared above.
  const mount = (server: { middlewares: { use(handle: unknown): unknown } }) => {
    server.middlewares.use(toLocalhost);
  };
  return {
    name: 'redirect-loopback-to-localhost',
    // Hooks without a returned function run before Vite's internal
    // middlewares, so the redirect wins over static serving and the proxy.
    configureServer(server) {
      mount(server);
    },
    configurePreviewServer(server) {
      mount(server);
    },
  };
}

export default defineConfig({
  plugins: [redirectLoopbackToLocalhost(), react()],
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
