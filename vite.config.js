import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'fs'

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
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [react(), tailwindcss(), emitVersionFile()],
})

