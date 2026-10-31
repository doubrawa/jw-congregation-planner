import { describe, expect, it } from 'vitest'
import { ueberschneiden, wasBleibt } from '../../supabase/functions/_shared/trolley.ts'
import { emptyQualifications } from './helpers'
import {
  darfTrolley,
  eigeneTermine,
  eintragenHindernis,
  freierZeitraum,
  kommendeTermine,
  moeglichePartner,
  partnerGesucht,
  TROLLEY_ZEITEN,
  trolleysSortiert,
  zeitraumGueltig,
} from './trolleys'
import type { Person, Trolley, TrolleyTermin } from './types'

/**
 * **Trolleys** (T121, Phase 7) — die reine Logik: frei von 6 bis 22 Uhr in
 * halben Stunden, kein Trolley zweimal zur selben Zeit, niemand an zwei Orten,
 * und wer nach dem Austragen bleibt. Die Function rechnet mit denselben
 * Regeln (`_shared/trolley.ts`); was dort steht, gilt hier wie dort.
 */

const person = (id: string, ln: string, zeugnis = true): Person => ({
  id,
  fn: id.toUpperCase(),
  ln,
  role: 'verkuendiger',
  female: false,
  priv: { ...emptyQualifications(), zeugnis },
})

const JONAS = person('p-jonas', 'Berger')
const SIMON = person('p-simon', 'Krüger')
const OHNE = person('p-ohne', 'Hne', false)

const termin = (patch: Partial<TrolleyTermin> = {}): TrolleyTermin => ({
  id: 'r1',
  trolleyId: 'tr1',
  datum: '2026-09-12',
  von: '09:00',
  bis: '11:00',
  pid: JONAS.id,
  partner: null,
  gemeinsam: false,
  ...patch,
})

/** Montag, 7. September 2026, mittags. */
const HEUTE = new Date(2026, 8, 7, 12)

describe('das Raster: 6 bis 22 Uhr in halben Stunden', () => {
  it('33 Zeiten, die erste 06:00, die letzte 22:00', () => {
    expect(TROLLEY_ZEITEN).toHaveLength(33)
    expect(TROLLEY_ZEITEN[0]).toBe('06:00')
    expect(TROLLEY_ZEITEN[1]).toBe('06:30')
    expect(TROLLEY_ZEITEN.at(-1)).toBe('22:00')
  })

  it.each([
    ['09:00', '11:00', true],
    ['06:00', '22:00', true],
    ['05:30', '07:00', false],
    ['21:00', '22:30', false],
    ['09:15', '10:00', false],
    ['11:00', '11:00', false],
    ['11:00', '09:00', false],
  ])('%s–%s → %s', (von, bis, gilt) => {
    expect(zeitraumGueltig(von, bis)).toBe(gilt)
  })
})

describe('überschneiden', () => {
  const a = { datum: '2026-09-12', von: '09:00', bis: '11:00' }
  it('am selben Tag, wenn einer beginnt, bevor der andere endet', () => {
    expect(ueberschneiden(a, { ...a, von: '10:30', bis: '12:00' })).toBe(true)
    expect(ueberschneiden(a, { ...a, von: '08:00', bis: '09:30' })).toBe(true)
    expect(ueberschneiden(a, { ...a, von: '09:30', bis: '10:00' })).toBe(true)
  })
  it('wer um 11 übernimmt, wo einer um 11 aufhört, stört niemanden — und ein anderer Tag auch nicht', () => {
    expect(ueberschneiden(a, { ...a, von: '11:00', bis: '12:00' })).toBe(false)
    expect(ueberschneiden(a, { ...a, von: '07:00', bis: '09:00' })).toBe(false)
    expect(ueberschneiden(a, { ...a, datum: '2026-09-13' })).toBe(false)
  })
})

describe('wer nach dem Austragen bleibt', () => {
  it('geht einer von zweien, bleibt der andere — wer eingetragen hat oder der Partner', () => {
    expect(wasBleibt('a', 'b', 'b')).toEqual({ person: 'a' })
    expect(wasBleibt('a', 'b', 'a')).toEqual({ person: 'b' })
  })
  it('geht der Letzte, ist der Termin weg; wer nicht dabei ist, ändert nichts', () => {
    expect(wasBleibt('a', null, 'a')).toBeNull()
    expect(wasBleibt('a', 'b', 'c')).toBeUndefined()
  })
})

