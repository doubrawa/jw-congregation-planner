import { describe, expect, it } from 'vitest'
import { emptyQualifications, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from './helpers'
import { montagNach, tagNach } from './meeting-dates'
import { openingSongNr, TALK_PLACEHOLDER } from './meeting-edit'
import { neueWocheEinordnen } from './neue-woche'
import type { Meeting, MeetingTimes, PartItem, Person, Week } from './types'
import {
  hatAenderungen,
  personFehlt,
  vortragDerWoche,
  vortragInNeueWoche,
  vortragSetzen,
  vortragsplanAnwenden,
  vortragsplanVorschau,
  type PlanVortrag,
  type VorgemerkterVortrag,
  type Vortragsplan,
} from './vortragsplan'

/**
 * **Vortragsplan aus dem Planungsprogramm** (T122).
 *
 * Der Vortragskoordinator plant Monate voraus, die App hat Wochen erst mit
 * ihrem Programm. Geprüft wird, was die Vorschau meldet, was „Übernehmen"
 * schreibt — in angelegte Wochen und als Vormerkung — und dass eine später
 * angelegte Woche ihren vorgemerkten Vortrag bekommt.
 */

/** Die Uhr der Proben: Montag, 7. September 2026. */
const HEUTE = new Date(2026, 8, 7, 9, 0)
const W0 = '2026-09-07'
const W1 = montagNach(W0, 1)
const W2 = montagNach(W0, 2)
const W5 = montagNach(W0, 5)
const W6 = montagNach(W0, 6)
const VORWOCHE = montagNach(W0, -1)
/** Sonntag einer Woche — der Tag, an dem die Datei den Vortrag nennt. */
const sonntag = (woche: string): string => tagNach(woche, 6)

function wochenende(): Meeting {
  return {
    date: '',
    end: '',
    sections: [
      { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [{ iid: 'e', title: 'Lied · Gebet', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzWe' }] }] },
      { label: 'ÖFFENTLICHER VORTRAG', kind: 'vortrag', farbe: 'petrol', items: [{ iid: 'v', title: TALK_PLACEHOLDER, meta: '30 Min.', mins: 30, names: [{ name: '', rolle: ROLE_GUEST_SPEAKER, bereichsKey: 'vortrag' }] }] },
      { label: 'ABSCHLUSS', kind: 'abschluss', farbe: 'neutral', items: [{ iid: 'a', title: 'Schlussworte · Lied · Gebet', names: [] }] },
    ],
    helpers: {},
  }
}

function woche(start: string, extra: Partial<Week> = {}): Week {
  const mid: Meeting = { date: '', end: '', sections: [], helpers: {} }
  return {
    range: start,
    book: '',
    start,
    mid,
    we: wochenende(),
    alt: { en: { range: start, book: '', mid: structuredClone(mid), we: wochenende() } },
    ...extra,
  }
}

function person(id: string, fn: string, ln: string): Person {
  return { id, fn, ln, role: 'aeltester', priv: { ...emptyQualifications(), vortrag: true } }
}

const PERSONEN = [person('p1', 'Peter', 'Beispiel'), person('p2', 'Paul', 'Muster')]

const gast = (woche_: string, redner = 'Max Mustermann', extra: Partial<PlanVortrag> = {}): PlanVortrag => ({
  datum: sonntag(woche_),
  redner,
  versammlung: 'Musterstadt',
  eigener: false,
  thema: 'Demo-Thema 1',
  lied: '151',
  ...extra,
})

function plan(vortraege: PlanVortrag[], von = '', bis = ''): Vortragsplan {
  const tage = [von, bis, ...vortraege.map((v) => v.datum)].filter(Boolean).sort()
  return { von: tage[0] ?? '', bis: tage[tage.length - 1] ?? '', vortraege }
}

/** Dienstag 19 Uhr, Sonntag 10 Uhr. */
const ZEITEN: MeetingTimes = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }

const kontext = (weeks: Week[], vormerkungen: VorgemerkterVortrag[] = [], zeiten = ZEITEN, heute = HEUTE) => ({
  weeks,
  vormerkungen,
  persons: PERSONEN,
  zeiten,
  heute,
})

const talk = (w: Week): PartItem => w.we.sections[1]!.items[0] as PartItem

describe('Vorschau: angelegte Wochen', () => {
  it('leerer Platz → neu; dieselben Werte → unverändert; anderer Redner → geändert', () => {
    const p = plan([gast(W0)])
    expect(vortragsplanVorschau(p, kontext([woche(W0)])).zeilen).toEqual([
      expect.objectContaining({ woche: W0, art: 'neu', angelegt: true, vorher: null }),
    ])

    const gesetzt = vortragSetzen([woche(W0)], 0, vortragsplanVorschau(p, kontext([woche(W0)])).zeilen[0]!.nachher!)
    expect(vortragsplanVorschau(p, kontext(gesetzt)).zeilen[0]?.art).toBe('unveraendert')

    const anders = plan([gast(W0, 'Klaus Platzhalter')])
    const zeile = vortragsplanVorschau(anders, kontext(gesetzt)).zeilen[0]
    expect(zeile?.art).toBe('geaendert')
    expect(zeile?.vorher?.redner).toBe('Max Mustermann')
    expect(zeile?.nachher?.redner).toBe('Klaus Platzhalter')
  })

  it('auch ein anderes Thema oder Lied allein ist eine Änderung', () => {
    const gesetzt = vortragsplanAnwenden({
      vorschau: vortragsplanVorschau(plan([gast(W0)]), kontext([woche(W0)])),
      weeks: [woche(W0)],
      vormerkungen: [],
      neueId: () => 'v-neu',
      heute: HEUTE,
    }).weeks
    for (const extra of [{ thema: 'Demo-Thema 9' }, { lied: '7' }]) {
      const zeile = vortragsplanVorschau(plan([gast(W0, 'Max Mustermann', extra)]), kontext(gesetzt)).zeilen[0]
      expect(zeile?.art).toBe('geaendert')
    }
  })

  it('Sonderwochen bleiben unberührt und werden genannt — nur, wenn die Datei dort etwas wollte', () => {
    const weeks = [
      woche(W0, { anlass: { art: 'co' } }),
      woche(W1, { anlass: { art: 'kongress', von: W1, bis: W1 } }),
      // Wie `setAnlassTermin` es setzt: Anlass und Ausfall. Bis zum 16.10.2026
      // las die Prüfung `memCancel`, das kein Code setzte.
      woche(W2, { anlass: { art: 'mem' }, dev: { we: { cancelled: true } } }),
      woche(montagNach(W0, 3), { dev: { we: { cancelled: true } } }),
      woche(montagNach(W0, 4), { anlass: { art: 'co' } }),
    ]
    const p = plan([gast(W0), gast(W1), gast(W2), gast(montagNach(W0, 3))], W0, sonntag(montagNach(W0, 4)))
    const zeilen = vortragsplanVorschau(p, kontext(weeks)).zeilen
    expect(zeilen.map((z) => [z.art, z.grund])).toEqual([
      ['uebersprungen', 'kreisaufseher'],
      ['uebersprungen', 'kongress'],
      ['uebersprungen', 'gedaechtnismahl'],
      ['uebersprungen', 'ausfall'],
    ])
  })

  it('vorbei ist ein Vortrag mit seinem Tag, nicht mit seiner Woche', () => {
    // Sonntag, 13.9., abends: Der Vortrag von heute lässt sich noch ändern …
    const sonntagAbend = new Date(2026, 8, 13, 20, 0)
    const p = plan([gast(W0)])
    expect(vortragsplanVorschau(p, kontext([woche(W0)], [], ZEITEN, sonntagAbend)).zeilen.map((z) => z.art)).toEqual(['neu'])
    // … der vom Samstag (bei Samstags-Versammlung) nicht mehr: Er ist gehalten.
    const SAMSTAG: MeetingTimes = { ...ZEITEN, we: { wd: 6, time: '16:00' } }
    const v = vortragsplanVorschau(p, kontext([woche(W0)], [], SAMSTAG, sonntagAbend))
    expect(v.zeilen).toEqual([])
    expect(v.vergangen).toBe(1)
  })

  it('vergangene Wochen fasst der Import nicht an — er zählt sie nur', () => {
    const vorwoche = vortragSetzen([woche(VORWOCHE)], 0, {
      redner: 'Alt Redner', versammlung: 'Nord', eigener: false, thema: '', lied: '',
    })
    const p = plan([gast(VORWOCHE, 'Neu Redner'), gast(W0)], VORWOCHE, sonntag(W0))
    const v = vortragsplanVorschau(p, kontext([...vorwoche, woche(W0)]))
    expect(v.vergangen).toBe(1)
    expect(v.zeilen.map((z) => z.woche)).toEqual([W0])
  })
})

describe('Vorschau: Wochen, die es noch nicht gibt', () => {
  const vorgemerkt: VorgemerkterVortrag = {
    id: 'v1', woche: W5, redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, pid: null, thema: 'Demo-Thema 1', lied: '151',
  }

  it('wird vorgemerkt: neu, unverändert oder geändert gegenüber der Vormerkung', () => {
    expect(vortragsplanVorschau(plan([gast(W5)]), kontext([])).zeilen[0]).toMatchObject({ art: 'neu', angelegt: false })
    expect(vortragsplanVorschau(plan([gast(W5)]), kontext([], [vorgemerkt])).zeilen[0]?.art).toBe('unveraendert')
    expect(vortragsplanVorschau(plan([gast(W5, 'Klaus Platzhalter')]), kontext([], [vorgemerkt])).zeilen[0]?.art).toBe('geaendert')
  })

  it('maßgeblich ist der Tag der Zusammenkunft: Eine Datei bis Montag 30.11. lässt den Vortrag vom 6.12. stehen', () => {
    const W_30_11 = '2026-11-30'
    const dezember = vortragSetzen([woche(W_30_11)], 0, {
      redner: 'Dezember Redner', versammlung: 'Nord', eigener: false, thema: '', lied: '',
    })
    const p = plan([gast('2026-11-02')], '2026-11-01', '2026-11-30')
    const zeilen = vortragsplanVorschau(p, kontext([...dezember])).zeilen
    expect(zeilen.map((z) => [z.woche, z.art])).toEqual([['2026-11-02', 'neu']])
  })

  it('… und bei Samstags-Versammlungen zählt der Samstag — vor dem ersten Tag der Datei bleibt alles', () => {
    const SAMSTAG: MeetingTimes = { ...ZEITEN, we: { wd: 6, time: '16:00' } }
    // Woche ab 26.10.: Samstag 31.10. liegt vor der Datei (ab 1.11.). Woche ab 2.11.: Samstag 7.11. liegt darin.
    const weeks = [
      ...vortragSetzen([woche('2026-10-26')], 0, { redner: 'Oktober Redner', versammlung: 'Nord', eigener: false, thema: '', lied: '' }),
      ...vortragSetzen([woche('2026-11-02')], 0, { redner: 'November Redner', versammlung: 'Nord', eigener: false, thema: '', lied: '' }),
    ]
    const zeilen = vortragsplanVorschau(plan([], '2026-11-01', '2026-11-30'), kontext(weeks, [], SAMSTAG)).zeilen
    expect(zeilen.map((z) => [z.woche, z.tag, z.art])).toEqual([['2026-11-02', '2026-11-07', 'entfaellt']])
  })

  it('eine Woche mit fehlerhaftem Eintrag bleibt, wie sie ist — ein Fehler ist keine Absage', () => {
    const p = { ...plan([], W0, sonntag(W6)), fehlerWochen: [W5] }
    const zeilen = vortragsplanVorschau(p, kontext([], [vorgemerkt])).zeilen
    expect(zeilen).toEqual([])
  })

  it('was im Zeitraum der Datei nicht mehr steht, entfällt — außerhalb bleibt es', () => {
    const angelegt = vortragSetzen([woche(W0)], 0, {
      redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: '', lied: '',
    })
    const spaeter: VorgemerkterVortrag = { ...vorgemerkt, id: 'v2', woche: W6 }
    // Zeitraum W0 bis Sonntag W5: W0 und die Vormerkung W5 entfallen, W6 liegt draußen.
    const p = plan([], W0, sonntag(W5))
    const zeilen = vortragsplanVorschau(p, kontext(angelegt, [vorgemerkt, spaeter])).zeilen
    expect(zeilen.map((z) => [z.woche, z.art, z.angelegt])).toEqual([
      [W0, 'entfaellt', true],
      [W5, 'entfaellt', false],
    ])
  })
})

describe('Eigener Redner', () => {
  it('wird über den Namen seiner Person zugeordnet — ohne Groß-/Kleinschreibung', () => {
    const p = plan([gast(W0, 'peter  BEISPIEL', { eigener: true, versammlung: '' })])
    const nachher = vortragsplanVorschau(p, kontext([woche(W0)])).zeilen[0]?.nachher
    expect(nachher).toMatchObject({ redner: 'Peter Beispiel', pid: 'p1', eigener: true, versammlung: '' })
    expect(personFehlt(nachher ?? null)).toBe(false)
  })

  it('ohne passende Person bleibt der Name aus der Datei, und die Vorschau sagt es', () => {
    const p = plan([gast(W0, 'Niemand Bekannt', { eigener: true, versammlung: '' })])
    const nachher = vortragsplanVorschau(p, kontext([woche(W0)])).zeilen[0]?.nachher ?? null
    expect(nachher).toMatchObject({ redner: 'Niemand Bekannt', eigener: true })
    expect(nachher?.pid).toBeUndefined()
    expect(personFehlt(nachher)).toBe(true)
  })
})

describe('Übernehmen', () => {
  it('schreibt Redner, Versammlung, Thema und Anfangslied in die Woche — auch in die Sprachvariante', () => {
    const vorschau = vortragsplanVorschau(plan([gast(W0)]), kontext([woche(W0)]))
    const { weeks, geaendert } = vortragsplanAnwenden({
      vorschau, weeks: [woche(W0)], vormerkungen: [], neueId: () => 'x', heute: HEUTE,
    })
    const slot = talk(weeks[0]!).names[0]
    expect(slot).toMatchObject({ name: 'Max Mustermann', rolle: ROLE_GUEST_SPEAKER, herkunft: 'Musterstadt' })
    expect(slot?.pid).toBeUndefined()
    expect(talk(weeks[0]!).title).toBe('Demo-Thema 1')
    expect((weeks[0]!.alt!.en!.we.sections[1]!.items[0] as PartItem).title).toBe('Demo-Thema 1')
    expect(openingSongNr(weeks[0]!.we)).toBe('151')
    expect(geaendert).toEqual([0])
  })

  it('der eigene Redner wird Person: Rolle „Redner" mit Id, ohne Versammlung', () => {
    const p = plan([gast(W0, 'Peter Beispiel', { eigener: true, versammlung: '' })])
    const { weeks } = vortragsplanAnwenden({
      vorschau: vortragsplanVorschau(p, kontext([woche(W0)])), weeks: [woche(W0)], vormerkungen: [], neueId: () => 'x', heute: HEUTE,
    })
    expect(talk(weeks[0]!).names[0]).toEqual({ name: 'Peter Beispiel', rolle: ROLE_OWN_SPEAKER, pid: 'p1', bereichsKey: 'vortrag' })
  })

  it('ein entfallener Vortrag hinterlässt den Platz wie frisch von jw.org', () => {
    const vorher = vortragSetzen([woche(W0)], 0, {
      redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p1', thema: 'Demo-Thema 1', lied: '27',
    })
    const vorschau = vortragsplanVorschau(plan([], W0, sonntag(W0)), kontext(vorher))
    expect(vorschau.zeilen.map((z) => z.art)).toEqual(['entfaellt'])
    const { weeks } = vortragsplanAnwenden({ vorschau, weeks: vorher, vormerkungen: [], neueId: () => 'x', heute: HEUTE })
    const frisch = woche(W0)
    expect(talk(weeks[0]!).names).toEqual(talk(frisch).names)
    expect(talk(weeks[0]!).title).toBe(TALK_PLACEHOLDER)
    expect(weeks[0]!.we.sections[0]).toEqual(frisch.we.sections[0])
    expect(vortragDerWoche(weeks[0]!)).toEqual({ redner: '', versammlung: '', eigener: false, thema: '', lied: '' })
  })

  it('ohne Änderung dieselbe Referenz — sonst würde geschrieben', () => {
    const weeks = vortragSetzen([woche(W0)], 0, {
      redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: 'Demo-Thema 1', lied: '151',
    })
    const vormerkungen: VorgemerkterVortrag[] = [
      { id: 'v5', woche: W5, redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, pid: null, thema: 'Demo-Thema 1', lied: '151' },
    ]
    const vorschau = vortragsplanVorschau(plan([gast(W0), gast(W5)]), kontext(weeks, vormerkungen))
    expect(hatAenderungen(vorschau)).toBe(false)
    const ergebnis = vortragsplanAnwenden({ vorschau, weeks, vormerkungen, neueId: () => 'x', heute: HEUTE })
    expect(ergebnis.weeks).toBe(weeks)
    expect(ergebnis.vormerkungen).toBe(vormerkungen)
  })

  it('Vormerkungen: neu mit Kennung, geändert mit alter Kennung, entfallen und überholte abgeräumt', () => {
    const alt: VorgemerkterVortrag[] = [
      { id: 'v-alt', woche: W5, redner: 'Alt Redner', versammlung: 'Nord', eigener: false, pid: null, thema: '', lied: '' },
      { id: 'v-weg', woche: W6, redner: 'Weg Redner', versammlung: 'Süd', eigener: false, pid: null, thema: '', lied: '' },
      // überholt: die Woche ist inzwischen angelegt …
      { id: 'v-angelegt', woche: W0, redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, pid: null, thema: '', lied: '' },
      // … und die hier vergangen
      { id: 'v-vorbei', woche: VORWOCHE, redner: 'Alt Redner', versammlung: 'Nord', eigener: false, pid: null, thema: '', lied: '' },
    ]
    const p = plan([gast(W5, 'Neu Redner'), gast(montagNach(W0, 8))], W1, sonntag(montagNach(W0, 8)))
    const vorschau = vortragsplanVorschau(p, kontext([woche(W0)], alt))
    const { vormerkungen } = vortragsplanAnwenden({ vorschau, weeks: [woche(W0)], vormerkungen: alt, neueId: () => 'v-neu', heute: HEUTE })
    expect(vormerkungen.map((m) => [m.id, m.woche, m.redner])).toEqual([
      ['v-alt', W5, 'Neu Redner'],
      ['v-neu', montagNach(W0, 8), 'Max Mustermann'],
    ])
  })
})

describe('Eine später angelegte Woche bekommt ihren vorgemerkten Vortrag', () => {
  const vorgemerkt: VorgemerkterVortrag = {
    id: 'v1', woche: W5, redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p1', thema: 'Demo-Thema 2', lied: '27',
  }

  it('über neueWocheEinordnen — dieselbe Einordnung für Knopf und Skript', () => {
    const { week } = neueWocheEinordnen(woche(W5), {
      zeiten: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } },
      auxClass: false,
      fsRules: [],
      gruppenbesuche: [],
      vortraege: [vorgemerkt],
      persons: PERSONEN,
      absences: [],
    })
    expect(vortragDerWoche(week)).toEqual({ redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p1', thema: 'Demo-Thema 2', lied: '27' })
  })

  it('ist die Person seitdem gelöscht, sucht sie der Name neu — sonst bleibt nur der Name', () => {
    const ohneId = vortragInNeueWoche(woche(W5), [{ ...vorgemerkt, pid: 'gelöscht' }], PERSONEN)
    expect(talk(ohneId).names[0]?.pid).toBe('p1')
    const niemand = vortragInNeueWoche(woche(W5), [{ ...vorgemerkt, pid: 'gelöscht' }], [])
    expect(talk(niemand).names[0]).toMatchObject({ name: 'Peter Beispiel', rolle: ROLE_OWN_SPEAKER })
    expect(talk(niemand).names[0]?.pid).toBeUndefined()
  })

  it('fällt das Gedächtnismahl aufs Wochenende, bleibt der Platz leer; ohne Vormerkung dieselbe Woche', () => {
    // Wie `setAnlassTermin` es setzt: Anlass und Ausfall am Wochenende.
    const mahl = woche(W5, { anlass: { art: 'mem' }, dev: { we: { cancelled: true } } })
    expect(vortragDerWoche(vortragInNeueWoche(mahl, [vorgemerkt], PERSONEN))?.redner).toBe('')
    const leer = woche(W6)
    expect(vortragInNeueWoche(leer, [vorgemerkt], PERSONEN)).toBe(leer)
  })
})

/*
 * **Eine leere Datei ist keine Absage.** Ohne Vorträge und ohne Zeitraum sagt
 * die Datei über keine Woche etwas — was in der App steht und was vorgemerkt
 * ist, bleibt. Ein Zeitraum aus dem Nichts (etwa „alles") ließe jeden Vortrag
 * entfallen.
 */
describe('Eine leere Datei', () => {
  it('lässt angelegte Wochen und Vormerkungen stehen — nichts zu tun, dieselben Listen', () => {
    const weeks = vortragSetzen([woche(W0)], 0, {
      redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: 'Demo-Thema 1', lied: '151',
    })
    const vormerkungen: VorgemerkterVortrag[] = [
      { id: 'v5', woche: W5, redner: 'Klaus Platzhalter', versammlung: 'Nord', eigener: false, pid: null, thema: '', lied: '' },
    ]
    const leer: Vortragsplan = { von: '', bis: '', vortraege: [] }
    const vorschau = vortragsplanVorschau(leer, kontext(weeks, vormerkungen))
    expect(vorschau).toEqual({ zeilen: [], vergangen: 0 })
    expect(hatAenderungen(vorschau)).toBe(false)
    const ergebnis = vortragsplanAnwenden({ vorschau, weeks, vormerkungen, neueId: () => 'x', heute: HEUTE })
    expect(ergebnis.weeks).toBe(weeks)
    expect(ergebnis.vormerkungen).toBe(vormerkungen)
  })
})

describe('Vergangen zählt nur, was die Datei wollte', () => {
  it('eine vergangene Woche im Zeitraum ohne Vortrag in der Datei ist kein vergangener Vortrag', () => {
    // Gegenstück zu „vergangene Wochen fasst der Import nicht an": Dort nennt
    // die Datei die Vorwoche und sie zählt. Hier steht die Vorwoche nur in der
    // App — die Vorschau sagte sonst „1 Vortrag liegt zurück", den es in der
    // Datei gar nicht gibt.
    const vorwoche = vortragSetzen([woche(VORWOCHE)], 0, {
      redner: 'Alt Redner', versammlung: 'Nord', eigener: false, thema: '', lied: '',
    })
    const v = vortragsplanVorschau(plan([gast(W0)], VORWOCHE, sonntag(W0)), kontext([...vorwoche, woche(W0)]))
    expect(v.vergangen).toBe(0)
    expect(v.zeilen.map((z) => [z.woche, z.art])).toEqual([[W0, 'neu']])
  })
})

describe('Eine Vormerkung mit eigenem Redner', () => {
  it('derselbe Redner aus der Datei ist unverändert — die Person der Vormerkung zählt mit', () => {
    // Die Datei nennt nur den Namen; die Vorschau findet die Person (p1). Die
    // Vormerkung trägt sie schon — verglichen ohne sie, stünde jede Woche mit
    // eigenem Redner bei jedem Import als „geändert" da.
    const vorgemerkt: VorgemerkterVortrag = {
      id: 'v1', woche: W5, redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p1', thema: 'Demo-Thema 2', lied: '27',
    }
    const datei = plan([gast(W5, 'Peter Beispiel', { eigener: true, versammlung: '', thema: 'Demo-Thema 2', lied: '27' })])
    const vorschau = vortragsplanVorschau(datei, kontext([], [vorgemerkt]))
    expect(vorschau.zeilen.map((z) => z.art)).toEqual(['unveraendert'])
    expect(hatAenderungen(vorschau)).toBe(false)
  })
})

/*
 * **Jede Änderung am Redner erreicht den Platz.** `vortragSetzen` schreibt den
 * Platz nur, wenn sich an ihm etwas ändert — sonst bekäme die Woche bei jedem
 * Import einen neuen Klon und ginge an die Datenbank. Geprüft wird je Feld,
 * das allein sich ändert: Wer eines davon beim Vergleich vergisst, lässt den
 * alten Wert im Programm stehen.
 */
describe('vortragSetzen: jedes Feld des Redners allein ist eine Änderung', () => {
  const slot = (w: Week[]) => talk(w[0]!).names[0]

  it('derselbe Gastredner aus einer anderen Versammlung — die Versammlung wird neu gesetzt', () => {
    const vorher = vortragSetzen([woche(W0)], 0, { redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, thema: '', lied: '' })
    const nachher = vortragSetzen(vorher, 0, { redner: 'Max Mustermann', versammlung: 'Nordstadt', eigener: false, thema: '', lied: '' })
    expect(vortragDerWoche(nachher[0]!)?.versammlung).toBe('Nordstadt')
  })

  it('derselbe Name, jetzt als eigener Redner — Rolle „Redner", auch ohne gefundene Person', () => {
    const vorher = vortragSetzen([woche(W0)], 0, { redner: 'Niemand Bekannt', versammlung: '', eigener: false, thema: '', lied: '' })
    expect(slot(vorher)?.rolle).toBe(ROLE_GUEST_SPEAKER) // Positivkontrolle
    const nachher = vortragSetzen(vorher, 0, { redner: 'Niemand Bekannt', versammlung: '', eigener: true, thema: '', lied: '' })
    expect(slot(nachher)?.rolle).toBe(ROLE_OWN_SPEAKER)
    expect(vortragDerWoche(nachher[0]!)?.eigener).toBe(true)
  })

  it('derselbe eigene Redner mit neuer Person (gelöscht und neu angelegt) — die neue Id gilt', () => {
    const vorher = vortragSetzen([woche(W0)], 0, { redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p-alt', thema: '', lied: '' })
    const nachher = vortragSetzen(vorher, 0, { redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p1', thema: '', lied: '' })
    expect(slot(nachher)?.pid).toBe('p1')
  })

  it('Gegenprobe: alles gleich — dieselbe Referenz, nichts zu schreiben', () => {
    const v = { redner: 'Peter Beispiel', versammlung: '', eigener: true, pid: 'p1', thema: 'Demo-Thema 1', lied: '27' }
    const vorher = vortragSetzen([woche(W0)], 0, v)
    expect(vortragSetzen(vorher, 0, v)).toBe(vorher)
  })
})
