import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Supabase-Stub mit einer FIFO-Antwort-Warteschlange je Tabelle: `from(table)`
 * liefert eine verkettbare Query, deren `await` die nächste für diese Tabelle
 * hinterlegte Antwort auflöst. „members" wird zweimal abgefragt (einmal
 * maybeSingle, einmal als Liste) → zwei Einträge in Reihenfolge.
 */
const store = vi.hoisted(() => ({
  responses: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
  /** Mitgeschriebene Filter: `[Tabelle, Methode, Spalte, Wert]`. */
  filter: [] as Array<[string, string, string, unknown]>,
}))
const fromMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({
  supabase: { from: fromMock },
}))

import { loadCongregationData, WEEK_LIMIT } from './data'
import { buildDemoWeeks } from '../data/testdaten'

function chainFor(table: string) {
  const resp = (store.responses[table] ?? []).shift() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'in', 'is', 'order', 'maybeSingle']) {
    chain[m] = () => chain
  }
  // Die Obergrenze wird mitgeschrieben: das Ladefenster steckt jetzt in ihr
  // (und in der Sortierung), nicht mehr in einem `gte` aus einer Vorabfrage.
  chain.limit = (wert: unknown) => {
    store.filter.push([table, 'limit', '', wert])
    return chain
  }
  // Filter werden mitgeschrieben: seit T66 steckt im `gte` das Ladefenster, und
  // ohne diese Aufzeichnung wäre es von außen nicht mehr zu sehen.
  for (const m of ['eq', 'gte']) {
    chain[m] = (spalte: string, wert: unknown) => {
      store.filter.push([table, m, spalte, wert])
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resp)
  return chain
}

/** Obergrenze, mit der `table` abgefragt wurde (undefined: keine). */
const grenze = (table: string): unknown =>
  store.filter.find(([t, m]) => t === table && m === 'limit')?.[3]

