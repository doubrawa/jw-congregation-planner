import { describe, expect, it } from 'vitest'
import { buildDemoWeeks, DEMO_GROUPS, DEMO_PERSONS, DEMO_SERVICES } from '../../tests/testdaten/testdaten'
import { buildAbsences } from './absence'
import { bedarfJeBereich } from './bedarf'
import { istArt } from './helpers'
import { offenePlaetze } from './offene-plaetze'
import { allePlaetze, platzMitZusage } from './plaetze'
import { autoAssignMeeting, countOpenSlots, punktKey, rangfolgeFuer, sentKey, zuteilbarePlaetze } from './planning'
import { besetzung } from './saal'
import type { MeetingKey, MeetingSlotSelection, PartItem, Week } from './types'
import { schlussgebetVorOrt } from '../../supabase/functions/_shared/planung.ts'

/**
 * **Das Schlussgebet am Wochenende plant niemand** (T133, Betreiber
 * 24.10.2026): Es spricht der Vortragsredner, wenn er bleibt; sonst bittet der
 * Leiter des Wachtturm-Studiums vor der Zusammenkunft jemanden. Wäre der leere
 * Platz „offen", stünde jede Woche ein Platz in der Spur, den niemand füllen
 * soll — und die Automatik setzte jemanden ein, der dann zusagen müsste und
 * erinnert würde.
 *
 * Unter der Woche wird das Schlussgebet weiter geplant; das ist die Gegenprobe
 * in jedem Fall. Und wer es vorher weiß, trägt jemanden ein — dann ist es ein
 * Platz wie jeder.
 *
 * Die Testwochen tragen keine Art an den Abschnitten (wie der Altbestand): Die
 * Regel erkennt Abschluss und Wachtturm-Studium dort an der Überschrift.
 */

/** Woche 0 der Testdaten mit leerem Schlussgebet — am Wochenende oder unter der Woche. */
function ohneSchlussgebet(tab: MeetingKey): Week[] {
  const weeks = buildDemoWeeks()
  schlussgebet(weeks[0]![tab]).name = ''
  delete schlussgebet(weeks[0]![tab]).pid
  return weeks
}

function abschluss(meeting: Week[MeetingKey]): { si: number; item: PartItem } {
  const si = meeting.sections.findIndex((s) => istArt(s, 'abschluss'))
  const item = meeting.sections[si]?.items[0]
  if (si < 0 || !item || 'song' in item) throw new Error('Abschluss fehlt')
  return { si, item }
}

function schlussgebet(meeting: Week[MeetingKey]) {
  const slot = abschluss(meeting).item.names.find((n) => n.rolle === 'Gebet')
  if (!slot) throw new Error('Schlussgebet fehlt')
  return slot
}

describe('Ein leeres Schlussgebet am Wochenende ist nicht offen', () => {
  it('es zählt nicht als offener Platz — unter der Woche schon', () => {
    const we = ohneSchlussgebet('we')
    expect(countOpenSlots(we[0]!.we, DEMO_SERVICES)).toBe(countOpenSlots(buildDemoWeeks()[0]!.we, DEMO_SERVICES))
    const mid = ohneSchlussgebet('mid')
    expect(countOpenSlots(mid[0]!.mid, DEMO_SERVICES)).toBe(countOpenSlots(buildDemoWeeks()[0]!.mid, DEMO_SERVICES) + 1)
  })

  it('im Saal und in der Spur steht es weder offen noch besetzt', () => {
    const vorher = besetzung(buildDemoWeeks()[0]!.we, DEMO_SERVICES, {}, '2026-09-07', 'we', null)
    const nachher = besetzung(ohneSchlussgebet('we')[0]!.we, DEMO_SERVICES, {}, '2026-09-07', 'we', null)
    expect(nachher.offen).toBe(vorher.offen)
    // Vorher war es besetzt und wartete auf die Zusage — jetzt fehlt es ganz.
    expect(nachher.voll + nachher.wartet + nachher.problem).toBe(vorher.voll + vorher.wartet + vorher.problem - 1)
  })

  it('„Automatisch" findet es nicht als zu besetzenden Platz vor', () => {
    const voll = zuteilbarePlaetze(buildDemoWeeks()[0]!.we, DEMO_SERVICES, 'parts')
    const leer = zuteilbarePlaetze(ohneSchlussgebet('we')[0]!.we, DEMO_SERVICES, 'parts')
    expect(leer).toEqual({ besetzt: voll.besetzt - 1, gesamt: voll.gesamt - 1 })
  })
})

