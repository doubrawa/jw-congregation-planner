import { describe, expect, it } from 'vitest'
import { syncAuxSlots } from './aux-class'
import { buildImportWeek, DEMO_SERVICES } from './demo'
import { displayName, isSong, partWorkload, serviceQualKey } from './helpers'
import { autoAssignMeeting, weekConflicts } from './planning'
import type { Meeting, Person, Qualifications, Service, SlotAssignment, Week } from './types'

/**
 * Langzeit-Fairness der Auto-Zuteilung.
 *
 * Die Strichliste zählt nur ein gleitendes Fenster von ±3 Wochen. Bei
 * Schulungsaufgaben gibt es aber mehr Schwestern als Plätze — dort stehen fast
 * alle im Fenster bei null, die Zahl unterscheidet also nichts mehr und die
 * Auswahl hängt ganz an den Kriterien danach. Diese Tests messen deshalb, was
 * über Monate herauskommt, nicht was eine einzelne Woche tut.
 *
 * Sie hielten drei Fehler fest, die sich erst über einen langen Zeitraum
 * zeigten (Zahlen aus derselben Simulation, 30 Schwestern, ein Jahr):
 *  - Tie-Break-Hash ohne Nachmischung → feste Rangliste nach Namen: 0 bis 13
 *    Aufgaben, eine Schwester ein ganzes Jahr lang keine einzige.
 *  - Zusätzliche Klasse zählte nicht als Auslastung → 16 bis 24.
 *  - Kein Kriterium für „wer wartet am längsten" → 8 bis 12.
 * Heute: 10 bis 11.
 */

let counter = 0
function priv(on: string[]): Qualifications {
  const base: Qualifications = {
    vorsitzMid: false, vorsitzWe: false, vortrag: false, gebet: false, bibellesung: false,
    leser: false, schulung: false, schulungPartner: false, studium: false, treffpunkt: false,
  }
  for (const key of on) base[key] = true
  return base
}
function mk(
  quals: string[],
  opts: { female?: boolean; role?: Person['role']; ln?: string } = {},
): Person {
  counter += 1
  return {
    id: `f${counter}`,
    fn: 'T',
    ln: opts.ln ?? `P${counter}`,
    role: opts.role ?? 'verkuendiger',
    tel: '', mail: '', absent: [],
    priv: priv(quals),
    ...(opts.female ? { female: true } : {}),
  }
}
function many(n: number, quals: string[], opts: { female?: boolean; role?: Person['role'] } = {}): Person[] {
  return Array.from({ length: n }, () => mk(quals, opts))
}

/** Alle belegten Aufgaben-Namen einer Zusammenkunft — beide Räume, mit Ratgeber. */
function partNames(meeting: Meeting): string[] {
  const names: string[] = []
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of [...item.names, ...(item.aux ?? [])]) if (slot.name) names.push(slot.name)
    }
  }
  if (meeting.auxRatgeber?.name) names.push(meeting.auxRatgeber.name)
  return names
}

