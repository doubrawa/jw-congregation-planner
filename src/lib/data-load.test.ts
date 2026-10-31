import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Supabase-Stub mit einer FIFO-Antwort-Warteschlange je Tabelle: `from(table)`
 * liefert eine verkettbare Query, deren `await` die nächste für diese Tabelle
 * hinterlegte Antwort auflöst. „members" wird zweimal abgefragt (einmal
 * maybeSingle, einmal als Liste) → zwei Einträge in Reihenfolge.
 */
const store = vi.hoisted(() => ({
  /** Je Tabelle die Antworten in Reihenfolge; `count` nur bei Seiten-Abfragen (`count: 'exact'`). */
  responses: {} as Record<string, Array<{ data: unknown; error: unknown; count?: number }>>,
  /** Mitgeschriebene Filter: `[Tabelle, Methode, Spalte, Wert]`. */
  filter: [] as Array<[string, string, string, unknown]>,
}))
const fromMock = vi.hoisted(() => vi.fn())
/** Die Datenbank-Funktionen: je Name eine Warteschlange wie bei den Tabellen, unter `rpc/<name>`. */
const rpcMock = vi.hoisted(() => vi.fn())
/** Die Edge Functions — nur für die Fälle, in denen eine Function die Woche schreibt. */
const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({
  supabase: { from: fromMock, rpc: rpcMock, functions: { invoke: invokeMock } },
}))

import {
  ABWESENHEIT_SPALTEN,
  loadCongregationData,
  loadNotifications,
  PERSON_SPALTEN,
  platzFuellen,
  saveFsWeek,
  saveWeek,
  SENT_LOG_LIMIT,
  setKonfliktMelder,
  substituteTake,
  wocheGeschrieben,
} from './data'
import { aufbewahrtAb, VERTEILUNG_WOCHEN } from '../data/aufbewahrung'
import type { Week } from '../data/types'
import { STANDARD_ERINNERUNGEN, STANDARD_ZEITEN } from '../data/vorgaben'
import { buildDemoWeeks } from '../../tests/testdaten/testdaten'

function chainFor(table: string) {
  const resp = (store.responses[table] ?? []).shift() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['insert', 'upsert', 'update', 'delete', 'in', 'is', 'order', 'maybeSingle']) {
    chain[m] = () => chain
  }
  // Die Spalten werden mitgeschrieben: Fehlt eine, liefert die Datenbank sie
  // nicht — der Stub hier schon, und der Fehler bliebe unsichtbar.
  chain.select = (spalten: unknown) => {
    store.filter.push([table, 'select', String(spalten), ''])
    return chain
  }
  // Die Obergrenze wird mitgeschrieben: Das Tagebuch kappt bei den jüngsten.
  chain.limit = (wert: unknown) => {
    store.filter.push([table, 'limit', '', wert])
    return chain
  }
  // Ebenso die Seiten: Wachsende Tabellen kommen seitenweise (`alleSeiten`).
  chain.range = (von: number, bis: number) => {
    store.filter.push([table, 'range', '', [von, bis]])
    return chain
  }
  // Filter werden mitgeschrieben: Im `gte` steckt das Ladefenster (T125), und
  // ohne diese Aufzeichnung wäre es von außen nicht zu sehen.
  for (const m of ['eq', 'gte']) {
    chain[m] = (spalte: string, wert: unknown) => {
      store.filter.push([table, m, spalte, wert])
      return chain
    }
  }
  // Und wann die Antwort abgeholt wird: Daran lässt sich sehen, ob die Seiten
  // nacheinander oder gleichzeitig hinausgehen.
  chain.then = (resolve: (v: unknown) => void) => {
    store.filter.push([table, 'then', '', null])
    resolve(resp)
  }
  return chain
}

/** Ein Funktionsaufruf: die nächste hinterlegte Antwort, sonst eine leere Liste. Mitgeschrieben als `rpc/<name>`. */
function rpcFor(name: string) {
  store.filter.push([`rpc/${name}`, 'rpc', '', null])
  return Promise.resolve((store.responses[`rpc/${name}`] ?? []).shift() ?? { data: [], error: null })
}

/** Obergrenze, mit der `table` abgefragt wurde (undefined: keine). */
const grenze = (table: string): unknown =>
  store.filter.find(([t, m]) => t === table && m === 'limit')?.[3]

const personRow = { id: 'p1', fn: 'Anna', ln: 'Beispiel', planner: false, role: 'verkuendiger', female: true, priv: {}, grp: null }
const serviceRow = { key: 'mik', name: 'Mikrofone', count: 2, priv: null, groups: false, position: 0 }
const groupRow = { id: 'g1', name: 'Gruppe 1', overseer_id: null, assistant_id: null, position: 0, ohne_reinigung: false }

