const fs = require('node:fs');
const path = require('node:path');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], { env, stdio:'inherit' });
  process.exitCode = result.status || (result.error ? 1 : 0);
} else {
  const { app, nativeImage } = require('electron');
  app.whenReady().then(() => {
    const image = nativeImage.createFromPath(path.resolve('src/assets/images/hivetroncoin_hivepower.png'));
    if (image.isEmpty()) throw new Error('A arte do ícone não foi encontrada.');
    const png = image.resize({ width:256,height:256,quality:'best' }).toPNG();
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1,2); header.writeUInt16LE(1,4);
    header.writeUInt16LE(1,10); header.writeUInt16LE(32,12);
    header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
    fs.mkdirSync(path.resolve('build'), { recursive:true });
    fs.writeFileSync(path.resolve('build/icon.ico'), Buffer.concat([header,png]));
    app.quit();
  }).catch(error => { console.error(error.message); app.exit(1); });
}
