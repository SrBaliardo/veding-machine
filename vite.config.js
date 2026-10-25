import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
export default defineConfig({
  plugins: [react(), {
    name: 'medalhive-local-preview',
    configureServer(server) {
      const { Store } = require('./electron/store.cjs');
      const store = new Store(path.resolve('.local/preview.sqlite'));
      const timer = setInterval(() => { try { store.advance(); } catch (error) { console.error(error.message); } }, 100);
      server.httpServer?.once('close', () => { clearInterval(timer); store.close(); });
      server.middlewares.use('/__medalhive', (req, res) => {
        if (req.method !== 'POST' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { res.statusCode = 403; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 32768) req.destroy(); });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { method, payload, token } = JSON.parse(body);
            res.end(JSON.stringify({ ok: true, data: store.call(method, payload, token) }));
          } catch (error) { res.end(JSON.stringify({ ok: false, error: error.message })); }
        });
      });
    },
  }],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'chrome138', chunkSizeWarningLimit: 600 },
});