/** Alle Tabellen mit „normalen" Antworten füllen; einzelne per Argument überschreiben. */
function seedResponses(over: Partial<Record<string, Array<{ data: unknown; error: unknown; count?: number }>>> = {}) {
  store.responses = {
    members: [
      { data: { congregation_id: 'c1', person_id: 'p9', planner: true }, error: null },
      { data: [{ user_id: 'u1', person_id: 'p9', planner: true, email: 'a@b' }], error: null },
    ],
    congregations: [{ data: { name: 'Krumbach', hall: 'H', mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00', reminder_first: 7, reminder_last: 1, reminder_repeat: false, cong_lang: 'de', prog_langs: ['en'], aux_class: false }, error: null }],
    persons: [{ data: [personRow], error: null }],
    services: [{ data: [serviceRow], error: null }],
    groups: [{ data: [groupRow], error: null }],
    // Eine Antwort: das Ladefenster braucht keine Vorabfrage mehr, die
    // Datumsgrenze ergibt sich aus der jüngsten Zeile des Ergebnisses.
    weeks: [{ data: [{ start: '2026-09-07', data: buildDemoWeeks()[0] }], error: null }],
    absences: [{ data: [], error: null }],
    notifications: [{ data: [], error: null }],
    confirmations: [{ data: [{ task_key: 'k1', status: 'bestätigt' }], error: null }],
    anmelde_links: [{ data: [], error: null }],
    fs_rules: [{ data: [], error: null }],
    fs_weeks: [{ data: [], error: null }],
    ...over,
  }
}

beforeEach(() => {
  fromMock.mockReset()
  fromMock.mockImplementation(chainFor)
  rpcMock.mockReset()
  rpcMock.mockImplementation(rpcFor)
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
    expect(res.data.services[0]!.key).toBe('mik')
    expect(res.data.weeks).toHaveLength(1)
    // Spalte und Zustand führen denselben Wert: den jw.org-Code. Angezeigt
    // wird der Name erst beim Rendern (`langLabel`), in der Bediensprache.
    expect(res.data.congLang).toBe('de')
    expect(res.data.progLangs).toEqual(['en'])
    expect(res.data.confirmations['k1']).toBe('bestätigt')
    expect(res.empty).toBe(false)
  })

  it('eine aus der Reinigung genommene Gruppe kommt so an — eine, die reinigt, ohne Vermerk (18.10.2026)', async () => {
    seedResponses({
      groups: [{ data: [{ ...groupRow, ohne_reinigung: true }, { ...groupRow, id: 'g2', name: 'Gruppe 2' }], error: null }],
    })
    const res = await loadCongregationData('u1')
    if (!res.ok) throw new Error('nicht geladen')
    expect(res.data.groups.map((g) => g.ohneReinigung)).toEqual([true, undefined])
  })

  /**
   * **Seitenweise, was wächst** (14.10.2026). PostgREST liefert je Abfrage
   * höchstens `max-rows` Zeilen (gehostet 1000) — still, ohne Fehler. Die
   * Zusagen wachsen ohne Grenze: Ohne Seiten fiel nach gut einem halben Jahr
   * ein beliebiger Teil weg, und ein bestätigter Platz stand wieder als offen
   * da. Das Tagebuch sollte bis `SENT_LOG_LIMIT` bringen und brachte nie mehr
   * als die Grenze.
   */
  describe('Seitenweise', () => {
    /** Die Seiten, mit denen `table` abgefragt wurde. */
    const seiten = (table: string): unknown[] =>
      store.filter.filter(([t, m]) => t === table && m === 'range').map(([, , , wert]) => wert)

    it('die Zusagen kommen über die Zeilengrenze hinweg vollständig an', async () => {
      seedResponses({
        confirmations: [
          { data: [{ task_key: 'k1', status: 'bestätigt' }], error: null, count: 2 },
          { data: [{ task_key: 'k2', status: 'verhindert' }], error: null, count: 2 },
        ],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.confirmations).toEqual({ k1: 'bestätigt', k2: 'verhindert' })
      // Die zweite Seite beginnt hinter dem, was die erste wirklich brachte —
      // auch wenn die Grenze kleiner ist als die erbetene Seite.
      expect(seiten('confirmations')).toEqual([[0, 999], [1, 1000]])
    })

    it('scheitert eine spätere Seite der Zusagen, lädt die App nicht — statt einen bestätigten Platz als offen zu zeigen', async () => {
      // Die Gegenprobe steht darüber: Gehen beide Seiten durch, kommt alles an.
      seedResponses({
        confirmations: [
          { data: [{ task_key: 'k1', status: 'bestätigt' }], error: null, count: 2 },
          { data: null, error: { message: 'Seite 2 abgebrochen' } },
        ],
      })
      expect(await loadCongregationData('u1')).toEqual({ ok: false, reason: 'error', message: 'Seite 2 abgebrochen' })
    })

    it('ist alles da, folgt keine zweite Abfrage', async () => {
      seedResponses()
      await loadCongregationData('u1')
      expect(seiten('confirmations')).toEqual([[0, 999]])
    })

    it('die weiteren Seiten gehen gleichzeitig hinaus, nicht eine nach der anderen (Review App #5)', async () => {
      // Nacheinander kostete jede Seite eine volle Netzrunde mehr bis zum
      // ersten Bild — bei einem Jahr Zusagen drei.
      const zusagen = (von: number) =>
        Array.from({ length: 1000 }, (_, i) => ({ task_key: `k${von + i}`, status: 'bestätigt' }))
      seedResponses({
        confirmations: [
          { data: zusagen(0), error: null, count: 2500 },
          { data: zusagen(1000), error: null, count: 2500 },
          { data: zusagen(2000).slice(0, 500), error: null, count: 2500 },
        ],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok && Object.keys(res.data.confirmations)).toHaveLength(2500)
      const ablauf = store.filter
        .filter(([t, m]) => t === 'confirmations' && (m === 'range' || m === 'then'))
        .map(([, m, , wert]) => (m === 'range' ? `range ${(wert as [number, number])[0]}` : 'then'))
      expect(ablauf).toEqual(['range 0', 'then', 'range 1000', 'range 2000', 'then', 'then'])
    })

    it('der Stand jeder geladenen Treffpunkt-Woche geht beim Schreiben mit (15.10.2026)', async () => {
      // Ohne ihn schrieb `saveFsWeek` als Upsert und nahm zurück, was ein
      // anderer inzwischen an derselben Woche geändert hatte.
      seedResponses({
        fs_weeks: [
          { data: [{ start: '2026-09-07', data: [], updated_at: 'F7' }], error: null },
          { data: { updated_at: 'F8' }, error: null },
        ],
      })
      await loadCongregationData('u1')
      store.filter = []
      saveFsWeek('c1', '2026-09-07', [])
      await new Promise((r) => setTimeout(r, 0))
      expect(store.filter).toContainEqual(['fs_weeks', 'eq', 'updated_at', 'F7'])
    })

    it('auch Abwesenheiten und Plan-Einträge kommen seitenweise', async () => {
      seedResponses({
        absences: [
          { data: [{ id: 'a1', person_id: 'p1', user_id: null, from_date: '2026-09-01', to_date: '2026-09-02', reason: '' }], error: null, count: 2 },
          { data: [{ id: 'a2', person_id: 'p1', user_id: null, from_date: '2026-10-01', to_date: '2026-10-02', reason: '' }], error: null, count: 2 },
        ],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.absences.map((a) => a.id)).toEqual(['a1', 'a2'])
      expect(seiten('absences')).toEqual([[0, 999], [1, 1000]])
      expect(seiten('plan_eintraege')).toEqual([[0, 999]])
    })

    it('die Absagen kommen seitenweise und zeigen auf ihre Person (T126)', async () => {
      seedResponses({
        absagen: [
          { data: [{ person_id: 'p1', task_key: '2026-09-07|mid|part|k1|0' }], error: null, count: 2 },
          { data: [{ person_id: 'p9', task_key: 'fs|2026-09-14|i1' }], error: null, count: 2 },
        ],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.absagen).toEqual([
        { personId: 'p1', taskKey: '2026-09-07|mid|part|k1|0' },
        { personId: 'p9', taskKey: 'fs|2026-09-14|i1' },
      ])
      expect(seiten('absagen')).toEqual([[0, 999], [1, 1000]])
    })

    it('ohne Absagen-Tabelle (noch nicht ausgerollt) lädt der Rest trotzdem', async () => {
      // Die Absagen sind nur für die Auswertung — ein Fehler dort darf die
      // Planung nicht aufhalten.
      seedResponses({ absagen: [{ data: null, error: { message: 'relation "public.absagen" does not exist' } }] })
      const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.absagen).toEqual([])
      expect(fehler).toHaveBeenCalledWith('[absagen]', 'relation "public.absagen" does not exist')
      fehler.mockRestore()
    })

    it('das Tagebuch kommt bis SENT_LOG_LIMIT, nicht weiter', async () => {
      const zeilen = (n: number) =>
        Array.from({ length: n }, (_, i) => ({ task_key: `k${i}`, name: 'N', sent_at: '2026-09-01T10:00:00Z', user_id: null, persoenlich_at: null }))
      seedResponses({
        assignment_log: [
          { data: zeilen(1000), error: null, count: 5000 },
          { data: zeilen(1000), error: null, count: 5000 },
          { data: zeilen(1000), error: null, count: 5000 },
          { data: zeilen(SENT_LOG_LIMIT - 3000), error: null, count: 5000 },
        ],
      })
      await loadCongregationData('u1')
      expect(seiten('assignment_log')).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, SENT_LOG_LIMIT - 1]])
    })
  })

  /**
   * **Ladefenster** (T125, 16.10.2026): Die Wochen kommen ab dem Montag vor
   * einem Jahr, gezählt vom heutigen — dieselbe Frist, nach der die Datenbank
   * aufräumt (`aufbewahrung.ts`). Bis dahin waren es die jüngsten 52 Wochen.
   *
   * Gemessen wird seit T66 am **Datum**. Bis dahin lief es über die Position,
   * und weil die zugleich Kennung war und in jedem `task_key` steckte
   * („60|mid|part|2|1|0"), mussten die Indizes absolut bleiben: vor der ersten
   * geladenen Woche standen Platzhalter, damit sich nichts verschob. Beides ist
   * weg — die Wochen reihen sich nach Datum, und der Index sagt nur noch, was
   * vor was kommt.
   */
  describe('Ladefenster', () => {
    /** Heute im Test: Montag, 2. März 2026 — `montag(8)`. */
    const HEUTE = new Date(2026, 2, 2, 9, 0)
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(HEUTE)
    })
    afterEach(() => vi.useRealTimers())

    /** Montag `n` Wochen nach dem 5. Januar 2026. */
    const montag = (n: number): string =>
      new Date(Date.UTC(2026, 0, 5) + n * 7 * 864e5).toISOString().slice(0, 10)

    /** Die Grenze ein Jahr zurück: der Montag 52 Wochen vor dem 2. März 2026. */
    const EIN_JAHR = aufbewahrtAb(VERTEILUNG_WOCHEN, HEUTE)

    /** Wert des `gte`-Filters auf `spalte`, mit dem `table` abgefragt wurde. */
    const ab = (table: string, spalte: string): unknown =>
      store.filter.find(([t, m, s]) => t === table && m === 'gte' && s === spalte)?.[3]

    /**
     * Antworten für eine Versammlung mit diesen Wochen (hier aufsteigend
     * genannt, weil sich das so liest). Die Datenbank liefert **absteigend** —
     * genau das stellt der Stub nach. Sonst prüfte der Test eine Reihenfolge,
     * die es so nie gibt.
     */
    const mitWochen = (geladen: string[]) =>
      seedResponses({
        weeks: [
          {
            data: [...geladen].reverse().map((start) => ({ start, data: buildDemoWeeks()[0] })),
            error: null,
          },
        ],
      })

    it('die Grenze steht fest: der 3. März 2025', () => {
      // Gegenprobe zur Rechnung in `aufbewahrung.ts`, damit die Proben unten
      // nicht nur dieselbe Funktion zweimal fragen.
      expect(EIN_JAHR).toBe('2025-03-03')
    })

    it('holt die Wochen ab dem Montag vor einem Jahr — die Treffpunkte genauso, ohne Obergrenze', async () => {
      mitWochen([montag(0)])
      await loadCongregationData('u1')
      expect(ab('weeks', 'start')).toBe(EIN_JAHR)
      // Dieselbe Grenze für die Treffpunkte — sonst hätte eine Woche ihre
      // Zusammenkunft ohne ihre Treffpunkte oder umgekehrt.
      expect(ab('fs_weeks', 'start')).toBe(EIN_JAHR)
      // Was voraus liegt, kommt ganz: Die Frist zählt zurück, nicht vor.
      expect(grenze('weeks')).toBeUndefined()
      expect(grenze('fs_weeks')).toBeUndefined()
    })

    it('ebenso, was zu den Wochen gehört, die Absagen und die Abwesenheiten bis ein Jahr nach ihrem Ende', async () => {
      // Die Abwesenheiten bis zum 17.10.2026 nur acht Wochen — seitdem rechnet
      // die Auswertung über das Jahr mit ihnen (T126).
      seedResponses()
      await loadCongregationData('u1')
      expect(ab('gruppenbesuche', 'woche')).toBe(EIN_JAHR)
      expect(ab('vortraege', 'woche')).toBe(EIN_JAHR)
      expect(ab('plan_eintraege', 'datum')).toBe(EIN_JAHR)
      expect(ab('absagen', 'woche')).toBe(EIN_JAHR)
      expect(ab('absences', 'to_date')).toBe(EIN_JAHR)
    })

    it('kommt mit einer einzigen Antwort je Wochentabelle aus — keine Vorabfrage', async () => {
      // Der Stub gibt jede hinterlegte Antwort genau einmal heraus. Käme eine
      // Vorabfrage (früher `max(start)`) zurück, äße sie diese eine Antwort auf
      // und für das eigentliche Laden bliebe nichts — die Wochen kämen leer an.
      mitWochen([montag(0), montag(1)])
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks.map((w) => w.start)).toEqual([montag(0), montag(1)])
    })

    it('was älter ist als die Grenze, fällt heraus — auch wenn die Datenbank es liefert', async () => {
      const davor = '2025-02-24'
      seedResponses({
        weeks: [{ data: [montag(59), montag(0), EIN_JAHR, davor].map((start) => ({ start, data: buildDemoWeeks()[0] })), error: null }],
      })
      const res = await loadCongregationData('u1')
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data.weeks.map((w) => w.start)).toEqual([EIN_JAHR, montag(0), montag(59)])
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
     * der Spalte `weeks.start`; im Blob steht sie nicht, und eine Woche
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
      const inst = [{ id: 'i1', grp: null, wd: 3, time: '14:00', place: 'Saal', leader: 'Max' }]
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

  it('fehlt die Zeile der Versammlung, gelten die Vorgaben einer frisch angelegten — mit ihr ihre eigenen Werte', async () => {
    // Nur denkbar, wenn jemand sie zwischen zwei Abfragen löscht. Die App soll
    // dann stehen, statt an einer fehlenden Zeile zu scheitern.
    const eigene = { name: 'Versammlung Muster', hall: 'Saal A', mid_wd: 3, mid_time: '19:30:00', we_wd: 6, we_time: '17:00:00', reminder_first: 5, reminder_last: 2, reminder_repeat: true, cong_lang: 'en', prog_langs: ['fr'], aux_class: true }
    seedResponses({ congregations: [{ data: eigene, error: null }] })
    const mit = await loadCongregationData('u1')
    if (!mit.ok) throw new Error('nicht geladen')
    expect(mit.data.congregation).toEqual({ name: 'Versammlung Muster', hall: 'Saal A', times: { mid: { wd: 3, time: '19:30' }, we: { wd: 6, time: '17:00' } } })
    expect([mit.data.reminders, mit.data.congLang, mit.data.progLangs, mit.data.auxClass]).toEqual([{ first: 5, last: 2, repeat: true }, 'en', ['fr'], true])

    seedResponses({ congregations: [{ data: null, error: null }] })
    const ohne = await loadCongregationData('u1')
    if (!ohne.ok) throw new Error('nicht geladen')
    expect(ohne.data.congregation).toEqual({ name: '', hall: '', times: STANDARD_ZEITEN })
    expect([ohne.data.reminders, ohne.data.congLang, ohne.data.progLangs, ohne.data.auxClass]).toEqual([STANDARD_ERINNERUNGEN, 'de', [], false])
  })
})

/**
 * **Was nur eine Auskunft fehlen lässt, hält das Laden nicht auf** — das
 * Versand-Tagebuch („benachrichtigt am"), die vorgemerkten Vorträge (T122)
 * und die Anwesenden (T152). Eine Datenbank, in der `schema.sql` noch nicht
 * lief, hat die neueren Tabellen nicht; die Planung soll trotzdem gehen.
 * Je Tabelle die Gegenprobe: Mit Zeilen kommen sie an.
 */
describe('Laden ohne Tagebuch, Vormerkungen oder Anwesende (31.10.2026)', () => {
  /** Einmal mit Zeilen, einmal mit Fehler — beide Male muss die App laden. */
  async function mitUndOhne(tabelle: string, zeilen: unknown[]) {
    seedResponses({ [tabelle]: [{ data: zeilen, error: null, count: zeilen.length }] })
    const mit = await loadCongregationData('u1')
    seedResponses({ [tabelle]: [{ data: null, error: { message: `relation "public.${tabelle}" does not exist` } }] })
    const ohne = await loadCongregationData('u1')
    if (!mit.ok || !ohne.ok) throw new Error('nicht geladen')
    return { mit: mit.data, ohne: ohne.data }
  }
  let fehler: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => fehler.mockRestore())

  it('ohne Versand-Tagebuch bleibt „benachrichtigt am" leer — die Planung lädt', async () => {
    const zeile = { task_key: '2026-09-07|mid|helper|mik|0', name: 'Anna Beispiel', sent_at: '2026-09-01T10:00:00Z', user_id: null, persoenlich_at: null }
    const { mit, ohne } = await mitUndOhne('assignment_log', [zeile])
    expect(Object.values(mit.sentLog)).toEqual(['2026-09-01T10:00:00Z'])
    expect(Object.values(mit.persoenlich)).toEqual([null])
    expect([ohne.sentLog, ohne.persoenlich]).toEqual([{}, {}])
    expect(fehler).toHaveBeenCalledWith('[assignment_log]', 'relation "public.assignment_log" does not exist')
  })

  it('ohne die vorgemerkten Vorträge fehlen nur sie', async () => {
    const zeile = { id: 'v1', woche: '2026-09-07', redner: 'Max Mustermann', versammlung: 'Musterstadt', eigener: false, person_id: null, thema: 'Demothema 1', lied: '' }
    const { mit, ohne } = await mitUndOhne('vortraege', [zeile])
    expect(mit.vortraege.map((v) => [v.id, v.redner])).toEqual([['v1', 'Max Mustermann']])
    expect(ohne.vortraege).toEqual([])
    expect(fehler).toHaveBeenCalledWith('[vortraege]', 'relation "public.vortraege" does not exist')
  })

  it('ohne die Anwesenden fehlen nur sie', async () => {
    const zeile = { woche: '2026-09-07', zusammenkunft: 'mid', saal: 42, video: 7, person_id: 'p1' }
    const { mit, ohne } = await mitUndOhne('anwesenheit', [zeile])
    expect(mit.anwesenheit).toEqual([{ woche: '2026-09-07', tab: 'mid', saal: 42, video: 7, pid: 'p1' }])
    expect(ohne.anwesenheit).toEqual([])
    expect(fehler).toHaveBeenCalledWith('[anwesenheit]', 'relation "public.anwesenheit" does not exist')
  })
})

