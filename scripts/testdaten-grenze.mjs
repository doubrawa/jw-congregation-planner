/**
 * **Die Grenze zwischen Testdaten und App** — zwei Bauschritte für
 * `vite.config.ts`.
 *
 * Die erfundenen Daten liegen unter `tests/testdaten/`: Die Tests benutzen
 * sie, die Entwicklerseite zeigt sie, die App nie. Bis zum 2.10.2026 lagen sie
 * unter `src/data/` und sollten über `import.meta.env.DEV` aus dem Bündel
 * fallen. Die erfundene Personenliste stand trotzdem mit Adressen und Nummern
 * auf versammlung.app. Geprüft hatte das eine Einmal-Messung vom 13.8., die
 * nach „Manfred Albrecht" suchte — so steht der Name aber nur in den Wochen;
 * die Personenliste führt Vor- und Nachnamen getrennt.
 *
 * Deshalb hier zwei Schritte statt einer Messung:
 *
 *  - `entwicklerseite()` liefert im Dev-Server `/demo.html` aus — gebaut aus
 *    `index.html`, nur mit anderem Einstieg. Als Datei gibt es die Seite
 *    nicht, also kann sie auch niemand versehentlich mitbauen, und ihr Kopf
 *    läuft `index.html` nicht davon.
 *  - `testdatenWache()` bricht jeden Build ab, in dem ein Modul aus
 *    `tests/testdaten/` steckt oder ein Kennzeichen der Testdaten im Ergebnis
 *    steht. Die CI baut vor dem Veröffentlichen — ein solcher Stand geht also
 *    gar nicht erst hinaus.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Wo die erfundenen Daten liegen — als Teil einer Modul-Kennung, beide Pfadtrenner. */
export const TESTDATEN_ORDNER = /[\\/]tests[\\/]testdaten[\\/]/

/** Pfad der Entwicklerseite. Steht gleichlautend in `src/lib/supabase.ts`. */
export const ENTWICKLERSEITE = '/demo.html'

const APP_EINSTIEG = '/src/main.tsx'
const ENTWICKLER_EINSTIEG = '/tests/testdaten/demo.tsx'

/**
 * `index.html` mit dem Einstieg der Entwicklerseite.
 *
 * Rein und ohne Datei-Zugriff, damit sie prüfbar ist. Lädt `index.html` den
 * App-Einstieg nicht mehr, ist `ersetzt` false — die Seite wäre sonst still
 * die App selbst.
 */
export function alsEntwicklerseite(indexHtml) {
  const marke = `src="${APP_EINSTIEG}"`
  return {
    html: indexHtml.replace(marke, `src="${ENTWICKLER_EINSTIEG}"`),
    ersetzt: indexHtml.includes(marke),
  }
}

/** Liefert `/demo.html` im Dev-Server aus (nur `vite serve`, nie im Build). */
export function entwicklerseite() {
  return {
    name: 'entwicklerseite',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== ENTWICKLERSEITE) return next()
        try {
          const { html, ersetzt } = alsEntwicklerseite(
            readFileSync(join(server.config.root, 'index.html'), 'utf8'),
          )
          if (!ersetzt) {
            throw new Error(`index.html lädt ${APP_EINSTIEG} nicht mehr — die Entwicklerseite fände keinen Einstieg`)
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(await server.transformIndexHtml(req.url, html))
        } catch (fehler) {
          next(fehler)
        }
      })
    },
  }
}

const TEXT = /\.(?:[cm]?js|css|html|json|svg|webmanifest|txt|xml)$/i

/** Inhalt einer Ausgabedatei als Text; `null` für Binäres (Schriften, Bilder). */
export function ausgabeText(datei) {
  if (datei.type === 'chunk') return datei.code
  if (!TEXT.test(datei.fileName)) return null
  return typeof datei.source === 'string' ? datei.source : new TextDecoder().decode(datei.source)
}

/**
 * Was die Wache findet — leer heißt sauber.
 *
 * Rein, damit prüfbar: Modul-Kennungen und Dateiinhalte kommen herein, die
 * Befunde als Sätze heraus.
 */
export function testdatenBefunde({ module, dateien, kennzeichen }) {
  const befunde = []
  for (const id of module) {
    if (TESTDATEN_ORDNER.test(id)) befunde.push(`Modul aus den Testdaten: ${id}`)
  }
  for (const { name, text } of dateien) {
    for (const k of kennzeichen) {
      if (text.includes(k)) befunde.push(`${name} enthält „${k}" — ein Kennzeichen der Testdaten`)
    }
  }
  return befunde
}

/**
 * Der Bauschritt: bricht den Build ab, sobald Testdaten im Bündel stehen.
 *
 * Geprüft wird das fertige Ergebnis (`writeBundle`), nicht eine Absicht im
 * Quelltext — genau die hatte am 13.8. getäuscht.
 */
export function testdatenWache(kennzeichen) {
  if (kennzeichen.length === 0) throw new Error('Testdaten-Wache ohne Kennzeichen — sie prüfte ins Leere')
  return {
    name: 'testdaten-wache',
    apply: 'build',
    writeBundle(_optionen, bundle) {
      const dateien = []
      for (const datei of Object.values(bundle)) {
        const text = ausgabeText(datei)
        if (text !== null) dateien.push({ name: datei.fileName, text })
      }
      // Ohne ein einziges Skript prüfte die Wache ins Leere und meldete „sauber".
      if (!dateien.some((d) => /\.[cm]?js$/.test(d.name))) {
        this.error('Testdaten-Wache: kein Skript im Bündel gesehen — geprüft wurde nichts')
      }
      const befunde = testdatenBefunde({ module: this.getModuleIds(), dateien, kennzeichen })
      if (befunde.length > 0) {
        this.error(`Testdaten im ausgelieferten Bündel:\n  ${befunde.join('\n  ')}`)
      }
    },
  }
}
