import { describe, expect, it } from 'vitest'
import { allePlaetze, platzKey } from '../data/plaetze'
import type { FsInstance, MeetingTimes, Service, Week } from '../data/types'
import type { PlanStand } from '../data/weitere-plaene'
import { dict } from '../i18n/ui'
import { spurDerWoche, spurDesPlans, wochenZahlen, zahlenDerWoche, type WochenZahlen } from './plan-spur'

/**
 * **Die Spur beim Planen** (T121, `GPlanen`): Zuteilen, Senden, Zusagen —
 * welcher Schritt gerade dran ist und welche Zahl darunter steht.
 *
 * Die Zahlen kommen aus den Funktionen, die sie auch sonst liefern (Saal,
 * „Plan senden"). Geprüft wird hier, dass `wochenZahlen` jeweils das Richtige
 * fragt — die gezeigte Zusammenkunft oder die ganze Woche — und dass die Lagen
 * der Reihenfolge der Arbeit folgen: erst besetzen, dann senden, dann kommen
 * die Zusagen.
 */

const t = dict('de')
const WOCHE = '2026-09-07'
const ZEITEN: MeetingTimes = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const SERVICES: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]
/** Montag der Woche, 9 Uhr: Beide Zusammenkünfte und der Treffpunkt liegen voraus. */
const HEUTE = new Date(2026, 8, 7, 9, 0)

/**
 * Unter der Woche zwei Punkte (einer besetzt) und zwei Mikrofone (eins
 * besetzt), am Wochenende ein Gastredner — er hat nichts zu bestätigen.
 */
function woche(): Week {
  return {
    range: '7.–13. September', book: '', start: WOCHE,
    mid: {
      date: '', end: '20:45',
      sections: [{
        label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
        items: [
          { iid: 'i1', title: 'Punkt 1', meta: '', names: [{ name: 'Anna Alt' }] },
          { iid: 'i2', title: 'Punkt 2', meta: '', names: [{ name: '' }] },
        ],
      }],
      helpers: { mik: [{ name: 'Bert Bau' }] },
    },
    we: {
      date: '', end: '11:45',
      sections: [{
        label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol',
        items: [{ iid: 'v1', title: 'Ein Thema', names: [{ name: 'Gast Redner', rolle: 'Gastredner' }] }],
      }],
      helpers: {},
    },
  }
}

const TREFFPUNKT: FsInstance = { id: 'f1', ruleId: 'r1', grp: null, wd: 6, time: '09:30', place: 'Saal', leader: 'Cora Clas' }

/** Der Schlüssel des Platzes, auf dem `name` steht. */
function keyVon(w: Week, name: string): string {
  const platz = [...allePlaetze(w.mid, SERVICES)].find((p) => p.slot?.name === name)!
  return platzKey(platz, WOCHE, 'mid')
}

describe('wochenZahlen: die Zusammenkunft für Besetzung und Zusagen, die Woche fürs Senden', () => {
  it('unter der Woche: 2 von 4 besetzt, Anna hat zugesagt, Bert und der Treffpunkt sind neu', () => {
    const w = woche()
    const zahlen = wochenZahlen(
      w,
      [TREFFPUNKT],
      'mid',
      { services: SERVICES, confirmations: { [keyVon(w, 'Anna Alt')]: 'bestätigt' }, persoenlich: {}, sentLog: {}, zeiten: ZEITEN },
      HEUTE,
    )
    expect(zahlen).toEqual({ besetzt: 2, gesamt: 4, neu: 2, bestaetigt: 1, zuBestaetigen: 2 })
  })

  it('am Wochenende zählt „neu" dieselbe Woche — der Gastredner aber nirgends mit', () => {
    const w = woche()
    const zahlen = wochenZahlen(w, [TREFFPUNKT], 'we', { services: SERVICES, confirmations: {}, persoenlich: {}, sentLog: {}, zeiten: ZEITEN }, HEUTE)
    // Besetzt ist nur der Vortrag; dazu zwei leere Mikrofone. Neu sind Anna,
    // Bert und der Treffpunkt — gesendet wird die ganze Woche.
    expect(zahlen).toEqual({ besetzt: 1, gesamt: 3, neu: 3, bestaetigt: 0, zuBestaetigen: 0 })
  })
})

/** **Die Zusagen der Woche** (Phase 5g) zählen beide Zusammenkünfte zusammen — wie ihre Liste. */
describe('zahlenDerWoche: beide Zusammenkünfte, ohne was vorbei ist', () => {
  const q = (w: Week) => ({ services: SERVICES, confirmations: { [keyVon(w, 'Anna Alt')]: 'bestätigt' as const }, persoenlich: {}, sentLog: {}, zeiten: ZEITEN })

  it('Dienstag und Sonntag zusammen; „neu" ist dieselbe Zahl wie am Knopf', () => {
    const w = woche()
    expect(zahlenDerWoche(w, [TREFFPUNKT], q(w), HEUTE)).toEqual({ besetzt: 3, gesamt: 7, neu: 2, bestaetigt: 1, zuBestaetigen: 2 })
  })

  it('am Mittwoch ist der Dienstag vorbei — es bleibt der Sonntag', () => {
    const w = woche()
    const mittwoch = new Date(2026, 8, 9, 12, 0)
    expect(zahlenDerWoche(w, [TREFFPUNKT], q(w), mittwoch)).toMatchObject({ besetzt: 1, gesamt: 3, bestaetigt: 0, zuBestaetigen: 0 })
  })
})

