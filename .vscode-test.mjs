import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: './src/test/fixtures/workspace',
  mocha: {
    timeout: 20000
  }
});
