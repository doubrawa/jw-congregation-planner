#!/usr/bin/env node
/**
 * Den **Grundplan der Treffpunkte** eintragen — und die schon importierten
 * Termine damit zusammenführen.
 *
 * `treffpunkte-importieren.mjs` legt aus den NWS-Terminen je Woche einzelne
 * Treffpunkte an und markiert sie als `manual`; einen Grundplan schlägt es nur
 * vor, denn welche Regel dahintersteckt, ist eine Entscheidung und keine Zeile
 * in den Daten. Wer sie getroffen hat, trägt sie hiermit ein.
 *
 * **Ohne das Zusammenführen stünde alles doppelt.** `regenFsWeeks` (src/data/fs.ts)
 * erzeugt die Treffpunkte aus dem Grundplan und behält daneben jeden manuellen
 * Eintrag — nach dem Eintragen läge der Montag 14:30 zweimal in derselben Woche,
 * einmal aus der Regel und einmal aus dem Import. Deshalb geht hier eine
 * gleichartige manuelle Zeile (gleicher Wochentag, gleiche Uhrzeit) **in der
 * Regel-Instanz auf** und gibt ihre Besetzung an sie ab: Ein zugeteilter Leiter
 * bleibt, wo er war. Was keine Regel abdeckt (Einzeltermine wie ein zusätzlicher
 * Samstag 13:30), bleibt unangetastet stehen.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/treffpunkt-regeln-setzen.mjs --datei <regeln.json> [--ersetzen] [--trocken]
 *
 *   --datei      JSON-Liste von Regeln:
 *                [{ "wd": 1, "time": "14:30", "place": "Beliebig",
 *                   "monthly": 0, "grp": null }]
 *                wd: 0 = Sonntag … 6 = Samstag · monthly: 0 = jede Woche,
 *                1..4 = N-ter dieser Wochentage im Monat · grp: null =
 *                Versammlungstreffpunkt, sonst die Id einer Predigtdienstgruppe.
 *   --ersetzen   einen vorhandenen Grundplan vorher wegräumen.
 *   --trocken    zeigt Regeln und Wochen-Änderungen, schreibt nichts.
 *
 * Die Kennung ist `r<uuid>` wie in der App (`fsRuleAdd` im Reducer): Das
 * führende `r` hält den Aufgaben-Schlüssel `fs|<montag>|<instanzId>` lesbar.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { argumente, authKopf, zugangsdaten } from './gemeinsam.mjs'

const WD_NAME = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

/**
 * Datum dieses Wochentags in dieser Woche — wie `fsTag` in `src/data/fs.ts`.
 * Mittag statt Mitternacht, damit keine Zeitzone den Tag verschiebt.
 */
