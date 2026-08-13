import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T39 — zwei Planer überschreiben sich nicht mehr gegenseitig.
 *
 * `saveWeek` schrieb die **komplette Woche** als JSONB-Upsert, ohne Sperre und
 * ohne Versionskennzeichen. Planen zwei Koordinatoren gleichzeitig, gewinnt
 * schlicht der Letzte: seine Fassung überschreibt die des anderen vollständig
 * und lautlos. Der README behandelt dieses Risiko ausführlich für den
 * **Offline**-Fall — online bestand es unverändert.
 *
 * Jetzt trägt jede Zeile einen Stand (`weeks.updated_at`, von einem Trigger
 * gesetzt). Wer schreibt, nennt den Stand, auf dem seine Fassung beruht; trifft
 * er nicht mehr zu, findet der Schreibvorgang keine Zeile — und statt fremde
 * Arbeit zu überschreiben, meldet sich der Client.
 *
 * **Jeder Test beginnt mit einer eigenen Woche**, deren Stand noch unbekannt
 * ist. Der erste Aufruf legt die Zeile also an und lernt dabei den Stand — das
 * ist zugleich die Reihenfolge, die im Betrieb entsteht.
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

import { saveWeek, setKonfliktMelder, setSchreibfehlerMelder } from './data'
import type { Week } from '../data/types'

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

/**
 * Eine Woche mit Inhalt `range` und der Kennung `start`.
 *
 * Die Kennung bezeichnet seit T66 die Zeile — sie ist das, was hier früher die
 * Positionsnummer war. Jeder Test unten nimmt deshalb sein **eigenes** Datum:
 * Stand und Schreibkette werden je Woche geführt, und zwei Tests, die sich
 * dieselbe teilten, sähen den Stand des jeweils anderen.
 */
const woche = (range: string, start: string): Week => ({
  range,
  book: '',
  start,
  current: false,
  mid: { date: '', end: '', sections: [], helpers: {} },
  we: { date: '', end: '', sections: [], helpers: {} },
})

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
  it('legt die unbekannte Zeile an und merkt sich ihren Stand', async () => {
    stub.antworten = [ok('S1'), ok('S2')]
    saveWeek('c1', woche('erste', '2026-01-05'))
    await abgearbeitet()
    saveWeek('c1', woche('zweite', '2026-01-05'))
    await abgearbeitet()

    expect(stub.aufrufe[0].op).toBe('insert')
    // Der zweite Schreibvorgang ist ein Update MIT Bedingung auf den Stand,
    // den der erste zurückbekam. Ohne die Bedingung wäre es der alte Upsert.
    expect(stub.aufrufe[1].op).toBe('update')
    expect(stub.aufrufe[1].filter.updated_at).toBe('S1')
    expect(konflikte).toBe(0)
  })

  it('zieht den Stand bei jedem Schreibvorgang nach', async () => {
    stub.antworten = [ok('S1'), ok('S2'), ok('S3')]
    for (const r of ['a', 'b', 'c']) {
      saveWeek('c1', woche(r, '2026-01-12'))
      await abgearbeitet()
    }
    expect(stub.aufrufe[1].filter.updated_at).toBe('S1')
    expect(stub.aufrufe[2].filter.updated_at).toBe('S2')
  })

  it('schreibt nichts, was keine Woche bezeichnet', () => {
    // Hier stand bis T66 „schreibt Platzhalter-Wochen nie": Wochen außerhalb
    // des Ladefensters standen als leere Objekte im Array, damit der Index die
    // Datenbank-Position blieb — und hätten beim Speichern die echte Zeile
    // geleert. Die Platzhalter sind weg; geblieben ist die Bedingung dahinter:
    // ohne Kennung gibt es keine Zeile, die gemeint sein könnte.
    saveWeek('c1', woche('ohne Kennung', ''))
    expect(stub.aufrufe).toEqual([])
  })
})

