import { describe, expect, it } from 'vitest'
import { buildDemoWeeks, buildImportWeek, DEMO_GROUPS, DEMO_PERSONS, DEMO_SERVICES } from '../../tests/testdaten/testdaten'
import { emptyQualifications, idAufloeser, isGuestRole, MEETING_TABS, partnerGenderOk, privSetzen } from './helpers'
import { tagNach } from './meeting-dates'
import { allePlaetze, platzDerAuswahl, type Platz } from './plaetze'
import { autoAssignMeeting, rangfolgeFuer, zuletztImBereich } from './planning'
import type { Meeting, MeetingKey, MeetingSlotSelection, PartItem, Person, Week } from './types'
import { schlussgebetVorOrt } from '../../supabase/functions/_shared/planung.ts'

/**
 * **Der Vorschlag im Zuteilen-Blatt ist, wen „Automatisch" nähme** (T121,
 * Phase 5d).
 *
 * Das Blatt markiert die erste Person aus `rangfolgeFuer` als „Vorschlag".
 * Rechnete es nach einer eigenen Regel, schlüge es jemand anderen vor, als der
 * Knopf daneben einträgt — und niemand merkte es, weil beide Antworten
 * plausibel aussehen. Geprüft wird deshalb am Ergebnis der Automatik selbst:
 * Ist genau dieser eine Platz offen, landet dort der Vorschlag.
 */

function auswahl(platz: Platz, wi: number, tab: MeetingKey): MeetingSlotSelection {
  const basis = { wi, tab, label: '', groups: false }
  switch (platz.art) {
    case 'programm':
      return { ...basis, kind: 'part', si: platz.si, ii: platz.ii, ni: platz.ni, aux: platz.aux || undefined, priv: platz.slot.bereichsKey ?? null }
    case 'ratgeber':
      return { ...basis, kind: 'ratgeber', priv: 'ratgeber' }
    case 'helper':
      return { ...basis, kind: 'helper', svc: platz.svc.key, pos: platz.pos, priv: null, groups: platz.svc.groups === true }
  }
}

/** Dieselben Wochen, nur dieser eine Platz ist leer. */
function mitLeeremPlatz(weeks: Week[], sel: MeetingSlotSelection): Week[] {
  const kopie = structuredClone(weeks)
  const slot = platzDerAuswahl(kopie[sel.wi]![sel.tab], DEMO_SERVICES, sel)?.slot
  if (!slot) throw new Error('Platz fehlt')
  slot.name = ''
  delete slot.pid
  return kopie
}

/**
 * Wo die Automatik nicht wählt — dort gibt es keinen Vorschlag (`rangfolgeFuer`).
 * Das Anfangsgebet gehört seit dem 16.10.2026 nicht mehr dazu: Die Automatik
 * setzt dort den Vorsitzenden ein (`anVorsitzKoppeln`), und genau ihn schlägt
 * das Blatt jetzt vor — bis dahin niemanden. Das Schlussgebet am Wochenende
 * dagegen seit dem 24.10.2026 (T133): Es plant niemand.
 */
function ohneWahl(platz: Platz, meeting: Meeting): boolean {
  if (platz.art === 'helper') return platz.svc.groups === true
  if (platz.art === 'ratgeber') return false
  return isGuestRole(platz.slot.rolle) || schlussgebetVorOrt(meeting.sections, platz.section, platz.slot)
}

/** Die Wochen 0–2 des Bestands, beide Zusammenkünfte (Woche 3 hat das Gedächtnismahl). */
const FAELLE = [0, 1, 2].flatMap((wi) => MEETING_TABS.map((tab) => [wi, tab] as const))

/** Die ganze Zusammenkunft besetzt — ein zweiter offener Platz nähme der Automatik womöglich die beste Person weg. */
const besetzt = (wi: number, tab: MeetingKey) =>
  autoAssignMeeting(buildDemoWeeks(), wi, tab, DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS)

