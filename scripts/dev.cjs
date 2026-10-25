const { spawn } = require('node:child_process');
const path = require('node:path');
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' });
let electron;
let stopped = false;
function stop() { if (stopped) return; stopped = true; electron?.kill(); vite.kill(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
vite.on('exit', code => { if (!stopped) { stop(); process.exitCode = code || 0; } });
(async () => {
  for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const env = { ...process.env, MEDALHIVE_DEV_URL: 'http://127.0.0.1:5173' };
        delete env.ELECTRON_RUN_AS_NODE;
        electron = spawn(require('electron'), ['.', '--windowed'], { stdio: 'inherit', env });
        electron.on('exit', stop); return;
      }
    } catch { /* Vite is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!stopped) { console.error('O Vite não iniciou na porta 5173.'); stop(); process.exitCode = 1; }
})();
