/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reducer } from './reducer'
import type { AppState } from './context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { ozKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { OZ_DIENST } from '../../supabase/functions/_shared/zuteilungen.ts'
import type { MyTask, OzEintrag, OzTermin } from '../data/types'

/**
 * **Öffentliches Zeugnisgeben im Reducer** (T120, Phase 3). Die Regeln selbst
 * prüft `data/zeugnis.test.ts`; hier geht es darum, dass jede Aktion sie
 * benutzt — und um die Wege, auf denen eine Zusage verfällt oder eine Absage
 * die Planer erreicht.
 */

/** Ein Termin am Mittwoch. Die Uhr steht auf Montag, 7. September 2026. */
const MITTWOCH: OzTermin = { id: 't-mi', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }
const NAECHSTER_MITTWOCH = '2026-09-09'
const LETZTER_MITTWOCH = '2026-09-02'

/** Simon (p9) ist angemeldet; er, Manfred (p1) und Konrad (p5) haben den Aufgabenbereich. */
function zustand(over: Partial<AppState> = {}): AppState {
  const basis = demoZustand()
  return {
    ...basis,
    planner: true,
    personId: 'p9',
    persons: basis.persons.map((p) =>
      ['p1', 'p5', 'p9'].includes(p.id) ? { ...p, priv: { ...p.priv, zeugnis: true } } : p,
    ),
    ozTermine: [MITTWOCH],
    ozEintraege: [],
    confirmations: {},
    notifs: [],
    terminGewaehlt: true,
    ...over,
  }
}

const eintrag = (datum: string, pid: string, selbst = false, id = `e-${datum}-${pid}`): OzEintrag => ({
  id,
  terminId: MITTWOCH.id,
  datum,
  pid,
  selbst,
})

/** Die eigene Aufgabe aus dem öffentlichen Zeugnisgeben, falls es eine gibt. */
const ozAufgabe = (s: AppState): MyTask | undefined => s.myTasks.find((t) => t.id.startsWith('oz|'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
})
afterEach(() => vi.useRealTimers())

