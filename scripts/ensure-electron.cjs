const fs = require('node:fs');
const executable = require('electron');
fs.accessSync(executable);
console.log('Runtime Electron disponível para empacotamento.');
