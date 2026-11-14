import { describe, expect, it } from 'vitest'
import { offeneZusagen } from '../../supabase/functions/_shared/app-zahl.ts'
import { FS_LEITER, type FsInstance as ServerTreffpunkt } from '../../supabase/functions/_shared/zuteilungen.ts'
import { buildDemoConfirmations } from '../../tests/testdaten/demo-zusagen'
import { buildDemoFsWeeks, buildDemoWeeks, DEMO_PERSONS, DEMO_SERVICES, DEMO_UNBESTAETIGT } from '../../tests/testdaten/testdaten'
import { offeneZusagenZahl } from '../app/useAppSymbolZahl'
import { deriveMyFsTasks } from './fs'
import { displayName } from './helpers'
import { istVorbei } from './meeting-dates'
import { deriveMyTasks } from './planung/aufgaben'
import type { ConfirmationMap } from './types'
import { STANDARD_ZEITEN } from './vorgaben'

/**
 * **Die Zahl am App-Symbol: App und Push sagen dasselbe** (T184).
 *
 * Ist die App offen, zählt sie selbst (`offeneZusagenZahl` über „Meine
 * Aufgaben"); ist sie zu, bringt der Push die Zahl des Servers
 * (`offeneZusagen`, `_shared/app-zahl.ts`). Zählten beide verschieden, spränge
 * die Zahl beim Öffnen der App — und keine von beiden wäre glaubwürdig.
 *
 * Gemessen auf den Demo-Wochen mit allen drei Stufen der Zusage, über jede
 * Person, an einem Tag mitten im Bestand: Vergangenes fällt beiderseits weg.
 */

const WEEKS = buildDemoWeeks()
const FS = buildDemoFsWeeks()
const HEUTE = new Date(2026, 8, 16, 9, 0) // ein Mittwoch: der Dienstag davor ist vorbei
const HEUTE_UTC = Date.UTC(2026, 8, 16)

function appZahl(conf: ConfirmationMap, pid: string, name: string): number {
  const tasks = [
    ...deriveMyTasks(WEEKS, DEMO_SERVICES, name, conf, STANDARD_ZEITEN, pid),
    ...deriveMyFsTasks(FS, WEEKS.map((w) => w.start), name, conf, pid, FS_LEITER),
  ].filter((task) => !istVorbei(task.at, HEUTE))
  return offeneZusagenZahl(tasks)
}

function pushZahl(conf: ConfirmationMap): (pid: string, name: string) => number {
  return offeneZusagen(
    WEEKS.map((w) => ({ start: w.start, data: w })),
    // Dieselben Zeilen, wie die Datenbank sie liefert: Die Function kennt eine
    // Gruppe ohne Wert als `undefined`, der Client als `null` — gezählt wird nach ihr nicht.
    FS.map((insts, i) => ({ start: WEEKS[i]!.start, data: insts as unknown as ServerTreffpunkt[] })),
    // Die Spalte `groups` steht in der Datenbank immer da.
    DEMO_SERVICES.map((s) => ({ ...s, groups: Boolean(s.groups) })),
    new Map(Object.keys(conf).map((k) => [k, ''])),
    STANDARD_ZEITEN,
    HEUTE_UTC,
  )
}

describe('Die Zahl am App-Symbol: App und Push zählen gleich', () => {
  const conf = buildDemoConfirmations(WEEKS, DEMO_SERVICES, FS, DEMO_UNBESTAETIGT)

  it('für jede Person dieselbe Zahl — mit Zusagen, Absagen und offenen Plätzen', () => {
    const push = pushZahl(conf)
    const abweichend = DEMO_PERSONS.map((p) => [displayName(p), appZahl(conf, p.id, displayName(p)), push(p.id, displayName(p))])
      .filter(([, app, server]) => app !== server)
    expect(abweichend).toEqual([])
  })

  it('…und es gibt etwas zu zählen: Wer noch nicht zugesagt hat, steht nicht bei 0', () => {
    const push = pushZahl(conf)
    const offen = DEMO_PERSONS.filter((p) => push(p.id, displayName(p)) > 0).map(displayName)
    expect(offen.length).toBeGreaterThan(0)
    expect(offen.every((name) => DEMO_UNBESTAETIGT.includes(name))).toBe(true)
  })

  it('ohne jede Zusage zählen beide alles Künftige — und wieder gleich', () => {
    const push = pushZahl({})
    for (const p of DEMO_PERSONS) expect(push(p.id, displayName(p))).toBe(appZahl({}, p.id, displayName(p)))
    expect(DEMO_PERSONS.some((p) => push(p.id, displayName(p)) > appZahl(conf, p.id, displayName(p)))).toBe(true)
  })
})
