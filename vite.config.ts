import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { constants, setPriority } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { alsCacheName, SW_PLATZHALTER, swMitKennung } from './scripts/sw-kennung.mjs'
import { entwicklerseite, testdatenWache } from './scripts/testdaten-grenze.mjs'
import { TESTDATEN_KENNZEICHEN } from './tests/testdaten/kennzeichen.ts'

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

/**
 * **Ein Testlauf lässt den Rechner bedienbar** (Betreiber, 31.10.2026: „das
 * dauert lange und blockiert den rechner in der zeit, weil die prozessorlast
 * extrem hoch ist"). vitest setzt `VITEST`, bevor es diese Datei lädt; dann
 * läuft es mit „Niedriger als normal", und unter Windows erben die Worker das.
 * Dev-Server und Build bleiben unberührt, die CI ebenso — dort drängelt
 * niemand.
 */
if (process.env.VITEST && !process.env.CI) {
  try {
    setPriority(constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    // Ohne das Recht dazu läuft der Test eben mit normaler Priorität.
  }
}

// https://vite.dev/config/
//
// Die App läuft unter der eigenen Domain https://versammlung.app/ und liegt
// dort in der Wurzel — der base-Pfad ist deshalb überall "/". Vorher stand hier
// '/jw-congregation-planner/', weil GitHub Pages eine Projekt-Site unter
// /<repo>/ ausliefert; mit eigener Domain entfällt dieser Pfad. Wer die App
// wieder unter dem github.io-Pfad ausliefern will, baut mit
// `vite build --base=/jw-congregation-planner/`.
export default defineConfig(({ command }) => ({
  base: '/',
  // Die Testdaten bleiben draußen: `/demo.html` zeigt sie nur im Dev-Server,
  // und jeder Build bricht ab, in dem eines ihrer Module oder Kennzeichen
  // steckt (scripts/testdaten-grenze.mjs).
  plugins: [react(), serviceWorkerKennung(), entwicklerseite(), testdatenWache(TESTDATEN_KENNZEICHEN)],
  // Nur beim Build ermitteln: sonst liefe bei jedem Dev-Start und jedem
  // Testlauf ein git-Prozess mit, obwohl die Kennung dort nichts aussagt.
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId() : 'dev') },
  test: {
    // Unter `.claude/worktrees/<name>/` liegt je Worktree eine volle Kopie des
    // Repos auf eigenem Commit. vitest sammelt mit `dot: true`, beachtet
    // `.gitignore` nicht, und sein Standard-`exclude` nimmt in vitest 4 nur
    // `node_modules` und `.git` aus. Im Hauptcheckout zählte
    // `vitest list --filesOnly` deshalb 1557 Testdateien statt 195, 1362 davon
    // aus sieben Worktrees (26.9.2026): Die Suite lief einmal je Kopie, ein
    // roter Test in irgendeinem Worktree machte den Lauf rot, und die
    // Mutationsprobe konnte einer Regel einen fremden Wächter gutschreiben.
    // Das Muster gilt relativ zur Wurzel, trifft im Worktree selbst also
    // nichts — und sonst liegt unter `.claude/` kein Test.
    exclude: [...configDefaults.exclude, '.claude/**'],
    // Halb so viele Worker wie Kerne statt aller bis auf einen — und trotzdem
    // schneller: Gemessen am 31.10.2026 auf 16 logischen Kernen lief die Suite
    // mit 15 Workern 117,5 s (sieben Tests rissen die 5 s Frist), mit 8 Workern
    // 106,7 s ohne einen Ausfall. Die Kerne teilen sich Rechenwerke und
    // Speicherbus; mehr Worker bauten jsdom nur langsamer auf (Umgebung
    // 700 s gegen 311 s, über alle Worker gezählt). Die CI behält ihre
    // Vorgabe — dort gibt es zwei bis vier Kerne.
    maxWorkers: process.env.CI ? undefined : '50%',
    // Die Bildschirm-Proben laufen unter happy-dom (Docblock je Datei); was die
    // App dort anders vorfände als unter jsdom, gleicht diese Datei an.
    setupFiles: ['./tests/dom-umgebung.ts'],
    // Ein `<script src>`, das eine Probe einhängt (die Fassungsprüfung liest
    // das Bündel daraus), lädt happy-dom nicht — und schrieb dafür je Skript
    // einen Fehler samt Stapel auf die Konsole. jsdom lud es ebenso wenig, still.
    environmentOptions: { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } } },
    // Die CI hat beim Testen keine Supabase-Variablen. Lokal läse Vite
    // `.env.local` mit — ein Test, der davon abhing, war dann lokal grün und
    // in der CI rot (15.9.2026, der Deploy blieb stehen). Leer gilt hier
    // dasselbe wie dort: kein Client, also kein Weg, der hinausgeht.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
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