describe('Die Anmelde-Links (T121, Phase 8)', () => {
  const ZEILE = { person_id: 'p9', gueltig_bis: '2026-10-07T09:00:00Z', erstellt_at: '2026-09-07T09:00:00Z', gesendet_at: null, benutzt_at: null }

  it('kommen mit ausdrücklichen Spalten — die Prüfsummen darf die App nicht lesen, ein `*` scheiterte an ihnen', async () => {
    seedResponses({ anmelde_links: [{ data: [ZEILE], error: null }] })
    const res = await loadCongregationData('u1')
    const spalten = store.filter.find(([t, m]) => t === 'anmelde_links' && m === 'select')?.[2] ?? ''
    expect(spalten.split(',').map((s) => s.trim()).sort()).toEqual(['benutzt_at', 'erstellt_at', 'gesendet_at', 'gueltig_bis', 'person_id'])
    expect(store.filter).toContainEqual(['anmelde_links', 'eq', 'congregation_id', 'c1'])
    expect(res.ok && res.data.anmeldeLinks).toEqual([
      { personId: 'p9', gueltigBis: '2026-10-07T09:00:00Z', erstelltAt: '2026-09-07T09:00:00Z', gesendetAt: null, benutztAt: null },
    ])
  })

  it('scheitern sie, lädt die App trotzdem — es fehlt nur der Stand an den Personen', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    seedResponses({ anmelde_links: [{ data: null, error: { message: 'kaputt' } }] })
    const res = await loadCongregationData('u1')
    expect(res.ok && res.data.anmeldeLinks).toEqual([])
    expect(err).toHaveBeenCalledWith('[anmelde_links]', 'kaputt')
    err.mockRestore()
  })
})

