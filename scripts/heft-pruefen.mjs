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
 * Geprüft wird je Woche (`befundeDerWoche`, `strukturBefunde`):
 *  - Eröffnung und Abschluss tragen ein Lied mit Nummer — sonst kam die
 *    Rückfall-Zeile —, und unter „Unser Leben als Christ" steht ein Lied;
 *  - die Abschnitte der Zusammenkunft, jeder farbige mit Punkten, alle
 *    fortlaufend nummeriert, jeder mit Titel, Minuten und Plätzen;
 *  - auf Deutsch: Jeden Punkt unter „Uns im Dienst verbessern" kennt der
 *    Parser (`dienstteilBekannt`) — seine Formen versteht er nur deutsch;
 *  - je weiterer Sprache: dieselbe Gliederung wie die deutsche Seite. Die
 *    Plätze überträgt `applyGoldSlots` nach der Stelle.
 *
 * Aufruf:  node scripts/heft-pruefen.mjs [--alle] [sprachcode …]
 *   Ohne Sprachcode nur Deutsch, sonst dazu die Fassungen (en fr …).
 *   `--alle` prüft auch die Wochen, die schon vorbei sind.
 * Nur lesen — nichts geht in die Datenbank. Endet mit Code 1, wenn es etwas zu
 * melden gibt.
 */

import { alsSkript, appCodeBereit } from './gemeinsam.mjs'

appCodeBereit()
const { dienstteilBekannt, parseWorkbookWeek } = await import('../supabase/functions/import-week/parse.ts')
const { discoverWeeks, localizedUrl, UA } = await import('../supabase/functions/import-week/hefte.ts')

/** Eine Ziffer in irgendeiner Schrift — das Lied trägt seine Nummer auch auf Persisch (۱۲۲). */
const ZIFFER = /\p{Nd}/u

/** Die Abschnitte einer Zusammenkunft unter der Woche, in dieser Folge. */
const GLIEDERUNG = 'neutral petrol gold wein neutral'

/** Die farbigen Abschnitte — dort stehen die nummerierten Punkte. */
const FARBIG = new Set(['petrol', 'gold', 'wein'])

/**
 * Was an einer geparsten Woche nach einer neuen Form der Seite aussieht — als
 * Sätze, leer heißt: in Ordnung. Mit `deutsch` auch die Formen unter „Uns im
 * Dienst verbessern": Der Parser versteht ihre Beschreiber nur deutsch, für die
 * übrigen Sprachen kommen die Plätze von der deutschen Seite.
 */
export function befundeDerWoche(woche, { deutsch }) {
  const befunde = []
  const abschnitte = woche.mid.sections
  if (!woche.range) befunde.push('kein Zeitraum')
  const farben = abschnitte.map((s) => s.farbe).join(' ')
  if (farben !== GLIEDERUNG) befunde.push(`Abschnitte „${farben}" statt „${GLIEDERUNG}"`)

  const zeile = (art) => abschnitte.find((s) => s.kind === art)?.items.find((i) => 'names' in i)
  for (const [art, name] of [['eroeffnung', 'Eröffnung'], ['abschluss', 'Abschluss']]) {
    const titel = zeile(art)?.title ?? ''
    if (!ZIFFER.test(titel)) befunde.push(`${name} ohne Liednummer: „${titel}"`)
  }
  const leben = abschnitte.find((s) => s.farbe === 'wein')
  if (leben && !leben.items.some((i) => 'song' in i)) befunde.push(`kein Lied unter „${leben.label}"`)

  for (const s of abschnitte.filter((s) => FARBIG.has(s.farbe))) {
    if (!s.items.some((i) => 'names' in i)) befunde.push(`„${s.label}" ohne Punkte`)
  }
  const punkte = abschnitte.filter((s) => FARBIG.has(s.farbe)).flatMap((s) => s.items.filter((i) => 'names' in i).map((p) => ({ p, s })))
  punkte.forEach(({ p, s }, i) => {
    const wo = `Punkt ${p.num ?? '?'} „${p.title}"`
    if (p.num !== i + 1) befunde.push(`${wo} steht an Stelle ${i + 1}`)
    if (!p.title.trim()) befunde.push(`${wo} ohne Titel`)
    if (typeof p.mins !== 'number') befunde.push(`${wo} ohne Minuten`)
    if (p.names.length === 0) befunde.push(`${wo} ohne Plätze`)
    if (deutsch && s.farbe === 'gold' && !dienstteilBekannt(p.title, p.meta ?? '')) {
      befunde.push(`${wo}: Form „${(p.meta ?? '').split(' · ')[0]}" — der Parser rät die Plätze`)
    }
  })
  return befunde
}

/** Die Gliederung einer Woche: je Abschnitt Lieder (L) und Punkte mit Nummer. */
const gliederung = (woche) =>
  woche.mid.sections.map((s) => `${s.farbe}: ${s.items.map((i) => ('song' in i ? 'L' : (i.num ?? '·'))).join(' ')}`).join(' | ')

/**
 * Gliedert sich die Fassung einer anderen Sprache wie die deutsche? Die Plätze
 * kommen nach der Stelle von dort (`applyGoldSlots`) — eine verschobene Stelle
 * gäbe einem Punkt die Plätze seines Nachbarn.
 */
export function strukturBefunde(deutsch, fremd) {
  const soll = gliederung(deutsch)
  const ist = gliederung(fremd)
  return ist === soll ? [] : [`gegliedert „${ist}" statt wie Deutsch „${soll}"`]
}

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
    melde(`${tag} de (${de.range})`, befundeDerWoche(de, { deutsch: true }))
    for (const code of sprachen) {
      const url = localizedUrl(html, code)
      // Eine Sprache, die noch fehlt, ist keine neue Form — nur ein Hinweis.
      if (!url) {
        fehlend.push(`${tag} ${code}`)
        continue
      }
      const fremd = parseWorkbookWeek(await holen(url))
      melde(`${tag} ${code}`, [...befundeDerWoche(fremd, { deutsch: false }), ...strukturBefunde(de, fremd)])
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