export function tagDerWoche(wochenStart, wd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(wochenStart))) return null
  const d = new Date(`${wochenStart}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + ((wd + 6) % 7)) // (wd+6)%7 = Versatz ab Montag
  return d
}

/** Gilt die Regel in dieser Woche? `monthly` 0 heißt: jede Woche. */
export function giltInWoche(regel, wochenStart) {
  if (!regel.monthly) return true
  const tag = tagDerWoche(wochenStart, regel.wd)
  return tag !== null && Math.ceil(tag.getDate() / 7) === regel.monthly
}

/** Reihenfolge wie `fsSort` in der App: Wochentag (ab Montag), Uhrzeit, Gruppe. */
export function fsSort(a, b) {
  return (
    ((a.wd + 6) % 7) - ((b.wd + 6) % 7) ||
    String(a.time).localeCompare(String(b.time)) ||
    String(a.grp ?? '').localeCompare(String(b.grp ?? ''))
  )
}

/**
 * Die Treffpunkte einer Woche, nachdem der Grundplan gilt.
 *
 * Erzeugt wie `genFsWeek`, nur mit einem Zusatz, den die App nicht braucht: Sie
 * kennt keine importierten Zeilen, dieses Skript schon.
 */
export function wocheNeu(wochenStart, regeln, alte = []) {
  const uebrig = [...alte]
  const passend = regeln.filter((r) => giltInWoche(r, wochenStart))
  // Eine Gruppen-Regel mit `skipCong` entfällt, wenn am selben Wochentag ein
  // Versammlungstreffpunkt liegt — wie in `genFsWeek`.
  const congTage = new Set(passend.filter((r) => r.grp == null).map((r) => r.wd))
  const ausRegeln = passend
    .filter((r) => r.grp == null || !(r.skip_cong ?? r.skipCong) || !congTage.has(r.wd))
    .map((r) => {
      const i = uebrig.findIndex((o) => o.wd === r.wd && o.time === r.time)
      const alt = i >= 0 ? uebrig.splice(i, 1)[0] : null
      return {
        id: r.id,
        ruleId: r.id,
        grp: r.grp ?? null,
        wd: r.wd,
        time: r.time,
        place: r.place,
        leader: alt?.leader ?? '',
        ...(alt?.lpid ? { lpid: alt.lpid } : {}),
        ...(alt?.lext ? { lext: true } : {}),
      }
    })
  return [...ausRegeln, ...uebrig].sort(fsSort)
}

/** Was an einer Regel unbrauchbar ist — leere Liste heißt: in Ordnung. */
export function regelFehler(r, gruppenIds = []) {
  const fehler = []
  if (!Number.isInteger(r?.wd) || r.wd < 0 || r.wd > 6) fehler.push('wd muss 0..6 sein (0 = Sonntag)')
  if (!/^\d{2}:\d{2}$/.test(String(r?.time ?? ''))) fehler.push('time muss "HH:MM" sein')
  if (typeof r?.place !== 'string') fehler.push('place muss Text sein (leer ist erlaubt)')
  const m = r?.monthly ?? 0
  if (!Number.isInteger(m) || m < 0 || m > 4) fehler.push('monthly muss 0..4 sein')
  if (r?.grp != null && !gruppenIds.includes(r.grp)) fehler.push(`grp ${r.grp} ist keine Gruppe dieser Versammlung`)
  return fehler
}

/** Lesbare Zeile für die Ausgabe. */
export function regelText(r) {
  return (
    `${WD_NAME[r.wd]} ${r.time}` +
    (r.place ? ` · ${r.place}` : '') +
    ` — ${r.monthly ? `jeden ${r.monthly}. im Monat` : 'jede Woche'}` +
    (r.grp ? ' (Gruppe)' : '')
  )
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  if (typeof arg.datei !== 'string' || !fs.existsSync(arg.datei)) {
    console.error('--datei <regeln.json> fehlt oder zeigt ins Leere.')
    process.exit(2)
  }
  let roh
  try {
    roh = JSON.parse(fs.readFileSync(arg.datei, 'utf8'))
  } catch (err) {
    console.error(`${arg.datei} ist kein lesbares JSON: ${err instanceof Error ? err.message : err}`)
    process.exit(2)
  }
  if (!Array.isArray(roh) || !roh.length) {
    console.error('Die Datei muss eine nicht-leere Liste von Regeln enthalten.')
    process.exit(2)
  }

  const { url, key } = await zugangsdaten()
  const kopf = authKopf(key)
  const rest = async (pfad, opts = {}) => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, { ...opts, headers: { ...kopf, 'Content-Type': 'application/json', ...opts.headers } })
    if (!res.ok) throw new Error(`${pfad}: ${res.status} ${await res.text()}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  const cong = (arg.cong
    ? await rest(`congregations?select=id,name&id=eq.${arg.cong}`)
    : await rest('congregations?select=id,name&limit=1'))[0]
  if (!cong) {
    console.error('Keine Versammlung gefunden.')
    process.exit(1)
  }
  const gruppen = await rest(`groups?select=id,name&congregation_id=eq.${cong.id}`)
  const vorhandene = await rest(`fs_rules?select=id&congregation_id=eq.${cong.id}`)

  const regeln = roh.map((r) => ({
    id: `r${crypto.randomUUID()}`,
    congregation_id: cong.id,
    grp: r.grp ?? null,
    wd: r.wd,
    time: r.time,
    place: r.place ?? '',
    monthly: r.monthly ?? 0,
    skip_cong: Boolean(r.skipCong ?? r.skip_cong ?? false),
  }))
  const fehler = regeln.flatMap((r, i) => regelFehler(r, gruppen.map((g) => g.id)).map((f) => `Regel ${i + 1}: ${f}`))
  if (fehler.length) {
    for (const f of fehler) console.error(f)
    process.exit(2)
  }

  console.log(`Versammlung:  ${cong.name} (${cong.id})`)
  console.log(`Grundplan:    ${vorhandene.length} Regel(n) vorhanden${vorhandene.length && !arg.ersetzen ? ' — mit --ersetzen überschreiben' : ''}`)
  console.log('Einzutragen:')
  for (const r of regeln) console.log(`  ${regelText(r)}`)

  if (vorhandene.length && !arg.ersetzen) {
    console.error('\nEs steht schon ein Grundplan da. Abgebrochen.')
    process.exit(2)
  }

  // Wochen zusammenführen — je Woche die neue Liste berechnen.
  const wochen = await rest(`weeks?select=start&congregation_id=eq.${cong.id}&order=start`)
  const fsWochen = await rest(`fs_weeks?select=start,data&congregation_id=eq.${cong.id}&order=start`)
  const alteNach = new Map(fsWochen.map((w) => [w.start, w.data]))
  const plan = wochen.map((w) => {
    const alt = alteNach.get(w.start) ?? []
    const neu = wocheNeu(w.start, regeln, alt)
    return { start: w.start, alt, neu, neuzeile: !alteNach.has(w.start) }
  })

  console.log('\nWochen:')
  for (const p of plan) {
    const uebernommen = p.neu.filter((i) => i.ruleId && i.leader).length
    console.log(
      `  ${p.start}: ${p.alt.length} → ${p.neu.length} Treffpunkte` +
        `${uebernommen ? `, ${uebernommen} Leiter übernommen` : ''}` +
        `${p.neuzeile ? ' (Woche hatte noch keine Zeile)' : ''}`,
    )
  }

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  if (vorhandene.length) {
    await rest(`fs_rules?congregation_id=eq.${cong.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  await rest('fs_rules', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(regeln) })

  for (const p of plan) {
    if (p.neuzeile) {
      await rest('fs_weeks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ congregation_id: cong.id, start: p.start, data: p.neu }),
      })
    } else {
      await rest(`fs_weeks?congregation_id=eq.${cong.id}&start=eq.${p.start}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ data: p.neu }),
      })
    }
  }
  console.log(`\nGeschrieben: ${regeln.length} Regel(n), ${plan.length} Woche(n) neu zusammengesetzt.`)
}

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
  })
}
