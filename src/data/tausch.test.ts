import { describe, expect, it } from 'vitest'
import { helferKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { anfrageZu, anfragenAn, platzTermin, tauschbar, tauschLokal, type TauschAnfrage } from './tausch'
import type { MeetingTimes, MyTask, Person, SentLog, Service, Week } from './types'

/**
 * **Tauschen in der App** (T153): wann sie „Tauschen" anbietet, welche
 * Anfragen gelten, und dass der Tausch hier genauso aussieht wie das, was die
 * Function geschrieben hat. Wen man fragen kann, rechnet der Server — die
 * Regeln dazu prüft `supabase/functions/_test/tauschen.test.ts`.
 */

const W1 = '2026-09-07' // Dienstag 8.9., Sonntag 13.9.
const W2 = '2026-09-14' // Sonntag 20.9.
const ZEITEN: MeetingTimes = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const SERVICES: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2 },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]
const person = (id: string, fn: string, ln: string): Person =>
  ({ id, fn, ln, role: 'verkuendiger', female: false, mail: '', priv: {} }) as unknown as Person
const SIMON = person('p-simon', 'Simon', 'Krüger')
const JONAS = person('p-jonas', 'Jonas', 'Berger')

function woche(start: string, we: Record<string, { name: string; pid?: string }[]>): Week {
  return {
    range: '', book: '', start,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: we },
  } as Week
}
const WOCHEN = [woche(W1, { mik: [{ name: 'Simon Krüger', pid: 'p-simon' }] }), woche(W2, { mik: [{ name: 'Jonas Berger', pid: 'p-jonas' }] })]

const A = helferKey(W1, 'we', 'mik', 0)
const B = helferKey(W2, 'we', 'mik', 0)

const aufgabe = (id: string, tag: string): MyTask =>
  ({ id, title: '', rolle: 'Mikrofone', date: '', at: Date.parse(tag), status: 'offen', s89: null }) as MyTask
/** Ein Eintrag im Versand-Tagebuch: Der Plan dieser Woche ging hinaus. */
const gesendet = (...wochen: string[]) => Object.fromEntries(wochen.map((w) => [`${w}|we|helper|mik|0 Simon Krüger`, '2026-09-01T10:00:00Z']))
const HEUTE = new Date('2026-09-07T09:00:00')

const anfrage = (patch: Partial<TauschAnfrage> = {}): TauschAnfrage => ({
  id: 'a1', von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13', ...patch,
})

describe('Wann die App „Tauschen" anbietet', () => {
  const basis = (sentLog: SentLog, weeks: Week[] = WOCHEN) => ({ services: SERVICES, sentLog, weeks })

  it('an einem Hilfsdienst in einer Woche, deren Plan hinausging, solange er kommt', () => {
    expect(tauschbar(aufgabe(A, '2026-09-13'), 'p-simon', basis(gesendet(W1)), HEUTE)).toBe(true)
  })

  it('nicht vor „Plan senden" — dann plant der Planer noch', () => {
    expect(tauschbar(aufgabe(A, '2026-09-13'), 'p-simon', basis(gesendet(W2)), HEUTE)).toBe(false)
    expect(tauschbar(aufgabe(A, '2026-09-13'), 'p-simon', basis({}), HEUTE)).toBe(false)
  })

  it('nicht an einem Programmpunkt, nicht an der Reinigung, nicht im Nachhinein', () => {
    expect(tauschbar(aufgabe(`${W1}|we|part|v1|0`, '2026-09-13'), 'p-simon', basis(gesendet(W1)), HEUTE)).toBe(false)
    expect(tauschbar(aufgabe(helferKey(W1, 'we', 'rein', 0), '2026-09-13'), 'p-simon', basis(gesendet(W1)), HEUTE)).toBe(false)
    expect(tauschbar(aufgabe(A, '2026-09-13'), 'p-simon', basis(gesendet(W1)), new Date('2026-09-14T09:00:00'))).toBe(false)
  })

  it('nicht an einem Platz, der nur den Namen trägt — den tauscht der Server nicht (Review 30.10.2026)', () => {
    // Die Aufgabe gehört Simon über den Namen (`gehoertZu`), der Platz trägt
    // aber keine Kennung: Der Server sagte `not-yours`, das Blatt „mit
    // niemandem möglich". Und ohne eigene Person gibt es nichts zu tauschen.
    const nurName = [woche(W1, { mik: [{ name: 'Simon Krüger' }] }), WOCHEN[1]!]
    expect(tauschbar(aufgabe(A, '2026-09-13'), 'p-simon', basis(gesendet(W1), nurName), HEUTE)).toBe(false)
    expect(tauschbar(aufgabe(A, '2026-09-13'), 'p-jonas', basis(gesendet(W1)), HEUTE)).toBe(false)
    expect(tauschbar(aufgabe(A, '2026-09-13'), null, basis(gesendet(W1)), HEUTE)).toBe(false)
  })
})

