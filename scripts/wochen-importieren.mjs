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
 * Gedächtnismahls, die Treffpunkte aus dem Grundplan samt vorgemerkter
 * Gruppenbesuche, der vorgemerkte öffentliche Vortrag aus dem Vortragsplan
 * (T122) und der feste Leiter des Wachtturm-Studiums, bei Abwesenheit sein
 * Vertreter (18.10.2026). Geschrieben wird eine Zeile je Woche in `weeks` und eine in
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
 *   node scripts/wochen-importieren.mjs [--anzahl 8] [--ab 2025-10-13]
 *                                       [--cong <id>] [--trocken]
 *
 *   --anzahl   wie viele Wochen (Standard 8, höchstens ein Jahr und ein
 *              halbes — weiter reicht das Arbeitsheft nicht).
 *   --ab       ab welcher Woche (ISO-Datum, es zählt die Woche, in der es
 *              liegt) — auch zurück, um Wochen nachzuholen, bis zum Montag vor
 *              einem Jahr (T125). Ein Neuaufbau mit Geschichte für die
 *              Auswertung (T126): `--ab <Montag vor einem Jahr> --anzahl 60`,
 *              das Jahr, die laufende Woche und sieben voraus. Bis zum
 *              18.10.2026 nannte `--ab` die Woche davor — die erste Woche der
 *              Frist ließ sich so gar nicht holen. Ohne Angabe wie der Knopf in
 *              der App (`holenNach`): nach der letzten gespeicherten Woche,
 *              aber nie vor der laufenden.
 *   --trocken  holt und zeigt, schreibt aber nicht.
 *
 * Gibt es zur nächsten Woche noch kein Programm auf jw.org, endet der Lauf mit
 * dem, was da war — das ist kein Fehler, sondern der Kalender. Bricht die Kette
 * dagegen ab (Function oder jw.org nicht erreichbar) oder springt sie über
 * Wochen, schreibt der Lauf, was kam, und endet mit Code 1: Sonst ginge ein
 * Neuaufbau (`neuaufbau-fahren.mjs`) mit halber Geschichte weiter, und nur
 * eine Zeile mitten in der Ausgabe sagte es.
 */

import {
  alsSkript,
  appCodeBereit,
  argumente,
  funktionsKopf,
  nichtVorDerFrist,
  restKlient,
  versammlungHolen,
  zugangsdaten,
} from './gemeinsam.mjs'

/** Was die Einordnung von der Versammlung braucht — Zeiten und Klasse kommen aus dieser Zeile. */
const VERSAMMLUNG_SPALTEN = 'id,name,cong_lang,prog_langs,aux_class,mid_wd,mid_time,we_wd,we_time'

/** Eine Woche in Millisekunden — der Abstand zweier Montage. */
const WOCHE_MS = 7 * 864e5

/**
 * Wochen der Reihe nach holen. Jede Antwort nennt ihren Montag, und der ist
 * die Basis für die nächste Anfrage — dieselbe Kette wie in der App
 * (`latestImportedStart` → `importNextWeek`).
 *
 * Was zurückkommt, sagt auch, **wie** die Kette endete:
 *  - `ende` — danach hat jw.org (noch) nichts, auch nicht in der Sprache der
 *    Versammlung. Das ist der Kalender, kein Fehler.
 *  - `fehler` ohne `ende` — abgebrochen: Function oder jw.org antworteten nicht.
 *  - `luecken` — die Kette sprang über Wochen. Das Arbeitsheft hat jede Woche
 *    (die des Gedächtnismahls baut die Function), ein Sprung heißt also, dass
 *    eine Ausgabe fehlte (`discoverWeeks` übergeht eine vergangene, die jw.org
 *    nicht mehr liefert).
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
  const luecken = []
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
      return { wochen, luecken, fehler: `unlesbare Antwort (${antwort.status}): ${text.slice(0, 120)}`, ende: false }
    }
    if (!nutzlast?.week) {
      const ende = nutzlast?.ende === true || nutzlast?.code === 'sprache-fehlt'
      return { wochen, luecken, fehler: nutzlast?.error ?? `HTTP ${antwort.status}`, ende }
    }
    const { start } = nutzlast.week
    if (cursor && start && Date.parse(start) - Date.parse(cursor) > WOCHE_MS) luecken.push({ nach: cursor, kam: start })
    wochen.push(nutzlast.week)
    cursor = start
  }
  return { wochen, luecken, fehler: '', ende: false }
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
 * Gruppenbesuche, vorgemerkte Vorträge, Personen und Abwesenheiten gelesen und
 * umgesetzt wie beim Laden der App (`src/lib/zeilen.ts`), dieselbe Reihenfolge
 * wie dort.
 */
