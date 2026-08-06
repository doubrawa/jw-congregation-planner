import { describe, expect, it } from 'vitest'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_PERSONS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/demo'
import { displayName } from '../data/helpers'
import { personTimeline, type TimelineDaten } from './person-timeline'

function daten(patch: Partial<TimelineDaten> = {}): TimelineDaten {
  return {
    weeks: buildDemoWeeks(),
    services: DEMO_SERVICES,
    confirmations: {},
    congregation: CONGREGATION,
    fsWeeks: buildDemoFsWeeks(),
    fsBase: FS_BASE,
    ...patch,
  }
}

/** Erste Person, die in den Demo-Wochen überhaupt zugeteilt ist. */
const person = DEMO_PERSONS.find((p) => p.id === 'p1')!

describe('Zeitleiste einer Person', () => {
  it('listet die Zuteilungen der Zusammenkünfte mit Datum und Art', () => {
    const eintraege = personTimeline(person, daten())
    expect(eintraege.length).toBeGreaterThan(0)
    const meeting = eintraege.find((e) => e.kind === 'meeting')
    expect(meeting).toBeDefined()
    if (meeting?.kind !== 'meeting') throw new Error('kein Zusammenkunfts-Eintrag')
    expect(meeting.datum).not.toBe('')
    expect(meeting.titel).not.toBe('')
  })

  it('nimmt geleitete Treffpunkte mit auf', () => {
    const ohne = buildDemoFsWeeks().map((week) => week.map((inst) => ({ ...inst, leader: '' })))
    expect(personTimeline(person, daten({ fsWeeks: ohne })).some((e) => e.kind === 'fs')).toBe(false)

    const mit = ohne.map((week, wi) =>
      week.map((inst, i) => (wi === 0 && i === 0 ? { ...inst, leader: displayName(person) } : inst)),
    )
    const fs = personTimeline(person, daten({ fsWeeks: mit })).filter((e) => e.kind === 'fs')
    expect(fs).toHaveLength(1)
    if (fs[0].kind !== 'fs') throw new Error('kein Treffpunkt-Eintrag')
    expect(fs[0].ort).toBe(mit[0][0].place)
  })

  it('ordnet Zusammenkünfte und Treffpunkte chronologisch ineinander', () => {
    const fsWeeks = buildDemoFsWeeks().map((week, wi) =>
      week.map((inst) => (wi === 0 ? { ...inst, leader: displayName(person) } : inst)),
    )
    const eintraege = personTimeline(person, daten({ fsWeeks }))
    const tage = eintraege.map((e) => e.tag)
    expect([...tage].sort((a, b) => a - b)).toEqual(tage)
    // Treffpunkte der Woche 0 dürfen nicht hinter Zusammenkünfte späterer
    // Wochen rutschen — genau das ginge ohne gemeinsame Tageszählung schief.
    expect(eintraege.filter((e) => e.tag < 7).some((e) => e.kind === 'fs')).toBe(true)
  })

  it('ordnet auch innerhalb einer Woche nach Wochentag', () => {
    // Demo: Zusammenkunft Di, Treffpunkt der Gruppe 1 am Sa (Woche 0), dann
    // der Versammlungstreffpunkt am Mo der Woche 1. Zählte der Treffpunkt nur
    // die Woche und nicht den Tag, stünde der Samstag vor dem Dienstag.
    const anfang = personTimeline(person, daten()).slice(0, 3)
    expect(anfang.map((e) => e.kind)).toEqual(['meeting', 'fs', 'fs'])
    expect(anfang.map((e) => e.tag)).toEqual([1, 5, 7])
  })

  it('markiert am echten Kalendertag, was schon vorbei ist', () => {
    // Woche 0 beginnt am 7.9.; „heute" liegt in Woche 2 → Woche 0 und 1 sind
    // vorbei, der laufende Tag selbst zählt noch nicht als vergangen.
    const heute = new Date(FS_BASE)
    heute.setDate(heute.getDate() + 14)
    const eintraege = personTimeline(person, daten(), heute)
    expect(eintraege.some((e) => e.vergangen)).toBe(true)
    for (const e of eintraege) {
      expect(e.vergangen).toBe(e.tag < 14)
    }
  })

  it('ohne Zeitbezug (alles in der Zukunft) ist nichts vergangen', () => {
    const frueher = new Date(FS_BASE)
    frueher.setDate(frueher.getDate() - 1)
    expect(personTimeline(person, daten(), frueher).every((e) => !e.vergangen)).toBe(true)
  })

  it('ohne Zuteilungen bleibt die Leiste leer', () => {
    const fremd = { ...person, id: 'gibt-es-nicht', fn: 'Niemand', ln: 'Ohnenamen', dn: undefined }
    expect(personTimeline(fremd, daten())).toEqual([])
  })
})
