const js = require('@eslint/js');
const globals = require('globals');
const hooks = require('eslint-plugin-react-hooks');
module.exports = [
  { ignores: ['dist/**','release/**','node_modules/**','.tmp/**','.local/**'] },
  js.configs.recommended,
  { files: ['**/*.cjs','vite.config.js'], languageOptions: { globals: globals.node, sourceType: 'commonjs' } },
  { files: ['vite.config.js'], languageOptions: { sourceType: 'module' } },
  { files: ['src/medalhive/**/*.{js,jsx}','src/main.jsx'], languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' }, plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules, 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_' }] } },
];
