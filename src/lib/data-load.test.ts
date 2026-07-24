import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Supabase-Stub mit einer FIFO-Antwort-Warteschlange je Tabelle: `from(table)`
 * liefert eine verkettbare Query, deren `await` die nächste für diese Tabelle
 * hinterlegte Antwort auflöst. „members" wird zweimal abgefragt (einmal
 * maybeSingle, einmal als Liste) → zwei Einträge in Reihenfolge.
 */
const store = vi.hoisted(() => ({ responses: {} as Record<string, Array<{ data: unknown; error: unknown }>> }))
const fromMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({
  supabase: { from: fromMock },
}))

import { loadCongregationData, seedCongregation } from './data'
import { buildDemoWeeks } from '../data/demo'

function chainFor(table: string) {
  const resp = (store.responses[table] ?? []).shift() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle']) {
    chain[m] = () => chain
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resp)
  return chain
}

const personRow = { id: 'p1', fn: 'Anna', ln: 'Beispiel', dn: '', planner: false, role: 'verkuendiger', female: true, tel: '', mail: '', absent: [], priv: {}, grp: null }
const serviceRow = { key: 'mik', name: 'Mikrofone', count: 2, priv: null, groups: false, position: 0 }
const groupRow = { id: 'g1', name: 'Gruppe 1', overseer_id: null, assistant_id: null, position: 0 }

/** Alle Tabellen mit „normalen" Antworten füllen; einzelne per Argument überschreiben. */
function seedResponses(over: Partial<Record<string, Array<{ data: unknown; error: unknown }>>> = {}) {
  store.responses = {
    members: [
      { data: { congregation_id: 'c1', person_id: 'p9', planner: true }, error: null },
      { data: [{ user_id: 'u1', person_id: 'p9', planner: true, email: 'a@b' }], error: null },
    ],
    congregations: [{ data: { name: 'Krumbach', hall: 'H', meeting_times: 'M', settings: { congLang: 'Deutsch', progLangs: ['Englisch'] } }, error: null }],
    persons: [{ data: [personRow], error: null }],
    services: [{ data: [serviceRow], error: null }],
    groups: [{ data: [groupRow], error: null }],
    weeks: [{ data: [{ position: 0, data: buildDemoWeeks()[0] }], error: null }],
    absences: [{ data: [], error: null }],
    notifications: [{ data: [], error: null }],
    confirmations: [{ data: [{ task_key: 'k1', status: 'bestätigt' }], error: null }],
    invites: [{ data: [], error: null }],
    fs_rules: [{ data: { base: '2026-09-07', rules: [] }, error: null }],
    fs_weeks: [{ data: [], error: null }],
    ...over,
  }
}

beforeEach(() => {
  fromMock.mockReset()
  fromMock.mockImplementation(chainFor)
  store.responses = {}
})

describe('loadCongregationData', () => {
  it('lädt und mappt die Versammlungsdaten des Nutzers', async () => {
    seedResponses()
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.congregationId).toBe('c1')
    expect(res.userId).toBe('u1')
    expect(res.data.congregation.name).toBe('Krumbach')
    expect(res.data.persons.map((p) => p.fn)).toContain('Anna')
    expect(res.data.services[0].key).toBe('mik')
    expect(res.data.weeks).toHaveLength(1)
    expect(res.data.congLang).toBe('Deutsch')
    expect(res.data.progLangs).toEqual(['Englisch'])
    expect(res.data.confirmations['k1']).toBe('bestätigt')
    expect(res.empty).toBe(false)
  })

  it('ohne Mitgliedschaft → no-membership', async () => {
    seedResponses({ members: [{ data: null, error: null }] })
    const res = await loadCongregationData('u1')
    expect(res).toEqual({ ok: false, reason: 'no-membership' })
  })

  it('Fehler bei der Mitglieds-Abfrage → error', async () => {
    seedResponses({ members: [{ data: null, error: { message: 'boom' } }] })
    const res = await loadCongregationData('u1')
    expect(res).toMatchObject({ ok: false, reason: 'error', message: 'boom' })
  })

  it('Fehler bei einer Daten-Abfrage → error', async () => {
    seedResponses({ persons: [{ data: null, error: { message: 'persons kaputt' } }] })
    const res = await loadCongregationData('u1')
    expect(res).toMatchObject({ ok: false, reason: 'error', message: 'persons kaputt' })
  })

  it('leere Versammlung (keine Personen/Wochen) → empty', async () => {
    seedResponses({ persons: [{ data: [], error: null }], weeks: [{ data: [], error: null }] })
    const res = await loadCongregationData('u1')
    expect(res.ok && res.empty).toBe(true)
  })
})

describe('seedCongregation', () => {
  it('schreibt Personen, dann Dienste/Gruppen/Wochen; null bei Erfolg', async () => {
    store.responses = {
      persons: [{ data: null, error: null }],
      services: [{ data: null, error: null }],
      groups: [{ data: null, error: null }],
      weeks: [{ data: null, error: null }],
    }
    expect(await seedCongregation('c1')).toBeNull()
    const tables = fromMock.mock.calls.map((c) => c[0])
    expect(tables).toEqual(expect.arrayContaining(['persons', 'services', 'groups', 'weeks']))
  })

  it('gibt die Fehlermeldung zurück, wenn das Personen-Insert scheitert', async () => {
    store.responses = { persons: [{ data: null, error: { message: 'FK-Verletzung' } }] }
    expect(await seedCongregation('c1')).toBe('FK-Verletzung')
  })
})
