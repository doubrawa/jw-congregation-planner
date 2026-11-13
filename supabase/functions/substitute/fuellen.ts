// =============================================================================
// substitute, Aufruf 'fill': einen freien Platz selbst übernehmen
// =============================================================================
//   { action: 'fill', taskKey, heute? }
//
// Unter „Freie Plätze" bietet die App unbesetzte Hilfsdienste an, für die der
// Leser den Aufgabenbereich hat (`src/data/offene-plaetze.ts`). Ein Tipp trägt
// ihn ein — **direkt**, ohne Rückfrage beim Planer (Betreiber), und mit
// Zusage, wie beim Einspringen.
//
// Über die Service-Role, weil Wochen und Bestätigungen sonst nur der Planer
// schreibt. Damit ist das hier die Rechteprüfung, nicht der Knopf — und was
// hier abgewiesen wird, schreibt nichts.
//
//  - der Platz ist ein **Hilfsdienst** (Betreiber: „aufgaben weist der planer
//    zu") und leer;
//  - der Plan der Woche ist gesendet, und die Zusammenkunft fällt nicht aus;
//  - Mitglied mit eigener Person, und die darf ihn übernehmen — dieselbe
//    Regel, nach der die App anbietet (`uebernahmeHindernis`: Bereich, noch
//    kein Platz des Dienstes, nicht vorbei, nicht abwesend).
//
// Geschrieben wird die ganze Woche mit Vergleiche-und-Tausche auf ihren Stand
// (`updated_at`, `_shared/woche-schreiben.ts`), wie der Client speichert (T39):
// Hat zwischen Lesen und Schreiben jemand die Woche geändert, geht nichts
// verloren — der Aufruf endet mit 409, und die App lädt nach.
// =============================================================================

import { json, type Rest, wert } from '../_shared/rest.ts'
import { wocheSchreiben } from '../_shared/woche-schreiben.ts'
import { schluesselTeile } from '../_shared/aufgaben-schluessel.ts'
import { HINDERNIS_STATUS, stehtImDienst, uebernahmeHindernis } from '../_shared/freie-plaetze.ts'
import {
  istAusgefallenFuer,
  personDisplayName,
  terminDerWoche,
  terminTag,
  ZEITEN_SPALTEN,
  zeitenAus,
  type ZeitenRow,
} from '../_shared/planung.ts'
import type { ServiceRow, Week } from '../_shared/zuteilungen.ts'

interface Person {
  id: string
  fn: string
  ln: string
  priv: Record<string, boolean> | null
}

interface Absence {
  from_date: string
  to_date: string
}

/**
 * Den Aufrufer in den freien Platz `taskKey` eintragen.
 *
 * `heute` ist der Kalendertag, an dem gefragt wird („YYYY-MM-DD"): der des
 * Geräts, soweit glaubhaft (`heuteUtc` in `index.ts`). Bis zum 5.10.2026 galt
 * hier der UTC-Tag — zwischen Mitternacht und 02:00 noch der gestrige.
 */
