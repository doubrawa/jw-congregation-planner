import { describe, expect, it } from 'vitest'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_PERSONS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import { displayName } from '../data/helpers'
import type { Absence } from '../data/types'
import { personTimeline, type TimelineDaten } from './person-timeline'

function daten(patch: Partial<TimelineDaten> = {}): TimelineDaten {
  return {
    weeks: buildDemoWeeks(),
    services: DEMO_SERVICES,
    confirmations: {},
    congregation: CONGREGATION,
    fsWeeks: buildDemoFsWeeks(),
    fsBase: FS_BASE,
    absences: [],
    ...patch,
  }
}

/** Abwesenheit dieser Person, so wie sie aus der Datenbank käme. */
const abwesenheit = (id: string, from: string, to: string, reason = ''): Absence => ({
  id, personId: person.id, userId: null, from, to, reason,
})

/** Erste Person, die in den Demo-Wochen überhaupt zugeteilt ist. */
const person = DEMO_PERSONS.find((p) => p.id === 'p1')!

describe('Zeitleiste einer Person', () => {
  it('listet die Zuteilungen der Zusammenkünfte mit Datum und Art', () => {
    const eintraege = personTimeline(person, daten())
    expect(eintraege.length).toBeGreaterThan(0)
    const meeting = eintraege.find((e) => e.kind === 'meeting')
    expect(meeting).toBeDefined()
    if (meeting?.kind !== 'meeting') throw new Error('kein Zusammenkunfts-Eintrag')
    // Titel und Rolle stehen getrennt (die Anzeige übersetzt sie verschieden);
    // benannt sein muss der Eintrag, gleich über welche der beiden Hälften.
    expect(`${meeting.titel}${meeting.rolle ?? ''}`).not.toBe('')
    // Demo: Woche 0 beginnt Mo, 7.9.; Einstellungen sagen „Di 19:00 · So 10:00"
    expect(meeting.datum.getDay()).toBe(2) // Dienstag
    expect(meeting.datum.getDate()).toBe(8)
    expect(meeting.zeit).toBe('19:00')
  })

  /** Wochen wie nach dem jw.org-Import: im Datumsfeld steht nur die Spanne. */
  const importierteWochen = () =>
    buildDemoWeeks().map((w) => ({
      ...w,
      mid: { ...w.mid, date: w.range },
      we: { ...w.we, date: w.range },
    }))

  it('nennt auch bei importierten Wochen Tag und Zeit statt der Wochenspanne', () => {
    // Der Import schreibt „7.–13. September" ins Datumsfeld — der Termin steht
    // dann nur in den Einstellungen (hier „Di 19:00 · So 10:00").
    const eintraege = personTimeline(person, daten({ weeks: importierteWochen() }))
    const meetings = eintraege.filter((e) => e.kind === 'meeting')
    expect(meetings.length).toBeGreaterThan(0)
    for (const e of meetings) {
      expect([2, 0]).toContain(e.datum.getDay()) // Dienstag oder Sonntag
      expect(e.zeit).toBe(e.datum.getDay() === 2 ? '19:00' : '10:00')
    }
  })

  it('ein eigener Termin der Woche hat Vorrang (Gedächtnismahl)', () => {
    // Demo-Woche 3: Gedächtnismahl am Samstag 19:30 statt Sonntag 10:00.
    const sonder = personTimeline(person, daten()).find((e) => e.zeit === '19:30')
    expect(sonder).toBeDefined()
    expect(sonder?.datum.getDay()).toBe(6) // Samstag
    // Ohne eigenen Termin fiele derselbe Punkt auf den Sonntag zurück.
    const ohne = personTimeline(person, daten({ weeks: importierteWochen() }))
    expect(ohne.some((e) => e.zeit === '19:30')).toBe(false)
  })

  it('ohne hinterlegte Uhrzeit bleibt das Feld leer, statt etwas zu erfinden', () => {
    const congregation = { ...CONGREGATION, meetings: 'Di · So' }
    const eintraege = personTimeline(person, daten({ weeks: importierteWochen(), congregation }))
    const meeting = eintraege.find((e) => e.kind === 'meeting')
    expect(meeting?.zeit).toBe('')
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

  it('bei einer Lücke im Bestand nennt der Treffpunkt den Tag SEINER Woche', () => {
    /*
     * **Der Fall, den ein lückenloser Bestand nicht messen kann.** Seit T66
     * stehen die Wochen nach Datum nebeneinander, ohne Platzhalter: Fehlt eine
     * im geladenen Fenster, ist die Woche mit Index 1 nicht der 14., sondern
     * der 21. September. `fsBase + wi·7` nennt ab dort jeden Treffpunkt sieben
     * Tage zu früh — und niemand merkt es, weil beide Rechnungen ohne Lücke
     * dasselbe liefern.
     *
     * Sichtbar wird es genau hier: Der Zusammenkunfts-Zweig rechnet längst über
     * `meetingDate`, der Treffpunkt-Zweig tat es nicht. Dieselbe Leiste zeigte
     * damit zwei Termine derselben Woche eine Woche auseinander.
     */
    const alle = buildDemoWeeks()
    // Woche 1 (14.9.) fällt heraus — übrig: 7.9., 21.9., 28.9.
    const mitLuecke = [alle[0]!, alle[2]!, alle[3]!]
    const fsOhne = buildDemoFsWeeks().map((w) => w.map((i) => ({ ...i, leader: '' })))
    // Der Treffpunkt steht in der Woche mit Index 1 — also am 21.9., nicht am 14.
    const fsWeeks = fsOhne.map((w, wi) =>
      w.map((inst, i) => (wi === 1 && i === 0 ? { ...inst, leader: displayName(person) } : inst)),
    )
    const fs = personTimeline(person, daten({ weeks: mitLuecke, fsWeeks })).filter(
      (e) => e.kind === 'fs',
    )
    expect(fs).toHaveLength(1)
    const montag = new Date(`${mitLuecke[1]!.start}T12:00:00`)
    const versatz = ((fsWeeks[1]![0]!.wd + 6) % 7) // 0=So … 6=Sa → Tage nach Montag
    const erwartet = new Date(montag)
    erwartet.setDate(erwartet.getDate() + versatz)
    expect(fs[0]!.datum.getDate()).toBe(erwartet.getDate())
    expect(fs[0]!.datum.getMonth()).toBe(erwartet.getMonth())
    // Und die Sortierung zieht mit: 14 Tage nach dem Montag der Woche 0, nicht 7.
    expect(fs[0]!.tag).toBe(14 + versatz)
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

/**
 * Abwesenheiten stehen in derselben Leiste wie die Zuteilungen — nicht als
 * zweite Liste darunter. Erst dadurch ist zu sehen, dass eine Zuteilung in
 * einen Zeitraum fällt; und genau das muss die Markierung tragen, aus der die
 * Anzeige die Strecke einfärbt.
 */
describe('Abwesenheiten in der Zeitleiste', () => {
  /** Nur die Abwesenheits-Ränder, in der Reihenfolge der Leiste. */
  const raender = (e: ReturnType<typeof personTimeline>) =>
    e.filter((x) => x.kind === 'abw').map((x) => (x.kind === 'abw' ? x.rand : ''))

  it('macht aus einem Zeitraum zwei Punkte — Beginn und Ende', () => {
    const eintraege = personTimeline(person, daten({ absences: [abwesenheit('a', '2026-09-14', '2026-09-20', 'Urlaub')] }))
    expect(raender(eintraege)).toEqual(['start', 'ende'])
    const [beginn, ende] = eintraege.filter((e) => e.kind === 'abw')
    expect(beginn?.datum.getDate()).toBe(14)
    expect(ende?.datum.getDate()).toBe(20)
  })

  it('macht aus einem einzelnen Tag einen einzigen Punkt', () => {
    // Zwei Punkte auf demselben Datum wären keine Strecke, sondern ein Doppel.
    const eintraege = personTimeline(person, daten({ absences: [abwesenheit('a', '2026-09-14', '2026-09-14')] }))
    expect(raender(eintraege)).toEqual(['einzel'])
  })

  it('färbt die Strecke zwischen Beginn und Ende — und nur sie', () => {
    /*
     * Die Markierung ist nach oben und unten getrennt, weil der Punkt die
     * **Grenze** ist: Beim Beginn gehört nur das Stück darunter zum Zeitraum,
     * beim Ende nur das darüber. Ohne diese Trennung liefe die Farbe über den
     * Rand hinaus, und der Zeitraum sähe größer aus, als er ist.
     */
    const eintraege = personTimeline(person, daten({ absences: [abwesenheit('a', '2026-09-08', '2026-09-27')] }))
    const beginn = eintraege.find((e) => e.kind === 'abw' && e.rand === 'start')
    const ende = eintraege.find((e) => e.kind === 'abw' && e.rand === 'ende')
    expect([beginn?.abwOben, beginn?.abwUnten]).toEqual([false, true])
    expect([ende?.abwOben, ende?.abwUnten]).toEqual([true, false])
    // Der letzte Eintrag liegt hinter dem Ende — dort ist nichts mehr gefärbt.
    expect(eintraege[eintraege.length - 1]?.abwUnten).toBe(false)
  })

  it('markiert die Zuteilungen, die IN den Zeitraum fallen', () => {
    // Der eigentliche Gewinn gegenüber der Liste unter dem Formular: Man sieht,
    // dass jemand eingeteilt ist, obwohl er weg ist.
    const eintraege = personTimeline(person, daten({ absences: [abwesenheit('a', '2026-09-08', '2026-09-27')] }))
    const drin = eintraege.filter((e) => e.kind !== 'abw' && e.abwOben && e.abwUnten)
    expect(drin.length).toBeGreaterThan(0)
    for (const e of drin) {
      expect(e.datum >= new Date('2026-09-08T00:00:00')).toBe(true)
      expect(e.datum <= new Date('2026-09-27T23:59:59')).toBe(true)
    }
  })

  it('fasst den Tag ein: Beginn vor den Zuteilungen des Tages, Ende dahinter', () => {
    /*
     * Am selben Kalendertag entscheidet die Reihenfolge über die Färbung. Stünde
     * der Beginn hinter der Zuteilung dieses Tages, liefe die Strecke an ihr
     * vorbei — obwohl sie sehr wohl in den Zeitraum fällt.
     */
    const eintraege = personTimeline(person, daten({ absences: [abwesenheit('a', '2026-09-08', '2026-09-08')] }))
    const amTag = eintraege.filter((e) => e.datum.getDate() === 8)
    expect(amTag[0]?.kind).toBe('abw')
  })

  it('zeigt auch, was jenseits der geladenen Wochen liegt', () => {
    // Die Demo-Wochen enden Anfang Oktober; eine Abwesenheit im Dezember
    // gehört trotzdem hierher — geplant ist sie ja.
    const eintraege = personTimeline(person, daten({ absences: [abwesenheit('a', '2026-12-24', '2026-12-28')] }))
    expect(raender(eintraege)).toEqual(['start', 'ende'])
    expect(eintraege[eintraege.length - 1]?.datum.getMonth()).toBe(11)
  })

  it('nimmt nur die Abwesenheiten dieser Person', () => {
    const fremd: Absence = { id: 'f', personId: 'p2', userId: null, from: '2026-09-14', to: '2026-09-20', reason: '' }
    expect(raender(personTimeline(person, daten({ absences: [fremd] })))).toEqual([])
  })

  it('trägt auch bei überlappenden Zeiträumen durchgehend', () => {
    /*
     * Der Import fasst Überlappendes zwar zusammen, von Hand lässt sich aber
     * beides eintragen. Ein Vergleich je Paar hätte die Farbe am ersten Ende
     * abgeschaltet, obwohl der zweite Zeitraum noch läuft — deshalb zählt die
     * Markierung offene Zeiträume, statt sie zu paaren.
     */
    const eintraege = personTimeline(
      person,
      daten({ absences: [abwesenheit('a', '2026-09-08', '2026-09-20'), abwesenheit('b', '2026-09-14', '2026-09-27')] }),
    )
    const ersteEnde = eintraege.find((e) => e.kind === 'abw' && e.rand === 'ende')
    expect(ersteEnde?.abwUnten).toBe(true) // der zweite Zeitraum läuft weiter
  })
})
