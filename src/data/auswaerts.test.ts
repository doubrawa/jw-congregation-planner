import { describe, expect, it } from 'vitest'
import {
  deriveMyVaTasks,
  vaEntzogeneZusagen,
  vaKonflikte,
  vaNachDatum,
  vaOffeneMeldungen,
  vaReiterSichtbar,
  vaStand,
  vaTaskKey,
  vaTerminText,
  vaVerwaisteZusagen,
  vaVorbei,
  vaZuletztGesendet,
} from './auswaerts'
import { emptyQualifications } from './helpers'
import { sentKey } from './planning'
import type { Absence, Meeting, Person, VortragAuswaerts, Week } from './types'

/**
 * **Redner auswärts** (T120, Phase 4): ein eigener Redner hält den öffentlichen
 * Vortrag in einer anderen Versammlung. Geprüft wird der Schlüssel, die
 * Aufgabe des Redners, die Doppelbelegung von der Seite des Vortrags, was ein
 * Entzug meldet, was „Plan senden" zählt — und wann der Reiter dasteht.
 */

const HEUTE = new Date(2026, 8, 7, 9, 0) // Montag, 7. September 2026
/** Zusammenkünfte Di 19:00 und So 10:00. */
const ZEITEN = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }

function person(id: string, fn: string): Person {
  return { id, fn, ln: 'Test', role: 'aeltester', tel: '', mail: '', priv: { ...emptyQualifications(), vortrag: true } }
}
const HELMUT = person('p-h', 'Helmut')
const JONAS = person('p-j', 'Jonas')

const vortrag = (id: string, datum: string, pid: string | null, extra: Partial<VortragAuswaerts> = {}): VortragAuswaerts => ({
  id,
  datum,
  zeit: '10:00',
  versammlung: 'Beispielheim',
  nummer: 12,
  pid,
  ...extra,
})

/** Eine Zusammenkunft, in der `wer` den Vorsitz hat. */
function mitVorsitz(wer: Person): Meeting {
  return {
    date: '',
    end: '',
    helpers: {},
    sections: [
      {
        label: 'ERÖFFNUNG',
        farbe: 'neutral',
        items: [{ iid: 'i1', title: 'Lied 1 · Gebet', meta: '', names: [{ name: `${wer.fn} ${wer.ln}`, rolle: 'Vorsitz', pid: wer.id }] }],
      },
    ],
  }
}
const leer = (): Meeting => ({ date: '', end: '', helpers: {}, sections: [] })
/** Woche ab Montag, 7.9.2026: Helmut hat am Sonntag, 13.9., den Vorsitz. */
const WOCHE: Week = { range: '', book: '', start: '2026-09-07', mid: leer(), we: mitVorsitz(HELMUT) }

