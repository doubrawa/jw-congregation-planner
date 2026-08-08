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

import { loadCongregationData, seedCongregation, WEEK_LIMIT } from './data'
import { buildDemoWeeks } from '../data/demo'

function chainFor(table: string) {
  const resp = (store.responses[table] ?? []).shift() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'gte', 'in', 'is', 'order', 'limit', 'maybeSingle']) {
    chain[m] = () => chain
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resp)
  return chain
}

const personRow = { id: 'p1', fn: 'Anna', ln: 'Beispiel', dn: '', planner: false, role: 'verkuendiger', female: true, tel: '', mail: '', priv: {}, grp: null }
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
    // Zwei Antworten: erst die hoechste Position (Ladefenster), dann die Daten.
    weeks: [
      { data: { position: 0 }, error: null },
      { data: [{ position: 0, data: buildDemoWeeks()[0] }], error: null },
    ],
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

  /**
   * Ladefenster: nur die jüngsten WEEK_LIMIT Wochen kommen aus der Datenbank.
   * Die Positionen bleiben absolut, weil sie in jedem gespeicherten `task_key`
   * stecken („60|mid|part|2|1|0") — würde man die geladenen Wochen bei 0 neu
   * durchnummerieren, zeigten alle bestehenden Bestätigungen auf die falsche
   * Woche. Deshalb stehen davor Platzhalter.
   */
  describe('Ladefenster', () => {
    /** Antworten für eine Versammlung mit `hoechste`+1 Wochen in der Datenbank. */
    const mitWochen = (hoechste: number, geladen: number[]) =>
      seedResponses({
        weeks: [
          { data: { position: hoechste }, error: null },
          { data: geladen.map((position) => ({ position, data: buildDemoWeeks()[0] })), error: null },
        ],
      })

    it('lädt höchstens WEEK_LIMIT Wochen und füllt davor mit Platzhaltern', async () => {
      // 60 Wochen in der DB (Positionen 0..59) → geladen ab 8, davor 8 Platzhalter.
      const ab = 60 - WEEK_LIMIT
      mitWochen(59, Array.from({ length: WEEK_LIMIT }, (_u, i) => ab + i))
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weekFrom).toBe(ab)
      expect(res.data.weeks).toHaveLength(60) // Index = DB-Position, lückenlos
      expect(res.data.weeks.slice(0, ab).every((w) => w.stub)).toBe(true)
      expect(res.data.weeks.slice(ab).some((w) => w.stub)).toBe(false)
    })

    it('bei wenigen Wochen bleibt alles geladen (weekFrom 0)', async () => {
      mitWochen(3, [0, 1, 2, 3])
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weekFrom).toBe(0)
      expect(res.data.weeks.some((w) => w.stub)).toBe(false)
    })

    it('leere Versammlung: keine Wochen, keine Platzhalter', async () => {
      seedResponses({ weeks: [{ data: null, error: null }, { data: [], error: null }] })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weekFrom).toBe(0)
      expect(res.data.weeks).toEqual([])
    })

    /**
     * T35: jede Zeile an ihre eigene Position, nicht der Reihe nach.
     *
     * Vorher wurden die geladenen Zeilen schlicht hintereinander gehängt.
     * Fehlt eine Position — etwa weil ein Schreibvorgang früher stumm
     * fehlschlug (T5) —, rutscht alles dahinter einen Index nach vorn. Der
     * Index **ist** die Position und steckt in jedem `task_key`: sämtliche
     * Bestätigungen zeigten danach auf die Nachbarwoche.
     */
    it('eine fehlende Position verschiebt die folgenden Wochen nicht', async () => {
      mitWochen(3, [0, 1, 3]) // Position 2 fehlt
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks).toHaveLength(4)
      expect(res.data.weeks[2].stub).toBe(true) // die Lücke wird Platzhalter …
      expect(res.data.weeks[3].stub).toBeUndefined() // … und Position 3 bleibt 3
    })

    it('auch eine Lücke am Anfang des Ladefensters bleibt eine Lücke', async () => {
      const ab = 60 - WEEK_LIMIT
      const geladen = Array.from({ length: WEEK_LIMIT }, (_u, i) => ab + i).filter((p) => p !== ab)
      mitWochen(59, geladen)
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks).toHaveLength(60)
      expect(res.data.weeks[ab].stub).toBe(true)
      expect(res.data.weeks[ab + 1].stub).toBeUndefined()
    })
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
