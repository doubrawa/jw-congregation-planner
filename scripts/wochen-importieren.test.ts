import { describe, expect, it, vi } from 'vitest'
import { main, nurNeue, wochenHolen } from './wochen-importieren.mjs'
import { fahre, type Zeile } from './schema-attrappe'
import type { AppState } from '../src/app/context'
import { initialState } from '../src/app/init'
import { reducer } from '../src/app/reducer'
import type { Week } from '../src/data/types'
import { fsRuleFromRow, gruppenbesuchFromRow, personFromRow, type FsRuleRow, type GruppenbesuchRow, type PersonRow } from '../src/lib/zeilen'
import { zeitenAus } from '../supabase/functions/_shared/planung.ts'

/**
 * **Acht Wochen statt acht Klicks.**
 *
 * Geprüft wird ohne Netz: Der Aufruf der Edge Function ist ein Parameter. Was
 * gemessen wird, ist die Kette — jede Antwort nennt ihren Montag, und der ist
 * die Basis für die nächste Anfrage. Verliert das Skript diese Kette, holt es
 * achtmal **dieselbe** Woche, und weil `weeks` ein `unique (congregation_id,
 * start)` trägt, fiele das erst beim Schreiben auf.
 *
 * Die zweite Frage ist das Ende: Zur übernächsten Woche gibt es auf jw.org
 * irgendwann noch nichts. Das ist der Normalfall am Jahresrand und kein
 * Fehler — der Lauf muss mit dem enden, was da war.
 */

const woche = (start: string) => ({ week: { start, range: `Woche ${start}` } })

const antwort = (nutzlast: unknown, status = 200) => ({
  status,
  text: () => Promise.resolve(JSON.stringify(nutzlast)),
})

