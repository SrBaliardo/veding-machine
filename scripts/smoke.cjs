const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync(path.resolve('.tmp'), { recursive:true });
const directory = fs.mkdtempSync(path.resolve('.tmp/medalhive-ui-'));
const env = { ...process.env, MEDALHIVE_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), ['.', '--smoke-test'], { stdio: 'inherit', env });
child.on('exit', code => {
  const result = path.join(directory,'smoke-result.json');
  if (code !== 0 || !fs.existsSync(result) || JSON.parse(fs.readFileSync(result,'utf8')).status !== 'passed') {
    console.error('O teste não confirmou a conclusão do fluxo de interface.');
    process.exitCode = code || 1;
  }
});
