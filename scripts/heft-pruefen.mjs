/**
 * **Jede neue Ausgabe des Arbeitshefts gegen den Parser fahren** (Betreiber,
 * 16.10.2026). Holt die Wochen der laufenden Ausgaben von jw.org — mit
 * derselben Suche wie `import-week` (`import-week/hefte.ts`) —, parst sie mit
 * dem echten Parser (`import-week/parse.ts`) und meldet, was nach einer neuen
 * Form der Seite aussieht.
 *
 * Anlass: Ab Januar 2027 stehen die Lieder als Absatz, und unter „Uns im Dienst
 * verbessern" gibt es den „Vortrag des Vorsitzenden". Aufgefallen ist beides
 * am 16.10.2026 nur, weil die nächste Ausgabe zufällig gelesen wurde — im
 * Betrieb wären ab Mitte Dezember alle Lieder ohne Nummer gekommen, und der
 * Vortrag hätte einen Schüler mit Partner bekommen.
 *
 * Was geprüft wird, steht seit dem 31.10.2026 in `import-week/befunde.ts`
 * (`heftBefunde`, `strukturBefunde`) — dieselben Prüfungen laufen bei jedem
 * Holen in der App, und das Blatt „Programm holen" zeigt, was sie finden.
 * Hier stehen nur der Abruf und die Ausgabe:
 *  - die deutsche Seite mit den Formen unter „Uns im Dienst verbessern" —
 *    der Parser versteht sie nur deutsch;
 *  - je weiterer Sprache die Seite selbst und ihre Gliederung gegen die
 *    deutsche. Die Plätze überträgt `applyGoldSlots` nach der Stelle.
 *
 * Aufruf:  node scripts/heft-pruefen.mjs [--alle] [sprachcode …]
 *   Ohne Sprachcode nur Deutsch, sonst dazu die Fassungen (en fr …).
 *   `--alle` prüft auch die Wochen, die schon vorbei sind.
 * Nur lesen — nichts geht in die Datenbank. Endet mit Code 1, wenn es etwas zu
 * melden gibt.
 */

import { alsSkript, appCodeBereit } from './gemeinsam.mjs'

appCodeBereit()
const { parseWorkbookWeek } = await import('../supabase/functions/import-week/parse.ts')
const { befundAufDeutsch, heftBefunde, strukturBefunde } = await import('../supabase/functions/import-week/befunde.ts')
const { discoverWeeks, localizedUrl, UA } = await import('../supabase/functions/import-week/hefte.ts')

async function main() {
  const argumente = process.argv.slice(2)
  const alle = argumente.includes('--alle')
  const sprachen = argumente.filter((a) => !a.startsWith('--'))
  const jetzt = new Date()
  const heute = Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())

  let abrufe = 0
  const holen = async (url) => {
    abrufe++
    const antwort = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de' } })
    if (!antwort.ok) throw new Error(`HTTP ${antwort.status} bei ${url}`)
    return antwort.text()
  }

  // Die Woche des Gedächtnismahls hat keine Seite (`url: null`).
  const wochen = (await discoverWeeks(holen, jetzt)).filter((w) => w.url && (alle || w.start.getTime() + 6 * 864e5 >= heute))
  let gemeldet = 0
  const fehlend = []
  const melde = (wer, befunde) => {
    if (befunde.length === 0) return
    gemeldet += befunde.length
    console.log(`${wer}:`)
    for (const b of befunde) console.log(`  - ${b}`)
  }

  for (const w of wochen) {
    const tag = w.start.toISOString().slice(0, 10)
    const html = await holen(w.url)
    const de = parseWorkbookWeek(html)
    const aufDeutsch = (b) => befundAufDeutsch(b, de)
    melde(`${tag} de (${de.range})`, heftBefunde(de, de).map(aufDeutsch))
    for (const code of sprachen) {
      const url = localizedUrl(html, code)
      // Eine Sprache, die noch fehlt, ist keine neue Form — nur ein Hinweis.
      if (!url) {
        fehlend.push(`${tag} ${code}`)
        continue
      }
      const fremd = parseWorkbookWeek(await holen(url))
      // Die Formen unter „Uns im Dienst verbessern" meldet die deutsche Seite schon.
      melde(`${tag} ${code}`, [...heftBefunde(fremd, null), ...strukturBefunde(de, fremd, code)].map(aufDeutsch))
    }
  }

  const erste = wochen[0]?.start.toISOString().slice(0, 10)
  const letzte = wochen.at(-1)?.start.toISOString().slice(0, 10)
  console.log(`\n${wochen.length} Wochen${erste ? ` (${erste} bis ${letzte})` : ''}, ${abrufe} Abrufe bei jw.org.`)
  if (fehlend.length) console.log(`Noch nicht in der Sprache: ${fehlend.join(', ')}`)
  console.log(gemeldet ? `${gemeldet} Befunde — erst ansehen, dann den Parser anpassen.` : 'Keine Auffälligkeiten.')
  if (gemeldet) process.exitCode = 1
}

alsSkript(import.meta.url, main)
