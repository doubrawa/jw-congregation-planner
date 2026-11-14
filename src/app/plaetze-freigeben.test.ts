import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { helferKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { emptyQualifications } from '../data/helpers'
import { sentKey } from '../data/planung/schluessel'
import type { Person, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { AppState } from './context'
import { reducer } from './reducer'

/**
 * **Plätze freigeben** (T181, T182) im Reducer — und beim Entfernen der Person.
 *
 * Freigeben ist Umteilen auf niemanden: Die Zusage des Platzes verfällt, und
 * wer davon wusste, erfährt es (`ohneEntzogene` räumt dabei sein
 * Tagebuch-Eintrag ab, `persist` meldet). Wer **entfernt** wird, bekommt keine
 * Meldung mehr (`OHNE_ENTZUG`) — sein Konto geht mit ihm.
 */

const t = dict('de')
const MONTAG = '2026-11-16'
const MIKRO = helferKey(MONTAG, 'we', 'mikro', 0)
const ORDNER = helferKey(MONTAG, 'we', 'ordner', 0)

const ANTON: Person = {
  id: 'p-anton', fn: 'Anton', ln: 'Probe', role: 'verkuendiger',
  priv: { ...emptyQualifications(), 'svc:mikro': true, 'svc:ordner': true },
}
const amPlatz = { name: 'Anton Probe', pid: ANTON.id }

function zustand(): AppState {
  const week: Week = {
    range: '', book: '', start: MONTAG,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: { mikro: [amPlatz], ordner: [amPlatz] } },
  }
  return {
    ...demoZustand(),
    lang: 'de',
    weeks: [week],
    fsWeeks: [[]],
    services: [
      { key: 'mikro', name: 'Mikrofone', count: 1 },
      { key: 'ordner', name: 'Ordner', count: 1 },
    ],
    persons: [ANTON],
    confirmations: { [MIKRO]: 'bestätigt', [ORDNER]: 'bestätigt' },
    sentLog: { [sentKey(MIKRO, 'Anton Probe')]: '2026-11-10T18:00:00Z' },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 9, 0)) // Mittwoch — der Sonntag kommt noch
})
afterEach(() => vi.useRealTimers())

describe('Plätze freigeben', () => {
  it('leert genau die genannten Plätze der Person — ihre Zusage verfällt, die anderen bleiben', () => {
    const next = reducer(zustand(), { type: 'plaetzeFreigeben', personId: ANTON.id, keys: [MIKRO] })
    expect(next.weeks[0]?.we.helpers.mikro?.[0]).toEqual({ name: '' })
    expect(next.weeks[0]?.we.helpers.ordner?.[0]).toEqual(amPlatz)
    expect(next.confirmations).toEqual({ [ORDNER]: 'bestätigt' })
    expect(next.toast?.text).toBe(fill(t.toastPlaetzeFrei, { n: 1 }))
  })

  it('auch eine Absage verfällt mit dem Platz — wer ihn neu bekommt, erbte sie sonst', () => {
    const vorher = { ...zustand(), confirmations: { [MIKRO]: 'verhindert' as const } }
    expect(reducer(vorher, { type: 'plaetzeFreigeben', personId: ANTON.id, keys: [MIKRO] }).confirmations).toEqual({})
  })

  it('wer davon wusste, verliert auch den Eintrag im Versand-Tagebuch — gemeldet wird es ihm (`persist`)', () => {
    const next = reducer(zustand(), { type: 'plaetzeFreigeben', personId: ANTON.id, keys: [MIKRO] })
    expect(next.sentLog).toEqual({})
  })

  it('Gegenprobe: eine unbekannte Person ändert nichts', () => {
    const vorher = zustand()
    expect(reducer(vorher, { type: 'plaetzeFreigeben', personId: 'p-niemand', keys: [MIKRO] })).toBe(vorher)
  })

  it('Gegenprobe: ein Platz, an dem sie nicht mehr steht, bleibt, wie er ist', () => {
    const vorher = zustand()
    vorher.weeks[0]!.we.helpers.mikro = [{ name: 'Berta Probe', pid: 'p-berta' }]
    expect(reducer(vorher, { type: 'plaetzeFreigeben', personId: ANTON.id, keys: [MIKRO] })).toBe(vorher)
  })
})

describe('Eine Person entfernen (T182)', () => {
  it('mit Freigeben: die Plätze werden offen, die Person geht, ihre Zusagen gehen mit', () => {
    const next = reducer(zustand(), { type: 'removePerson', id: ANTON.id, freigeben: [MIKRO, ORDNER] })
    expect(next.persons).toEqual([])
    expect(next.weeks[0]?.we.helpers).toEqual({ mikro: [{ name: '' }], ordner: [{ name: '' }] })
    expect(next.confirmations).toEqual({})
  })

  it('…und gemeldet wird niemandem etwas: Das Tagebuch bleibt, wie es ist (`OHNE_ENTZUG`)', () => {
    const vorher = zustand()
    expect(reducer(vorher, { type: 'removePerson', id: ANTON.id, freigeben: [MIKRO] }).sentLog).toBe(vorher.sentLog)
  })

  it('Gegenprobe: ohne Freigeben bleibt der Name als Text in den Wochen stehen, wie bisher', () => {
    const next = reducer(zustand(), { type: 'removePerson', id: ANTON.id })
    expect(next.weeks[0]?.we.helpers.mikro?.[0]).toEqual({ name: 'Anton Probe' })
    expect(next.confirmations).toEqual({ [MIKRO]: 'bestätigt', [ORDNER]: 'bestätigt' })
  })
})
