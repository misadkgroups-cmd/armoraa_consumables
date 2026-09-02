import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync, readFileSync } from 'fs'

// Unique ID generated per build. The running app compares this against the
// version.json emitted into dist/ — if they differ, a new deploy is live and
// the app shows a "refresh" prompt (see src/components/UpdatePrompt.jsx).
const BUILD_ID = Date.now().toString(36)

function emitVersionFile() {
  return {
    name: 'emit-version-file',
    closeBundle() {
      writeFileSync(
        'dist/version.json',
        JSON.stringify({ version: BUILD_ID, builtAt: new Date().toISOString() })
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works at a domain root OR a GitHub Pages
  // project subpath (e.g. /armoraa_consumables/). Absolute '/assets/...'
  // references 404 on subpath deploys and produce a white screen.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    emitVersionFile(),
    // public/404.html (copied verbatim into dist/) is the SPA fallback for
    // static hosts like GitHub Pages: deep links such as /billing-log/all-bills
    // hit 404.html, which stores the requested URL and redirects to the app
    // root; index.html's inline snippet then restores the route.
  ],
})