export async function platzFuellen(rest: Rest, userId: string, taskKey: string, heute: string): Promise<Response> {
  const teile = schluesselTeile(taskKey)
  if (!teile || !('tab' in teile)) return json({ error: 'bad-request' }, 400)
  // Nur Hilfsdienste — Programmpunkte und den Ratgeber teilt der Planer zu (25.10.2026).
  if (teile.art !== 'helper') return json({ error: 'not-offered' }, 403)

  // Die Versammlung aus der eigenen Mitgliedszeile, nie aus dem Rumpf.
  const eigene = await rest.get<{ person_id: string | null; congregation_id: string }[]>(
    `members?select=person_id,congregation_id&user_id=eq.${wert(userId)}`,
  )
  const caller = eigene[0]
  if (!caller) return json({ error: 'forbidden' }, 403)
  if (!caller.person_id) return json({ error: 'not-qualified' }, 403)
  const cong = caller.congregation_id

  const [weekRows, services, persons, congRows, absences, versand] = await Promise.all([
    rest.get<{ start: string; data: Week; updated_at: string }[]>(
      `weeks?select=start,data,updated_at&congregation_id=eq.${wert(cong)}&start=eq.${wert(teile.woche)}`,
    ),
    rest.get<ServiceRow[]>(`services?select=key,name,count,groups&congregation_id=eq.${wert(cong)}`),
    rest.get<Person[]>(
      `persons?select=id,fn,ln,priv&congregation_id=eq.${wert(cong)}&id=eq.${wert(caller.person_id)}`,
    ),
    rest.get<ZeitenRow[]>(`congregations?select=${ZEITEN_SPALTEN}&id=eq.${wert(cong)}`),
    rest.get<Absence[]>(
      `absences?select=from_date,to_date&congregation_id=eq.${wert(cong)}&person_id=eq.${wert(caller.person_id)}`,
    ),
    // „Plan gesendet": ein Eintrag im Versand-Tagebuch zu einem Platz dieser
    // Woche genügt (`planGesendet` im Client) — nur Zusammenkünfte, nicht `fs|`.
    rest.get<{ task_key: string }[]>(
      `assignment_log?select=task_key&congregation_id=eq.${wert(cong)}&task_key=like.${wert(`${teile.woche}|*`)}&limit=1`,
    ),
  ])

  const row = weekRows[0]
  const meeting = row?.data?.[teile.tab]
  if (!row || !meeting) return json({ error: 'slot-not-found' }, 404)
  if (istAusgefallenFuer(row.data.dev, teile.tab)) return json({ error: 'meeting-cancelled' }, 409)
  if (versand.length === 0) return json({ error: 'not-published' }, 409)

  // Den Platz gibt es nur bis zur eingestellten Platzzahl (wie `allePlaetze` im Client).
  const svc = services.find((s) => s.key === teile.svc)
  if (!svc || teile.pos >= svc.count) return json({ error: 'slot-not-found' }, 404)
  const reihe = ((meeting.helpers ??= {})[teile.svc] ??= [])
  if (reihe[teile.pos]?.name) return json({ error: 'slot-taken' }, 409)

  const person = persons[0]
  if (!person) return json({ error: 'not-qualified' }, 403)
  const name = personDisplayName(person.fn, person.ln)
  const tag = terminTag(row.start, terminDerWoche(zeitenAus(congRows[0]), teile.tab, row.start, row.data.dev).versatz)
  // Dieselbe Regel wie `offenePlaetze` im Client (`uebernahmeHindernis`).
  const hindernis = uebernahmeHindernis({
    svc,
    hatBereich: (bereich) => Boolean(person.priv?.[bereich]),
    imDienst: stehtImDienst(reihe, { id: person.id, name }),
    vorbei: tag !== null && tag < heute,
    abwesend: tag !== null && absences.some((a) => a.from_date <= tag && tag <= a.to_date),
  })
  if (hindernis) return json({ error: hindernis }, HINDERNIS_STATUS[hindernis])

  // Wie `assignSlot` im Client: Lücken davor als leere Plätze auffüllen.
  while (reihe.length <= teile.pos) reihe.push({ name: '' })
  reihe[teile.pos] = { name, pid: person.id }
  const neuerStand = await wocheSchreiben(rest, cong, teile.woche, row.updated_at, row.data)
  if (!neuerStand) return json({ error: 'slot-taken' }, 409)

  // Wer sich selbst einträgt, hat zugesagt. Eine alte Zeile zu diesem Platz
  // (eine Absage dessen, der ihn vorher hatte) gehört nicht zum neuen.
  const keyEnc = wert(taskKey)
  await rest.send('DELETE', `confirmations?congregation_id=eq.${wert(cong)}&task_key=eq.${keyEnc}`)
  await rest.insert('confirmations', [
    { congregation_id: cong, user_id: userId, task_key: taskKey, status: 'bestätigt' },
  ])
  // Der Stand vorher und nachher — wie beim Einspringen (`index.ts`).
  return json({ ok: true, filled: true, woche: teile.woche, vorher: row.updated_at, stand: neuerStand })
}
