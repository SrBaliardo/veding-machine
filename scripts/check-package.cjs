const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
fs.mkdirSync(path.resolve('.tmp'), { recursive:true });
const directory = fs.mkdtempSync(path.resolve('.tmp/packaged-check-'));
const executable = path.resolve('release/medalhive/win-unpacked/MedalHive.exe');
const env = { ...process.env, MEDALHIVE_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, ['--diagnostics'], { env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  try {
    assert.equal(code,0);
    const report = JSON.parse(fs.readFileSync(path.join(directory,'diagnostics.json'),'utf8'));
    assert.equal(report.packaged,true); assert.equal(report.integrity,'ok');
    assert.equal(report.products,4); assert.equal(report.home,true);
    assert.equal(report.nodeExposed,false); assert.equal(report.bridge,true); assert.equal(report.brokenImages,0);
    console.log(JSON.stringify(report,null,2));
    console.log('MEDALHIVE_PACKAGE_PASS');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
