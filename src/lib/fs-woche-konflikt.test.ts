import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Die Treffpunkt-Wochen schreiben mit Stand** (15.10.2026) — derselbe Schutz
 * wie bei den Wochen der Zusammenkünfte (T39, `week-konflikt.test.ts`).
 *
 * Die Treffpunkte einer Woche liegen als **eine** Liste in einer Zeile
 * (`fs_weeks.data`). Bis zum 15.10.2026 ging sie als Upsert hinaus, ohne
 * Stand: Wer mit einem älteren Stand schrieb — der Admin, der seit dem Morgen
 * nicht neu geladen hatte —, schrieb die ganze Liste zurück und nahm still
 * zurück, was ein Gruppenaufseher inzwischen in derselben Woche eingetragen
 * hatte. Der Trigger `fs_weeks_pruefen` prüft Admin und Planer nicht (oder nur
 * ohne Leiter) und half dort nicht.
 *
 * **Jeder Test nimmt seine eigene Woche** — Stand und Schreibkette werden je
 * Woche geführt.
 */

interface Aufruf {
  op: 'insert' | 'update' | 'select'
  payload?: Record<string, unknown>
  filter: Record<string, unknown>
}

const stub = vi.hoisted(() => ({
  aufrufe: [] as Aufruf[],
  antworten: [] as Array<{ data: unknown; error: unknown }>,
}))
const fromMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({ supabase: { from: fromMock } }))

import { saveFsWeek, setKonfliktMelder, setSchreibfehlerMelder } from './data'
import type { FsInstance } from '../data/types'

function chain() {
  const aufruf: Aufruf = { op: 'select', filter: {} }
  const c: Record<string, unknown> = {}
  c.insert = (p: Record<string, unknown>) => {
    aufruf.op = 'insert'
    aufruf.payload = p
    return c
  }
  c.update = (p: Record<string, unknown>) => {
    aufruf.op = 'update'
    aufruf.payload = p
    return c
  }
  c.select = () => c
  c.eq = (k: string, v: unknown) => {
    aufruf.filter[k] = v
    return c
  }
  c.maybeSingle = () => c
  c.then = (resolve: (v: unknown) => void) => {
    stub.aufrufe.push(aufruf)
    resolve(stub.antworten.shift() ?? { data: null, error: null })
  }
  return c
}

const ok = (stand: string) => ({ data: { updated_at: stand }, error: null })
const leer = { data: null, error: null }
const treffpunkte = (leiter: string): FsInstance[] => [
  { id: 'i1', grp: 'g1', wd: 6, time: '09:30', place: 'Saal', leader: leiter } as FsInstance,
]

/** Auf das Ende der (je Woche serialisierten) Schreibkette warten. */
const abgearbeitet = () => new Promise((r) => setTimeout(r, 0))

let konflikte = 0
let schreibfehler = 0

beforeEach(() => {
  fromMock.mockReset()
  fromMock.mockImplementation(chain)
  stub.aufrufe = []
  stub.antworten = []
  konflikte = 0
  schreibfehler = 0
  setKonfliktMelder(() => {
    konflikte++
  })
  setSchreibfehlerMelder(() => {
    schreibfehler++
  })
})

describe('Der Stand wird gelernt und mitgeschickt', () => {
  it('legt die unbekannte Woche an und schreibt danach nur mit ihrem Stand', async () => {
    stub.antworten = [ok('F1'), ok('F2')]
    saveFsWeek('c1', '2026-01-05', treffpunkte('A'))
    await abgearbeitet()
    saveFsWeek('c1', '2026-01-05', treffpunkte('B'))
    await abgearbeitet()

    expect(stub.aufrufe[0]?.op).toBe('insert')
    // Kein Upsert mehr: ein Update MIT Bedingung auf den gelernten Stand.
    expect(stub.aufrufe[1]?.op).toBe('update')
    expect(stub.aufrufe[1]?.filter).toMatchObject({ congregation_id: 'c1', start: '2026-01-05', updated_at: 'F1' })
    expect(konflikte).toBe(0)
  })

  it('zwei rasche Änderungen derselben Woche kämpfen nicht gegeneinander', async () => {
    stub.antworten = [ok('F1'), ok('F2')]
    saveFsWeek('c1', '2026-01-12', treffpunkte('A'))
    saveFsWeek('c1', '2026-01-12', treffpunkte('B')) // ohne await dazwischen
    await abgearbeitet()
    await abgearbeitet()

    expect(konflikte).toBe(0)
    expect(stub.aufrufe[1]?.filter.updated_at).toBe('F1')
  })

  it('schreibt nichts ohne Kennung', () => {
    saveFsWeek('c1', '', treffpunkte('A'))
    expect(stub.aufrufe).toEqual([])
  })
})

describe('Ein anderer war schneller', () => {
  it('ein Fehltreffer lädt nach — und überschreibt nichts', async () => {
    stub.antworten = [ok('F1'), leer]
    saveFsWeek('c1', '2026-01-19', treffpunkte('A'))
    await abgearbeitet()
    saveFsWeek('c1', '2026-01-19', treffpunkte('mit altem Stand'))
    await abgearbeitet()

    expect(konflikte).toBe(1)
    expect(schreibfehler).toBe(0)
    expect(stub.aufrufe.filter((a) => a.op === 'update')).toHaveLength(1)
  })

  it('angelegt hatte die Woche schon ein anderer (23505) — nachladen', async () => {
    stub.antworten = [{ data: null, error: { code: '23505', message: 'duplicate key' } }]
    saveFsWeek('c1', '2026-01-26', treffpunkte('A'))
    await abgearbeitet()
    expect(konflikte).toBe(1)
    expect(schreibfehler).toBe(0)
  })

  it('die Abweisung des Triggers (42501) heißt veralteter Stand — nachladen', async () => {
    stub.antworten = [{ data: null, error: { code: '42501', message: 'nur-eigene-gruppe' } }]
    saveFsWeek('c1', '2026-02-02', treffpunkte('A'))
    await abgearbeitet()
    expect(konflikte).toBe(1)
    expect(schreibfehler).toBe(0)
  })

  it('ein anderer Fehler bleibt ein Schreibfehler', async () => {
    stub.antworten = [{ data: null, error: { code: '08006', message: 'connection failure' } }]
    saveFsWeek('c1', '2026-02-09', treffpunkte('A'))
    await abgearbeitet()
    expect(schreibfehler).toBe(1)
    expect(konflikte).toBe(0)
  })
})
