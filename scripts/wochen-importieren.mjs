#!/usr/bin/env node
/**
 * Mehrere Wochenprogramme von jw.org holen — ohne Klicken in der App.
 *
 * In der App holt „NÄCHSTE WOCHE IMPORTIEREN" **eine** Woche je Klick. Nach
 * einem Neuaufbau braucht es acht davon, und acht Klicks sind acht
 * Gelegenheiten, eine zu vergessen.
 *
 * Gearbeitet wird mit derselben Edge Function wie in der App
 * (`import-week`): Sie holt die Seite von jw.org und gibt eine fertige Woche
 * zurück — das Zerlegen des HTML steht damit an genau einer Stelle, und dieses
 * Skript kann es nicht anders machen als die App. Geschrieben wird wie dort:
 * eine Zeile je Woche in `weeks` (`congregation_id`, `start`, `data`).
 *
 * **Die Function nimmt den Secret-Schlüssel als Anmeldung an** (gemessen am
 * 18.9.2026: Status 200). Sie verlangt laut `config.toml` ein JWT, und der
 * Schlüssel gilt dem Gateway als eines — deshalb braucht dieses Skript keine
 * Anmeldung eines Benutzers.
 *
 * Sprache: `congregations.cong_lang` ist bereits der **jw.org-Sprachcode**
 * (seit dem Schema-Neuaufbau, siehe `supabase/schema.sql`), `prog_langs` sind
 * die weiteren Programmsprachen. Beides geht unverändert an die Function —
 * genau wie es der Einstellungen-Bildschirm tut.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/wochen-importieren.mjs [--anzahl 8] [--ab 2026-10-19]
 *                                       [--cong <id>] [--trocken]
 *
 *   --anzahl   wie viele Wochen (Standard 8).
 *   --ab       ab welcher Woche weitergezählt wird (ISO-Montag). Ohne Angabe:
 *              die letzte gespeicherte Woche; ist keine da, fängt die Function
 *              bei der laufenden an.
 *   --trocken  holt und zeigt, schreibt aber nicht.
 *
 * Gibt es zur nächsten Woche noch kein Programm auf jw.org, endet der Lauf mit
 * dem, was da war — das ist kein Fehler, sondern der Kalender.
 */

import { argumente, funktionsKopf, restKlient, zugangsdaten } from './gemeinsam.mjs'

/**
 * Wochen der Reihe nach holen. Jede Antwort nennt ihren Montag, und der ist
 * die Basis für die nächste Anfrage — dieselbe Kette wie in der App
 * (`latestImportedStart` → `importNextWeek`).
 *
 * `holen` ist ein Parameter, damit die Probe ohne Netz messen kann.
 */
export async function wochenHolen({ url, key, lang = 'de', altLangs = [], ab, anzahl, holen = fetch }) {
  const wochen = []
  let cursor = ab
  for (let i = 0; i < anzahl; i++) {
    const antwort = await holen(`${url}/functions/v1/import-week`, {
      method: 'POST',
      headers: funktionsKopf(key),
      body: JSON.stringify({ after: cursor, lang, altLangs }),
    })
    const text = await antwort.text()
    let nutzlast = null
    try {
      nutzlast = text ? JSON.parse(text) : null
    } catch {
      return { wochen, fehler: `unlesbare Antwort (${antwort.status}): ${text.slice(0, 120)}` }
    }
    if (!nutzlast?.week) {
      return { wochen, fehler: nutzlast?.error ?? `HTTP ${antwort.status}` }
    }
    wochen.push(nutzlast.week)
    cursor = nutzlast.week.start
  }
  return { wochen, fehler: '' }
}

/**
 * Was davon wirklich neu ist. Die Kette beginnt hinter der letzten
 * gespeicherten Woche, doppelt sollte also nichts kommen — aber `weeks` hat
 * `unique (congregation_id, start)`, und ein abgewiesener Schreibvorgang mitten
 * im Lauf wäre teurer als dieser Vergleich.
 */
export function nurNeue(vorhandeneStarts, wochen) {
  const da = new Set(vorhandeneStarts)
  return wochen.filter((w) => w.start && !da.has(w.start))
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const anzahl = Number(arg.anzahl ?? 8)
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 52) {
    console.error('--anzahl braucht eine ganze Zahl zwischen 1 und 52.')
    process.exit(2)
  }
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)

  const cong = arg.cong
    ? (await rest(`congregations?select=id,name,cong_lang,prog_langs&id=eq.${arg.cong}`))[0]
    : (await rest('congregations?select=id,name,cong_lang,prog_langs&limit=1'))[0]
  if (!cong) {
    console.error('Keine Versammlung gefunden — erst scripts/versammlung-anlegen.mjs.')
    process.exit(1)
  }

  const vorhandene = (await rest(`weeks?select=start&congregation_id=eq.${cong.id}&order=start`)).map((w) => w.start)
  const ab = arg.ab || vorhandene[vorhandene.length - 1]

  console.log(`Versammlung:  ${cong.name} (${cong.id})`)
  console.log(`Sprache:      ${cong.cong_lang}${cong.prog_langs?.length ? ` (+ ${cong.prog_langs.join(', ')})` : ''}`)
  console.log(`Vorhanden:    ${vorhandene.length} Woche(n)${ab ? `, zuletzt ${ab}` : ''}`)
  console.log(`Holen:        ${anzahl}${ab ? ` ab ${ab}` : ' ab der laufenden Woche'}\n`)

  const { wochen, fehler } = await wochenHolen({
    url, key, lang: cong.cong_lang, altLangs: cong.prog_langs ?? [], ab, anzahl,
  })
  const neue = nurNeue(vorhandene, wochen)
  for (const w of neue) console.log(`  ${w.start}  ${w.range ?? ''}`)
  if (fehler) console.log(`\nDanach nichts mehr: ${fehler}`)

  if (!neue.length) {
    console.log('\nNichts zu tun.')
    return
  }
  if (arg.trocken) {
    console.log(`\n--trocken: ${neue.length} Woche(n) blieben ungeschrieben.`)
    return
  }
  for (const w of neue) {
    await rest('weeks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ congregation_id: cong.id, start: w.start, data: w }),
    })
  }
  console.log(`\nGeschrieben: ${neue.length} Woche(n).`)
}

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
  })
}
