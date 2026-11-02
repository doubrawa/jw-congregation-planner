#!/usr/bin/env node
/**
 * **Steht der Bestand so da, wie die App ihn lädt?** — und wenn nicht, ihn
 * dorthin bringen (5.10.2026, Befund 9 des Reviews).
 *
 * Beim Laden gleicht die App jede Woche an, schreibt es aber nicht zurück:
 *
 *  - Namen an ihre Person binden und die Vorsitz-Bereiche nachziehen
 *    (`pidsNachtragen`, `normalizeChairKeys` in `loadCongregationData`),
 *  - die Zusätzliche Klasse (`syncAuxSlots` beim `hydrate`),
 *  - die Treffpunkte nach dem Grundplan (`regenFsWeeks`) und ihre Leiter
 *    (`fsLeiterBinden`).
 *
 * Weicht die Datenbank davon ab, sieht für den Gruppenaufseher schon ein
 * fremder Treffpunkt wie ein Umbau aus: Der Trigger `fs_weeks_pruefen`
 * vergleicht die Treffpunkte fremder Gruppen, weist ab, die App lädt nach —
 * und es bleibt dabei, bis Admin oder Planer die Woche einmal speichern. Ein
 * bekannter Auslöser war `wochen-importieren.mjs` (bis zum 5.10.2026). Die
 * Bindung der Leiter zählt dabei nicht: Der Trigger sieht von der Person-Id
 * ab. Bis zum 15.10.2026 wies auch die Edge Function `zuteilen` den Planer
 * ab, sobald die Woche anders dastand als geladen; Planer schreiben seitdem
 * unmittelbar.
 *
 * Gerechnet wird mit **denselben Funktionen** wie in der App (`appCodeBereit`),
 * nicht mit einer Abschrift; dass die Kette die des Ladens ist, hält
 * `src/lib/data-load.test.ts` fest. Geschrieben wird, was abweicht — mit dem
 * Secret-Schlüssel, also wie ein Admin, die Wochen mit Vergleiche-und-Tausche
 * auf ihren Stand. Ausgegeben werden nur Wochen und Gründe, keine Namen.
 *
 *   node scripts/wochen-angleichen.mjs [--cong <id>] [--trocken]
 *
 *   --trocken  nennt, was abweicht, und schreibt nichts.
 *
 * Gelesen wird das Ladefenster der App: die Wochen ab dem Montag vor einem Jahr
 * (T125, `aufbewahrtAb` in `src/data/aufbewahrung.ts`, aus der App geladen).
 * Ein zweiter Lauf muss „nichts abweichend" melden.
 */

import {
  alsSkript,
  appCodeBereit,
  argumente,
  restKlient,
  StandVerfehlt,
  versammlungHolen,
  wocheSchreiben,
  zugangsdaten,
} from './gemeinsam.mjs'

export const GRUND_KLASSE = 'Zusätzliche Klasse'
export const GRUND_TREFFPUNKTE_FEHLEN = 'Treffpunkte fehlen'
export const GRUND_GRUNDPLAN = 'Treffpunkte nach Grundplan'
export const GRUND_NAMEN = 'Namen gebunden'
export const GRUND_LEITER = 'Leiter gebunden'

/** Welche Abweichung jemanden abweisen lässt — die übrigen sieht der Trigger nicht. */
export function hindernis(gruende) {
  return gruende.includes(GRUND_TREFFPUNKTE_FEHLEN) || gruende.includes(GRUND_GRUNDPLAN) ? 'Gruppenaufseher abgewiesen' : ''
}

/**
 * Die Funktionen der App, mit denen gerechnet wird — geladen, nicht abgeschrieben.
 * `ab` ist der Anfang ihres Ladefensters, gerechnet vom Tag `heute`.
 */
export async function appFunktionen(heute = new Date()) {
  appCodeBereit()
  const [aux, bindung, helfer, fs, zeilen, aufbewahrung, termine, inhalt] = await Promise.all([
    import('../src/data/aux-class.ts'),
    import('../src/data/namensbindung.ts'),
    import('../src/data/helpers.ts'),
    import('../src/data/fs.ts'),
    import('../src/lib/zeilen.ts'),
    import('../src/data/aufbewahrung.ts'),
    import('../src/data/meeting-dates.ts'),
    import('../supabase/functions/_shared/gleicher-inhalt.ts'),
  ])
  return {
    syncAuxSlots: aux.syncAuxSlots,
    pidsNachtragen: bindung.pidsNachtragen,
    normalizeChairKeys: helfer.normalizeChairKeys,
    regenFsWeeks: fs.regenFsWeeks,
    fsLeiterBinden: fs.fsLeiterBinden,
    personFromRow: zeilen.personFromRow,
    fsRuleFromRow: zeilen.fsRuleFromRow,
    // Derselbe Vergleich wie beim Schreiben einer Woche (`gleicherInhalt`):
    // Die Reihenfolge der Schlüssel zählt nicht, die der Listen schon.
    gleich: inhalt.gleicherInhalt,
    ab: aufbewahrung.aufbewahrtAb(aufbewahrung.VERTEILUNG_WOCHEN, heute),
    // Ab hier formen Klasse und Grundplan die Wochen — wie beim Laden der App (`wirktAb`).
    wirktAb: termine.wirktAb(heute),
  }
}

/**
 * Was die App beim Laden aus dem Bestand macht, Woche für Woche, und worin das
 * abweicht. `wochen` und `fsWochen` kommen absteigend, wie die Abfragen sie
 * liefern — die App ordnet sie genauso ein.
 *
 * Je Woche: `nachher` und `fsNachher` (was die App zeigt), `woche` und
 * `treffpunkte` (was zu schreiben ist, sonst `null`) und die Gründe.
 */
