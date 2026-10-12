/**
 * Der Saal auf dem Start (T121): Besetzung zählen und auf 18 Plätze verteilen.
 *
 * Gefragt wird, was der Leser im Bild sieht — nicht, wie gerechnet wird: Eine
 * Absage darf nie verschwinden, Offenes sitzt hinten, der eigene Platz steht
 * immer an derselben Stelle.
 */
import { describe, expect, it } from 'vitest'
import { platzKey, allePlaetze } from './plaetze'
import { besetztVon, besetzung, saalLagen, SAAL_PLAETZE, type Besetzung, type SaalLage } from './saal'
import type { ConfirmationMap, Meeting, Service } from './types'

const WOCHE = '2026-09-07'
const SERVICES: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Eine Zusammenkunft mit `n` Programmplätzen, die ersten `besetzt` davon belegt. */
function zusammenkunft(n: number, besetzt: number, mikrofone: string[] = []): Meeting {
  return {
    date: '', end: '',
    sections: [
      {
        label: 'UNS IM DIENST VERBESSERN',
        farbe: 'gold',
        items: Array.from({ length: n }, (_, i) => ({
          iid: `i${i}`,
          title: `Punkt ${i}`,
          meta: '',
          names: [{ name: i < besetzt ? `Person ${i}` : '' }],
        })),
      },
    ],
    helpers: { mik: mikrofone.map((name) => ({ name })) },
  }
}

/** Die Schlüssel aller besetzten Plätze, in Durchlauf-Reihenfolge. */
function schluessel(m: Meeting): string[] {
  return [...allePlaetze(m, SERVICES)].filter((p) => p.slot?.name).map((p) => platzKey(p, WOCHE, 'mid'))
}

const zaehle = (lagen: readonly SaalLage[], lage: SaalLage): number => lagen.filter((l) => l === lage).length
const leer: Besetzung = { voll: 0, wartet: 0, problem: 0, offen: 0, du: false }

describe('besetzung: jeder Platz einmal, nach seiner Zusage', () => {
  it('zählt zugesagt, wartend, abgesagt und offen — Hilfsdienste eingeschlossen', () => {
    const m = zusammenkunft(5, 4, ['Mik 1'])
    const [a, b, c] = schluessel(m)
    const confirmations: ConfirmationMap = { [a!]: 'bestätigt', [b!]: 'verhindert', [c!]: 'bestätigt' }
    // 4 Programmplätze belegt (2 zugesagt, 1 abgesagt, 1 wartet) + Mikrofon 1
    // (wartet) + Mikrofon 2 und der fünfte Punkt offen.
    expect(besetzung(m, SERVICES, confirmations, WOCHE, 'mid', null)).toEqual({
      voll: 2, wartet: 2, problem: 1, offen: 2, du: false,
    })
  })

  it('der eigene Platz zählt gesondert, gleich wie seine Zusage steht', () => {
    const m = zusammenkunft(3, 3)
    const [, mein] = schluessel(m)
    const b = besetzung(m, SERVICES, { [mein!]: 'verhindert' }, WOCHE, 'mid', mein!)
    expect(b.du).toBe(true)
    expect(b.problem).toBe(0)
    expect(besetztVon(b)).toEqual({ besetzt: 3, gesamt: 5 })
  })
})

describe('saalLagen: 18 Plätze, die nichts verschweigen', () => {
  it('immer genau 18 Plätze', () => {
    for (const b of [leer, { ...leer, voll: 30 }, { ...leer, offen: 1, du: true }, { voll: 7, wartet: 3, problem: 2, offen: 9, du: true }]) {
      expect(saalLagen(b)).toHaveLength(SAAL_PLAETZE)
    }
  })

  it('eine einzige Absage unter vielen Plätzen bekommt trotzdem einen Platz', () => {
    const lagen = saalLagen({ voll: 40, wartet: 0, problem: 1, offen: 0, du: false })
    expect(zaehle(lagen, 'problem')).toBe(1)
    expect(zaehle(lagen, 'voll')).toBe(17)
  })

  it('jede vorhandene Lage ist zu sehen', () => {
    const lagen = saalLagen({ voll: 50, wartet: 1, problem: 1, offen: 1, du: true })
    for (const lage of ['voll', 'wartet', 'problem', 'offen', 'du'] as const) expect(zaehle(lagen, lage)).toBeGreaterThan(0)
  })

  it('verteilt nach Anteil: die Hälfte offen heißt die halbe Reihe gestrichelt', () => {
    const lagen = saalLagen({ voll: 9, wartet: 0, problem: 0, offen: 9, du: false })
    expect(zaehle(lagen, 'voll')).toBe(9)
    expect(zaehle(lagen, 'offen')).toBe(9)
  })

  it('offen sitzt hinten, wie ein Saal sich von vorn füllt', () => {
    const lagen = saalLagen({ voll: 10, wartet: 2, problem: 2, offen: 4, du: false })
    const ersterOffener = lagen.indexOf('offen')
    expect(lagen.slice(ersterOffener).every((l) => l === 'offen')).toBe(true)
  })

  it('Wartende und Absagen stehen verteilt, nicht als Block', () => {
    const lagen = saalLagen({ voll: 10, wartet: 2, problem: 2, offen: 3, du: true })
    const stellen = (lage: SaalLage): number[] => lagen.flatMap((l, i) => (l === lage ? [i] : []))
    const [w1, w2] = stellen('wartet')
    const [p1, p2] = stellen('problem')
    expect(w2! - w1!).toBeGreaterThan(3)
    expect(p2! - p1!).toBeGreaterThan(3)
  })

  it('der eigene Platz sitzt immer an derselben Stelle', () => {
    expect(saalLagen({ voll: 3, wartet: 0, problem: 0, offen: 20, du: true })[6]).toBe('du')
    expect(saalLagen({ voll: 30, wartet: 5, problem: 1, offen: 0, du: true })[6]).toBe('du')
  })

  it('ohne gezählte Plätze bleibt der Saal offen — nur der eigene Platz ist besetzt', () => {
    const lagen = saalLagen({ ...leer, du: true })
    expect(zaehle(lagen, 'du')).toBe(1)
    expect(zaehle(lagen, 'offen')).toBe(17)
  })
})