describe('Wege in der Spur (Entwurf: `ziele`)', () => {
  const zahlen: WochenZahlen = { besetzt: 4, gesamt: 4, neu: 0, bestaetigt: 1, zuBestaetigen: 4 }

  it('ohne Ziele ist kein Schritt ein Weg', () => {
    expect(spurDerWoche(zahlen, t).some((s) => s.ziel)).toBe(false)
  })

  it('„Zusagen" und „Zuteilen" werden Wege, „Senden" nicht', () => {
    const zuDenZusagen = (): void => {}
    const zumPlan = (): void => {}
    const [zuteilen, senden, zusagen] = spurDerWoche(zahlen, t, { zuteilen: zumPlan, zusagen: zuDenZusagen })
    expect(zuteilen!.ziel).toBe(zumPlan)
    expect(senden!.ziel).toBeUndefined()
    expect(zusagen!.ziel).toBe(zuDenZusagen)
  })
})

describe('spurDerWoche: der laufende Schritt ist der erste, der nicht fertig ist', () => {
  const z = (over: Partial<WochenZahlen>): WochenZahlen => ({
    besetzt: 0, gesamt: 4, neu: 0, bestaetigt: 0, zuBestaetigen: 0, ...over,
  })
  const lagen = (zahlen: WochenZahlen) => spurDerWoche(zahlen, t).map((s) => s.lage)

  it.each([
    ['nichts besetzt: Zuteilen ist dran, der Rest wartet', z({}), ['jetzt', 'leer', 'leer']],
    ['halb besetzt, noch nicht gesendet', z({ besetzt: 2, neu: 2, zuBestaetigen: 2 }), ['jetzt', 'teil', 'leer']],
    ['alles besetzt, noch nicht gesendet: Senden ist dran', z({ besetzt: 4, neu: 4, zuBestaetigen: 4 }), ['voll', 'jetzt', 'leer']],
    ['gesendet: jetzt die Zusagen', z({ besetzt: 4, zuBestaetigen: 4, bestaetigt: 1 }), ['voll', 'voll', 'jetzt']],
    ['alle zugesagt', z({ besetzt: 4, zuBestaetigen: 4, bestaetigt: 4 }), ['voll', 'voll', 'voll']],
    ['halb besetzt, das Besetzte gesendet und zum Teil zugesagt', z({ besetzt: 2, zuBestaetigen: 2, bestaetigt: 1 }), ['jetzt', 'voll', 'teil']],
    // Die gezeigte Zusammenkunft ist leer, die andere aber nicht: Was noch
    // hinaus muss, steht trotzdem an — gesendet wird die ganze Woche.
    ['leer, aber die Woche hat Neues', z({ neu: 3 }), ['jetzt', 'teil', 'leer']],
  ] as const)('%s', (_fall, zahlen, erwartet) => {
    expect(lagen(zahlen)).toEqual(erwartet)
  })

  it('die Zahlen stehen als „a/b" und „Neu: n" — so stimmt die Form in jeder Sprache', () => {
    const [zuteilen, senden, zusagen] = spurDerWoche(z({ besetzt: 3, neu: 2, zuBestaetigen: 3, bestaetigt: 1 }), t)
    expect(zuteilen).toEqual({ name: t.spurZuteilen, wert: '3/4', lage: 'jetzt' })
    expect(senden!.wert).toBe(t.neuN.replace('{n}', '2'))
    expect(zusagen!.wert).toBe('1/3')
  })

  it('ohne Neues und ohne etwas zu bestätigen steht keine Zahl da', () => {
    const [, senden, zusagen] = spurDerWoche(z({ besetzt: 4 }), t)
    expect(senden!.wert).toBeUndefined()
    expect(zusagen!.wert).toBeUndefined()
  })
})

/** **Die Spur eines Weiteren Plans** (T121, `GPlaenePlanen`): Entwurf, veröffentlicht, abgeschlossen. */
describe('Wo ein Weiterer Plan steht', () => {
  const lagen = (entwurf: boolean, stand: PlanStand) => spurDesPlans({ entwurf }, stand, t).map((s) => s.lage)

  it('der Entwurf steht am Anfang, ein veröffentlichter Plan in der Mitte', () => {
    expect(lagen(true, 'entwurf')).toEqual(['jetzt', 'leer', 'leer'])
    expect(lagen(false, 'aktuell')).toEqual(['voll', 'jetzt', 'leer'])
  })

  it('ein abgeschlossener ist durch — als Entwurf abgelaufen, war er nie veröffentlicht', () => {
    expect(lagen(false, 'abgeschlossen')).toEqual(['voll', 'voll', 'voll'])
    expect(lagen(true, 'abgeschlossen')).toEqual(['voll', 'leer', 'voll'])
  })

  it('die Schritte heißen wie der Stand des einen Plans', () => {
    expect(spurDesPlans({ entwurf: true }, 'entwurf', t).map((s) => s.name)).toEqual([
      t.wpEntwurf,
      t.spurVeroeffentlicht,
      t.spurAbgeschlossen,
    ])
  })
})