describe('Ein anderer Planer war schneller', () => {
  it('meldet den Konflikt und überschreibt nichts', async () => {
    stub.antworten = [
      ok('S1'), // anlegen
      leer, // geschütztes Update trifft keine Zeile
      ok('FREMD'), // nachgesehen: dort steht ein anderer Stand
    ]
    saveWeek('c1', woche('erste', '2026-01-26'))
    await abgearbeitet()
    saveWeek('c1', woche('meine Fassung', '2026-01-26'))
    await abgearbeitet()

    expect(konflikte).toBe(1)
    expect(schreibfehler).toBe(0)
    // Entscheidend: NACH dem Nachsehen wird nicht doch noch geschrieben.
    expect(stub.aufrufe.filter((a) => a.op === 'update')).toHaveLength(1)
  })

  it('deutet einen Unique-Verstoß beim Anlegen als Konflikt', async () => {
    // Die Zeile existiert längst — wir kannten sie nur nicht. Angelegt hat sie
    // also jemand anders. Als bloßer Schreibfehler gemeldet, bliebe der
    // Bildschirm auf einer Fassung stehen, die es nicht gibt.
    stub.antworten = [{ data: null, error: { code: '23505', message: 'duplicate key' } }]
    saveWeek('c1', woche('erste', '2026-02-02'))
    await abgearbeitet()
    expect(konflikte).toBe(1)
    expect(schreibfehler).toBe(0)
  })
})

describe('Kein falscher Alarm', () => {
  it('schreibt doch, wenn der Stand unverändert dasteht', async () => {
    // Ein FALSCHER Konfliktalarm verwirft die Arbeit des Nutzers — deshalb wird
    // nachgesehen, bevor gemeldet wird. Steht dort noch unser eigener Stand,
    // war niemand schneller; der Filter hat die Zeile aus einem anderen Grund
    // nicht getroffen.
    stub.antworten = [
      ok('S1'), // anlegen
      leer, // geschütztes Update trifft nichts
      ok('S1'), // nachgesehen: unverändert
      ok('S2'), // zweiter Anlauf, ungeschützt
    ]
    saveWeek('c1', woche('erste', '2026-02-09'))
    await abgearbeitet()
    saveWeek('c1', woche('meine Fassung', '2026-02-09'))
    await abgearbeitet()

    expect(konflikte).toBe(0)
    const updates = stub.aufrufe.filter((a) => a.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[1].filter.updated_at).toBeUndefined() // ungeschützt
    expect(updates[1].filter.start).toBe('2026-02-09')

    // Und der neue Stand ist gelernt: der nächste Schreibvorgang nennt S2.
    stub.antworten = [ok('S3')]
    saveWeek('c1', woche('dritte', '2026-02-09'))
    await abgearbeitet()
    expect(stub.aufrufe[stub.aufrufe.length - 1].filter.updated_at).toBe('S2')
  })

  it('zwei rasche Änderungen derselben Woche kämpfen nicht gegeneinander', async () => {
    // Ohne die Serialisierung gingen beide mit demselben Stand los und die
    // zweite meldete einen Konflikt, den es nicht gab — gegen sich selbst.
    stub.antworten = [ok('S1'), ok('S2')]
    saveWeek('c1', woche('erste', '2026-02-16'))
    saveWeek('c1', woche('zweite', '2026-02-16')) // ohne await dazwischen
    await abgearbeitet()
    await abgearbeitet()

    expect(konflikte).toBe(0)
    expect(stub.aufrufe[0].op).toBe('insert')
    expect(stub.aufrufe[1].op).toBe('update')
    expect(stub.aufrufe[1].filter.updated_at).toBe('S1')
  })
})

describe('Echte Schreibfehler bleiben Schreibfehler', () => {
  it('ein Datenbankfehler meldet nicht fälschlich einen Konflikt', async () => {
    stub.antworten = [{ data: null, error: { code: '42501', message: 'RLS' } }]
    saveWeek('c1', woche('erste', '2026-02-23'))
    await abgearbeitet()
    expect(schreibfehler).toBe(1)
    expect(konflikte).toBe(0)
  })
})