describe('Selbst eintragen', () => {
  it('legt einen eigenen Eintrag an — und der ist damit zugesagt', () => {
    const s = reducer(zustand({ planner: false }), { type: 'ozEintragen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH })
    expect(s.ozEintraege).toEqual([expect.objectContaining({ datum: NAECHSTER_MITTWOCH, pid: 'p9', selbst: true })])
    // Keine Zeile in den Zusagen: Das Selbsteintragen ist die Zusage.
    expect(s.confirmations).toEqual({})
    expect(ozAufgabe(s)).toMatchObject({
      id: ozKey('2026-09-07', s.ozEintraege[0]!.id),
      rolle: OZ_DIENST,
      date: 'Mittwoch, 9. September · 10:00–12:00 · Marktplatz',
      status: 'bestätigt',
    })
  })

  it('ohne den Aufgabenbereich, an einem falschen Tag, in eine volle oder vergangene Schicht: nichts', () => {
    const ohne = zustand({ planner: false })
    ohne.persons = ohne.persons.map((p) => (p.id === 'p9' ? { ...p, priv: { ...p.priv, zeugnis: false } } : p))
    expect(reducer(ohne, { type: 'ozEintragen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH })).toBe(ohne)

    const s = zustand({ planner: false })
    expect(reducer(s, { type: 'ozEintragen', terminId: MITTWOCH.id, datum: '2026-09-10' })).toBe(s)
    expect(reducer(s, { type: 'ozEintragen', terminId: MITTWOCH.id, datum: LETZTER_MITTWOCH })).toBe(s)
    const voll = zustand({
      planner: false,
      ozEintraege: [eintrag(NAECHSTER_MITTWOCH, 'p1'), eintrag(NAECHSTER_MITTWOCH, 'p5')],
    })
    expect(reducer(voll, { type: 'ozEintragen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH })).toBe(voll)
  })
})

describe('Zuteilen und bestätigen', () => {
  it('der Planer teilt zu — die Zuteilung wartet auf Bestätigung', () => {
    let s = reducer(zustand(), { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p9' })
    expect(s.ozEintraege).toEqual([expect.objectContaining({ pid: 'p9', selbst: false })])
    expect(ozAufgabe(s)?.status).toBe('offen')
    s = reducer(s, { type: 'confirmTask', id: ozAufgabe(s)!.id })
    expect(ozAufgabe(s)?.status).toBe('bestätigt')
  })

  it('niemanden zweimal in dieselbe Schicht', () => {
    const s = zustand({ ozEintraege: [eintrag(NAECHSTER_MITTWOCH, 'p1')] })
    expect(reducer(s, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p1' })).toBe(s)
  })
})

describe('Absagen gibt den Platz frei', () => {
  it('aus „Meine Aufgaben": der Eintrag geht, die Planer erfahren es mit Tag und Ort', () => {
    let s = reducer(zustand({ planner: false }), { type: 'ozEintragen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH })
    const key = ozAufgabe(s)!.id
    s = reducer(s, { type: 'declineTask', id: key })
    expect(s.ozEintraege).toEqual([])
    expect(s.confirmations).toEqual({}) // kein „verhindert" für einen Platz, den es nicht mehr gibt
    expect(ozAufgabe(s)).toBeUndefined()
    // Mit dem Schlüssel des Eintrags: Der Tipp des Planers führt zum Zeugnisgeben (4.10.2026).
    expect(s.notifs[0]).toMatchObject({ type: 'verhindert', title: 'Verhinderung gemeldet', local: true, taskId: key })
    expect(s.notifs[0]!.text).toContain(`${OZ_DIENST} · Mittwoch, 9. September · 10:00–12:00 · Marktplatz — `)
  })

  it('aus der Ansicht ebenso — und eine Zusage dazu verschwindet mit', () => {
    const e = eintrag(NAECHSTER_MITTWOCH, 'p9')
    const s = reducer(
      zustand({ planner: false, ozEintraege: [e], confirmations: { [ozKey('2026-09-07', e.id)]: 'bestätigt' } }),
      { type: 'ozAustragen', id: e.id },
    )
    expect(s.ozEintraege).toEqual([])
    expect(s.confirmations).toEqual({})
    expect(s.notifs[0]?.type).toBe('verhindert')
    expect(s.notifs[0]?.taskId).toBe(ozKey('2026-09-07', e.id))
  })

  it('der Planer, der seinen Plan aufräumt, meldet sich nichts selbst', () => {
    const e = eintrag(NAECHSTER_MITTWOCH, 'p1')
    const s = reducer(
      zustand({ ozEintraege: [e], confirmations: { [ozKey('2026-09-07', e.id)]: 'bestätigt' } }),
      { type: 'ozAustragen', id: e.id },
    )
    expect(s.ozEintraege).toEqual([])
    expect(s.confirmations).toEqual({})
    expect(s.notifs).toEqual([])
  })
})

describe('Termine', () => {
  it('ein neuer Termin: Samstagvormittag, zwei Plätze, eine lesbare Kennung', () => {
    const s = reducer(zustand({ ozTermine: [] }), { type: 'ozTerminAdd' })
    expect(s.ozTermine).toEqual([expect.objectContaining({ wd: 6, von: '10:00', bis: '12:00', ort: '', plaetze: 2 })])
    expect(s.ozTermine[0]!.id).toMatch(/^t.{8,}/)
  })

  it('ein anderer Wochentag nimmt die kommenden Einträge mit — Vergangenes bleibt', () => {
    const alt = eintrag(LETZTER_MITTWOCH, 'p1')
    const neu = eintrag(NAECHSTER_MITTWOCH, 'p5')
    const s = reducer(zustand({ ozEintraege: [alt, neu] }), { type: 'ozTerminUpdate', id: MITTWOCH.id, patch: { wd: 4 } })
    expect(s.ozTermine[0]!.wd).toBe(4)
    expect(s.ozEintraege).toEqual([alt])
  })

  it('Uhrzeit, Ort und Plätze lassen die Einträge stehen', () => {
    const e = eintrag(NAECHSTER_MITTWOCH, 'p5')
    const s = reducer(zustand({ ozEintraege: [e] }), { type: 'ozTerminUpdate', id: MITTWOCH.id, patch: { von: '14:00', ort: 'Bahnhof', plaetze: 1 } })
    expect(s.ozEintraege).toEqual([e])
  })

  it('ein gestrichener Termin nimmt seine Einträge und deren Zusagen mit', () => {
    const e = eintrag(NAECHSTER_MITTWOCH, 'p9')
    const s = reducer(
      zustand({ ozEintraege: [e], confirmations: { [ozKey('2026-09-07', e.id)]: 'bestätigt' } }),
      { type: 'ozTerminRemove', id: MITTWOCH.id },
    )
    expect(s.ozTermine).toEqual([])
    expect(s.ozEintraege).toEqual([])
    expect(s.confirmations).toEqual({})
    expect(ozAufgabe(s)).toBeUndefined()
  })
})

describe('Eine Schicht fällt aus (4.10.2026)', () => {
  const streichen = (datum: string, aus = true) =>
    ({ type: 'ozSchichtAus', terminId: MITTWOCH.id, datum, aus }) as const

  it('der Tag steht am Termin; die Einträge des Tages gehen samt Zusage — andere Tage bleiben', () => {
    const weg = eintrag(NAECHSTER_MITTWOCH, 'p9')
    const bleibt = eintrag('2026-09-16', 'p9')
    const s = reducer(
      zustand({ ozEintraege: [weg, bleibt], confirmations: { [ozKey('2026-09-07', weg.id)]: 'bestätigt' } }),
      streichen(NAECHSTER_MITTWOCH),
    )
    expect(s.ozTermine[0]!.aus).toEqual([NAECHSTER_MITTWOCH])
    expect(s.ozEintraege).toEqual([bleibt])
    expect(s.confirmations).toEqual({})
    expect(s.myTasks.filter((t) => t.id.startsWith('oz|')).map((t) => t.date)).toEqual([
      'Mittwoch, 16. September · 10:00–12:00 · Marktplatz',
    ])
  })

  it('niemand trägt sich ein, niemand wird zugeteilt, automatisch besetzt wird sie nicht', () => {
    const s = reducer(zustand(), streichen(NAECHSTER_MITTWOCH))
    expect(reducer(s, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p1' })).toBe(s)
    const selbst = { ...s, planner: false }
    expect(reducer(selbst, { type: 'ozEintragen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH })).toBe(selbst)
    const auto = reducer(s, { type: 'ozAutoAssign' })
    // Zwölf Wochen zu zwei Plätzen — die gestrichene fehlt.
    expect(auto.ozEintraege).toHaveLength(24)
    expect(auto.ozEintraege.some((e) => e.datum === NAECHSTER_MITTWOCH)).toBe(false)
  })

  it('wiederherstellen holt die Schicht zurück, leer — die Einträge kommen nicht wieder', () => {
    const e = eintrag(NAECHSTER_MITTWOCH, 'p1')
    const aus = reducer(zustand({ ozEintraege: [e] }), streichen(NAECHSTER_MITTWOCH))
    const zurueck = reducer(aus, streichen(NAECHSTER_MITTWOCH, false))
    expect(zurueck.ozTermine[0]!.aus).toEqual([])
    expect(zurueck.ozEintraege).toEqual([])
    // Danach ist sie wieder eine Schicht wie jede andere.
    const zugeteilt = reducer(zurueck, { type: 'ozZuteilen', terminId: MITTWOCH.id, datum: NAECHSTER_MITTWOCH, pid: 'p1' })
    expect(zugeteilt.ozEintraege).toHaveLength(1)
  })

  it('nichts zu tun: schon gestrichen, nicht gestrichen, vergangen, falscher Tag, kein Termin', () => {
    const s = reducer(zustand(), streichen(NAECHSTER_MITTWOCH))
    expect(reducer(s, streichen(NAECHSTER_MITTWOCH))).toBe(s)
    const z = zustand()
    expect(reducer(z, streichen(NAECHSTER_MITTWOCH, false))).toBe(z)
    // Vergangenes bleibt, wie es war — auch seine Einträge.
    const vorbei = zustand({ ozEintraege: [eintrag(LETZTER_MITTWOCH, 'p1')] })
    expect(reducer(vorbei, streichen(LETZTER_MITTWOCH))).toBe(vorbei)
    expect(reducer(z, streichen('2026-09-10'))).toBe(z)
    expect(reducer(z, { type: 'ozSchichtAus', terminId: 't-weg', datum: NAECHSTER_MITTWOCH, aus: true })).toBe(z)
  })

  it('was vor dieser Woche liegt, fällt beim nächsten Streichen aus der Liste — der Rest bleibt sortiert', () => {
    const alt = zustand({ ozTermine: [{ ...MITTWOCH, aus: ['2026-08-26', '2026-09-23'] }] })
    const s = reducer(alt, streichen(NAECHSTER_MITTWOCH))
    expect(s.ozTermine[0]!.aus).toEqual([NAECHSTER_MITTWOCH, '2026-09-23'])
  })

  it('heute lässt sich noch streichen — es regnet ja vielleicht', () => {
    vi.setSystemTime(new Date(2026, 8, 9, 7, 0)) // Mittwoch früh
    const s = reducer(zustand({ ozEintraege: [eintrag(NAECHSTER_MITTWOCH, 'p1')] }), streichen(NAECHSTER_MITTWOCH))
    expect(s.ozTermine[0]!.aus).toEqual([NAECHSTER_MITTWOCH])
    expect(s.ozEintraege).toEqual([])
  })
})

describe('Automatisch zuteilen und leeren', () => {
  it('füllt die Plätze des Vierteljahrs, niemand doppelt in einer Schicht', () => {
    const s = reducer(zustand(), { type: 'ozAutoAssign' })
    // 13 Wochen ab dieser, je zwei Plätze.
    expect(s.ozEintraege).toHaveLength(26)
    expect(s.ozEintraege.every((e) => !e.selbst)).toBe(true)
    const jeSchicht = new Map<string, string[]>()
    for (const e of s.ozEintraege) jeSchicht.set(e.datum, [...(jeSchicht.get(e.datum) ?? []), e.pid])
    for (const pids of jeSchicht.values()) expect(new Set(pids).size).toBe(pids.length)
  })

  it('„Leeren" nimmt nur Zugeteiltes, das noch kommt', () => {
    const selbst = eintrag(NAECHSTER_MITTWOCH, 'p9', true)
    const zugeteilt = eintrag(NAECHSTER_MITTWOCH, 'p1')
    const vorbei = eintrag(LETZTER_MITTWOCH, 'p5')
    const s = reducer(zustand({ ozEintraege: [vorbei, selbst, zugeteilt] }), { type: 'ozLeeren' })
    expect(s.ozEintraege).toEqual([vorbei, selbst])
  })
})

describe('Personen löschen', () => {
  it('nimmt ihre Einträge mit — wie die Datenbank (Kaskade)', () => {
    const s = reducer(
      zustand({ ozEintraege: [eintrag(NAECHSTER_MITTWOCH, 'p1'), eintrag(NAECHSTER_MITTWOCH, 'p5')] }),
      { type: 'removePerson', id: 'p1' },
    )
    expect(s.ozEintraege.map((e) => e.pid)).toEqual(['p5'])
  })
})
