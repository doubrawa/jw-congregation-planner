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
 * Weicht die Datenbank davon ab, sieht für Planer und Gruppenaufseher schon ein
 * einzelner Name wie ein Umbau aus: `zuteilen` vergleicht die Woche ohne Namen
 * (`nurZuteilungen`), der Trigger `fs_weeks_pruefen` die fremden Treffpunkte.
 * Beide weisen ab, die App lädt nach — und es bleibt dabei, bis ein Admin die
 * Woche einmal speichert. Ein bekannter Auslöser war `wochen-importieren.mjs`
 * (bis zum 5.10.2026). Die Bindung von Namen und Leitern zählt dabei nicht:
 * Beide Prüfungen sehen von der Person-Id ab.
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
 * Gelesen wird das Ladefenster der App: die jüngsten `FENSTER` Wochen. Ein
 * zweiter Lauf muss „nichts abweichend" melden.
 */

import { alsSkript, appCodeBereit, argumente, restKlient, versammlungHolen, zugangsdaten } from './gemeinsam.mjs'

/** Das Ladefenster der App (`WEEK_LIMIT` in `src/lib/data.ts`) — der Test hält beide gleich. */
export const FENSTER = 52

export const GRUND_KLASSE = 'Zusätzliche Klasse'
export const GRUND_TREFFPUNKTE_FEHLEN = 'Treffpunkte fehlen'
export const GRUND_GRUNDPLAN = 'Treffpunkte nach Grundplan'
export const GRUND_NAMEN = 'Namen gebunden'
export const GRUND_LEITER = 'Leiter gebunden'

/** Welche Abweichung wen abweisen lässt — die übrigen sehen beide Prüfungen nicht. */
export function hindernis(gruende) {
  const wer = []
  if (gruende.includes(GRUND_KLASSE)) wer.push('Planer')
  if (gruende.includes(GRUND_TREFFPUNKTE_FEHLEN) || gruende.includes(GRUND_GRUNDPLAN)) wer.push('Gruppenaufseher')
  return wer.length ? `${wer.join(' und ')} abgewiesen` : ''
}

/** Die Funktionen der App, mit denen gerechnet wird — geladen, nicht abgeschrieben. */
export async function appFunktionen() {
  appCodeBereit()
  const [aux, bindung, helfer, fs, zeilen, grenze] = await Promise.all([
    import('../src/data/aux-class.ts'),
    import('../src/data/namensbindung.ts'),
    import('../src/data/helpers.ts'),
    import('../src/data/fs.ts'),
    import('../src/lib/zeilen.ts'),
    import('../supabase/functions/_shared/zuteilen-grenze.ts'),
  ])
  return {
    syncAuxSlots: aux.syncAuxSlots,
    pidsNachtragen: bindung.pidsNachtragen,
    normalizeChairKeys: helfer.normalizeChairKeys,
    regenFsWeeks: fs.regenFsWeeks,
    fsLeiterBinden: fs.fsLeiterBinden,
    personFromRow: zeilen.personFromRow,
    fsRuleFromRow: zeilen.fsRuleFromRow,
    gleich: grenze.gleich,
  }
}

/** Erster Montag des Ladefensters — dieselbe Rechnung wie `fensterAnfang` in `src/lib/data.ts`. */
function fensterAnfang(juengste) {
  if (!juengste) return ''
  const d = new Date(`${juengste}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - (FENSTER - 1) * 7)
  return d.toISOString().slice(0, 10)
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
  const ab = fensterAnfang(wochen[0]?.start)
  const imFenster = (rows) => (ab ? rows.filter((r) => r.start >= ab) : rows).slice().reverse()
  const zeilen = imFenster(wochen)
  const persons = personen.map(app.personFromRow)
  const fsRules = regeln.map(app.fsRuleFromRow)

  const roh = zeilen.map((r) => ({ ...r.data, start: r.start }))
  const geladen = app.normalizeChairKeys(app.pidsNachtragen(roh, persons))
  const angeglichen = app.syncAuxSlots(geladen, auxClass)

  const fsNachWoche = new Map(imFenster(fsWochen).map((r) => [r.start, r.data]))
  const gespeichert = zeilen.map((r) => fsNachWoche.get(r.start))
  const fsRoh = gespeichert.map((d) => d ?? [])
  const ausgerichtet = fsRules.length ? app.regenFsWeeks(zeilen.map((r) => r.start), fsRoh, fsRules) : fsRoh
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

  const [wochen, fsWochen, regeln, personen] = await Promise.all([
    rest(`weeks?select=start,data,updated_at&${meine}&order=start.desc&limit=${FENSTER}`),
    rest(`fs_weeks?select=start,data&${meine}&order=start.desc&limit=${FENSTER}`),
    rest(`fs_rules?select=*&${meine}&order=created_at`),
    rest(`persons?select=*&${meine}&order=created_at`),
  ])
  const ergebnis = angleichen({ wochen, fsWochen, regeln, personen, auxClass: Boolean(cong.aux_class) }, await appFunktionen())
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
      ? `\nAbweichend: ${abweichend.length} Woche(n), in ${hinderlich} davon weist die Datenbank Planer oder Gruppenaufseher ab.`
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
    if (e.woche) {
      const getroffen = await rest(
        `weeks?${meine}&start=eq.${e.start}&updated_at=eq.${encodeURIComponent(e.stand)}&select=start`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: e.woche }) },
      )
      if (!getroffen?.length) {
        verpasst++
        console.log(`  ${e.start}: inzwischen geändert — beim nächsten Lauf.`)
        continue
      }
    }
    if (e.treffpunkte && e.neueTreffpunktZeile) {
      await rest('fs_weeks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ congregation_id: cong.id, start: e.start, data: e.treffpunkte }),
      })
    } else if (e.treffpunkte) {
      await rest(`fs_weeks?${meine}&start=eq.${e.start}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ data: e.treffpunkte }),
      })
    }
    geschrieben++
  }
  console.log(`\nAngeglichen: ${geschrieben} Woche(n)${verpasst ? `, ${verpasst} inzwischen geändert` : ''}.`)
}

alsSkript(import.meta.url, main)