describe('Niemand wird dafür eingeteilt', () => {
  it('die Automatik lässt es leer und zählt es nicht als unbesetzbar', () => {
    const ergebnis = autoAssignMeeting(ohneSchlussgebet('we'), 0, 'we', DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS)
    expect(schlussgebet(ergebnis.weeks[0]!.we).name).toBe('')
    expect(ergebnis.unfilled).toBe(0)
  })

  it('unter der Woche besetzt sie es', () => {
    const ergebnis = autoAssignMeeting(ohneSchlussgebet('mid'), 0, 'mid', DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS)
    expect(schlussgebet(ergebnis.weeks[0]!.mid).name).not.toBe('')
  })

  it('das Zuteilen-Blatt schlägt niemanden vor — unter der Woche schon', () => {
    const rang = (tab: MeetingKey) => {
      const weeks = ohneSchlussgebet(tab)
      const sel: MeetingSlotSelection = { kind: 'part', wi: 0, tab, si: abschluss(weeks[0]![tab]).si, ii: 0, ni: 0, priv: 'gebet', label: '', groups: false }
      return rangfolgeFuer(weeks, sel, DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS, new Set())
    }
    expect(rang('we')).toEqual([])
    expect(rang('mid').length).toBeGreaterThan(0)
  })

  it('es zählt nicht als Bedarf an Betern', () => {
    // Das Anfangsgebet folgt dem Vorsitz, das Schlussgebet übernimmt der Redner oder wer vor Ort gebeten wird.
    expect(bedarfJeBereich(buildDemoWeeks()[0]!.we, DEMO_SERVICES).get('gebet')).toBeUndefined()
    expect(bedarfJeBereich(buildDemoWeeks()[0]!.mid, DEMO_SERVICES).get('gebet')).toBeGreaterThan(0)
  })
})

describe('Es wird nicht als freier Platz angeboten', () => {
  it('nach „Plan senden" bietet die App das Schlussgebet am Wochenende niemandem an', () => {
    const weeks = ohneSchlussgebet('we')
    const mid = ohneSchlussgebet('mid')
    weeks[0]!.mid = mid[0]!.mid
    const zeiten = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
    // Gesendet ist der Plan, sobald irgendein Platz der Woche im Tagebuch steht.
    const gesendet = { [sentKey(punktKey('2026-09-07', 'mid', 'x', 0), 'Irgendwer')]: '2026-09-01T10:00:00Z' }
    const beter = DEMO_PERSONS.find((p) => p.priv.gebet && !p.female)!
    const angebote = offenePlaetze(weeks, DEMO_SERVICES, gesendet, beter, zeiten, buildAbsences([], weeks, zeiten), new Date('2026-09-07T09:00:00Z'))
    const iid = (tab: MeetingKey) => abschluss(weeks[0]![tab]).item.iid
    const keys = angebote.map((a) => a.key)
    expect(keys).not.toContain(punktKey('2026-09-07', 'we', iid('we'), 0))
    expect(keys).toContain(punktKey('2026-09-07', 'mid', iid('mid'), 0))
  })
})

describe('Wer es vorher weiß, trägt jemanden ein', () => {
  it('eingetragen ist es ein Platz wie jeder: besetzt, mit Zusage, nicht mehr „vor Ort"', () => {
    const meeting = buildDemoWeeks()[0]!.we
    const platz = [...allePlaetze(meeting, DEMO_SERVICES)].find(
      (p) => p.art === 'programm' && schlussgebetVorOrt(meeting.sections, p.section, p.slot),
    )
    expect(platz?.slot?.name).toBeTruthy()
    expect(platz && platzMitZusage(platz)).toBe(true)
  })
})

describe('Die Regel selbst', () => {
  const we = buildDemoWeeks()[0]!.we
  const abschlussWe = we.sections[abschluss(we).si]!

  it('greift nur beim Gebet im Abschluss einer Zusammenkunft mit Wachtturm-Studium', () => {
    expect(schlussgebetVorOrt(we.sections, abschlussWe, { rolle: 'Gebet' })).toBe(true)
    const mid = buildDemoWeeks()[0]!.mid
    expect(schlussgebetVorOrt(mid.sections, mid.sections[abschluss(mid).si]!, { rolle: 'Gebet' })).toBe(false)
    expect(schlussgebetVorOrt(we.sections, we.sections[0]!, { rolle: 'Gebet' })).toBe(false) // Anfangsgebet
    expect(schlussgebetVorOrt(we.sections, abschlussWe, { rolle: 'Vorsitz' })).toBe(false)
  })

  it('erkennt Abschnitte mit gespeicherter Art wie ohne', () => {
    const mitArt = we.sections.map((s) => ({ ...s, kind: istArt(s, 'abschluss') ? 'abschluss' : istArt(s, 'wtStudium') ? 'wtStudium' : undefined }))
    const abschlussMitArt = mitArt.find((s) => s.kind === 'abschluss')!
    expect(schlussgebetVorOrt(mitArt, abschlussMitArt, { rolle: 'Gebet' })).toBe(true)
  })
})
