import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// GitHub Pages (Projekt-Site) liefert die App unter /<repo>/ aus — deshalb
// braucht der Production-Build diesen base-Pfad. Im Dev-Server bleibt es "/".
// Bei eigener Domain oder User-Page (doubrawa.github.io) auf "/" ändern
// bzw. beim Build via `vite build --base=/` überschreiben.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jw-congregation-planner/' : '/',
  plugins: [react()],
  test: {
    alias: [
      // Die Edge-Functions holen web-push über den Deno-npm-Specifier, den Node
      // nicht auflösen kann. Im Test tritt ein Stub an seine Stelle, damit die
      // Functions unverändert (also so wie deployt) geprüft werden können.
      {
        find: /^npm:web-push@.*$/,
        replacement: fileURLToPath(new URL('./supabase/functions/_test/web-push.stub.ts', import.meta.url)),
      },
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor-Code in eigene, gut cachebare Chunks (ändert sich seltener
        // als der App-Code); die Sprach-Overlays splittet import.meta.glob.
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
}))