describe('Reihenfolge und Listen', () => {
  it('die Trolleys nach dem Namen, Zahlen als Zahlen', () => {
    const t = (id: string, name: string): Trolley => ({ id, name, ort: '', hinweis: '' })
    expect(trolleysSortiert([t('c', 'Trolley 10'), t('a', 'Trolley 2'), t('b', 'Saal')]).map((x) => x.name)).toEqual([
      'Saal',
      'Trolley 2',
      'Trolley 10',
    ])
  })

  it('eigene Termine ab heute — eingetragen oder als Partner, in der Reihenfolge des Tages', () => {
    const termine = [
      termin({ id: 'spaeter', datum: '2026-09-19' }),
      termin({ id: 'partner', pid: SIMON.id, partner: JONAS.id, datum: '2026-09-12' }),
      termin({ id: 'vorbei', datum: '2026-09-05' }),
      termin({ id: 'fremd', pid: SIMON.id }),
    ]
    expect(eigeneTermine(termine, JONAS.id, HEUTE).map((t) => t.id)).toEqual(['partner', 'spaeter'])
    expect(eigeneTermine(termine, undefined, HEUTE)).toEqual([])
  })

  it('wo andere einen Partner suchen — die eigenen nicht, Vergangenes nicht', () => {
    const termine = [
      termin({ id: 'jonas-sucht' }),
      termin({ id: 'simon-sucht', pid: SIMON.id }),
      termin({ id: 'simon-voll', pid: SIMON.id, partner: 'p-lena' }),
      termin({ id: 'simon-vorbei', pid: SIMON.id, datum: '2026-09-01' }),
    ]
    expect(partnerGesucht(termine, JONAS.id, HEUTE).map((t) => t.id)).toEqual(['simon-sucht'])
  })

  it('kommende Termine eines Trolleys — ab heute', () => {
    const termine = [termin({ id: 'k' }), termin({ id: 'v', datum: '2026-09-01' }), termin({ id: 'a', trolleyId: 'tr2' })]
    expect(kommendeTermine(termine, 'tr1', HEUTE).map((t) => t.id)).toEqual(['k'])
  })

  it('mögliche Partner: wer das Trolley-Recht hat, außer einem selbst, nach dem Nachnamen', () => {
    expect(moeglichePartner([SIMON, OHNE, JONAS], JONAS.id, 'de').map((p) => p.id)).toEqual([SIMON.id])
    expect(darfTrolley(OHNE)).toBe(false)
    expect(darfTrolley(undefined)).toBe(false)
  })

  it('… in der Sprache des Lesers: Schwedisch stellt Å hinter Z, Deutsch zu A', () => {
    const aberg = person('p-aa', 'Åberg')
    const zander = person('p-z', 'Zander')
    expect(moeglichePartner([zander, aberg], undefined, 'de').map((p) => p.ln)).toEqual(['Åberg', 'Zander'])
    expect(moeglichePartner([zander, aberg], undefined, 'sv').map((p) => p.ln)).toEqual(['Zander', 'Åberg'])
  })
})

describe('was einem Eintrag im Weg steht', () => {
  const wunsch = { trolleyId: 'tr1', datum: '2026-09-12', von: '09:00', bis: '11:00', partner: SIMON }

  it('nichts — dann null', () => {
    expect(eintragenHindernis([], JONAS, wunsch, HEUTE)).toBeNull()
  })

  it.each<[string, TrolleyTermin[], Person | undefined, Partial<typeof wunsch>, string]>([
    ['ohne eigenes Recht', [], OHNE, {}, 'kein-recht'],
    ['ohne eigene Person', [], undefined, {}, 'kein-recht'],
    ['der Tag ist vorbei', [], JONAS, { datum: '2026-09-06' }, 'vorbei'],
    ['Bis vor Von', [], JONAS, { von: '11:00', bis: '09:00' }, 'zeit'],
    ['der Trolley ist unterwegs', [termin({ id: 'x', pid: 'p-lena', von: '10:00', bis: '12:00' })], JONAS, {}, 'belegt'],
    ['selbst schon woanders', [termin({ id: 'x', trolleyId: 'tr2', von: '10:00', bis: '12:00' })], JONAS, {}, 'doppelt'],
    ['der Partner ohne Recht', [], JONAS, { partner: OHNE }, 'partner-ohne-recht'],
    [
      'der Partner schon woanders',
      [termin({ id: 'x', trolleyId: 'tr2', pid: 'p-lena', partner: SIMON.id, von: '10:00', bis: '12:00' })],
      JONAS,
      {},
      'partner-doppelt',
    ],
  ])('%s → %s', (_was, termine, ich, patch, grund) => {
    expect(eintragenHindernis(termine, ich, { ...wunsch, ...patch }, HEUTE)).toBe(grund)
  })

  it('heute geht noch', () => {
    expect(eintragenHindernis([], JONAS, { ...wunsch, datum: '2026-09-07' }, HEUTE)).toBeNull()
  })
})

describe('der Vorschlag für einen Tipp auf eine freie Zeit', () => {
  it('zwei Stunden ab der halben Stunde', () => {
    expect(freierZeitraum([], 'tr1', '2026-09-12', '09:30')).toEqual({ von: '09:30', bis: '11:30' })
  })
  it('nur bis zum nächsten Termin dieses Trolleys — ein anderer Trolley zählt nicht', () => {
    const termine = [termin({ von: '10:30', bis: '12:00' }), termin({ id: 'b', trolleyId: 'tr2', von: '10:00', bis: '11:00' })]
    expect(freierZeitraum(termine, 'tr1', '2026-09-12', '09:30')).toEqual({ von: '09:30', bis: '10:30' })
  })
  it('höchstens bis 22 Uhr', () => {
    expect(freierZeitraum([], 'tr1', '2026-09-12', '21:00')).toEqual({ von: '21:00', bis: '22:00' })
  })
})