describe('Welche Anfragen gelten', () => {
  it('an mich: nur die an meine Person, bis ihr früherer Tag vorbei ist — die früheste zuerst', () => {
    const liste = [anfrage({ id: 'spaet', bis: '2026-09-20' }), anfrage({ id: 'frueh' }), anfrage({ id: 'fremd', an: 'p-lena' })]
    expect(anfragenAn(liste, 'p-jonas', '2026-09-07', WOCHEN).map((a) => a.id)).toEqual(['frueh', 'spaet'])
    expect(anfragenAn(liste, 'p-jonas', '2026-09-14', WOCHEN).map((a) => a.id)).toEqual(['spaet'])
    expect(anfragenAn(liste, null, '2026-09-07', WOCHEN)).toEqual([])
  })

  it('zu meinem Platz: die eine, die noch gilt', () => {
    expect(anfrageZu([anfrage()], A, '2026-09-13', WOCHEN)?.id).toBe('a1')
    expect(anfrageZu([anfrage()], A, '2026-09-14', WOCHEN)).toBeUndefined()
    expect(anfrageZu([anfrage()], B, '2026-09-07', WOCHEN)).toBeUndefined()
  })

  it('hat der Planer einen der beiden Plätze umgeteilt, gilt sie nicht mehr — auf keiner Seite', () => {
    const umgeteilt = (woche: string) =>
      WOCHEN.map((w) => (w.start === woche ? { ...w, we: { ...w.we, helpers: { mik: [{ name: 'Lena Hoffmann', pid: 'p-lena' }] } } } : w))
    for (const wochen of [umgeteilt(W1), umgeteilt(W2)]) {
      expect(anfragenAn([anfrage()], 'p-jonas', '2026-09-07', wochen)).toEqual([])
      expect(anfrageZu([anfrage()], A, '2026-09-07', wochen)).toBeUndefined()
    }
    // Ohne geladene Woche weiß die App es nicht — dann eben auch keine Karte.
    expect(anfragenAn([anfrage()], 'p-jonas', '2026-09-07', [])).toEqual([])
  })
})

describe('Der Tausch in der App', () => {
  it('auf dem abgegebenen Platz steht der Gefragte, auf dem übernommenen der Fragende — mit Kennung', () => {
    const neu = tauschLokal(WOCHEN, SERVICES, [SIMON, JONAS], anfrage())
    expect(neu[0]?.we.helpers.mik?.[0]).toEqual({ name: 'Jonas Berger', pid: 'p-jonas' })
    expect(neu[1]?.we.helpers.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    expect(WOCHEN[0]?.we.helpers.mik?.[0]?.pid).toBe('p-simon')
  })

  it('fehlt eine Person oder ein Platz im Bestand, bleibt alles, wie es ist — das Laden bringt den Stand', () => {
    expect(tauschLokal(WOCHEN, SERVICES, [SIMON], anfrage())).toBe(WOCHEN)
    expect(tauschLokal(WOCHEN, SERVICES, [SIMON, JONAS], anfrage({ nimmt: helferKey('2026-09-21', 'we', 'mik', 0) }))).toBe(WOCHEN)
  })

  it('ein Platz trägt Dienst und Termin wie eine Aufgabe — ohne geladene Woche nichts', () => {
    expect(platzTermin(WOCHEN, SERVICES, ZEITEN, B)).toEqual({
      dienst: 'Mikrofone',
      date: 'Sonntag, 20. September · 10:00',
      at: Date.UTC(2026, 8, 20),
    })
    expect(platzTermin(WOCHEN, SERVICES, ZEITEN, helferKey('2026-09-21', 'we', 'mik', 0))).toBeNull()
    expect(platzTermin(WOCHEN, SERVICES, ZEITEN, `${W1}|we|part|v1|0`)).toBeNull()
  })
})