/**
 * **Gründe nur, wem die App sie zeigt** (Sicherheits-Review 29.10.2026). Die
 * Spalte `absences.reason` ist für die Versammlung gesperrt; ein `*`
 * scheiterte an ihr als Ganzes. Der Grund kommt über eine Funktion, die nur
 * liefert, was der Angemeldete sehen darf. (Bis zum 31.10.2026 ebenso
 * `persons.mail` — die Spalte gibt es nicht mehr.)
 */
describe('Gründe (Sicherheits-Review 29.10.2026)', () => {
  const ausgewaehlt = (table: string): string[] =>
    store.filter.filter(([t, m]) => t === table && m === 'select').map(([, , spalten]) => spalten)
  const aufgerufen = (name: string): boolean => store.filter.some(([t]) => t === `rpc/${name}`)
  const abwesenheit = (id: string) => ({ id, person_id: 'p1', user_id: null, from_date: '2026-09-07', to_date: '2026-09-10' })

  it('Personen und Abwesenheiten kommen mit ausdrücklichen Spalten — ohne Grund', async () => {
    seedResponses()
    await loadCongregationData('u1')
    expect(ausgewaehlt('persons')).toEqual([PERSON_SPALTEN])
    expect(ausgewaehlt('absences')).toEqual([ABWESENHEIT_SPALTEN])
    expect(PERSON_SPALTEN).not.toMatch(/\*|\bmail\b/)
    expect(ABWESENHEIT_SPALTEN).not.toMatch(/\*|\breason\b/)
  })

  it('der Admin bekommt die Gründe über die Funktion — jeden an seiner Zeile', async () => {
    seedResponses({
      absences: [{ data: [abwesenheit('a1'), abwesenheit('a2')], error: null, count: 2 }],
      'rpc/abwesenheit_gruende': [{ data: [{ id: 'a2', reason: 'Urlaub' }], error: null }],
    })
    const res = await loadCongregationData('u1')
    if (!res.ok) throw new Error('nicht geladen')
    expect(res.data.absences.map((a) => [a.id, a.reason])).toEqual([['a1', ''], ['a2', 'Urlaub']])
    // Nach Adressen fragt die App seit dem 31.10.2026 nicht mehr.
    expect(aufgerufen('personen_mails')).toBe(false)
  })

  it('auch ein Mitglied ohne Admin-Recht fragt nach den Gründen — die eigenen bekommt es', async () => {
    seedResponses({
      members: [
        { data: { congregation_id: 'c1', person_id: 'p9', planner: false, zuteiler: true }, error: null },
        { data: [], error: null },
      ],
    })
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    expect(aufgerufen('abwesenheit_gruende')).toBe(true)
  })

  it('die offenen Tausch-Anfragen (T153): was noch gilt, in der Form des Zustands — scheitern sie, lädt die App trotzdem', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const zeile = { id: 'a1', von_person: 'p9', an_person: 'p1', gibt_ab: '2026-09-07|we|helper|mik|0', nimmt: '2026-09-14|we|helper|mik|0', bis: '2026-09-13' }
    seedResponses({ tausch_anfragen: [{ data: [zeile], error: null }] })
    const res = await loadCongregationData('u1')
    if (!res.ok) throw new Error('nicht geladen')
    expect(res.data.tauschAnfragen).toEqual([{ id: 'a1', von: 'p9', an: 'p1', gibtAb: zeile.gibt_ab, nimmt: zeile.nimmt, bis: '2026-09-13' }])
    expect(ausgewaehlt('tausch_anfragen')).toEqual(['id, von_person, an_person, gibt_ab, nimmt, bis'])
    expect(store.filter).toContainEqual(['tausch_anfragen', 'gte', 'bis', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)])

    seedResponses({ tausch_anfragen: [{ data: null, error: { message: 'kaputt' } }] })
    const ohne = await loadCongregationData('u1')
    expect(ohne.ok && ohne.data.tauschAnfragen).toEqual([])
    expect(err).toHaveBeenCalledWith('[tausch_anfragen]', 'kaputt')
    err.mockRestore()
  })

  it('scheitern die Gründe, lädt sie trotzdem — es fehlt nur der Satz in der Liste', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    seedResponses({
      absences: [{ data: [abwesenheit('a1')], error: null, count: 1 }],
      'rpc/abwesenheit_gruende': [{ data: null, error: { message: 'kaputt' } }],
    })
    const res = await loadCongregationData('u1')
    if (!res.ok) throw new Error('nicht geladen')
    expect(res.data.absences.map((a) => a.reason)).toEqual([''])
    expect(err).toHaveBeenCalledWith('[abwesenheit_gruende]', 'kaputt')
    err.mockRestore()
  })
})

