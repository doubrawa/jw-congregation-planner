/** @vitest-environment happy-dom */
/**
 * **Tauschen im Zustand** (T153): Was die Function `tauschen` geschrieben hat,
 * legt der Bildschirm nach ihrer Antwort hierher — die Anfrage, ihr Ende, den
 * Tausch selbst. Geschrieben wird von hier aus nichts (`persist.ts`:
 * `getauscht` umgeht den Wochen-Schreibweg).
 */
import { describe, expect, it } from 'vitest'
import { helferKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { sentKey } from '../data/planning'
import type { TauschAnfrage } from '../data/tausch'
import type { Person, Week } from '../data/types'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { AppState } from './context'
import { reducer } from './reducer'

const W1 = '2026-09-07'
const W2 = '2026-09-14'
const A = helferKey(W1, 'we', 'mik', 0)
const B = helferKey(W2, 'we', 'mik', 0)

const person = (id: string, fn: string, ln: string): Person =>
  ({ id, fn, ln, role: 'verkuendiger', female: false, mail: '', priv: {} }) as unknown as Person

function woche(start: string, name: string, pid: string): Week {
  return {
    range: '', book: '', start,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: { mik: [{ name, pid }] } },
  } as Week
}

const start = (over: Partial<AppState> = {}): AppState => ({
  ...demoZustand(),
  personId: 'p-jonas',
  persons: [person('p-simon', 'Simon', 'Krüger'), person('p-jonas', 'Jonas', 'Berger')],
  services: [{ key: 'mik', name: 'Mikrofone', count: 2 }],
  weeks: [woche(W1, 'Simon Krüger', 'p-simon'), woche(W2, 'Jonas Berger', 'p-jonas')],
  confirmations: {},
  tauschAnfragen: [],
  ...over,
})

const anfrage = (patch: Partial<TauschAnfrage> = {}): TauschAnfrage => ({
  id: 'a1', von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13', ...patch,
})

describe('Das Tausch-Blatt', () => {
  it('ersetzt das Blatt der Aufgabe, statt darüber zu liegen — und schließt', () => {
    const offen = reducer(start({ myTaskId: A }), { type: 'openTausch', id: A })
    expect([offen.tauschId, offen.myTaskId]).toEqual([A, null])
    expect(reducer(offen, { type: 'closeTausch' }).tauschId).toBeNull()
  })
})

describe('Die Anfragen', () => {
  it('eine neue steht da, mit Bestätigung — eine frühere zum selben Platz ersetzt sie', () => {
    const s = reducer(start({ tauschAnfragen: [anfrage({ id: 'alt' })] }), { type: 'tauschAngefragt', anfrage: anfrage({ id: 'neu' }) })
    expect(s.tauschAnfragen.map((a) => a.id)).toEqual(['neu'])
    expect(s.toast?.text).toBeTruthy()
  })

  it('zurückgezogen oder abgelehnt ist sie fort — eine unbekannte ändert nichts', () => {
    const vorher = start({ tauschAnfragen: [anfrage()] })
    expect(reducer(vorher, { type: 'tauschWeg', id: 'a1' }).tauschAnfragen).toEqual([])
    expect(reducer(vorher, { type: 'tauschWeg', id: 'gibt-es-nicht' })).toBe(vorher)
  })

  it('geht eine der beiden Personen, geht die Anfrage mit — wie in der Datenbank', () => {
    const s = reducer(start({ planner: true, tauschAnfragen: [anfrage()] }), { type: 'removePerson', id: 'p-simon' })
    expect(s.tauschAnfragen).toEqual([])
  })

  it('aus dem Laden: eine Momentaufnahme von davor kennt sie nicht', () => {
    const payload: Record<string, unknown> = { ...start(), notifications: [], congregationId: 'c1', userId: 'u1', empty: false }
    delete payload.tauschAnfragen
    const geladen = reducer(start({ tauschAnfragen: [anfrage()] }), { type: 'hydrate', payload: payload as never })
    expect(geladen.tauschAnfragen).toEqual([])
  })
})

describe('Der Tausch', () => {
  it('beide Plätze getauscht, beide zugesagt, die Anfrage und jede andere zu den Plätzen fort', () => {
    const andere = anfrage({ id: 'a2', von: 'p-lena', gibtAb: helferKey(W2, 'mid', 'mik', 0), nimmt: A })
    const fremd = anfrage({ id: 'a3', gibtAb: helferKey('2026-09-21', 'we', 'mik', 0), nimmt: helferKey('2026-09-28', 'we', 'mik', 0) })
    const s = reducer(start({ tauschAnfragen: [anfrage(), andere, fremd], tauschId: A }), { type: 'getauscht', tausch: anfrage() })
    expect(s.weeks[0]?.we.helpers.mik?.[0]).toEqual({ name: 'Jonas Berger', pid: 'p-jonas' })
    expect(s.weeks[1]?.we.helpers.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    expect(s.confirmations).toMatchObject({ [A]: 'bestätigt', [B]: 'bestätigt' })
    expect(s.tauschAnfragen.map((a) => a.id)).toEqual(['a3'])
    expect(s.toast?.text).toBe(dict('de').tauschToastGetauscht)
    // Das Tausch-Blatt ist zu: Sein Platz gehört jetzt dem anderen.
    expect(s.tauschId).toBeNull()
  })

  it('mit jemandem ohne Konto (30.10.2026): zugesagt hat nur der Fragende — die alte Zusage des abgegebenen Platzes ist fort', () => {
    const vorher = start({ confirmations: { [A]: 'bestätigt' } })
    const s = reducer(vorher, { type: 'getauscht', tausch: { von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B }, ohneKonto: true })
    expect(s.weeks[0]?.we.helpers.mik?.[0]).toEqual({ name: 'Jonas Berger', pid: 'p-jonas' })
    expect(s.weeks[1]?.we.helpers.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    expect(s.confirmations[B]).toBe('bestätigt')
    expect(A in s.confirmations).toBe(false)
    // Beide im Tagebuch: Bescheid gab der Fragende mündlich — Jonas ist in den
    // Zusagen gleich als „weiß Bescheid" abgehakt, wie die Function es schreibt.
    expect(Object.keys(s.sentLog)).toEqual(expect.arrayContaining([sentKey(A, 'Jonas Berger'), sentKey(B, 'Simon Krüger')]))
    expect(s.persoenlich[sentKey(A, 'Jonas Berger')]).toBeTruthy()
    expect(sentKey(B, 'Simon Krüger') in s.persoenlich).toBe(false)
    expect(s.toast?.text).toBe(fill(dict('de').tauschToastDirekt, { name: 'Jonas Berger' }))
  })

  it('mit Konto bleibt der Haken „weiß Bescheid" außen vor — beide haben in der App zugesagt', () => {
    const s = reducer(start({ persoenlich: {} }), { type: 'getauscht', tausch: anfrage() })
    expect(s.persoenlich).toEqual({})
  })
})