describe('Schlüssel und Termin', () => {
  it('der Schlüssel trägt den Montag der Woche, nicht den Tag', () => {
    expect(vaTaskKey(vortrag('v1', '2026-09-13', 'p-h'))).toBe('va|2026-09-07|v1')
  })

  it('der Termin steht kanonisch deutsch — mit der Versammlung in der Form, die der Übersetzer kennt', () => {
    expect(vaTerminText(vortrag('v1', '2026-09-13', 'p-h'))).toBe('Sonntag, 13. September · 10:00 · Vers. Beispielheim')
    expect(vaTerminText(vortrag('v1', '2026-09-13', 'p-h', { versammlung: '' }))).toBe('Sonntag, 13. September · 10:00')
  })

  it('vorbei ist ein Vortrag erst am Tag danach', () => {
    expect(vaVorbei(vortrag('v1', '2026-09-07', 'p-h'), HEUTE)).toBe(false)
    expect(vaVorbei(vortrag('v1', '2026-09-06', 'p-h'), HEUTE)).toBe(true)
  })

  it('der Zustand hält die Vorträge nach Tag und Uhrzeit', () => {
    const sortiert = vaNachDatum([
      vortrag('b', '2026-10-11', null, { zeit: '14:00' }),
      vortrag('c', '2026-10-11', null, { zeit: '10:00' }),
      vortrag('a', '2026-09-13', null),
    ])
    expect(sortiert.map((v) => v.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('Der Vortrag ist eine Aufgabe des Redners', () => {
  const vortraege = [vortrag('v1', '2026-09-13', 'p-h'), vortrag('v2', '2026-10-11', 'p-j')]

  it('nur die eigenen, mit der Rolle „Redner" und dem Termin', () => {
    const tasks = deriveMyVaTasks(vortraege, 'p-h', {})
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      id: 'va|2026-09-07|v1',
      rolle: 'Redner',
      date: 'Sonntag, 13. September · 10:00 · Vers. Beispielheim',
      status: 'offen',
    })
  })

  it('die Zusage steht unter dem Schlüssel', () => {
    expect(deriveMyVaTasks(vortraege, 'p-h', { 'va|2026-09-07|v1': 'bestätigt' })[0]?.status).toBe('bestätigt')
  })

  it('ohne eigene Person keine Aufgabe', () => {
    expect(deriveMyVaTasks(vortraege, undefined, {})).toEqual([])
  })
})

describe('Doppelbelegung von der Seite des Vortrags', () => {
  const args = { weeks: [WOCHE], persons: [HELMUT, JONAS], absences: [] as Absence[], services: [], zeiten: ZEITEN, heute: HEUTE }

  it('wer am selben Tag in der eigenen Zusammenkunft eingeteilt ist — mit dem, was er dort hat', () => {
    const [k, ...rest] = vaKonflikte({ ...args, vortraege: [vortrag('v1', '2026-09-13', 'p-h')] })
    expect(rest).toEqual([])
    expect(k).toMatchObject({ name: 'Helmut Test', art: 'zusammenkunft' })
    expect(k?.aufgaben).toEqual([{ text: 'Vorsitz', lang: 'u' }])
  })

  it('wer an dem Tag abwesend ist', () => {
    const absences: Absence[] = [{ id: 'a', personId: 'p-j', userId: null, from: '2026-10-10', to: '2026-10-12', reason: '' }]
    const konflikte = vaKonflikte({ ...args, absences, vortraege: [vortrag('v2', '2026-10-11', 'p-j')] })
    expect(konflikte.map((k) => `${k.name} ${k.art}`)).toEqual(['Jonas Test abwesend'])
  })

  it('kein Konflikt an einem anderen Tag, ohne Redner oder wenn der Vortrag vorbei ist', () => {
    expect(vaKonflikte({ ...args, vortraege: [vortrag('v1', '2026-09-12', 'p-h')] })).toEqual([])
    expect(vaKonflikte({ ...args, vortraege: [vortrag('v1', '2026-09-13', null)] })).toEqual([])
    expect(vaKonflikte({ ...args, heute: new Date(2026, 8, 14, 9), vortraege: [vortrag('v1', '2026-09-13', 'p-h')] })).toEqual([])
  })

  it('eine Zusammenkunft, die entfällt, hat keine Zuteilung, die stört (T30)', () => {
    const entfaellt: Week = { ...WOCHE, dev: { we: { cancelled: true } } }
    expect(vaKonflikte({ ...args, weeks: [entfaellt], vortraege: [vortrag('v1', '2026-09-13', 'p-h')] })).toEqual([])
  })
})

describe('Was ein Planer dem Redner nimmt', () => {
  const vorher = [vortrag('v1', '2026-09-13', 'p-h'), vortrag('v2', '2026-10-11', 'p-j')]
  const bestaetigt = { 'va|2026-09-07|v1': 'bestätigt', 'va|2026-10-05|v2': 'bestätigt' } as const

  it('ein bestätigter Vortrag, umbesetzt oder gestrichen, meldet sich beim alten Redner', () => {
    const nachher = [{ ...vorher[0]!, pid: 'p-j' }]
    const entzug = vaEntzogeneZusagen(vorher, nachher, [HELMUT, JONAS], bestaetigt, HEUTE)
    expect(entzug.map((e) => `${e.name} · ${e.label} · ${e.datum}`)).toEqual([
      'Helmut Test · Redner · Sonntag, 13. September · 10:00 · Vers. Beispielheim',
      'Jonas Test · Redner · Sonntag, 11. Oktober · 10:00 · Vers. Beispielheim',
    ])
  })

  it('ein unbestätigter oder vergangener nicht', () => {
    const nachher: VortragAuswaerts[] = []
    expect(vaEntzogeneZusagen(vorher, nachher, [HELMUT, JONAS], {}, HEUTE)).toEqual([])
    const spaeter = new Date(2026, 9, 20, 9)
    expect(vaEntzogeneZusagen(vorher, nachher, [HELMUT, JONAS], bestaetigt, spaeter)).toEqual([])
  })

  it('die Zusage verfällt mit dem Redner — der neue erbt sie nicht', () => {
    const nachher = [{ ...vorher[0]!, pid: 'p-j' }, vorher[1]!]
    expect(vaVerwaisteZusagen(vorher, nachher)).toEqual(['va|2026-09-07|v1'])
    expect(vaVerwaisteZusagen(vorher, [vorher[1]!])).toEqual(['va|2026-09-07|v1'])
    expect(vaVerwaisteZusagen(vorher, vorher)).toEqual([])
  })
})

describe('„Plan senden"', () => {
  const vortraege = [
    vortrag('v1', '2026-09-13', 'p-h'),
    vortrag('v2', '2026-10-11', 'p-j'),
    vortrag('v3', '2026-11-08', null),
    vortrag('v4', '2026-09-06', 'p-j'), // vorbei
  ]

  it('nennt jeden Redner mit unbestätigtem, kommendem Vortrag, den das Tagebuch nicht kennt', () => {
    const gesendet = { [sentKey('va|2026-10-05|v2', 'Jonas Test')]: '2026-09-01T10:00:00Z' }
    expect(vaOffeneMeldungen(vortraege, [HELMUT, JONAS], {}, {}, HEUTE).map((m) => m.key)).toEqual([
      'va|2026-09-07|v1',
      'va|2026-10-05|v2',
    ])
    expect(vaOffeneMeldungen(vortraege, [HELMUT, JONAS], {}, gesendet, HEUTE).map((m) => m.key)).toEqual(['va|2026-09-07|v1'])
    expect(vaOffeneMeldungen(vortraege, [HELMUT, JONAS], { 'va|2026-09-07|v1': 'bestätigt' }, gesendet, HEUTE)).toEqual([])
  })

  it('„zuletzt gesendet" kennt nur die eigenen Schlüssel', () => {
    expect(
      vaZuletztGesendet({
        'va|2026-09-07|v1 Helmut Test': '2026-09-01T10:00:00Z',
        'oz|2026-09-07|e1 Anna Test': '2026-09-05T10:00:00Z',
      }),
    ).toBe('2026-09-01T10:00:00Z')
  })
})

describe('Was die Planungs-Karte nennt', () => {
  it('Konflikte, Vorträge ohne Redner und den Versand — nur Kommendes', () => {
    const stand = vaStand({
      vortraege: [vortrag('v1', '2026-09-13', 'p-h'), vortrag('v3', '2026-11-08', null), vortrag('v4', '2026-08-30', null)],
      weeks: [WOCHE],
      persons: [HELMUT, JONAS],
      absences: [],
      services: [],
      zeiten: ZEITEN,
      confirmations: {},
      sentLog: {},
      sendenMoeglich: true,
      heute: HEUTE,
    })
    expect(stand).toEqual({ konflikte: 1, offen: 1, nichtGesendet: 1 })
  })

  it('offline nennt sie keinen Versand', () => {
    const stand = vaStand({
      vortraege: [vortrag('v2', '2026-10-11', 'p-j')],
      weeks: [],
      persons: [JONAS],
      absences: [],
      services: [],
      zeiten: ZEITEN,
      confirmations: {},
      sentLog: {},
      sendenMoeglich: false,
      heute: HEUTE,
    })
    expect(stand.nichtGesendet).toBe(0)
  })
})

describe('Der Reiter „Redner auswärts"', () => {
  const kommend = [vortrag('v1', '2026-09-13', 'p-h')]
  const vergangen = [vortrag('v4', '2026-08-30', 'p-h')]

  it('beim Planen für Planer immer — dort wird der erste Vortrag eingetragen', () => {
    expect(vaReiterSichtbar({ planen: true, planner: true, vortraege: [], heute: HEUTE })).toBe(true)
    expect(vaReiterSichtbar({ planen: true, planner: false, vortraege: kommend, heute: HEUTE })).toBe(false)
  })

  it('beim Ansehen, sobald ein Vortrag kommt — ein leerer Reiter nützt niemandem', () => {
    expect(vaReiterSichtbar({ planen: false, planner: false, vortraege: kommend, heute: HEUTE })).toBe(true)
    expect(vaReiterSichtbar({ planen: false, planner: true, vortraege: vergangen, heute: HEUTE })).toBe(false)
  })
})