/**
 * **Ein Neuladen überholt kein Schreiben** (15.10.2026).
 *
 * Ein Schreibvorgang beruht auf dem Zustand, aus dem er kommt — und der
 * stammt aus einem bestimmten Ladevorgang. Bis zum 15.10.2026 galt beim
 * Schreiben einfach der jüngste Stand, auch über ein Laden hinweg:
 *
 * - Wartete ein Schreibvorgang noch in seiner Kette, während die App neu lud,
 *   ging er danach mit dem **frischen** Stand los und schrieb seinen alten
 *   Inhalt still über das, was das Laden gebracht hatte.
 * - Kam die Antwort eines Schreibvorgangs erst nach dem Laden, setzte sie ihren
 *   Stand neben einen Bildschirm, der ihn womöglich gar nicht zeigte — die
 *   nächste Änderung nahm ihn dann lautlos zurück.
 */
describe('Neuladen und Schreiben', () => {
  const START = '2026-09-07'
  const woche = (range: string): Week => ({ ...buildDemoWeeks()[0]!, start: START, range })
  /** Eine Antwort, die erst kommt, wenn der Test es sagt. */
  function spaeteAntwort() {
    let geben: (stand: string) => void = () => {}
    const antwort = new Promise((r) => {
      geben = (stand) => r({ data: { updated_at: stand }, error: null })
    })
    return { antwort: antwort as unknown as { data: unknown; error: unknown }, geben }
  }
  /** Mit welchen Ständen `tabelle` seit dem letzten Leeren geschrieben wurde. */
  const staendeVon = (tabelle: string): unknown[] =>
    store.filter.filter(([t, m, spalte]) => t === tabelle && m === 'eq' && spalte === 'updated_at').map(([, , , wert]) => wert)
  /** Ein Laden, das für Wochen und Treffpunkte diese Stände bringt. */
  const laden = (stand: string) => {
    seedResponses({
      weeks: [{ data: [{ start: START, data: woche('geladen'), updated_at: stand }], error: null }],
      fs_weeks: [{ data: [{ start: START, data: [], updated_at: `F-${stand}` }], error: null }],
    })
    return loadCongregationData('u1')
  }
  const ruhe = () => new Promise((r) => setTimeout(r, 0))

  let konflikte = 0
  beforeEach(() => {
    konflikte = 0
    setKonfliktMelder(() => {
      konflikte++
    })
  })
  afterEach(() => setKonfliktMelder(null))

  it('eine Antwort, die erst nach dem Laden kommt, ersetzt den geladenen Stand nicht', async () => {
    await laden('S1')
    const spaet = spaeteAntwort()
    store.responses.weeks = [spaet.antwort]
    saveWeek('c1', woche('unterwegs'))
    await ruhe()
    await laden('S-geladen')
    spaet.geben('S-geschrieben')
    await ruhe()

    store.filter = []
    store.responses.weeks = [{ data: { updated_at: 'S3' }, error: null }]
    saveWeek('c1', woche('danach'))
    await ruhe()
    expect(staendeVon('weeks')).toEqual(['S-geladen'])
  })

  it('was vor dem Laden in der Kette wartete, geht danach nicht mehr los — es meldet einen Konflikt', async () => {
    await laden('S1')
    const spaet = spaeteAntwort()
    store.responses.weeks = [spaet.antwort]
    saveWeek('c1', woche('erste'))
    saveWeek('c1', woche('wartet in der Kette'))
    await ruhe()
    await laden('S-geladen')
    store.filter = []
    spaet.geben('S2')
    await ruhe()
    await ruhe()

    expect(staendeVon('weeks')).toEqual([])
    expect(konflikte).toBe(1)
  })

  it('bei den Treffpunkten ebenso: Wartendes geht nicht los, eine späte Antwort setzt keinen Stand', async () => {
    await laden('S1')
    const spaet = spaeteAntwort()
    store.responses.fs_weeks = [spaet.antwort]
    saveFsWeek('c1', START, [])
    saveFsWeek('c1', START, [])
    await ruhe()
    await laden('S-geladen')
    store.filter = []
    spaet.geben('F-geschrieben')
    await ruhe()
    await ruhe()
    expect(staendeVon('fs_weeks')).toEqual([])
    expect(konflikte).toBe(1)

    store.responses.fs_weeks = [{ data: { updated_at: 'F3' }, error: null }]
    saveFsWeek('c1', START, [])
    await ruhe()
    expect(staendeVon('fs_weeks')).toEqual(['F-S-geladen'])
  })

  it('`wocheGeschrieben` wartet, bis die Woche draußen ist — für „Plan senden" (15.10.2026)', async () => {
    await laden('S1')
    const spaet = spaeteAntwort()
    store.responses.weeks = [spaet.antwort]
    saveWeek('c1', woche('unterwegs'))
    let draussen = false
    void wocheGeschrieben(START).then(() => {
      draussen = true
    })
    await ruhe()
    expect(draussen).toBe(false)
    spaet.geben('S2')
    await ruhe()
    expect(draussen).toBe(true)
  })

  /*
   * **Der Stand nach dem Einspringen** (15.10.2026). Einspringen und ein freier
   * Platz schreiben die Woche in der Function `substitute`. Kannte die App den
   * neuen Stand nicht, meldete ihre nächste Änderung derselben Woche einen
   * Konflikt, den es nicht gab — ein Admin, der einspringt und gleich
   * weiterplant, verlor seine Änderung an ein Nachladen.
   */
  const KEY = `${START}|mid|helper|mik|0`
  /** Danach schreibt die App die Woche selbst — mit welchem Stand? */
  const naechsterStand = async (): Promise<unknown[]> => {
    store.filter = []
    store.responses.weeks = [{ data: { updated_at: 'S9' }, error: null }]
    saveWeek('c1', woche('danach'))
    await ruhe()
    return staendeVon('weeks')
  }

  it.each([
    ['Einspringen', () => substituteTake(KEY)],
    ['freier Platz', () => platzFuellen(KEY)],
  ])('%s: der Stand der Function gilt, wenn er auf dem eigenen aufbaut', async (_name, aufruf) => {
    await laden('S1')
    invokeMock.mockResolvedValueOnce({ data: { ok: true, woche: START, vorher: 'S1', stand: 'S2' }, error: null })
    aufruf()
    await ruhe()
    expect(await naechsterStand()).toEqual(['S2'])
    expect(konflikte).toBe(0)
  })

  it('hat dazwischen ein anderer geschrieben, bleibt der eigene — die nächste Änderung lädt nach', async () => {
    await laden('S1')
    invokeMock.mockResolvedValueOnce({ data: { ok: true, woche: START, vorher: 'S-fremd', stand: 'S2' }, error: null })
    substituteTake(KEY)
    await ruhe()
    expect(await naechsterStand()).toEqual(['S1'])
  })
})

