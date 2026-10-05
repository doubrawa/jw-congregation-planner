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
 * Skript kann es nicht anders machen als die App.
 *
 * **Eingeordnet wird mit derselben Funktion wie beim Knopf in der App**
 * (`neueWocheEinordnen`, `src/data/neue-woche.ts`): Endzeiten aus den eigenen
 * Zusammenkunftszeiten, die Zusätzliche Klasse, der Ausfall in der Woche des
 * Gedächtnismahls und die Treffpunkte aus dem Grundplan samt vorgemerkter
 * Gruppenbesuche. Geschrieben wird eine Zeile je Woche in `weeks` und eine in
 * `fs_weeks`. Bis zum 5.10.2026 stand hier „Geschrieben wird wie dort", und
 * geschrieben wurde die Woche, wie `import-week` sie liefert — ohne Klasse, mit
 * den festen Endzeiten des Imports, ohne Treffpunkte. Mit eingeschalteter
 * Klasse wies `zuteilen` danach jede Zuteilung eines Planers in diesen Wochen
 * als Umbau ab. Wer nachsehen will, ob der Bestand so dasteht, wie die App ihn
 * lädt: `scripts/wochen-angleichen.mjs`.
 *
 * Hat eine Woche schon Treffpunkte (`fs_weeks`), bleiben sie stehen — anders
 * als in der App, die eine neue Woche nie mit vorhandenen Treffpunkten sieht.
 *
 * **Die Function nimmt den Secret-Schlüssel als Anmeldung an** (gemessen am
 * 18.9.2026: Status 200). Sie verlangt laut `config.toml` ein JWT, und der
 * Schlüssel gilt dem Gateway als eines — deshalb braucht dieses Skript keine
 * Anmeldung eines Benutzers. Seit dem 1.10.2026 prüft `import-week` zusätzlich
 * selbst: Durch kommt ein Mitglied mit Sitzung oder ein `apikey`, der unter den
 * Secret-Schlüsseln des Projekts steht (`SUPABASE_SECRET_KEYS`) — den schickt
 * `funktionsKopf` mit. Der öffentliche Publishable-Key genügt nicht mehr.
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

import { alsSkript, appCodeBereit, argumente, funktionsKopf, restKlient, versammlungHolen, zugangsdaten } from './gemeinsam.mjs'

/** Was die Einordnung von der Versammlung braucht — Zeiten und Klasse kommen aus dieser Zeile. */
const VERSAMMLUNG_SPALTEN = 'id,name,cong_lang,prog_langs,aux_class,mid_wd,mid_time,we_wd,we_time'

/**
 * Wochen der Reihe nach holen. Jede Antwort nennt ihren Montag, und der ist
 * die Basis für die nächste Anfrage — dieselbe Kette wie in der App
 * (`latestImportedStart` → `importNextWeek`).
 *
 * `holen` ist ein Parameter, damit die Probe ohne Netz messen kann.
 *
 * @param {{
 *   url: string, key: string, lang?: string, altLangs?: string[], ab?: string, anzahl: number,
 *   holen?: (adresse: string, init: { method: string, headers: Record<string, string>, body: string }) => Promise<{ status: number, text: () => Promise<string> }>
 * }} auftrag
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

/**
 * Die Einordnung der App, bestückt mit dieser Versammlung: Grundplan,
 * Gruppenbesuche und Personen gelesen und umgesetzt wie beim Laden der App
 * (`src/lib/zeilen.ts`), dieselbe Reihenfolge wie dort.
 */
async function einordnungFuer(rest, cong) {
  appCodeBereit()
  const [{ neueWocheEinordnen }, zeilen, { zeitenAus }] = await Promise.all([
    import('../src/data/neue-woche.ts'),
    import('../src/lib/zeilen.ts'),
    import('../supabase/functions/_shared/planung.ts'),
  ])
  const meine = `congregation_id=eq.${cong.id}`
  const [regeln, besuche, personen] = await Promise.all([
    rest(`fs_rules?select=*&${meine}&order=created_at`),
    rest(`gruppenbesuche?select=id,woche,grp,person_id&${meine}&order=woche`),
    rest(`persons?select=*&${meine}&order=created_at`),
  ])
  const kontext = {
    zeiten: zeitenAus(cong),
    auxClass: Boolean(cong.aux_class),
    fsRules: regeln.map(zeilen.fsRuleFromRow),
    gruppenbesuche: besuche.map(zeilen.gruppenbesuchFromRow),
    persons: personen.map(zeilen.personFromRow),
  }
  return (roh) => neueWocheEinordnen(roh, kontext)
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const anzahl = Number(arg.anzahl ?? 8)
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 52) {
    console.error('--anzahl braucht eine ganze Zahl zwischen 1 und 52.')
    process.exit(2)
  }
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)

  const cong = await versammlungHolen(rest, arg, VERSAMMLUNG_SPALTEN)

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

  const einordnen = await einordnungFuer(rest, cong)
  const mitTreffpunkten = new Set(
    (await rest(`fs_weeks?select=start&congregation_id=eq.${cong.id}`)).map((r) => r.start),
  )
  for (const roh of neue) {
    const { week, fsWeek } = einordnen(roh)
    await rest('weeks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ congregation_id: cong.id, start: week.start, data: week }),
    })
    if (mitTreffpunkten.has(week.start)) {
      console.log(`  ${week.start}: Treffpunkte schon da — bleiben, wie sie sind.`)
      continue
    }
    await rest('fs_weeks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ congregation_id: cong.id, start: week.start, data: fsWeek }),
    })
  }
  console.log(`\nGeschrieben: ${neue.length} Woche(n) samt Treffpunkten.`)
}

alsSkript(import.meta.url, main)