describe('Der Vorschlag ist, wen „Automatisch" nähme', () => {
  const wi = 1

  it.each(FAELLE)('Woche %i, %s: für jeden Platz einzeln', (wi, tab) => {
    const voll = besetzt(wi, tab)
    expect(voll.unfilled, 'ein offener Platz störte den Vergleich').toBe(0)

    let geprueft = 0
    for (const platz of allePlaetze(voll.weeks[wi]![tab], DEMO_SERVICES)) {
      const sel = auswahl(platz, wi, tab)
      const leer = mitLeeremPlatz(voll.weeks, sel)
      const rang = rangfolgeFuer(leer, sel, DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS, new Set())
      if (ohneWahl(platz, voll.weeks[wi]![tab])) {
        expect(rang, JSON.stringify(sel)).toEqual([])
        continue
      }
      const nachher = autoAssignMeeting(leer, wi, tab, DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS)
      const gewaehlt = platzDerAuswahl(nachher.weeks[wi]![tab], DEMO_SERVICES, sel)?.slot
      expect(gewaehlt?.pid, JSON.stringify(sel)).toBe(rang[0]?.id)
      geprueft++
    }
    // Sonst prüfte die Schleife nichts — etwa, weil die Woche ausfiele.
    expect(geprueft).toBeGreaterThan(5)
  })

  it('am Partner-Platz eines Gesprächs: dieselben Regeln wie die Automatik', () => {
    // `schuelerteilOpts`: Der Partner passt zum Führer, Älteste und
    // Dienstamtgehilfen nur als letzte Wahl. Ohne diese Regeln schlüge das
    // Blatt einen Bruder als Gesprächspartner einer Schwester vor.
    const person = (id: string, female: boolean, role: Person['role'] = 'verkuendiger'): Person => {
      const priv = emptyQualifications()
      privSetzen(priv, 'schulungPartner', true)
      return { id, fn: id, ln: 'Test', role, female, priv, grp: null }
    }
    const SCHWESTER = person('sw1', true)
    const BRUDER = person('br1', false)
    const AELTESTE = person('sw2', true, 'aeltester')
    const PARTNERIN = person('sw3', true)
    const personen = [SCHWESTER, BRUDER, AELTESTE, PARTNERIN]
    const item: PartItem = {
      iid: 'g1', title: 'Gespräch',
      names: [{ name: 'sw1 Test', pid: SCHWESTER.id, bereichsKey: 'schulung' }, { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' }],
    }
    const weeks: Week[] = [{
      range: '', book: '', start: '2026-09-07',
      mid: { date: '', end: '', sections: [{ label: 'X', farbe: 'gold', items: [item] }], helpers: {} },
      we: { date: '', end: '', sections: [], helpers: {} },
    }]
    const sel: MeetingSlotSelection = { kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 1, label: '', priv: 'schulungPartner', groups: false }

    const rang = rangfolgeFuer(weeks, sel, personen, [], [], new Set())
    // Der Bruder passt nicht zur Führerin; die „Älteste" (nur Testdaten) kommt
    // erst nach der gewöhnlichen Verkündigerin.
    expect(rang.map((p) => p.id)).toEqual([PARTNERIN.id, AELTESTE.id])
    expect(rang.every((p) => partnerGenderOk(SCHWESTER, p))).toBe(true)
    const nachher = autoAssignMeeting(weeks, 0, 'mid', personen, [], [])
    expect((nachher.weeks[0]!.mid.sections[0]!.items[0] as PartItem).names[1]?.pid).toBe(rang[0]!.id)
  })

  it('wer in der Zusammenkunft schon eingeteilt ist, steht nicht in der Rangfolge — gefragt ist, wer käme', () => {
    const voll = besetzt(wi, 'mid').weeks
    const [platz] = [...allePlaetze(voll[wi]!.mid, DEMO_SERVICES)].filter((p) => !ohneWahl(p, voll[wi]!.mid) && p.slot?.pid)
    const sel = auswahl(platz!, wi, 'mid')
    const rang = rangfolgeFuer(voll, sel, DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS, new Set())
    const eingeteilt = new Set([...allePlaetze(voll[wi]!.mid, DEMO_SERVICES)].map((p) => p.slot?.pid).filter(Boolean))
    expect(rang.length).toBeGreaterThan(0)
    expect(rang.filter((p) => eingeteilt.has(p.id))).toEqual([])
  })

  it('eine ausgefallene Zusammenkunft hat keinen Vorschlag', () => {
    const weeks = buildDemoWeeks()
    weeks[wi]!.dev = { mid: { cancelled: true } }
    const [platz] = [...allePlaetze(weeks[wi]!.mid, DEMO_SERVICES)].filter((p) => !ohneWahl(p, weeks[wi]!.mid))
    expect(rangfolgeFuer(weeks, auswahl(platz!, wi, 'mid'), DEMO_PERSONS, DEMO_SERVICES, DEMO_GROUPS, new Set())).toEqual([])
  })
})

/**
 * **„zuletzt vor 12 Wochen"** — die Zeile unter einem Namen im Zuteilen-Blatt.
 * Gezählt wird nur, was vor der geplanten Woche liegt, und nur, was
 * stattfand.
 */
describe('zuletztImBereich', () => {
  const PERSON = DEMO_PERSONS[0]!
  const wer = idAufloeser(DEMO_PERSONS)

  /** Eine Woche, in der PERSON unter der Woche einen Platz im Bereich `bereich` hat. */
  function woche(start: string, bereich: string | null): Week {
    const item: PartItem = { iid: `i-${start}`, title: 'Punkt', names: bereich ? [{ name: 'x', pid: PERSON.id, bereichsKey: bereich }] : [] }
    return {
      range: '', book: '', start,
      mid: { date: '', end: '', sections: [{ label: 'X', farbe: 'gold', items: [item] }], helpers: {} },
      we: { date: '', end: '', sections: [], helpers: {} },
    }
  }

  it('misst in Wochen bis zum letzten Mal davor — das jüngste zählt', () => {
    const weeks = [woche('2026-06-01', 'lesung'), woche('2026-06-15', 'lesung'), woche('2026-06-22', 'gebet'), woche('2026-06-29', null)]
    expect(zuletztImBereich(weeks, 3, 'lesung', [], wer).get(PERSON.id)).toBe(2)
    expect(zuletztImBereich(weeks, 3, 'gebet', [], wer).get(PERSON.id)).toBe(1)
  })

  it('was danach schon geplant ist, ist kein „zuletzt"', () => {
    const weeks = [woche('2026-06-01', null), woche('2026-06-08', 'lesung')]
    expect(zuletztImBereich(weeks, 0, 'lesung', [], wer).has(PERSON.id)).toBe(false)
  })

  it('wer nie dran war, fehlt — ebenso, wer nur in einer ausgefallenen Zusammenkunft stand', () => {
    const weeks = [woche('2026-06-01', 'lesung'), woche('2026-06-08', null)]
    weeks[0]!.dev = { mid: { cancelled: true } }
    expect(zuletztImBereich(weeks, 1, 'lesung', [], wer).size).toBe(0)
  })

  it('auch für den Ratgeber der Zusätzlichen Klasse — sein Blatt nennt, wann er zuletzt riet', () => {
    const weeks = [woche('2026-06-01', null), woche('2026-06-08', null), woche('2026-06-15', null)]
    weeks[0]!.mid.auxRatgeber = { name: 'x', pid: PERSON.id, rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true }
    expect(zuletztImBereich(weeks, 2, 'ratgeber', [], wer).get(PERSON.id)).toBe(2)
    // Gegenprobe: Als Programmpunkt zählt der Ratgeber nicht.
    expect(zuletztImBereich(weeks, 2, 'lesung', [], wer).has(PERSON.id)).toBe(false)
  })
})

/**
 * **Wer am längsten wartet, kommt zuerst — aber eine ausgefallene
 * Zusammenkunft ist kein „zuletzt dran"** (T30). Bei gleicher Last im Fenster
 * entscheidet der Abstand zur letzten Einteilung über alle geladenen Wochen.
 * Stand jemand auf dem Platz einer Zusammenkunft, die dann ausfiel, hat er die
 * Aufgabe nie gehabt — er wartet weiter, statt hinter einem zurückzufallen, der
 * sie wirklich hatte.
 */
describe('Der Abstand der Automatik übergeht ausgefallene Zusammenkünfte', () => {
  const START = '2026-06-01'
  const bruder = (id: string, fn: string): Person => {
    const priv = emptyQualifications()
    privSetzen(priv, 'bibellesung', true)
    return { id, fn, ln: 'Beispiel', role: 'verkuendiger', priv }
  }
  const bernd = bruder('pb', 'Bernd')
  const paul = bruder('pp', 'Paul')

  /** Zehn fortlaufende Wochen ab START, alle Plätze offen. */
  function reihe(): Week[] {
    return Array.from({ length: 10 }, (_, i) => ({ ...structuredClone(buildImportWeek()), start: tagNach(START, 7 * i) }))
  }
  const lesung = (w: Week): Platz =>
    [...allePlaetze(w.mid, DEMO_SERVICES)].find((p) => p.art === 'programm' && p.slot.bereichsKey === 'bibellesung')!
  const besetze = (w: Week, p: Person): void => {
    Object.assign(lesung(w).slot!, { name: `${p.fn} ${p.ln}`, pid: p.id })
  }

  it('Paul las in einer ausgefallenen Zusammenkunft — er wartet länger als Bernd und kommt zuerst', () => {
    const weeks = reihe()
    besetze(weeks[1]!, bernd) // acht Wochen vor der geplanten
    besetze(weeks[3]!, paul) // sechs Wochen vor der geplanten — beide außerhalb des Last-Fensters
    weeks[3]!.dev = { mid: { cancelled: true } }
    const sel = auswahl(lesung(weeks[9]!), 9, 'mid')
    expect(rangfolgeFuer(weeks, sel, [bernd, paul], DEMO_SERVICES, [], new Set()).map((p) => p.id)).toEqual(['pp', 'pb'])
    // Gegenprobe: Findet die Zusammenkunft statt, war Paul vor kürzerer Zeit dran — Bernd zuerst.
    delete weeks[3]!.dev
    expect(rangfolgeFuer(weeks, sel, [bernd, paul], DEMO_SERVICES, [], new Set()).map((p) => p.id)).toEqual(['pb', 'pp'])
  })
})