/** Wie oft jede der `wer` über alle Wochen eine Aufgabe bekommen hat. */
function strichliste(weeks: Week[], wer: Person[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of wer) counts.set(displayName(p), 0)
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      for (const name of partNames(meeting)) {
        if (counts.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
  }
  return counts
}

/** Wie oft jede der `wer` je Bereich eingeteilt war: Bereich → Name → Anzahl. */
function bereichsZaehlung(weeks: Week[], wer: Person[]): Map<string, Map<string, number>> {
  const namen = new Set(wer.map(displayName))
  const out = new Map<string, Map<string, number>>()
  for (const week of weeks) {
    for (const meeting of [week.mid, week.we]) {
      for (const section of meeting.sections) {
        for (const item of section.items) {
          if (isSong(item)) continue
          for (const slot of [...item.names, ...(item.aux ?? [])]) {
            if (!slot.name || !slot.bereichsKey || !namen.has(slot.name)) continue
            let map = out.get(slot.bereichsKey)
            if (!map) { map = new Map(); out.set(slot.bereichsKey, map) }
            map.set(slot.name, (map.get(slot.name) ?? 0) + 1)
          }
        }
      }
    }
  }
  // Wer im Bereich nie vorkam, muss als 0 auftauchen — sonst misst min nichts.
  for (const map of out.values()) {
    for (const name of namen) if (!map.has(name)) map.set(name, 0)
  }
  return out
}

/** min/max eines Bereichs aus der Bereichs-Zählung. */
function verteilung(proBereich: Map<string, Map<string, number>>, bereich: string): { min: number; max: number } {
  const werte = [...(proBereich.get(bereich)?.values() ?? [])]
  return { min: Math.min(...werte), max: Math.max(...werte) }
}

/** Plant `n` Wochen der Reihe nach durch — wie der Planer Woche für Woche. */
function simulate(persons: Person[], n: number, aux = false): Week[] {
  let weeks: Week[] = Array.from({ length: n }, () => buildImportWeek())
  if (aux) weeks = syncAuxSlots(weeks, true)
  for (let wi = 0; wi < n; wi++) {
    weeks = autoAssignMeeting(weeks, wi, 'mid', persons, DEMO_SERVICES).weeks
    weeks = autoAssignMeeting(weeks, wi, 'we', persons, DEMO_SERVICES).weeks
  }
  return weeks
}

/* ---- Minimalbauten für die Einzelkriterien ------------------------------ */

function emptyMeeting(): Meeting {
  return { date: '', end: '', sections: [], helpers: {} }
}
/** Zusammenkunft mit genau einem offenen Platz des Bereichs `bereich`. */
function einPlatz(bereich: string): Meeting {
  return {
    date: '', end: '',
    sections: [{ label: 'X', farbe: 'neutral', items: [{ title: 'T', names: [{ name: '', bereichsKey: bereich }] }] }],
    helpers: {},
  }
}
/** Zusammenkunft, in der `name` einen Platz belegt (Historie). */
function belegt(name: string, bereich = 'vortrag'): Meeting {
  const m = einPlatz(bereich)
  ;(m.sections[0].items[0] as { names: SlotAssignment[] }).names[0].name = name
  return m
}
function wk(mid: Meeting, we: Meeting = emptyMeeting()): Week {
  return { range: '', book: '', current: false, mid, we }
}
/** Name auf dem einen Platz der geplanten Woche. */
function gewaehlt(weeks: Week[], wi: number, persons: Person[]): string {
  const res = autoAssignMeeting(weeks, wi, 'mid', persons, [])
  return partNames(res.weeks[wi].mid)[0] ?? ''
}

describe('Tie-Break bei gleicher Auslastung', () => {
  /**
   * Stehen mehrere bei null, entscheidet der Hash aus Name + Woche. Er MUSS die
   * Reihenfolge von Woche zu Woche wechseln — sonst ist er eine feste Rangliste
   * nach Namen und wer darin hinten steht, kommt nie dran.
   */
  it('wechselt die Reihenfolge von Woche zu Woche (keine feste Rangliste)', () => {
    const a = mk(['vortrag'], { ln: 'Anders' })
    const b = mk(['vortrag'], { ln: 'Berger' })
    const gewinner = new Set<string>()
    for (let wi = 0; wi < 12; wi++) {
      // Jede Woche mit LEERER Historie planen: beide stehen bei null und sind
      // gleich lange nicht dran gewesen — es entscheidet allein der Hash.
      const weeks: Week[] = Array.from({ length: 12 }, () => wk(einPlatz('vortrag')))
      gewinner.add(gewaehlt(weeks, wi, [a, b]))
    }
    expect(gewinner).toEqual(new Set([displayName(a), displayName(b)]))
  })

  /**
   * Das Kernproblem des kurzen Fensters: außerhalb von ±3 Wochen ist alles
   * gleich „null". Wer seit Monaten wartet, muss trotzdem vor dem stehen, der
   * vor fünf Wochen dran war — sonst entscheidet der Zufall.
   */
  it('wer am längsten nicht dran war, kommt zuerst — auch außerhalb des Fensters', () => {
    const a = mk(['vortrag'], { ln: 'Alt' })
    const b = mk(['vortrag'], { ln: 'Bald' })
    const plan = (langHer: Person, kuerzlich: Person): string => {
      const weeks: Week[] = Array.from({ length: 12 }, () => wk(emptyMeeting()))
      weeks[0].mid = belegt(displayName(langHer)) // 10 Wochen her
      weeks[6].mid = belegt(displayName(kuerzlich)) // 4 Wochen her
      weeks[10].mid = einPlatz('vortrag')
      // Fenster um Woche 10 = [7..12] → beide zählen dort null.
      expect(partWorkload(weeks.slice(7), displayName(langHer))).toBe(0)
      expect(partWorkload(weeks.slice(7), displayName(kuerzlich))).toBe(0)
      return gewaehlt(weeks, 10, [a, b])
    }
    // Beide Richtungen, damit nicht der Hash das Ergebnis zufällig trifft.
    expect(plan(a, b)).toBe(displayName(a))
    expect(plan(b, a)).toBe(displayName(b))
  })

  it('die Auslastung im Fenster wiegt schwerer als die Wartezeit', () => {
    // Wartezeit ist nur der Tie-Break: wer im Fenster schon eine Aufgabe hat,
    // steht hinten, auch wenn der andere gerade erst dran war.
    const a = mk(['vortrag'], { ln: 'Ausgelastet' })
    const b = mk(['vortrag'], { ln: 'Frei' })
    const weeks: Week[] = Array.from({ length: 12 }, () => wk(emptyMeeting()))
    weeks[9].mid = belegt(displayName(a)) // im Fenster → Last 1
    weeks[8].mid = belegt(displayName(b)) // ebenfalls kürzlich, aber …
    weeks[8].we = belegt('', 'vortrag')
    weeks[10].mid = einPlatz('vortrag')
    // A hat im Fenster eine Aufgabe, B keine → B gewinnt trotz kürzerer Wartezeit.
    expect(gewaehlt(weeks, 10, [a, b])).toBe(displayName(b))
  })
})

describe('Zusätzliche Klasse zählt als Auslastung', () => {
  it('partWorkload zählt Plätze der Klasse und den Ratgeber mit', () => {
    const meeting = einPlatz('schulung')
    const item = meeting.sections[0].items[0] as { names: SlotAssignment[]; aux?: SlotAssignment[] }
    item.names[0].name = 'Haupt Saal'
    item.aux = [{ name: 'Zweite Klasse', bereichsKey: 'schulung' }]
    meeting.auxRatgeber = { name: 'Rolf Ratgeber', rolle: 'Ratgeber', bereichsKey: 'ratgeber' }
    const weeks = [wk(meeting)]
    expect(partWorkload(weeks, 'Haupt Saal')).toBe(1)
    expect(partWorkload(weeks, 'Zweite Klasse')).toBe(1) // zählte früher 0
    expect(partWorkload(weeks, 'Rolf Ratgeber')).toBe(1) // zählte früher 0
  })

  it('zählt eine Begleitung nicht doppelt, wenn die Klasse die Rolle erbt', () => {
    // `angleichen` kopiert die Rollenbeschriftung in die Klasse — die
    // Begleiter-Erwähnung darf deshalb nur im Hauptsaal zählen.
    const meeting = einPlatz('schulung')
    const item = meeting.sections[0].items[0] as { names: SlotAssignment[]; aux?: SlotAssignment[] }
    item.names[0] = { name: 'Wer Auchimmer', rolle: 'mit Anna Beispiel', bereichsKey: 'schulung' }
    item.aux = [{ name: '', rolle: 'mit Anna Beispiel', bereichsKey: 'schulung' }]
    expect(partWorkload([wk(meeting)], 'Anna Beispiel')).toBe(1)
  })

  it('wer in der Klasse dran war, kommt nicht sofort wieder', () => {
    const a = mk(['schulung'], { female: true, ln: 'Klasse' })
    const b = mk(['schulung'], { female: true, ln: 'Frei' })
    const weeks: Week[] = Array.from({ length: 3 }, () => wk(emptyMeeting()))
    const vorwoche = einPlatz('schulung')
    const item = vorwoche.sections[0].items[0] as { names: SlotAssignment[]; aux?: SlotAssignment[] }
    item.names[0].name = '' // Hauptsaal blieb offen …
    item.aux = [{ name: displayName(a), bereichsKey: 'schulung' }] // … A war in der Klasse
    weeks[0].mid = vorwoche
    weeks[1].mid = einPlatz('schulung')
    expect(gewaehlt(weeks, 1, [a, b])).toBe(displayName(b))
  })
})

describe('Verteilung über ein halbes Jahr (Simulation)', () => {
  /**
   * Versammlung mit deutlich mehr Schwestern als Schulungsplätzen — genau die
   * Lage, in der das ±3-Wochen-Fenster nichts mehr unterscheidet.
   */
  const sisters = many(30, ['schulung', 'schulungPartner'], { female: true })
  /** Brüder, die Bibellesung UND Leser können — für die Bereichs-Verteilung. */
  const brothers = many(20, ['bibellesung', 'leser', 'schulung', 'schulungPartner', serviceQualKey('ton'), serviceQualKey('mik'), serviceQualKey('ord')])
  const persons: Person[] = [
    ...many(10, ['vorsitzMid', 'vorsitzWe', 'vortrag', 'gebet', 'studium', 'bibellesung', 'leser', 'schulung', 'schulungPartner', 'ratgeber'], { role: 'aeltester' }),
    ...many(8, ['vortrag', 'gebet', 'bibellesung', 'leser', 'schulung', 'schulungPartner', serviceQualKey('mik'), serviceQualKey('ord')], { role: 'dienstamtgehilfe' }),
    ...brothers,
    ...sisters,
  ]
  const WOCHEN = 26
  const weeks = simulate(persons, WOCHEN)
  const counts = strichliste(weeks, sisters)
  const werte = [...counts.values()].sort((a, b) => a - b)

  it('lässt in einem halben Jahr keine Schwester leer ausgehen', () => {
    // Der Fehlerfall, den das hier festhält: eine Schwester bekam in 52 Wochen
    // keine einzige Aufgabe, weil der Tie-Break eine feste Namensrangliste war.
    expect(werte[0]).toBeGreaterThan(0)
    expect(counts.size).toBe(sisters.length)
  })

  it('verteilt die Schulungsaufgaben nahezu gleich oft', () => {
    // 3 Schulungs- und 3 Partnerplätze je Woche auf 30 Schwestern → rund fünf
    // Aufgaben je Schwester im halben Jahr. Zugelassen ist ein Unterschied von
    // einer Aufgabe; früher lag die Spanne bei 0 bis 7.
    expect(werte.at(-1)! - werte[0]).toBeLessThanOrEqual(1)
  })

  it('lässt niemanden länger als zwei Monate warten', () => {
    const wochenMit = new Map<string, number[]>()
    for (const s of sisters) wochenMit.set(displayName(s), [])
    weeks.forEach((week, wi) => {
      for (const meeting of [week.mid, week.we]) {
        for (const name of partNames(meeting)) wochenMit.get(name)?.push(wi)
      }
    })
    for (const [name, wochen] of wochenMit) {
      let luecke = wochen.length ? wochen[0] : WOCHEN
      for (let i = 1; i < wochen.length; i++) luecke = Math.max(luecke, wochen[i] - wochen[i - 1])
      expect(luecke, `längste Pause von ${name}`).toBeLessThanOrEqual(8)
    }
  })

  it('bleibt auch mit Zusätzlicher Klasse ausgewogen (doppelt so viele Plätze)', () => {
    const mitKlasse = strichliste(simulate(persons, WOCHEN, true), sisters)
    const v = [...mitKlasse.values()].sort((a, b) => a - b)
    expect(v[0]).toBeGreaterThan(0)
    // Früher: 16 bis 24 über ein Jahr, weil die Klasse keine Last erzeugte.
    expect(v.at(-1)! - v[0]).toBeLessThanOrEqual(3)
  })

  /**
   * Gleich viele Aufgaben heißt noch nicht gleich behandelt: eine Schwester
   * kann jede Woche Gesprächspartnerin sein und nie das Gespräch führen. Beide
   * Rollen zählen in der Strichliste als eine Aufgabe — ohne eigenes Kriterium
   * bleibt die Aufteilung, wie sie sich zufällig eingependelt hat (gemessen
   * über ein Jahr: von 1 Gespräch geführt / 9 mal Partnerin bis 8 / 2).
   */
  it('verteilt auch die Rolle im Bereich gleich (Gesprächsführer / Partner)', () => {
    const proBereich = bereichsZaehlung(weeks, sisters)
    const fuehrer = verteilung(proBereich, 'schulung')
    const partner = verteilung(proBereich, 'schulungPartner')
    expect(fuehrer.min).toBeGreaterThan(0) // niemand ist nur Partnerin
    expect(partner.min).toBeGreaterThan(0) // und niemand führt nur
    expect(fuehrer.max - fuehrer.min).toBeLessThanOrEqual(1)
    expect(partner.max - partner.min).toBeLessThanOrEqual(1)
  })

  it('verteilt auch über mehrere Bereiche gleich (Bibellesung / Leser)', () => {
    // Dieselben 20 Brüder können beides. Vor dem Bereichs-Ausgleich las einer
    // sechsmal aus der Bibel und ein anderer einmal — bei gleicher Gesamtzahl.
    const proBereich = bereichsZaehlung(weeks, brothers)
    for (const bereich of ['bibellesung', 'leser']) {
      const v = verteilung(proBereich, bereich)
      expect(v.min, `${bereich}: niemand ohne`).toBeGreaterThan(0)
      expect(v.max - v.min, `${bereich}: Spanne`).toBeLessThanOrEqual(2)
    }
  })

  /**
   * Die Reihenfolge der beiden Wartezeiten ist keine Geschmacksfrage. Steht der
   * Bereich vorn, rotiert jeder Bereich für sich — dieselbe Person landet dann
   * in drei aufeinanderfolgenden Wochen in drei verschiedenen Bereichen. In
   * genau dieser Aufstellung waren das 33 Serien-Konflikte („3 Wochen in Folge
   * eingeteilt"), also das, wovor die Planen-Seite selbst warnt.
   */
  it('erzeugt keine Serien, die die Konfliktprüfung anschließend anmahnt', () => {
    let serien = 0
    for (let wi = 0; wi < WOCHEN; wi++) {
      serien += weekConflicts(weeks, wi, persons, DEMO_SERVICES).filter((c) => c.kind === 'streak').length
    }
    expect(serien).toBe(0)
  })
})

describe('Bereichs-Wartezeit als zweiter Tie-Break', () => {
  /**
   * Fokussiert auf das Kriterium selbst: gleiche Last, gleich lange her — aber
   * der eine hat diesen Bereich zuletzt gemacht, der andere einen anderen.
   */
  it('bei gleicher Last und gleicher Wartezeit entscheidet der Bereich', () => {
    const a = mk(['vortrag', 'bibellesung'], { ln: 'Aabe' })
    const b = mk(['vortrag', 'bibellesung'], { ln: 'Bebe' })
    const plan = (vortragZuletzt: Person, lesungZuletzt: Person): string => {
      const weeks: Week[] = Array.from({ length: 12 }, () => wk(emptyMeeting()))
      // Beide in derselben Woche dran → gleiche Last, gleicher Abstand.
      weeks[5].mid = belegt(displayName(vortragZuletzt), 'vortrag')
      weeks[5].we = belegt(displayName(lesungZuletzt), 'bibellesung')
      weeks[10].mid = einPlatz('vortrag')
      return gewaehlt(weeks, 10, [a, b])
    }
    // Wer zuletzt den Vortrag hatte, tritt beim Vortrag zurück — in beide
    // Richtungen geprüft, damit nicht der Hash zufällig richtig liegt.
    expect(plan(a, b)).toBe(displayName(b))
    expect(plan(b, a)).toBe(displayName(a))
  })

  it('die allgemeine Wartezeit bleibt vorrangig vor dem Bereich', () => {
    const a = mk(['vortrag', 'bibellesung'], { ln: 'Kuerzlich' })
    const b = mk(['vortrag', 'bibellesung'], { ln: 'Lange' })
    const weeks: Week[] = Array.from({ length: 12 }, () => wk(emptyMeeting()))
    // Beide Einteilungen liegen außerhalb des Fensters [7..12] → gleiche Last.
    // A war vor 4 Wochen dran (Bibellesung — im Bereich Vortrag also nie),
    // B vor 9 Wochen (Vortrag). Nach dem Bereich müsste A gewinnen; die
    // allgemeine Wartezeit steht davor, also gewinnt B.
    weeks[6].mid = belegt(displayName(a), 'bibellesung')
    weeks[1].mid = belegt(displayName(b), 'vortrag')
    weeks[10].mid = einPlatz('vortrag')
    expect(gewaehlt(weeks, 10, [a, b])).toBe(displayName(b))
  })
})

describe('Verteilung der Hilfsdienste über ein halbes Jahr', () => {
  it('teilt einen reinen Ordner-Pool reihum ein', () => {
    const ORD = serviceQualKey('ord')
    const pool = many(14, [ORD])
    const services: Service[] = [{ key: 'ord', name: 'Ordner', count: 2, groups: false }]
    let weeks: Week[] = Array.from({ length: 26 }, () => wk(emptyMeeting(), emptyMeeting()))
    for (let wi = 0; wi < 26; wi++) {
      weeks = autoAssignMeeting(weeks, wi, 'mid', pool, services).weeks
      weeks = autoAssignMeeting(weeks, wi, 'we', pool, services).weeks
    }
    const counts = new Map<string, number>()
    for (const p of pool) counts.set(displayName(p), 0)
    for (const week of weeks) {
      for (const meeting of [week.mid, week.we]) {
        for (const slot of meeting.helpers.ord ?? []) {
          if (slot.name) counts.set(slot.name, (counts.get(slot.name) ?? 0) + 1)
        }
      }
    }
    const werte = [...counts.values()].sort((a, b) => a - b)
    // 14 Ordner auf 2 Plätze × 2 Zusammenkünfte × 26 Wochen → rund 7 Einsätze
    // je Person. Gemessen 6 bis 9; vor den Korrekturen 6 bis 11.
    expect(werte[0]).toBeGreaterThan(0) // niemand bleibt außen vor
    expect(werte.at(-1)! - werte[0]).toBeLessThanOrEqual(3)
  })
})
