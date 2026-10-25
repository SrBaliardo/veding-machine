const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
let store, timer, window;
const isDev = !app.isPackaged;
const testing = process.argv.includes('--smoke-test');
const diagnostic = process.argv.includes('--diagnostics');
app.setName('MedalHive');
const dataDir = process.env.MEDALHIVE_DATA_DIR && (isDev || diagnostic) ? path.resolve(process.env.MEDALHIVE_DATA_DIR) : path.join(app.getPath('userData'), 'data');
if ((testing || diagnostic) && process.env.MEDALHIVE_DATA_DIR) {
  const isolatedRuntime = path.join(dataDir, 'runtime');
  fs.mkdirSync(isolatedRuntime, { recursive: true });
  app.setPath('userData', isolatedRuntime);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    try {
      if (diagnostic && (!process.env.MEDALHIVE_DATA_DIR || fs.existsSync(path.join(dataDir, 'medalhive.sqlite')))) throw new Error('O diagnóstico exige uma pasta de dados nova e exclusiva.');
      store = new Store(path.join(dataDir, 'medalhive.sqlite'), { online: () => net.isOnline() });
      const backupDir = path.join(dataDir, 'backups');
      const daily = path.join(backupDir, `medalhive-${new Date().toISOString().slice(0,10)}.sqlite`);
      if (!fs.existsSync(daily)) store.backup(daily);
      const files = fs.readdirSync(backupDir).filter(name => /^medalhive-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).sort();
      files.slice(0, Math.max(0, files.length - 14)).forEach(name => fs.unlinkSync(path.join(backupDir,name)));
      const renderer = isDev ? process.env.MEDALHIVE_DEV_URL : null;
      ipcMain.handle('medalhive:request', async (event, { method, payload, token } = {}) => {
        try {
          if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem não autorizada.');
          if (method === 'backup') {
            store.session(token);
            const result = await dialog.showSaveDialog(window, { title: 'Salvar backup MedalHive', defaultPath: `MedalHive-backup-${Date.now()}.sqlite`, filters: [{ name: 'Banco SQLite', extensions: ['sqlite'] }] });
            return { ok: true, data: result.canceled ? null : store.backup(result.filePath) };
          }
          if (method === 'restore') {
            store.session(token);
            if (store.activeSale()) throw new Error('Finalize a compra em andamento antes de restaurar.');
            const result = await dialog.showOpenDialog(window, { title: 'Selecionar backup MedalHive', properties: ['openFile'], filters: [{ name: 'Banco SQLite', extensions: ['sqlite'] }] });
            if (result.canceled) return { ok: true, data: null };
            const source = result.filePaths[0];
            const { DatabaseSync } = require('node:sqlite');
            const check = new DatabaseSync(source, { readOnly: true });
            let valid;
            try { valid = check.prepare('PRAGMA integrity_check').get().integrity_check === 'ok' && check.prepare('PRAGMA user_version').get().user_version === 1 && check.prepare("SELECT value FROM meta WHERE key='machineId'").get()?.value === store.meta('machineId') && check.prepare("SELECT COUNT(*) AS n FROM sales WHERE status IN ('pending','paid','dispensing','interrupted')").get().n === 0; }
            finally { check.close(); }
            if (!valid) throw new Error('Use um backup íntegro desta máquina, sem compras em andamento.');
            const confirm = await dialog.showMessageBox(window, { type: 'warning', buttons: ['Cancelar', 'Restaurar backup'], defaultId: 0, cancelId: 0, message: 'Restaurar este backup?', detail: 'Os dados atuais serão substituídos pelos do backup. Será salva uma cópia de segurança antes da restauração. O aplicativo será reiniciado.' });
            if (confirm.response !== 1) return { ok: true, data: null };
            clearInterval(timer);
            store.backup(path.join(backupDir, `antes-restauracao-${Date.now()}.sqlite`));
            const staged = path.join(dataDir, 'restore-staged.sqlite');
            const readonly = new DatabaseSync(source, { readOnly: true });
            try { readonly.prepare('VACUUM INTO ?').run(staged); } finally { readonly.close(); }
            store.close(); store = null;
            fs.renameSync(path.join(dataDir, 'medalhive.sqlite'), path.join(dataDir, `substituido-${Date.now()}.sqlite`));
            for (const suffix of ['-wal','-shm']) { const file = path.join(dataDir, `medalhive.sqlite${suffix}`); if (fs.existsSync(file)) fs.unlinkSync(file); }
            fs.renameSync(staged, path.join(dataDir, 'medalhive.sqlite'));
            app.relaunch(); app.quit();
            return { ok: true, data: true };
          }
          return { ok: true, data: store.call(method, payload, token) };
        } catch (error) { return { ok: false, error: error.message }; }
      });
      timer = setInterval(() => { try { store.advance(); } catch (error) { console.error('Motor de simulação:', error.message); } }, 100);
      window = new BrowserWindow({ title: 'MedalHive', width: 1080, height: 900, minWidth: 640, minHeight: 480, fullscreen: !testing && !diagnostic && !process.argv.includes('--windowed'), show: !testing && !diagnostic, autoHideMenuBar: true, backgroundColor: '#171B1F', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, offscreen: testing || diagnostic, backgroundThrottling: false } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => { const allowed = renderer ? url.startsWith(`${renderer}/`) : url.startsWith('file://') && url.split('#')[0] === window.webContents.getURL().split('#')[0]; if (!allowed) event.preventDefault(); });
      if (renderer && isDev) await window.loadURL(renderer);
      else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
      if (diagnostic) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const ui = await window.webContents.executeJavaScript(`({title:document.title,home:!!document.querySelector('.home-page'),bridge:typeof window.medalHive?.invoke==='function',brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,nodeExposed:typeof window.require!=='undefined'})`);
        const report = { version:app.getVersion(),packaged:app.isPackaged,runtime:process.versions.electron,sqlite:store.get('SELECT sqlite_version() AS version').version,integrity:store.get('PRAGMA integrity_check').integrity_check,products:store.products().length,...ui };
        fs.writeFileSync(path.join(dataDir, 'diagnostics.json'), JSON.stringify(report,null,2));
        fs.writeFileSync(path.join(dataDir, 'startup.png'), (await window.webContents.capturePage()).toPNG());
        clearInterval(timer); store.close(); store = null;
        app.exit(report.integrity==='ok' && report.home && report.bridge && !report.nodeExposed && !report.brokenImages ? 0 : 1);
      }
      if (testing) {
        const { runSmoke } = require('../tests/electron-smoke.cjs');
        try { await runSmoke(window, store); fs.writeFileSync(path.join(dataDir, 'smoke-result.json'), JSON.stringify({ status:'passed' })); clearInterval(timer); store.close(); store = null; app.exit(0); }
        catch (error) { console.error(error); app.exit(1); }
      }
    } catch (error) { console.error(error); dialog.showErrorBox('MedalHive — não foi possível iniciar', `${error.message}\nOs dados existentes não foram apagados.`); app.exit(1); }
  });
  app.on('before-quit', () => { clearInterval(timer); if (store) { store.close(); store = null; } });
  app.on('window-all-closed', () => app.quit());
}
