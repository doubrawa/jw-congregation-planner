import { defineConfig } from 'vite'
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
