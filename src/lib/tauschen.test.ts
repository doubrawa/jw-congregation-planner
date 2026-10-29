import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helferKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import type { Person, Service, Week } from '../data/types'

/**
 * **Tauschen über die Function** (T153): was die App hinschickt, was sie aus
 * der Antwort macht, und welcher Grund aus einer Abweisung wird. Ohne
 * Datenbank (Entwicklerseite) rechnet sie mit denselben Regeln wie der Server.
 */

const store = vi.hoisted(() => ({
  client: null as null | { functions: { invoke: ReturnType<typeof vi.fn> } },
  staende: [] as unknown[],
}))
vi.mock('./supabase', () => ({
  get supabase() {
    return store.client
  },
}))
vi.mock('./data', () => ({
  ladungJetzt: () => 7,
  tauschStaendeUebernehmen: (staende: unknown[], geladen: number) => store.staende.push({ staende, geladen }),
}))

import { tauschAblehnen, tauschAngebote, tauschAnfragen, tauschAnnehmen, type TauschBestand, tauschZurueckziehen } from './tauschen'

const W1 = '2026-09-07' // Sonntag 13.9.
const W2 = '2026-09-14' // Sonntag 20.9.
const A = helferKey(W1, 'we', 'mik', 0)
const B = helferKey(W2, 'we', 'mik', 0)
const HEUTE = '2026-09-07'

const person = (id: string, fn: string, ln: string): Person =>
  ({ id, fn, ln, role: 'verkuendiger', female: false, mail: '', priv: { 'svc:mik': true } }) as unknown as Person
const woche = (start: string, name: string, pid: string): Week =>
  ({
    range: '', book: '', start,
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: { mik: [{ name, pid }] } },
  }) as Week

const BESTAND: TauschBestand = {
  weeks: [woche(W1, 'Simon Krüger', 'p-simon'), woche(W2, 'Jonas Berger', 'p-jonas')],
  services: [{ key: 'mik', name: 'Mikrofone', count: 1 } as Service],
  persons: [person('p-simon', 'Simon', 'Krüger'), person('p-jonas', 'Jonas', 'Berger')],
  absences: [],
  sentLog: { [`${A} Simon Krüger`]: 'x', [`${B} Jonas Berger`]: 'x' },
  zeiten: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } },
  ich: 'p-simon',
  heute: HEUTE,
}

/** Eine Abweisung der Function, wie supabase-js sie meldet: der Grund hinter `context`. */
const abweisung = (body: unknown) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => body } },
})

beforeEach(() => {
  store.client = null
  store.staende = []
})

describe('Mit Datenbank', () => {
  const invoke = vi.fn()
  beforeEach(() => {
    invoke.mockReset()
    store.client = { functions: { invoke } }
  })

  it('die Angebote kommen vom Server — mit dem Tag des Geräts', async () => {
    invoke.mockResolvedValue({ data: { ok: true, angebote: [{ nimmt: B, personId: 'p-jonas' }] }, error: null })
    expect(await tauschAngebote(A, BESTAND)).toEqual({ ok: true, wert: [{ nimmt: B, personId: 'p-jonas' }] })
    expect(invoke).toHaveBeenCalledWith('tauschen', { body: { aktion: 'angebote', gibtAb: A, heute: HEUTE } })
  })

  it('die Anfrage, wie der Server sie anlegte, in der Form des Zustands', async () => {
    const zeile = { id: 'a1', von_user: 'u1', von_person: 'p-simon', an_person: 'p-jonas', gibt_ab: A, nimmt: B, bis: '2026-09-13' }
    invoke.mockResolvedValue({ data: { ok: true, anfrage: zeile }, error: null })
    expect(await tauschAnfragen(A, { nimmt: B, personId: 'p-jonas' }, BESTAND)).toEqual({
      ok: true,
      wert: { id: 'a1', von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13' },
    })
    expect(invoke).toHaveBeenCalledWith('tauschen', { body: { aktion: 'anfragen', gibtAb: A, nimmt: B, heute: HEUTE } })
  })

  it('nach dem Tausch übernimmt die App die Stände beider Wochen — aus der Ladung, aus der sie fragte', async () => {
    const wochen = [{ woche: W1, vorher: 's1', stand: 's1+' }, { woche: W2, vorher: 's2', stand: 's2+' }]
    invoke.mockResolvedValue({ data: { ok: true, wochen }, error: null })
    expect(await tauschAnnehmen('a1', HEUTE)).toEqual({ ok: true, wert: undefined })
    expect(invoke).toHaveBeenCalledWith('tauschen', { body: { aktion: 'annehmen', id: 'a1', heute: HEUTE } })
    expect(store.staende).toEqual([{ staende: wochen, geladen: 7 }])
  })

  it('ablehnen und zurückziehen nennen nur die Anfrage', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await tauschAblehnen('a1')
    await tauschZurueckziehen('a2')
    expect(invoke.mock.calls.map((c) => c[1])).toEqual([{ body: { aktion: 'ablehnen', id: 'a1' } }, { body: { aktion: 'zurueckziehen', id: 'a2' } }])
  })

  it('aus der Abweisung wird ihr Grund — was die App nicht unterscheidet, heißt „geändert"', async () => {
    invoke.mockResolvedValueOnce(abweisung({ error: 'gone' }))
    expect(await tauschAblehnen('a1')).toEqual({ ok: false, fehler: 'gone' })
    invoke.mockResolvedValueOnce(abweisung({ error: 'already-asked' }))
    expect(await tauschAnfragen(A, { nimmt: B, personId: 'p-jonas' }, BESTAND)).toEqual({ ok: false, fehler: 'already-asked' })
    invoke.mockResolvedValueOnce(abweisung({ error: 'busy' }))
    expect(await tauschAnnehmen('a1', HEUTE)).toEqual({ ok: false, fehler: 'stand' })
    expect(store.staende).toEqual([])
  })

  it('ohne lesbare Antwort fehlt das Netz', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    expect(await tauschAngebote(A, BESTAND)).toEqual({ ok: false, fehler: 'netz' })
    err.mockRestore()
  })
})

describe('Ohne Datenbank (Entwicklerseite)', () => {
  it('die Angebote rechnet die App nach den Regeln des Servers', async () => {
    expect(await tauschAngebote(A, BESTAND)).toEqual({ ok: true, wert: [{ nimmt: B, personId: 'p-jonas' }] })
    expect(await tauschAngebote(A, { ...BESTAND, ich: 'p-jonas' })).toEqual({ ok: true, wert: [] })
  })

  it('die Anfrage gilt bis zum früheren der beiden Tage — dem Tag der Zusammenkunft, nicht dem Montag', async () => {
    const erg = await tauschAnfragen(A, { nimmt: B, personId: 'p-jonas' }, BESTAND)
    expect(erg).toMatchObject({ ok: true, wert: { von: 'p-simon', an: 'p-jonas', gibtAb: A, nimmt: B, bis: '2026-09-13' } })
  })

  it('was nach den Regeln nicht geht, nimmt sie auch hier nicht an', async () => {
    expect(await tauschAnfragen(A, { nimmt: B, personId: 'p-jonas' }, { ...BESTAND, ich: 'p-jonas' })).toEqual({ ok: false, fehler: 'stand' })
  })

  it('die übrigen Schritte gelten als angenommen', async () => {
    expect(await tauschAnnehmen('a1', HEUTE)).toEqual({ ok: true, wert: undefined })
    expect(await tauschAblehnen('a1')).toEqual({ ok: true, wert: undefined })
    expect(await tauschZurueckziehen('a1')).toEqual({ ok: true, wert: undefined })
  })
})