export function angleichen({ wochen, fsWochen, regeln, personen, auxClass }, app) {
  const imFenster = (rows) => rows.filter((r) => r.start >= app.ab).slice().reverse()
  const zeilen = imFenster(wochen)
  const persons = personen.map(app.personFromRow)
  const fsRules = regeln.map(app.fsRuleFromRow)

  const roh = zeilen.map((r) => ({ ...r.data, start: r.start }))
  const geladen = app.normalizeChairKeys(app.pidsNachtragen(roh, persons))
  const angeglichen = app.syncAuxSlots(geladen, auxClass, app.wirktAb)

  const fsZeileNachWoche = new Map(imFenster(fsWochen).map((r) => [r.start, r]))
  const gespeichert = zeilen.map((r) => fsZeileNachWoche.get(r.start)?.data)
  const fsRoh = gespeichert.map((d) => d ?? [])
  const ausgerichtet = fsRules.length
    ? app.regenFsWeeks(zeilen.map((r) => r.start), fsRoh, fsRules, { ab: app.wirktAb })
    : fsRoh
  const fsAngeglichen = app.fsLeiterBinden(ausgerichtet, persons)

  return zeilen.map((r, i) => {
    const gruende = []
    if (!app.gleich(roh[i], geladen[i])) gruende.push(GRUND_NAMEN)
    if (!app.gleich(geladen[i], angeglichen[i])) gruende.push(GRUND_KLASSE)
    const ohneZeile = gespeichert[i] === undefined
    if (ohneZeile && ausgerichtet[i].length) gruende.push(GRUND_TREFFPUNKTE_FEHLEN)
    else if (!app.gleich(fsRoh[i], ausgerichtet[i])) gruende.push(GRUND_GRUNDPLAN)
    if (!app.gleich(ausgerichtet[i], fsAngeglichen[i])) gruende.push(GRUND_LEITER)
    const fsGleich = ohneZeile ? fsAngeglichen[i].length === 0 : app.gleich(gespeichert[i], fsAngeglichen[i])
    return {
      start: r.start,
      stand: r.updated_at,
      fsStand: fsZeileNachWoche.get(r.start)?.updated_at ?? null,
      nachher: angeglichen[i],
      fsNachher: fsAngeglichen[i],
      woche: app.gleich(roh[i], angeglichen[i]) ? null : angeglichen[i],
      treffpunkte: fsGleich ? null : fsAngeglichen[i],
      neueTreffpunktZeile: ohneZeile,
      gruende,
    }
  })
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)
  const cong = await versammlungHolen(rest, arg, 'id,name,aux_class')
  const meine = `congregation_id=eq.${cong.id}`

  const app = await appFunktionen()
  const fenster = `start=gte.${app.ab}&order=start.desc`
  const [wochen, fsWochen, regeln, personen] = await Promise.all([
    rest(`weeks?select=start,data,updated_at&${meine}&${fenster}`),
    rest(`fs_weeks?select=start,data,updated_at&${meine}&${fenster}`),
    rest(`fs_rules?select=*&${meine}&order=created_at`),
    rest(`persons?select=*&${meine}&order=created_at`),
  ])
  const ergebnis = angleichen({ wochen, fsWochen, regeln, personen, auxClass: Boolean(cong.aux_class) }, app)
  const abweichend = ergebnis.filter((e) => e.gruende.length)

  console.log(`Versammlung:  ${cong.name} (${cong.id})`)
  console.log(`Zusätzliche Klasse: ${cong.aux_class ? 'ja' : 'nein'}, Grundplan: ${regeln.length} Regel(n)`)
  console.log(
    `Geprüft:      ${ergebnis.length} Woche(n)${ergebnis.length ? ` (${ergebnis[0].start} bis ${ergebnis.at(-1).start})` : ''}\n`,
  )
  for (const e of abweichend) {
    const wer = hindernis(e.gruende)
    console.log(`  ${e.start}  ${e.gruende.join(', ')}${wer ? `  ← ${wer}` : ''}`)
  }
  const hinderlich = abweichend.filter((e) => hindernis(e.gruende)).length
  console.log(
    abweichend.length
      ? `\nAbweichend: ${abweichend.length} Woche(n), in ${hinderlich} davon weist die Datenbank den Gruppenaufseher ab.`
      : 'Nichts abweichend — der Bestand steht da, wie die App ihn lädt.',
  )
  if (!abweichend.length) return
  if (arg.trocken) {
    console.log('--trocken: nichts geschrieben.')
    return
  }

  let geschrieben = 0
  let verpasst = 0
  for (const e of abweichend) {
    // Beide nur auf dem gelesenen Stand (`wocheSchreiben`), Woche wie
    // Treffpunkte.
    try {
      if (e.woche) await wocheSchreiben(rest, { cong: cong.id, start: e.start, stand: e.stand, data: e.woche })
      if (e.treffpunkte) {
        // Ohne Zeile ohne Stand — dann legt der Aufruf sie an.
        await wocheSchreiben(rest, { tabelle: 'fs_weeks', cong: cong.id, start: e.start, stand: e.fsStand, data: e.treffpunkte })
      }
    } catch (err) {
      if (!(err instanceof StandVerfehlt)) throw err
      verpasst++
      console.log(`  ${e.start}: inzwischen geändert — beim nächsten Lauf.`)
      continue
    }
    geschrieben++
  }
  console.log(`\nAngeglichen: ${geschrieben} Woche(n)${verpasst ? `, ${verpasst} inzwischen geändert` : ''}.`)
}

alsSkript(import.meta.url, main)
