// =============================================================================
// substitute, Aufruf 'fill': einen freien Platz selbst übernehmen (4.10.2026)
// =============================================================================
//   { action: 'fill', taskKey, heute? }
//
// Unter „Meine Aufgaben" bietet die App unbesetzte Plätze an, für die der
// Leser den Aufgabenbereich hat (`src/data/offene-plaetze.ts`). Ein Tipp trägt
// ihn ein — **direkt**, ohne Rückfrage beim Planer (Betreiber, 4.10.2026),
// und mit Zusage, wie beim Einspringen.
//
// Über die Service-Role, weil Wochen und Bestätigungen sonst nur der Planer
// schreibt. Damit ist das hier die Rechteprüfung, nicht der Knopf: Jede Regel,
// nach der die App anbietet, steht hier noch einmal — und was hier abgewiesen
// wird, schreibt nichts.
//
//  - Mitglied, mit eigener Person, und für den Bereich freigegeben (ein
//    Brüder-Platz: ein Bruder);
//  - der Platz ist leer und wird überhaupt angeboten (`programmAngebot`, keine
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
import { schluesselTeile, type SchluesselTeile } from '../_shared/aufgaben-schluessel.ts'
import { programmAngebot } from '../_shared/freie-plaetze.ts'
import { istAusgefallenFuer, personDisplayName, versatzMitAbweichung, zeitenAus, type ZeitenRow } from '../_shared/planung.ts'
import type { Meeting, ServiceRow, Slot, Week } from '../_shared/zuteilungen.ts'

interface Person {
  id: string
  fn: string
  ln: string
  priv: Record<string, boolean> | null
  female?: boolean
}

interface Absence {
  from_date: string
  to_date: string
}

/** Ein gefundener Platz: was dort steht, wie man ihn setzt und wer ihn übernehmen darf. */
interface Fund {
  slot: Slot | null | undefined
  setzen: (neu: { name: string; pid: string }) => void
  /** Aufgabenbereich, unter dem er angeboten wird — `null`: gar nicht. */
  bereich: string | null
  nurBrueder: boolean
}

type Zusammenkunft = Extract<SchluesselTeile, { tab: 'mid' | 'we' }>

/**
 * Den Platz zu einem Schlüssel in der gelesenen Woche finden — `null`, wenn es
 * ihn nicht gibt. Punkt über seine Kennung (wie `punktKey`), Hilfsdienst nur
 * bis zur eingestellten Platzzahl (wie `allePlaetze` im Client).
 */
function platzFinden(meeting: Meeting, teile: Zusammenkunft, services: ServiceRow[]): Fund | null {
  if (teile.art === 'ratgeber') {
    const slot = meeting.auxRatgeber
    if (!slot) return null // keine Zusätzliche Klasse, kein Ratgeber
    return {
      slot,
      setzen: (neu) => {
        meeting.auxRatgeber = { ...slot, ...neu }
      },
      bereich: programmAngebot(slot),
      nurBrueder: slot.male === true,
    }
  }
  if (teile.art === 'helper') {
    const svc = services.find((s) => s.key === teile.svc)
    if (!svc || teile.pos >= svc.count) return null
    const helpers = (meeting.helpers ??= {})
    const reihe = helpers[teile.svc] ?? []
    return {
      slot: reihe[teile.pos],
      setzen: (neu) => {
        // Wie `assignSlot` im Client: Lücken davor als leere Plätze auffüllen.
        while (reihe.length <= teile.pos) reihe.push({ name: '' })
        reihe[teile.pos] = neu
        helpers[teile.svc] = reihe
      },
      bereich: svc.groups ? null : `svc:${svc.key}`,
      nurBrueder: false,
    }
  }
  for (const section of meeting.sections ?? []) {
    for (const item of section.items ?? []) {
      if ('song' in item || item.iid !== teile.iid) continue
      // Die Plätze der Zusätzlichen Klasse gibt es nur, solange sie besteht —
      // dieselbe Grenze wie `raeume()` im Client.
      if (teile.art === 'aux' && !meeting.auxRatgeber) return null
      const reihe = teile.art === 'aux' ? item.aux : item.names
      const slot = reihe?.[teile.ni]
      if (!reihe || !slot) return null
      return {
        slot,
        setzen: (neu) => {
          reihe[teile.ni] = { ...slot, ...neu }
        },
        bereich: programmAngebot(slot),
        nurBrueder: slot.male === true,
      }
    }
  }
  return null
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
      `persons?select=id,fn,ln,priv,female&congregation_id=eq.${wert(cong)}&id=eq.${wert(caller.person_id)}`,
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

  const fund = platzFinden(meeting, teile, services)
  if (!fund) return json({ error: 'slot-not-found' }, 404)
  if (fund.slot?.name) return json({ error: 'slot-taken' }, 409)
  if (!fund.bereich) return json({ error: 'not-offered' }, 403)

  const person = persons[0]
  if (!person || !person.priv?.[fund.bereich] || (fund.nurBrueder && person.female)) {
    return json({ error: 'not-qualified' }, 403)
  }

  const zeiten = zeitenAus(congRows[0])
  const tag = tagDerZusammenkunft(row.start, versatzMitAbweichung(row.data.dev, teile.tab, zeiten[teile.tab].wd))
  if (tag && tag < heute) return json({ error: 'past' }, 409)
  if (tag && absences.some((a) => a.from_date <= tag && tag <= a.to_date)) return json({ error: 'absent' }, 409)

  fund.setzen({ name: personDisplayName(person.fn, person.ln), pid: person.id })
  if (!(await wocheSchreiben(rest, cong, teile.woche, row.updated_at, row.data))) {
    return json({ error: 'slot-taken' }, 409)
  }

  // Wer sich selbst einträgt, hat zugesagt. Eine alte Zeile zu diesem Platz
  // (eine Absage dessen, der ihn vorher hatte) gehört nicht zum neuen.
  const keyEnc = wert(taskKey)
  await rest.send('DELETE', `confirmations?congregation_id=eq.${wert(cong)}&task_key=eq.${keyEnc}`)
  await rest.insert('confirmations', [
    { congregation_id: cong, user_id: userId, task_key: taskKey, status: 'bestätigt' },
  ])
  return json({ ok: true, filled: true })
}