/** Wert des `gte`-Filters, mit dem `table` abgefragt wurde (undefined: keiner). */
const fenster = (table: string): unknown =>
  store.filter.find(([t, m]) => t === table && m === 'gte')?.[3]

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
    // Eine Antwort: das Ladefenster braucht keine Vorabfrage mehr, die
    // Datumsgrenze ergibt sich aus der jüngsten Zeile des Ergebnisses.
    weeks: [{ data: [{ start: '2026-09-07', data: buildDemoWeeks()[0] }], error: null }],
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
  store.filter = []
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
   *
   * Gemessen wird seit T66 am **Datum**. Bis dahin lief es über die Position,
   * und weil die zugleich Kennung war und in jedem `task_key` steckte
   * („60|mid|part|2|1|0"), mussten die Indizes absolut bleiben: vor der ersten
   * geladenen Woche standen Platzhalter, damit sich nichts verschob. Beides ist
   * weg — die Wochen reihen sich nach Datum, und der Index sagt nur noch, was
   * vor was kommt.
   */
  describe('Ladefenster', () => {
    /** Montag `n` Wochen nach dem 5. Januar 2026. */
    const montag = (n: number): string =>
      new Date(Date.UTC(2026, 0, 5) + n * 7 * 864e5).toISOString().slice(0, 10)

    /**
     * Antworten für eine Versammlung mit diesen Wochen (hier aufsteigend
     * genannt, weil sich das so liest).
     *
     * Die Datenbank liefert **absteigend** und höchstens `WEEK_LIMIT` Zeilen —
     * genau das stellt der Stub nach. Sonst prüfte der Test eine Reihenfolge,
     * die es so nie gibt.
     */
    const mitWochen = (geladen: string[]) =>
      seedResponses({
        weeks: [
          {
            data: [...geladen]
              .reverse()
              .slice(0, WEEK_LIMIT)
              .map((start) => ({ start, data: buildDemoWeeks()[0] })),
            error: null,
          },
        ],
      })

    /*
      Bis hierher wurde der Anker (`max(start)`) in einer eigenen Abfrage
      **vor** allen anderen geholt — eine volle Netzrunde, bevor überhaupt
      etwas geladen wurde, und das bei jeder Anmeldung, jedem SIGNED_IN und
      jedem Konflikt-Neuladen. Zwei Proben halten fest, dass sie weg ist:
      nichts wird mehr vor dem Bündel gefragt, und die Datumsgrenze ist kein
      Abfrageparameter mehr, sondern wird am Ergebnis angelegt.
    */
    it('kommt mit einer einzigen Antwort je Wochentabelle aus', async () => {
      // Der Stub gibt jede hinterlegte Antwort genau einmal heraus. Käme die
      // Ankerabfrage zurück, äße sie diese eine Antwort auf und für das
      // eigentliche Laden bliebe nichts — die Wochen kämen leer an.
      mitWochen([montag(0), montag(1)])
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks.map((w) => w.start)).toEqual([montag(0), montag(1)])
    })

    it('setzt die Datumsgrenze nicht mehr als Abfragefilter', async () => {
      mitWochen([montag(0), montag(1)])
      await loadCongregationData('u1')
      expect(fenster('weeks')).toBeUndefined()
      expect(fenster('fs_weeks')).toBeUndefined()
    })

    it('holt höchstens WEEK_LIMIT Wochen — auch die Treffpunkte', async () => {
      mitWochen([montag(0)])
      await loadCongregationData('u1')
      expect(grenze('weeks')).toBe(WEEK_LIMIT)
      // Dieselbe Grenze für die Treffpunkte — sonst hätte eine Woche ihre
      // Zusammenkunft ohne ihre Treffpunkte oder umgekehrt.
      expect(grenze('fs_weeks')).toBe(WEEK_LIMIT)
    })

    /*
      Das Fenster misst am Datum, nicht an der Zeilenzahl. Fiele eine Kennung
      je auf einen anderen Wochentag als Montag, kämen mehr Zeilen in denselben
      Zeitraum — was älter ist als der Montag WEEK_LIMIT-1 Wochen vor der
      jüngsten, gehört trotzdem nicht dazu.
    */
    it('schneidet ab, was älter ist als WEEK_LIMIT-1 Wochen vor der jüngsten', async () => {
      seedResponses({
        weeks: [
          {
            data: [montag(59), montag(59 - (WEEK_LIMIT - 1)), montag(59 - WEEK_LIMIT)].map(
              (start) => ({ start, data: buildDemoWeeks()[0] }),
            ),
            error: null,
          },
        ],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks.map((w) => w.start)).toEqual([
        montag(59 - (WEEK_LIMIT - 1)),
        montag(59),
      ])
    })

    it('reicht genau so weit zurück wie die Wochen, die es gibt', async () => {
      mitWochen([montag(0), montag(1), montag(2), montag(3)])
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks).toHaveLength(4)
      expect(res.data.weeks.map((w) => w.start)).toEqual([montag(0), montag(1), montag(2), montag(3)])
    })

    it('leere Versammlung: keine Wochen und gar kein Fenster', async () => {
      // Ohne jüngste Woche gibt es keine Untergrenze zu rechnen — und nichts,
      // worauf sie sich beziehen könnte.
      seedResponses({ weeks: [{ data: [], error: null }] })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks).toEqual([])
    })

    /**
     * Der Fall, um dessentwillen T66 überhaupt gebaut wurde (T65: im Arbeitsheft
     * fehlt die Woche des Gedächtnismahls). Früher wurde die Lücke zum
     * Platzhalter, damit die Zählung stimmte — jede Einfügung dahinter
     * verschob sämtliche Bestätigungen. Jetzt ist eine fehlende Woche einfach
     * eine fehlende Woche.
     */
    it('eine fehlende Woche wird nicht aufgefüllt', async () => {
      mitWochen([montag(0), montag(1), montag(3)])
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks.map((w) => w.start)).toEqual([montag(0), montag(1), montag(3)])
    })

    /**
     * Die Kennung kommt aus der **Spalte**. `data->>'start'` gab es erst ab
     * migration-017; bei älteren Zeilen steht im Blob nichts, und eine Woche
     * ohne Kennung ließe sich weder speichern noch wiederfinden.
     */
    it('nimmt das Datum aus der Spalte, nicht aus dem Blob', async () => {
      const ohneStart = { ...buildDemoWeeks()[0], start: undefined }
      seedResponses({
        weeks: [{ data: [{ start: montag(0), data: ohneStart }], error: null }],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks[0]?.start).toBe(montag(0))
    })

    /** Treffpunkte hängen an der Kennung ihrer Woche, nicht an der Zeilenfolge. */
    it('ordnet die Treffpunkte über das Datum zu', async () => {
      const inst = [{ id: 'i1', grp: '', wd: 3, time: '14:00', place: 'Saal', leader: 'Max' }]
      mitWochen([montag(0), montag(1), montag(2)])
      store.responses.fs_weeks = [{ data: [{ start: montag(2), data: inst }], error: null }]
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.fsWeeks[0]).toEqual([])
      expect(res.data.fsWeeks[2]).toEqual(inst)
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

/*
  `seedCongregation` stand hier bis zum 13. August 2026 und schrieb den
  Demo-Datensatz in eine leere Versammlung — Personen, Dienste, Gruppen und
  **vier erfundene Wochen**, die der Planer erst wegräumen musste.

  Eine Versammlung legt jetzt der Administrator an
  (`scripts/versammlung-anlegen.mjs`): einen Planer, die Standard-Dienste, und
  keine einzige Woche. Die erste holt der Planer über den Import — mit echtem
  Programm statt erfundenem.
*/