describe('wochenHolen', () => {
  it('hängt jede Woche an die vorige — acht Anfragen, acht Montage', async () => {
    const gefragt: string[] = []
    const holen = (_url: string, init: { body: string }) => {
      const { after } = JSON.parse(init.body)
      gefragt.push(after ?? '(ohne)')
      const naechster = after ? `2026-09-${String(Number(after.slice(-2)) + 7).padStart(2, '0')}` : '2026-09-07'
      return Promise.resolve(antwort(woche(naechster)))
    }

    const { wochen, fehler } = await wochenHolen({ url: 'https://x', key: 'k', ab: undefined, anzahl: 3, holen })

    expect(fehler).toBe('')
    expect(wochen.map((w) => w.start)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21'])
    expect(gefragt).toEqual(['(ohne)', '2026-09-07', '2026-09-14'])
  })

  it('schickt Sprache und Programmsprachen der Versammlung mit', async () => {
    let gesehen: { lang?: string; altLangs?: string[] } = {}
    const holen = (_url: string, init: { body: string }) => {
      gesehen = JSON.parse(init.body)
      return Promise.resolve(antwort(woche('2026-09-07')))
    }

    await wochenHolen({ url: 'https://x', key: 'k', lang: 'cmn-hant', altLangs: ['en'], anzahl: 1, holen })

    expect(gesehen.lang).toBe('cmn-hant')
    expect(gesehen.altLangs).toEqual(['en'])
  })

  it('meldet sich beim Function-Gateway mit Authorization an', async () => {
    // Gemessen am 18.9.2026: Ohne diese Kopfzeile antwortet das Gateway mit
    // 401 — anders als PostgREST, das genau sie nicht verträgt.
    let kopf: Record<string, string> = {}
    const holen = (_url: string, init: { headers: Record<string, string>; body: string }) => {
      kopf = init.headers
      return Promise.resolve(antwort(woche('2026-09-07')))
    }

    await wochenHolen({ url: 'https://x', key: 'sb_secret_abc', anzahl: 1, holen })

    expect(kopf.Authorization).toBe('Bearer sb_secret_abc')
    expect(kopf.apikey).toBe('sb_secret_abc')
  })

  it('endet mit dem, was da war, wenn jw.org noch keine Woche hat', async () => {
    let n = 0
    const holen = () =>
      Promise.resolve(n++ < 2 ? antwort(woche(`2026-09-${14 + n * 7}`)) : antwort({ error: 'keine Woche gefunden' }))

    const { wochen, fehler } = await wochenHolen({ url: 'https://x', key: 'k', anzahl: 8, holen })

    expect(wochen).toHaveLength(2)
    expect(fehler).toBe('keine Woche gefunden')
  })

  it('stirbt nicht an einer unlesbaren Antwort', async () => {
    const holen = () => Promise.resolve({ status: 502, text: () => Promise.resolve('<html>Gateway</html>') })

    const { wochen, fehler } = await wochenHolen({ url: 'https://x', key: 'k', anzahl: 3, holen })

    expect(wochen).toEqual([])
    expect(fehler).toMatch(/502/)
  })
})

describe('nurNeue', () => {
  it('lässt weg, was schon gespeichert ist', () => {
    const geholt = [{ start: '2026-09-07' }, { start: '2026-09-14' }]
    expect(nurNeue(['2026-09-07'], geholt).map((w: { start?: string }) => w.start)).toEqual(['2026-09-14'])
  })

  it('wirft Wochen ohne Montag weg, statt sie zu schreiben', () => {
    // `weeks.start` ist `not null` mit Montags-Bedingung — eine Woche ohne
    // Startdatum brächte den ganzen Lauf zum Abbruch.
    expect(nurNeue([], [{ range: 'kaputt' }, { start: '2026-09-14' }]).map((w: { start?: string }) => w.start)).toEqual(['2026-09-14'])
  })
})

/**
 * **Geschrieben wie der Knopf in der App** (5.10.2026).
 *
 * Bis dahin schrieb das Skript die Woche, wie `import-week` sie liefert. Mit
 * eingeschalteter Zusätzlicher Klasse fehlten ihr zweite Platzreihe und
 * Ratgeber — und `zuteilen` wies jede Zuteilung eines Planers dort als Umbau
 * ab. Gemessen wird deshalb nicht eine Liste von Feldern, sondern der
 * Gleichstand: Dieselbe Woche geht durch das Skript und durch den Reducer
 * (`addImportedWeek`), und heraus muss dasselbe kommen — Woche und Treffpunkte.
 *
 * Der Bestand ist so gewählt, dass jeder Schritt der Einordnung etwas zu tun
 * hat: eigene Zeiten (18:30 statt der Endzeit des Imports), die Klasse an,
 * eine Grundplan-Regel, ein vorgemerkter Gruppenbesuch, eine Woche mit dem
 * Gedächtnismahl am Donnerstag. Alles Platzhalter.
 */
describe('main: eingeordnet wie beim Import in der App', () => {
  const C = '00000000-0000-4000-8000-000000000001'
  const G1 = '00000000-0000-4000-8000-000000000011'
  const P1 = '00000000-0000-4000-8000-000000000031'
  const VERSAMMLUNG = { id: C, name: 'Probe', cong_lang: 'de', prog_langs: [], aux_class: true, mid_wd: 2, mid_time: '18:30:00', we_wd: 0, we_time: '10:00:00' }
  const REGEL: FsRuleRow & Zeile = {
    id: '00000000-0000-4000-8000-000000000061', congregation_id: C, grp: G1, wd: 6, time: '09:30:00',
    place: 'Probe-Ort', monthly: 0, skip_cong: false, aus: null, created_at: '2026-01-01T00:00:00Z',
  }
  const BESUCH: GruppenbesuchRow & Zeile = { id: '00000000-0000-4000-8000-000000000071', congregation_id: C, woche: '2026-08-24', grp: G1, person_id: P1 }
  const PERSON: PersonRow & Zeile = {
    id: P1, congregation_id: C, fn: 'Probe', ln: 'Besuch', planner_vorgemerkt: false, role: 'aeltester', female: false,
    tel: '', mail: '', priv: {}, grp: null, fam: null, created_at: '2026-01-01T00:00:00Z',
  }

  /** Eine Woche, wie `import-week` sie liefert — ein Schülerteil, feste Endzeiten. */
  const roh = (start: string, extra: Partial<Week> = {}): Week =>
    ({
      start,
      range: 'Probewoche',
      book: '',
      mid: {
        date: '', end: 'Ende ca. 20:45',
        sections: [{ label: 'PROBE', farbe: 'gold', items: [{ iid: `s-${start}`, title: 'Probe-Schülerteil', meta: '', names: [{ name: '', bereichsKey: 'schulung' }] }] }],
        helpers: {},
      },
      we: { date: '', end: 'Ende ca. 11:45', sections: [], helpers: {} },
      ...extra,
    }) as Week
  const LIEFERUNG = [roh('2026-08-24'), roh('2026-08-31', { anlass: { art: 'mem', von: '2026-09-03' } })]

  it('Woche und Treffpunkte gleichen dem, was `addImportedWeek` daraus macht', async () => {
    let n = 0
    const { tabellen } = await fahre(() => main(['--anzahl', '2']), {
      bestand: { congregations: [VERSAMMLUNG], fs_rules: [REGEL], gruppenbesuche: [BESUCH], persons: [PERSON] },
      funktionen: { 'import-week': () => ({ json: { week: LIEFERUNG[n++] } }) },
    })

    // `initialState` liest die Geräte-Einstellungen — hier gibt es keine.
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    const leer = initialState()
    vi.unstubAllGlobals()
    let s: AppState = {
      ...leer,
      congregation: { ...leer.congregation, times: zeitenAus(VERSAMMLUNG) },
      auxClass: true,
      fsRules: [fsRuleFromRow(REGEL)],
      gruppenbesuche: [gruppenbesuchFromRow(BESUCH)],
      persons: [personFromRow(PERSON)],
      weeks: [],
      fsWeeks: [],
    }
    for (const week of LIEFERUNG) s = reducer(s, { type: 'addImportedWeek', week })
    const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

    expect((tabellen.weeks ?? []).map((z) => z.data)).toEqual(json(s.weeks))
    expect((tabellen.fs_weeks ?? []).map((z) => z.data)).toEqual(json(s.fsWeeks))

    // Und es war nicht der Leerlauf beider Seiten: Jeder Schritt hat gewirkt.
    const [erste, zweite] = s.weeks
    expect(erste?.mid.end).toBe('Ende ca. 20:15')
    expect(erste?.mid.auxRatgeber).toBeDefined()
    expect(zweite?.dev?.mid?.cancelled).toBe(true)
    expect(s.fsWeeks[0]?.[0]).toMatchObject({ grp: G1, leader: 'Probe Besuch', lpid: P1 })
  })

  it('lässt Treffpunkte stehen, die eine Woche schon hat', async () => {
    const vorhanden = [{ id: 'probe-treffpunkt', grp: null, time: '08:00', place: 'Schon da' }]
    const { tabellen, ausgabe } = await fahre(() => main(['--anzahl', '1']), {
      bestand: {
        congregations: [VERSAMMLUNG], fs_rules: [REGEL],
        fs_weeks: [{ congregation_id: C, start: '2026-08-24', data: vorhanden }],
      },
      funktionen: { 'import-week': () => ({ json: { week: roh('2026-08-24') } }) },
    })
    expect(tabellen.fs_weeks).toEqual([{ congregation_id: C, start: '2026-08-24', data: vorhanden }])
    expect(ausgabe.join('\n')).toContain('Treffpunkte schon da')
  })
})