/**
 * **Die Tabellen der Pläne ohne Woche** — Gruppenbesuche und Weitere Pläne
 * samt Einträgen (T120), dazu die Trolleys und ihre Termine (T121).
 *
 * Bis zum 3.10.2026 lief keine ihrer Zuordnungen je in einem Test: Der Stub
 * gab für sie nichts zurück, also blieb `…FromRow` stumm. Ein falscher
 * Spaltenname wäre erst im Betrieb aufgefallen — als leerer Plan.
 */
describe('loadCongregationData: die Pläne aus T120', () => {
  const T120 = ['gruppenbesuche', 'trolleys', 'trolley_termine', 'plaene', 'plan_eintraege']

  /** Normale Antworten plus je eine Zeile der neuen Tabellen — einzelne per Argument überschreiben. */
  function mitPlaenen(over: Partial<Record<string, Array<{ data: unknown; error: unknown; count?: number }>>> = {}) {
    seedResponses({
      gruppenbesuche: [{ data: [{ id: 'b1', woche: '2026-10-05', grp: 'g1', person_id: 'p1' }], error: null }],
      trolleys: [{ data: [{ id: 'tr1', name: 'Trolley 1', ort: 'Depot', hinweis: '' }], error: null }],
      trolley_termine: [
        {
          data: [
            { id: 'r1', trolley_id: 'tr1', datum: '2026-09-09', von: '10:00:00', bis: '12:30:00', person_id: 'p1', partner_id: null, gemeinsam: false },
          ],
          error: null,
        },
      ],
      plaene: [
        { data: [{ id: 'pl1', name: 'Winterdienst', von: '2026-09-07', bis: '2026-11-29', entwurf: false, takt: 'monat' }], error: null },
      ],
      plan_eintraege: [
        {
          data: [
            { id: 'pe1', plan_id: 'pl1', datum: '2026-09-07', grp: 'g1' },
            // Zu einem Plan, der vor dem Rückblick endete und deshalb nicht geladen ist.
            { id: 'pe-alt', plan_id: 'pl-alt', datum: '2026-03-02', grp: 'g1' },
          ],
          error: null,
        },
      ],
      ...over,
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  })
  afterEach(() => vi.useRealTimers())

  it('bringt jede Zeile in die Form des Zustands — Uhrzeiten ohne Sekunden, Spalten umbenannt', async () => {
    mitPlaenen()
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = res.data
    expect(d.gruppenbesuche).toEqual([{ id: 'b1', woche: '2026-10-05', grp: 'g1', pid: 'p1' }])
    expect(d.trolleys).toEqual([{ id: 'tr1', name: 'Trolley 1', ort: 'Depot', hinweis: '' }])
    expect(d.trolleyTermine).toEqual([
      { id: 'r1', trolleyId: 'tr1', datum: '2026-09-09', von: '10:00', bis: '12:30', pid: 'p1', partner: null, gemeinsam: false },
    ])
    // Der Takt kommt mit (4.10.2026) — sonst wechselte ein Monatsplan nach dem Laden wieder wöchentlich.
    expect(d.plaene).toEqual([{ id: 'pl1', name: 'Winterdienst', von: '2026-09-07', bis: '2026-11-29', entwurf: false, takt: 'monat' }])
    // Der Eintrag eines nicht geladenen Plans fällt heraus — er gehörte zu nichts, was die App zeigt.
    expect(d.planEintraege).toEqual([{ id: 'pe1', planId: 'pl1', datum: '2026-09-07', grp: 'g1' }])
  })

  it('die Trolley-Termine kommen über die Zeilengrenze hinweg vollständig an (15.10.2026)', async () => {
    // Ein Vierteljahr voraus, mehrere Trolleys, halbe Stunden: An der Grenze
    // fehlten still die spätesten, und ihr Platz stand frei da.
    const termin = (id: string, datum: string) => ({
      id, trolley_id: 'tr1', datum, von: '10:00:00', bis: '12:00:00', person_id: 'p1', partner_id: null, gemeinsam: false,
    })
    mitPlaenen({
      trolley_termine: [
        { data: [termin('r1', '2026-09-09')], error: null, count: 2 },
        { data: [termin('r2', '2026-12-02')], error: null, count: 2 },
      ],
    })
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.trolleyTermine.map((t) => t.id)).toEqual(['r1', 'r2'])
  })

  it('jede der fünf Abfragen nennt die eigene Versammlung', async () => {
    mitPlaenen()
    await loadCongregationData('u1')
    for (const tabelle of T120) {
      expect(store.filter, tabelle).toContainEqual([tabelle, 'eq', 'congregation_id', 'c1'])
    }
  })

  it('Pläne ab einem Vierteljahr zurück, Trolley-Termine ab dieser Woche, Besuche und Plan-Einträge ein Jahr — Trolleys ohne Grenze', async () => {
    mitPlaenen()
    await loadCongregationData('u1')
    // 91 Tage vor Montag, dem 7. September 2026.
    const gte = (tabelle: string) => store.filter.find(([t, m]) => t === tabelle && m === 'gte')
    // Ab dem Montag dieser Woche: Davor zeigt die App keinen Termin mehr.
    expect(gte('trolley_termine')).toEqual(['trolley_termine', 'gte', 'datum', '2026-09-07'])
    // Bei den Plänen zählt das Ende: Ein laufender Plan kann lange vorher begonnen haben.
    expect(gte('plaene')).toEqual(['plaene', 'gte', 'bis', '2026-06-08'])
    // Ein Jahr wie die Wochen (T125): der Montag 52 Wochen vor dem 7. September 2026.
    expect(gte('gruppenbesuche')).toEqual(['gruppenbesuche', 'gte', 'woche', '2025-09-08'])
    expect(gte('plan_eintraege')).toEqual(['plan_eintraege', 'gte', 'datum', '2025-09-08'])
    expect(gte('trolleys')).toBeUndefined()
  })

  it.each(T120)('fehlt %s noch (Schema nicht eingespielt), lädt der Rest trotzdem', async (tabelle) => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    mitPlaenen({ [tabelle]: [{ data: null, error: { message: 'relation does not exist', code: '42P01' } }] })
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Die App bleibt benutzbar — die übrigen Pläne sind da, nur dieser Teil fehlt.
    expect(res.data.persons).toHaveLength(1)
    const teile = {
      gruppenbesuche: res.data.gruppenbesuche,
      trolleys: res.data.trolleys,
      trolley_termine: res.data.trolleyTermine,
      plaene: res.data.plaene,
      plan_eintraege: res.data.planEintraege,
    }
    for (const [name, liste] of Object.entries(teile)) {
      // Ohne Pläne gehört auch kein Plan-Eintrag mehr zu etwas; Trolley-Termine
      // stehen dagegen für sich.
      const leer = name === tabelle || (tabelle === 'plaene' && name === 'plan_eintraege')
      expect(liste, name).toHaveLength(leer ? 0 : 1)
    }
    expect(fehler).toHaveBeenCalledWith(`[${tabelle}]`, 'relation does not exist')
    fehler.mockRestore()
  })
})

