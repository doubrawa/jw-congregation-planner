import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Die Woche eines Planers geht über die Edge Function `zuteilen`** — und
 * nimmt den Konfliktschutz aus T39 mit (Rechte-Stufe „Planer", 4.10.2026).
 *
 * Wochen schreibt laut RLS nur der Admin. Ein Planer teilt zu, und dass er nur
 * zugeteilt hat, prüft die Function am Stand der Datenbank (`nurZuteilungen`).
 * Hier geht es um den Client dahinter (`saveWeek(…, true)` →
 * `zuteilenSchreiben`): Er schickt den Stand, auf dem er gearbeitet hat, lernt
 * den neuen aus der Antwort und schreibt mit ihm weiter — sonst meldete schon
 * die zweite Zuteilung derselben Woche einen Konflikt, den es nicht gibt. Jede
 * Abweisung (409, 403) heißt „hier steht ein anderer Stand als dort" und lädt
 * nach. Bis zum 5.10.2026 prüfte das kein Test; die Proben gegen die Datenbank
 * (`mitgliedsrechte-probe.mjs`) rufen die Function selbst auf.
 *
 * Jeder Test nimmt seine eigene Woche: Stand und Schreibkette werden je Woche
 * geführt (`week-konflikt.test.ts`).
 */

interface Aufruf {
  art: 'invoke' | 'insert' | 'update'
  name?: string
  body?: Record<string, unknown>
  filter: Record<string, unknown>
}

const stub = vi.hoisted(() => ({
  aufrufe: [] as Aufruf[],
  antworten: [] as Array<{ data: unknown; error: unknown }>,
}))

vi.mock('./supabase', () => {
  const kette = () => {
    const aufruf: Aufruf = { art: 'update', filter: {} }
    const c: Record<string, unknown> = {}
    c.insert = () => {
      aufruf.art = 'insert'
      return c
    }
    c.update = () => c
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
  return {
    supabase: {
      from: () => kette(),
      functions: {
        invoke: (name: string, opts: { body: Record<string, unknown> }) => {
          stub.aufrufe.push({ art: 'invoke', name, body: opts.body, filter: {} })
          return Promise.resolve(stub.antworten.shift() ?? { data: null, error: null })
        },
      },
    },
  }
})

import { saveWeek, setKonfliktMelder, setSchreibfehlerMelder } from './data'
import type { Week } from '../data/types'

const woche = (range: string, start: string): Week => ({
  range,
  book: '',
  start,
  mid: { date: '', end: '', sections: [], helpers: {} },
  we: { date: '', end: '', sections: [], helpers: {} },
})

/** Antwort einer getroffenen Zeile (Admin) bzw. der Function (Planer). */
const zeile = (stand: string) => ({ data: { updated_at: stand }, error: null })
const angenommen = (stand: string) => ({ data: { ok: true, stand }, error: null })
const abgewiesen = (status: number) => ({ data: null, error: { message: `Edge Function returned ${status}` } })

/** Auf das Ende der (je Woche serialisierten) Schreibkette warten. */
const abgearbeitet = () => new Promise((r) => setTimeout(r, 0))

let konflikte = 0

beforeEach(() => {
  stub.aufrufe = []
  stub.antworten = []
  konflikte = 0
  setKonfliktMelder(() => {
    konflikte++
  })
  setSchreibfehlerMelder(() => {})
})

/** Die Woche anlegen, wie es der Admin tut — danach ist ihr Stand bekannt. */
async function vomAdminAngelegt(start: string, stand: string): Promise<void> {
  stub.antworten.push(zeile(stand))
  saveWeek('c1', woche('Admin', start))
  await abgearbeitet()
  stub.aufrufe = []
}

describe('Der Planer schreibt über die Function', () => {
  it('schickt Woche, Stand und Inhalt — nicht an die Tabelle vorbei', async () => {
    await vomAdminAngelegt('2026-03-02', 'S1')
    stub.antworten.push(angenommen('S2'))
    const w = woche('zugeteilt', '2026-03-02')
    saveWeek('c1', w, true)
    await abgearbeitet()

    expect(stub.aufrufe).toEqual([
      { art: 'invoke', name: 'zuteilen', body: { action: 'woche', woche: '2026-03-02', stand: 'S1', data: w }, filter: {} },
    ])
    expect(konflikte).toBe(0)
  })

  it('schreibt mit dem neuen Stand weiter — die zweite Zuteilung ist kein Konflikt', async () => {
    await vomAdminAngelegt('2026-03-09', 'S1')
    stub.antworten.push(angenommen('S2'), angenommen('S3'))
    // Zwei Tipps kurz hintereinander: Der zweite wartet auf die Antwort des
    // ersten und nennt deren Stand (`wochenKette`).
    saveWeek('c1', woche('eins', '2026-03-09'), true)
    saveWeek('c1', woche('zwei', '2026-03-09'), true)
    await abgearbeitet()
    await abgearbeitet()

    expect(stub.aufrufe.map((a) => a.body?.stand)).toEqual(['S1', 'S2'])
    expect(konflikte).toBe(0)
  })

  it('schreibt danach der Admin, nennt er den Stand aus der Antwort der Function', async () => {
    await vomAdminAngelegt('2026-03-16', 'S1')
    stub.antworten.push(angenommen('S2'), zeile('S3'))
    saveWeek('c1', woche('Planer', '2026-03-16'), true)
    await abgearbeitet()
    saveWeek('c1', woche('Admin', '2026-03-16'))
    await abgearbeitet()

    expect(stub.aufrufe[1]).toMatchObject({ art: 'update', filter: { updated_at: 'S2' } })
  })

  it.each([409, 403])('eine Abweisung (%i) lädt nach — und der Stand bleibt der alte', async (status) => {
    const start = status === 409 ? '2026-03-23' : '2026-03-30'
    await vomAdminAngelegt(start, 'S1')
    stub.antworten.push(abgewiesen(status), angenommen('S2'))
    saveWeek('c1', woche('abgewiesen', start), true)
    await abgearbeitet()
    expect(konflikte).toBe(1)

    // Ohne Nachladen ginge der nächste Versuch wieder vom alten Stand aus.
    saveWeek('c1', woche('erneut', start), true)
    await abgearbeitet()
    expect(stub.aufrufe.map((a) => a.body?.stand)).toEqual(['S1', 'S1'])
  })

  it('ohne bekannten Stand schreibt er nichts und lädt nach — eine Woche legt nur der Import an', async () => {
    saveWeek('c1', woche('nie geladen', '2026-04-06'), true)
    await abgearbeitet()

    expect(stub.aufrufe).toEqual([])
    expect(konflikte).toBe(1)
  })
})
