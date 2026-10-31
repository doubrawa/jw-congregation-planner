import { describe, expect, it, vi } from 'vitest'
import { main, nurNeue, wochenHolen } from './wochen-importieren.mjs'
import { fahre, type FunktionsAntwort, type Zeile } from './schema-attrappe'
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

  it('endet mit dem, was da war, wenn jw.org noch keine Woche hat — das ist der Kalender', async () => {
    // So antwortet `import-week` nach der letzten Woche des Hefts: 404 mit `ende`.
    let n = 0
    const holen = () =>
      Promise.resolve(
        n++ < 2
          ? antwort(woche(`2026-09-${14 + n * 7}`))
          : antwort({ error: 'Keine kommende Woche gefunden.', ende: true }, 404),
      )

    const { wochen, fehler, ende } = await wochenHolen({ url: 'https://x', key: 'k', anzahl: 8, holen })

    expect(wochen).toHaveLength(2)
    expect(fehler).toBe('Keine kommende Woche gefunden.')
    expect(ende).toBe(true)
  })

  it('fehlt die nächste Woche in der Sprache der Versammlung, ist das ebenso der Kalender', async () => {
    // Die Übersetzung erscheint später als das deutsche Heft.
    const holen = () => Promise.resolve(antwort({ error: 'Diese Woche ist … (es) noch nicht verfügbar.', code: 'sprache-fehlt' }, 404))

    const { ende } = await wochenHolen({ url: 'https://x', key: 'k', lang: 'es', anzahl: 3, holen })

    expect(ende).toBe(true)
  })

  it('bricht die Function ab, ist das kein Ende, sondern ein Abbruch', async () => {
    let n = 0
    const holen = () =>
      Promise.resolve(n++ < 1 ? antwort(woche('2026-09-07')) : antwort({ error: 'Import fehlgeschlagen.' }, 500))

    const { wochen, fehler, ende } = await wochenHolen({ url: 'https://x', key: 'k', ab: '2026-08-31', anzahl: 8, holen })

    expect(wochen).toHaveLength(1)
    expect(fehler).toBe('Import fehlgeschlagen.')
    expect(ende).toBe(false)
  })

  it('stirbt nicht an einer unlesbaren Antwort — und hält sie nicht für das Ende', async () => {
    const holen = () => Promise.resolve({ status: 502, text: () => Promise.resolve('<html>Gateway</html>') })

    const { wochen, fehler, ende } = await wochenHolen({ url: 'https://x', key: 'k', anzahl: 3, holen })

    expect(wochen).toEqual([])
    expect(fehler).toMatch(/502/)
    expect(ende).toBe(false)
  })

  it('springt die Kette über Wochen, steht die Lücke da', async () => {
    // Jede Woche hat ein Programm (die des Gedächtnismahls baut die Function).
    // Ein Sprung heißt: Eine ältere Ausgabe lieferte jw.org nicht mehr.
    const folge = ['2025-10-13', '2025-10-20', '2025-11-24', '2025-12-01']
    let n = 0
    const holen = () => Promise.resolve(antwort(woche(folge[n++] ?? '')))

    const { wochen, luecken } = await wochenHolen({ url: 'https://x', key: 'k', ab: '2025-10-06', anzahl: 4, holen })

    expect(wochen).toHaveLength(4)
    expect(luecken).toEqual([{ nach: '2025-10-20', kam: '2025-11-24' }])
  })

  it('eine lückenlose Kette hat keine Lücke — auch nicht über den Monats- oder Jahreswechsel', async () => {
    const folge = ['2025-12-22', '2025-12-29', '2026-01-05']
    let n = 0
    const holen = () => Promise.resolve(antwort(woche(folge[n++] ?? '')))

    const { luecken } = await wochenHolen({ url: 'https://x', key: 'k', ab: '2025-12-15', anzahl: 3, holen })

    expect(luecken).toEqual([])
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
    priv: {}, grp: null, fam: null, created_at: '2026-01-01T00:00:00Z',
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

/**
 * **Ein Jahr Geschichte für den Neuaufbau** (18.10.2026).
 *
 * `versammlung-zuruecksetzen.mjs` leert `weeks`; ohne die Wochen des
 * vergangenen Jahres begänne die Auswertung (T126) leer. Zwei Dinge muss das
 * Skript dafür können:
 *
 * - **`--ab` nennt die erste Woche, die kommt.** Bis dahin nannte es die Woche
 *   davor — und weil `--ab` nicht vor die Frist darf, ließ sich die erste Woche
 *   der Frist (der Montag vor einem Jahr) gar nicht holen.
 * - **Ein unvollständiger Lauf endet mit Code 1.** Sechzig Abrufe statt acht:
 *   Bricht einer ab oder springt die Kette, schreibt das Skript, was kam, und
 *   `neuaufbau-fahren.mjs` bleibt stehen, statt mit halber Geschichte
 *   weiterzumachen. Das Ende des Hefts dagegen ist der Kalender.
 */
describe('main: ein Jahr zurück', () => {
  const C = '00000000-0000-4000-8000-000000000001'
  const VERSAMMLUNG = { id: C, name: 'Probe', cong_lang: 'de', prog_langs: [], aux_class: false, mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00' }

  /** Eine Woche, wie `import-week` sie liefert — Platzhalter statt Wortlaut. */
  const probe = (start: string) => ({
    start,
    range: `Probewoche ${start}`,
    book: '',
    mid: { date: '', end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  })
  const plusSieben = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10)
  const lueckenlos = (after: string): FunktionsAntwort => ({ json: { week: probe(plusSieben(after)) } })

  /**
   * Ein Lauf am Sonntag, 18. Oktober 2026 — der Montag vor einem Jahr ist der
   * 13. Oktober 2025. `antworten` bekommt `after` und die Nummer des Abrufs.
   */
  async function lauf(argv: string[], antworten: (after: string, n: number) => FunktionsAntwort = lueckenlos) {
    const gefragt: string[] = []
    let code: number | string | null | undefined
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'))
    try {
      const ergebnis = await fahre(
        async () => {
          await main(argv)
          code = process.exitCode
        },
        {
          bestand: { congregations: [VERSAMMLUNG] },
          funktionen: {
            'import-week': (rumpf) => {
              gefragt.push(String(rumpf.after))
              return antworten(String(rumpf.after), gefragt.length)
            },
          },
        },
      )
      return { ...ergebnis, gefragt, code, text: ergebnis.ausgabe.join('\n') }
    } finally {
      vi.useRealTimers()
    }
  }

  it('--ab nennt die erste Woche, die kommt — gefragt wird nach der Woche davor', async () => {
    const { gefragt, ausgabe } = await lauf(['--ab', '2025-10-13', '--anzahl', '2', '--trocken'])
    expect(gefragt).toEqual(['2025-10-06', '2025-10-13'])
    expect(ausgabe).toContain('Holen:        2 Woche(n) ab 2025-10-13\n')
    expect(ausgabe.filter((z) => /^ {2}\d{4}-/.test(z)).map((z) => z.trim().slice(0, 10))).toEqual(['2025-10-13', '2025-10-20'])
  })

  it('--ab mitten in der Woche meint ihre Woche', async () => {
    const { gefragt } = await lauf(['--ab', '2025-10-15', '--anzahl', '1', '--trocken'])
    expect(gefragt).toEqual(['2025-10-06'])
  })

  it('das Jahr, die laufende Woche und sieben voraus: --anzahl 60 reicht bis Ende November', async () => {
    const { gefragt, ausgabe } = await lauf(['--ab', '2025-10-13', '--anzahl', '60', '--trocken'])
    expect(gefragt).toHaveLength(60)
    const wochen = ausgabe.filter((z) => /^ {2}\d{4}-/.test(z)).map((z) => z.trim().slice(0, 10))
    expect(wochen[0]).toBe('2025-10-13')
    expect(wochen).toContain('2026-10-12') // die laufende
    expect(wochen.at(-1)).toBe('2026-11-30')
  })

  it('mehr als anderthalb Jahre nimmt es nicht an — weiter reicht das Arbeitsheft nie', async () => {
    await expect(lauf(['--anzahl', '79'])).rejects.toThrow(/process\.exit\(2\).*zwischen 1 und 78/)
    await expect(lauf(['--anzahl', '78', '--trocken'])).resolves.toBeDefined()
  })

  it('--ab ohne Datum weist es ab, bevor es etwas holt', async () => {
    await expect(lauf(['--ab'])).rejects.toThrow(/process\.exit\(2\).*--ab braucht ein Datum/)
    await expect(lauf(['--ab', 'letzten-oktober'])).rejects.toThrow(/process\.exit\(2\)/)
  })

  it('springt die Kette, schreibt es, was kam — und endet mit Code 1', async () => {
    const { tabellen, code, text, meldungen } = await lauf(['--ab', '2025-10-13', '--anzahl', '2'], (after, n) =>
      n === 1 ? lueckenlos(after) : { json: { week: probe('2025-11-24') } },
    )
    expect((tabellen.weeks ?? []).map((z) => z.start)).toEqual(['2025-10-13', '2025-11-24'])
    expect(text).toContain('Lücke: nach 2025-10-13 kam erst 2025-11-24')
    expect(code).toBe(1)
    expect(meldungen.join('\n')).toContain('Nachholen mit: --ab 2025-10-20')
  })

  it('bricht die Function ab, endet es mit Code 1 und sagt, wo es weitergeht', async () => {
    const { tabellen, code, text, meldungen } = await lauf(['--ab', '2025-10-13', '--anzahl', '60'], (after, n) =>
      n <= 2 ? lueckenlos(after) : { status: 500, json: { error: 'Import fehlgeschlagen.' } },
    )
    expect((tabellen.weeks ?? []).map((z) => z.start)).toEqual(['2025-10-13', '2025-10-20'])
    expect(text).toContain('Abgebrochen nach 2 Woche(n): Import fehlgeschlagen.')
    expect(code).toBe(1)
    expect(meldungen.join('\n')).toContain('Nachholen mit: --ab 2025-10-27')
  })

  it('auch wenn schon der erste Abruf scheitert — dann gibt es nichts zu schreiben, aber Code 1', async () => {
    const { code, text } = await lauf(['--ab', '2025-10-13', '--anzahl', '60', '--trocken'], () => ({
      status: 500,
      json: { error: 'Import fehlgeschlagen.' },
    }))
    expect(text).toContain('Nichts zu tun.')
    expect(code).toBe(1)
  })

  it('das Ende des Hefts ist kein Fehler — der Lauf endet ohne Code 1', async () => {
    const { code, text } = await lauf(['--anzahl', '60', '--trocken'], (after, n) =>
      n <= 2 ? lueckenlos(after) : { status: 404, json: { error: 'Keine kommende Woche gefunden.', ende: true } },
    )
    expect(text).toContain('Danach nichts mehr: Keine kommende Woche gefunden.')
    expect(code).not.toBe(1)
  })
})
