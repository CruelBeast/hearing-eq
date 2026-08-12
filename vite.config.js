import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Read rather than import, so the config does not depend on the Node version's
// support for JSON import attributes.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
);

// Build stamp shown in the footer, so a deploy can be identified at a glance.
// Cloudflare Pages exposes the commit as CF_PAGES_COMMIT_SHA; locally we ask
// git, and fall back to "dev" when neither is available (e.g. a tarball build).
function commitRef() {
  const fromCI = process.env.CF_PAGES_COMMIT_SHA;
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitRef()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
});
