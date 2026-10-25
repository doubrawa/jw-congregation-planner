// =============================================================================
// substitute, Aufruf 'fill': einen freien Platz selbst übernehmen (4.10.2026)
// =============================================================================
//   { action: 'fill', taskKey, heute? }
//
// Unter „Freie Plätze" bietet die App unbesetzte Hilfsdienste an, für die der
// Leser den Aufgabenbereich hat (`src/data/offene-plaetze.ts`). Ein Tipp trägt
// ihn ein — **direkt**, ohne Rückfrage beim Planer (Betreiber, 4.10.2026),
// und mit Zusage, wie beim Einspringen.
//
// Über die Service-Role, weil Wochen und Bestätigungen sonst nur der Planer
// schreibt. Damit ist das hier die Rechteprüfung, nicht der Knopf: Jede Regel,
// nach der die App anbietet, steht hier noch einmal — und was hier abgewiesen
// wird, schreibt nichts.
//
//  - der Platz ist ein **Hilfsdienst** (Betreiber, 25.10.2026: „aufgaben weist
//    der planer zu") — bis dahin auch Programmpunkte und der Ratgeber;
//  - Mitglied, mit eigener Person, für den Dienst freigegeben und dort nicht
//    schon auf einem anderen Platz;
//  - der Platz ist leer und wird überhaupt angeboten (`angebotsBereich`, keine
//    Reinigung);
//  - der Plan der Woche ist gesendet, die Zusammenkunft fällt nicht aus, liegt
//    nicht zurück, und die Person ist an dem Tag nicht abwesend.
//
// Geschrieben wird die ganze Woche mit Vergleiche-und-Tausche auf ihren Stand
// (`updated_at`, `_shared/woche-schreiben.ts`), wie der Client speichert (T39):
// Hat zwischen Lesen und Schreiben jemand die Woche geändert, geht nichts
// verloren — der Aufruf endet mit 409, und die App lädt nach.
// =============================================================================

import { json, type Rest, wert } from '../_shared/rest.ts'
import { wocheSchreiben } from '../_shared/woche-schreiben.ts'
import { schluesselTeile } from '../_shared/aufgaben-schluessel.ts'
import { angebotsBereich } from '../_shared/freie-plaetze.ts'
import { istAusgefallenFuer, personDisplayName, versatzMitAbweichung, zeitenAus, type ZeitenRow } from '../_shared/planung.ts'
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

/** ISO-Tag der Zusammenkunft aus dem Wochenstart; null ohne Startdatum. */
function tagDerZusammenkunft(start: string, offset: number): string | null {
  const ms = Date.parse(start)
  return Number.isNaN(ms) ? null : new Date(ms + offset * 864e5).toISOString().slice(0, 10)
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
    rest.get<ZeitenRow[]>(`congregations?select=mid_wd,mid_time,we_wd,we_time&id=eq.${wert(cong)}`),
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
  const bereich = angebotsBereich(svc)
  if (!bereich) return json({ error: 'not-offered' }, 403)

  const person = persons[0]
  if (!person || !person.priv?.[bereich]) return json({ error: 'not-qualified' }, 403)
  // Schon auf einem anderen Platz desselben Dienstes — dieselbe Regel wie
  // `offenePlaetze` im Client, Id vor Name: Ein zweiter Platz brächte niemanden dazu.
  const name = personDisplayName(person.fn, person.ln)
  if (reihe.some((s) => (s?.pid ? s.pid === person.id : s?.name === name))) return json({ error: 'not-offered' }, 403)

  const zeiten = zeitenAus(congRows[0])
  const tag = tagDerZusammenkunft(row.start, versatzMitAbweichung(row.data.dev, teile.tab, zeiten[teile.tab].wd))
  if (tag && tag < heute) return json({ error: 'past' }, 409)
  if (tag && absences.some((a) => a.from_date <= tag && tag <= a.to_date)) return json({ error: 'absent' }, 409)

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
