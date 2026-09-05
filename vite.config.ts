import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { alsCacheName, SW_PLATZHALTER, swMitKennung } from './scripts/sw-kennung.mjs'

/**
 * Kennung des Stands, den ein Gerät gerade ausführt — im Profil sichtbar.
 *
 * Ohne sie lässt sich am Gerät nicht feststellen, welche Fassung dort läuft.
 * Genau daran ist mehrfach Zeit verloren gegangen: ein gemeldeter Fehler war
 * längst behoben, die App auf dem Handy aber noch auf altem Stand.
 *
 * Datum des **Commits**, nicht des Builds: eine Uhrzeit ändert sich bei jedem
 * Lauf, und weil die Kennung im Bundle steht, bekäme jeder Build einen neuen
 * Dateinamen — auch ohne eine einzige Codeänderung. Alle Geräte hätten dann
 * 330 kB neu zu laden, nur weil jemand gebaut hat. Der Commit identifiziert
 * den Stand ohnehin eindeutig; das Datum sagt bloß, wie alt er ist.
 */
function standKennung(): { commit: string; datum: string } {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD').toString().trim(),
      datum: execSync('git show -s --format=%cs HEAD').toString().trim(),
    }
  } catch {
    // Kein Git zur Hand (z. B. aus einem Archiv gebaut). Bewusst ohne
    // Zeitstempel — der brächte die Hash-Instabilität zurück.
    return { commit: 'unbekannt', datum: '' }
  }
}

function buildId(): string {
  const { commit, datum } = standKennung()
  return datum ? `${datum} · ${commit}` : commit
}

/**
 * **Die Stand-Kennung in den Service Worker eintragen.**
 *
 * `public/` geht unverändert nach `dist/`; `define` erreicht die Datei nicht.
 * Der Worker braucht sie aber im Cache-Namen, und zwar aus zwei Gründen
 * zugleich: `activate` löscht nur Caches mit **anderem** Namen, und `activate`
 * läuft überhaupt nur, wenn sich `sw.js` selbst geändert hat. Ohne Kennung hieß
 * der Cache immer gleich — es wurde nie etwas gelöscht, und die gehashten
 * Assets jedes Builds blieben liegen (V9).
 *
 * `writeBundle`, nicht `generateBundle`: Zu dem Zeitpunkt liegt `public/` schon
 * in `dist/`. Fehlt der Platzhalter, bricht der Build ab — ein stillschweigend
 * wirkungsloser Schritt wäre schlimmer als gar keiner.
 */
function serviceWorkerKennung(): Plugin {
  return {
    name: 'sw-kennung',
    apply: 'build',
    writeBundle(options) {
      const pfad = join(options.dir ?? 'dist', 'sw.js')
      const { quelle, ersetzt } = swMitKennung(
        readFileSync(pfad, 'utf8'),
        alsCacheName(standKennung().commit),
      )
      if (!ersetzt) {
        throw new Error(
          `sw.js trägt kein ${SW_PLATZHALTER} mehr — der Cache-Name bliebe konstant (V9).`,
        )
      }
      writeFileSync(pfad, quelle)
    },
  }
}

// https://vite.dev/config/
//
// GitHub Pages (Projekt-Site) liefert die App unter /<repo>/ aus — deshalb
// braucht der Production-Build diesen base-Pfad. Im Dev-Server bleibt es "/".
// Bei eigener Domain oder User-Page (doubrawa.github.io) auf "/" ändern
// bzw. beim Build via `vite build --base=/` überschreiben.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jw-congregation-planner/' : '/',
  plugins: [react(), serviceWorkerKennung()],
  // Nur beim Build ermitteln: sonst liefe bei jedem Dev-Start und jedem
  // Testlauf ein git-Prozess mit, obwohl die Kennung dort nichts aussagt.
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId() : 'dev') },
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
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
}))