/**
 * **Die Glocke: aus Zeilen werden Mitteilungen** — beim vollen Laden und beim
 * Nachladen über denselben Weg (`notificationsAus`). Abgelaufenes fällt heraus
 * (T77), eine unbekannte Art liest sich als „gesendet", und den Schlüssel der
 * Aufgabe trägt nur, wer einen hat.
 */
describe('Glocke: Zeilen werden zu Mitteilungen', () => {
  const zeile = (over: Record<string, unknown>) => ({
    id: 'n1',
    type: 'zuteilung',
    title: 'Titel',
    body: 'Text',
    created_at: '2026-09-01T10:00:00Z',
    read: false,
    task_key: null,
    ...over,
  })
  const ZEILEN = [
    zeile({ id: 'vorbei', task_key: '2026-01-05|mid|ratgeber' }),
    zeile({ id: 'kommt', task_key: '2099-01-05|mid|ratgeber' }),
    zeile({ id: 'ohne', type: 'neuartig', read: true }),
  ]

  it('Nachladen: der vergangene Platz fällt heraus, der kommende und der ohne Platz bleiben', async () => {
    store.responses = { notifications: [{ data: ZEILEN, error: null }] }
    const glocke = await loadNotifications('c1', [], STANDARD_ZEITEN)
    expect(glocke?.map((n) => n.id)).toEqual(['kommt', 'ohne'])
    expect(glocke?.[0]).toMatchObject({ type: 'zuteilung', title: 'Titel', text: 'Text', taskId: '2099-01-05|mid|ratgeber', read: false })
    // Eine Art, die die App nicht kennt, steht als „gesendet" da — nicht als leeres Zeichen.
    expect(glocke?.[1]).toMatchObject({ type: 'gesendet', read: true })
    expect(glocke?.[1]).not.toHaveProperty('taskId')
    expect(grenze('notifications')).toBe(50)
  })

  it('Nachladen: ohne Zeilen eine leere Glocke, bei einem Fehler bleibt der alte Stand (null)', async () => {
    store.responses = { notifications: [{ data: null, error: null }] }
    expect(await loadNotifications('c1', [], STANDARD_ZEITEN)).toEqual([])
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.responses = { notifications: [{ data: null, error: { message: 'kaputt' } }] }
    expect(await loadNotifications('c1', [], STANDARD_ZEITEN)).toBeNull()
    expect(fehler).toHaveBeenCalledWith('[notifications]', 'kaputt')
    fehler.mockRestore()
  })

  it('volles Laden: dieselbe Auswahl wie beim Nachladen', async () => {
    seedResponses({ notifications: [{ data: ZEILEN, error: null }] })
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.notifications.map((n) => n.id)).toEqual(['kommt', 'ohne'])
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