async function einordnungFuer(rest, cong) {
  appCodeBereit()
  const [{ neueWocheEinordnen }, zeilen, { zeitenAus }] = await Promise.all([
    import('../src/data/neue-woche.ts'),
    import('../src/lib/zeilen.ts'),
    import('../supabase/functions/_shared/planung.ts'),
  ])
  const meine = `congregation_id=eq.${cong.id}`
  const [regeln, besuche, vortraege, personen, abwesenheiten] = await Promise.all([
    rest(`fs_rules?select=*&${meine}&order=created_at`),
    rest(`gruppenbesuche?select=id,woche,grp,person_id&${meine}&order=woche`),
    rest(`vortraege?select=id,woche,redner,versammlung,eigener,person_id,thema,lied&${meine}&order=woche`),
    rest(`persons?select=*&${meine}&order=created_at`),
    rest(`absences?select=*&${meine}&order=from_date`),
  ])
  const kontext = {
    zeiten: zeitenAus(cong),
    auxClass: Boolean(cong.aux_class),
    fsRules: regeln.map(zeilen.fsRuleFromRow),
    gruppenbesuche: besuche.map(zeilen.gruppenbesuchFromRow),
    vortraege: vortraege.map(zeilen.vortragFromRow),
    persons: personen.map(zeilen.personFromRow),
    absences: abwesenheiten.map(zeilen.absenceFromRow),
  }
  return (roh) => neueWocheEinordnen(roh, kontext)
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  appCodeBereit()
  const [{ holenNach }, { aufbewahrtAb, VERTEILUNG_WOCHEN }, { montagNach, montagVon }] = await Promise.all([
    import('../src/data/holen.ts'),
    import('../src/data/aufbewahrung.ts'),
    import('../src/data/meeting-dates.ts'),
  ])
  // Ein Jahr zurück und ein halbes voraus — so weit reicht das Arbeitsheft nie.
  const hoechstens = VERTEILUNG_WOCHEN + 26
  const anzahl = Number(arg.anzahl ?? 8)
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > hoechstens) {
    console.error(`--anzahl braucht eine ganze Zahl zwischen 1 und ${hoechstens}.`)
    process.exit(2)
  }
  if (arg.ab !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(arg.ab))) {
    console.error('--ab braucht ein Datum wie 2025-10-13.')
    process.exit(2)
  }
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)

  const cong = await versammlungHolen(rest, arg, VERSAMMLUNG_SPALTEN)

  const vorhandene = (await rest(`weeks?select=start&congregation_id=eq.${cong.id}&order=start`)).map((w) => w.start)
  /*
   * Wonach gesucht wird, wie beim Knopf in der App (`holenNach`). Bis zum
   * 16.10.2026 ging ohne gespeicherte Woche gar kein `after` hinaus — dann
   * wählt der Server nach seinem UTC-Tag, und montags kurz nach Mitternacht kam
   * die vergangene Woche. Nach einer Pause holte das Skript außerdem Wochen
   * zurück, die niemand mehr plant; dafür gibt es `--ab`: Gefragt wird nach
   * der Woche davor, denn `import-week` liefert die erste **nach** `after`.
   * Nie vor dem Montag vor einem Jahr (T125) — Älteres lädt die App nicht.
   */
  const nach =
    typeof arg.ab === 'string'
      ? montagNach(nichtVorDerFrist(montagVon(arg.ab), aufbewahrtAb(VERTEILUNG_WOCHEN)), -1)
      : holenNach(vorhandene.map((start) => ({ start })), new Date())
  const zuletzt = vorhandene[vorhandene.length - 1]

  console.log(`Versammlung:  ${cong.name} (${cong.id})`)
  console.log(`Sprache:      ${cong.cong_lang}${cong.prog_langs?.length ? ` (+ ${cong.prog_langs.join(', ')})` : ''}`)
  console.log(`Vorhanden:    ${vorhandene.length} Woche(n)${zuletzt ? `, zuletzt ${zuletzt}` : ''}`)
  console.log(`Holen:        ${anzahl} Woche(n) ab ${montagNach(nach, 1)}\n`)

  const { wochen, luecken, fehler, ende } = await wochenHolen({
    url, key, lang: cong.cong_lang, altLangs: cong.prog_langs ?? [], ab: nach, anzahl,
  })
  const neue = nurNeue(vorhandene, wochen)
  for (const w of neue) console.log(`  ${w.start}  ${w.range ?? ''}`)
  for (const l of luecken) {
    console.log(`\nLücke: nach ${l.nach} kam erst ${l.kam} — die Wochen dazwischen lieferte jw.org nicht.`)
  }
  if (fehler) console.log(`\n${ende ? 'Danach nichts mehr' : `Abgebrochen nach ${wochen.length} Woche(n)`}: ${fehler}`)

  if (!neue.length) console.log('\nNichts zu tun.')
  else if (arg.trocken) console.log(`\n--trocken: ${neue.length} Woche(n) blieben ungeschrieben.`)
  else await schreiben(rest, cong, neue)

  /*
   * Unvollständig endet mit Code 1, auch nach dem Schreiben — sonst liefe
   * `neuaufbau-fahren.mjs` mit halber Geschichte weiter. Was kam, steht schon;
   * ein zweiter Lauf schreibt nur, was noch fehlt (`nurNeue`).
   */
  if (luecken.length || (fehler && !ende)) {
    const erste = luecken[0] ? luecken[0].nach : (wochen[wochen.length - 1]?.start ?? nach)
    console.error(`\nUnvollständig. Nachholen mit: --ab ${montagNach(erste, 1)}`)
    process.exitCode = 1
  }
}

/** Die neuen Wochen schreiben — eingeordnet wie in der App, je eine Zeile in `weeks` und `fs_weeks`. */
async function schreiben(rest, cong, neue) {
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
