/*
 * Die Edge Function `substitute`, Aufruf 'fill' (`fuellen.ts`): einen freien
 * Platz selbst übernehmen (4.10.2026).
 *
 * Die Function schreibt mit der Service-Role Wochen und Zusagen — an RLS
 * vorbei. Geprüft wird deshalb vor allem, was **nicht** gehen darf, und dass
 * jede Abweisung schreibfrei bleibt. Der REST-Zugang ist eine Attrappe des
 * `Rest`-Vertrags (`_shared/rest.ts`), die Filter wirklich auswertet: Fiele ein
 * Filter weg, sähe die Function hier nichts mehr.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Rest } from '../_shared/rest.ts'
import { helferKey, punktKey, ratgeberKey } from '../_shared/aufgaben-schluessel.ts'
import type { Week } from '../_shared/zuteilungen.ts'
import { platzFuellen } from '../substitute/fuellen.ts'
import { filterWert, likeMuster, passtAufMuster } from './attrappe.ts'

const CONG = 'cong-1'
const MONTAG = '2026-09-07' // Dienstag 8.9., Sonntag 13.9.
const HEUTE = '2026-09-07'

const U_ICH = 'user-ich'
const U_SCHWESTER = 'user-schwester'
const U_OHNE = 'user-ohne-person'
const U_FREMD = 'user-fremd'

const MEMBERS = [
  { user_id: U_ICH, person_id: 'p-ich', congregation_id: CONG },
  { user_id: U_SCHWESTER, person_id: 'p-schwester', congregation_id: CONG },
  { user_id: U_OHNE, person_id: null, congregation_id: CONG },
]

const PRIV = { gebet: true, vortrag: true, bibellesung: true, ratgeber: true, 'svc:mik': true, 'svc:rein': true }
const PERSONS = [
  { id: 'p-ich', fn: 'Ich', ln: 'Selbst', priv: PRIV, female: false },
  { id: 'p-schwester', fn: 'Eine', ln: 'Schwester', priv: PRIV, female: true },
]

const SERVICES = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const K_GEBET = punktKey(MONTAG, 'mid', 'k1', 0)
const K_VORTRAG = punktKey(MONTAG, 'mid', 'k2', 0)
const K_BIBELLESUNG = punktKey(MONTAG, 'mid', 'k3', 0)
const K_REDNER = punktKey(MONTAG, 'we', 'v1', 0)
const K_MIK = helferKey(MONTAG, 'mid', 'mik', 1)
const K_REIN = helferKey(MONTAG, 'mid', 'rein', 0)
const K_RATGEBER = ratgeberKey(MONTAG, 'mid')

function frischeWoche(): Week {
  return {
    start: MONTAG,
    mid: {
      date: '7.–13. September',
      sections: [
        { label: 'ERÖFFNUNG', items: [{ iid: 'k1', title: 'Lied 1 · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }] },
        { label: 'SCHÄTZE AUS GOTTES WORT', items: [
          { iid: 'k2', title: 'Platzhalter-Thema', names: [{ name: '', bereichsKey: 'vortrag', male: true }] },
          { iid: 'k3', title: 'Bibellesung', names: [{ name: '', bereichsKey: 'bibellesung' }], aux: [{ name: '', bereichsKey: 'bibellesung' }] },
        ] },
      ],
      helpers: { mik: [{ name: 'Andere Person', pid: 'p-x' }] },
    },
    we: {
      date: '7.–13. September',
      sections: [{ label: 'ÖFFENTLICHER VORTRAG', items: [{ iid: 'v1', title: 'Platzhalter-Vortrag', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }] }],
      helpers: {},
    },
  } as Week
}

/* ---- Attrappe ------------------------------------------------------------ */

interface Aufruf {
  method: string
  path: string
  body?: unknown
}

let woche: Week
let stand: string
let versand: string[]
let abwesend: { person_id: string; from_date: string; to_date: string }[]
let aufrufe: Aufruf[]
/** Ändert die Woche zwischen Lesen und Schreiben — der Wettlauf, den der Vergleich abfangen muss. */
let konkurrent: (() => void) | null
/** So oft scheitert ein Schreibversuch, ohne dass jemand geschrieben hat — ein Aussetzer (Netz, Zeitüberschreitung). */
let aussetzer: number
/** Läuft einmal nach einem Aussetzer — ein anderer schreibt genau zwischen erstem und zweitem Versuch. */
let zwischendurch: (() => void) | null

const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const rest: Rest = {
  async get<T>(path: string): Promise<T> {
    const cong = filterWert(path, 'congregation_id') ?? filterWert(path, 'id')
    const fremd = path.startsWith('congregations') ? cong !== CONG : cong !== null && cong !== CONG
    let rows: unknown[] = []
    if (path.startsWith('members')) {
      const wer = filterWert(path, 'user_id')
      rows = MEMBERS.filter((m) => m.user_id === wer)
    } else if (fremd) {
      rows = []
    } else if (path.startsWith('weeks?select=updated_at')) {
      rows = filterWert(path, 'start') === MONTAG ? [{ updated_at: stand }] : []
    } else if (path.startsWith('weeks')) {
      rows = filterWert(path, 'start') === MONTAG ? [{ start: MONTAG, data: kopie(woche), updated_at: stand }] : []
      if (konkurrent) {
        konkurrent()
        konkurrent = null
      }
    } else if (path.startsWith('services')) {
      rows = SERVICES
    } else if (path.startsWith('persons')) {
      rows = PERSONS.filter((p) => p.id === filterWert(path, 'id'))
    } else if (path.startsWith('congregations')) {
      rows = [{ mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00' }]
    } else if (path.startsWith('absences')) {
      rows = abwesend.filter((a) => a.person_id === filterWert(path, 'person_id'))
    } else if (path.startsWith('assignment_log')) {
      const muster = likeMuster(path, 'task_key')
      rows = versand.filter((k) => muster.every((m) => passtAufMuster(k, m))).map((task_key) => ({ task_key }))
    }
    return rows as T
  },
  async insert(path, rows): Promise<void> {
    aufrufe.push({ method: 'POST', path, body: rows })
  },
  async send(method, path, body): Promise<void> {
    aufrufe.push({ method, path, body })
  },
  async patchIf(path, body): Promise<boolean> {
    aufrufe.push({ method: 'PATCH', path, body })
    if (aussetzer > 0) {
      aussetzer--
      zwischendurch?.()
      zwischendurch = null
      return false
    }
    if (!path.startsWith('weeks') || filterWert(path, 'congregation_id') !== CONG) return false
    const bedingung = filterWert(path, 'updated_at')
    if (bedingung !== null && bedingung !== stand) return false
    woche = (body as { data: Week }).data
    stand = `${stand}+1`
    return true
  },
  async patchZeilen<T>(path: string, body: unknown): Promise<T[] | null> {
    return (await this.patchIf(path, body)) ? ([{ updated_at: stand }] as T[]) : []
  },
  async userId(): Promise<string | null> {
    return null
  },
}

beforeEach(() => {
  woche = frischeWoche()
  stand = '2026-09-01T10:00:00.000000+00:00'
  // Der Plan ist gesendet: ein Eintrag zu einem Platz dieser Woche.
  versand = [punktKey(MONTAG, 'mid', 'kx', 0)]
  abwesend = []
  aufrufe = []
  konkurrent = null
  aussetzer = 0
  zwischendurch = null
})

const fuellen = (taskKey: string, wer = U_ICH, heute = HEUTE) => platzFuellen(rest, wer, taskKey, heute)
const antwort = async (res: Response) => ({ status: res.status, body: await res.json() })
const geschrieben = () => aufrufe.filter((a) => a.method !== 'GET')

/** Name im Gebet-Platz, wie er gespeichert wurde. */
const gespeichert = () => woche.mid?.sections?.[0]?.items?.[0] as { names: { name: string; pid?: string }[] }

/* ---- Fälle --------------------------------------------------------------- */

describe('fill: der Weg, der gehen soll', () => {
  it('trägt in den Programmpunkt ein — Name und Person-Id — und setzt die Zusage', async () => {
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 200, body: { ok: true, filled: true } })
    expect(gespeichert().names[0]).toMatchObject({ name: 'Ich Selbst', pid: 'p-ich', rolle: 'Gebet', bereichsKey: 'gebet' })
    const zusage = aufrufe.find((a) => a.method === 'POST' && a.path === 'confirmations')
    expect(zusage?.body).toEqual([{ congregation_id: CONG, user_id: U_ICH, task_key: K_GEBET, status: 'bestätigt' }])
    // Erst die alte Zeile weg (eine Absage dessen, der ihn vorher hatte), dann die neue.
    const loeschen = aufrufe.findIndex((a) => a.method === 'DELETE' && a.path.startsWith('confirmations'))
    expect(loeschen).toBeGreaterThanOrEqual(0)
    expect(loeschen).toBeLessThan(aufrufe.findIndex((a) => a.method === 'POST'))
  })

  it('schreibt nur mit dem gelesenen Stand — Vergleiche-und-Tausche auf updated_at', async () => {
    await fuellen(K_GEBET)
    const patch = aufrufe.find((a) => a.method === 'PATCH')
    expect(filterWert(patch?.path ?? '', 'updated_at')).toBe('2026-09-01T10:00:00.000000+00:00')
    expect(filterWert(patch?.path ?? '', 'congregation_id')).toBe(CONG)
  })

  it('einen Hilfsdienst-Platz hinter dem letzten belegten — die Lücke davor bleibt leer', async () => {
    woche.mid!.helpers = {}
    expect((await fuellen(K_MIK)).status).toBe(200)
    expect(woche.mid?.helpers?.mik).toEqual([{ name: '' }, { name: 'Ich Selbst', pid: 'p-ich' }])
  })

  it('den Ratgeber der Zusätzlichen Klasse', async () => {
    woche.mid!.auxRatgeber = { name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true }
    expect((await fuellen(K_RATGEBER)).status).toBe(200)
    expect(woche.mid?.auxRatgeber).toMatchObject({ name: 'Ich Selbst', pid: 'p-ich', bereichsKey: 'ratgeber' })
  })

  it('schickt keine Mitteilung (Betreiber, 4.10.2026)', async () => {
    await fuellen(K_GEBET)
    expect(aufrufe.some((a) => a.path.startsWith('notifications'))).toBe(false)
  })

  it('ein Aussetzer beim ersten Schreiben verwirft den Tipp nicht — der zweite Versuch trägt dieselbe Bedingung', async () => {
    aussetzer = 1
    expect((await fuellen(K_GEBET)).status).toBe(200)
    expect(gespeichert().names[0]?.name).toBe('Ich Selbst')
    const patches = aufrufe.filter((a) => a.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(patches.every((p) => filterWert(p.path, 'updated_at') === '2026-09-01T10:00:00.000000+00:00')).toBe(true)
  })
})

describe('fill: was abgewiesen wird — und dann nichts schreibt', () => {
  it.each([
    ['ein Treffpunkt', `fs|${MONTAG}|i1`],
    ['das Zeugnisgeben', `oz|${MONTAG}|e1`],
    ['Unsinn', 'kaputt'],
  ])('%s → 400', async (_name, key) => {
    expect((await fuellen(key)).status).toBe(400)
    expect(geschrieben()).toEqual([])
  })

  it('kein Mitglied → 403 forbidden', async () => {
    expect(await antwort(await fuellen(K_GEBET, U_FREMD))).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(geschrieben()).toEqual([])
  })

  it('ein Konto ohne Person → 403', async () => {
    expect(await antwort(await fuellen(K_GEBET, U_OHNE))).toEqual({ status: 403, body: { error: 'not-qualified' } })
    expect(geschrieben()).toEqual([])
  })

  it('ohne den Aufgabenbereich → 403', async () => {
    PERSONS[0]!.priv = { ...PRIV, gebet: false }
    try {
      expect((await fuellen(K_GEBET)).status).toBe(403)
      expect(geschrieben()).toEqual([])
    } finally {
      PERSONS[0]!.priv = PRIV
    }
  })

  it('einen Brüder-Platz keiner Schwester → 403', async () => {
    expect(await antwort(await fuellen(K_VORTRAG, U_SCHWESTER))).toEqual({ status: 403, body: { error: 'not-qualified' } })
    expect(geschrieben()).toEqual([])
  })

  it.each([
    ['eine Schulungsaufgabe', K_BIBELLESUNG],
    ['den Rednerplatz', K_REDNER],
    ['die Reinigung', K_REIN],
  ])('%s wird nicht angeboten → 403 not-offered', async (_name, key) => {
    expect(await antwort(await fuellen(key))).toEqual({ status: 403, body: { error: 'not-offered' } })
    expect(geschrieben()).toEqual([])
  })

  it('vor „Plan senden" → 409 — ein gesendeter Treffpunkt zählt nicht', async () => {
    versand = []
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 409, body: { error: 'not-published' } })
    versand = [`fs|${MONTAG}|i1`]
    expect((await fuellen(K_GEBET)).status).toBe(409)
    expect(geschrieben()).toEqual([])
  })

  it('ein schon besetzter Platz → 409 slot-taken', async () => {
    gespeichert().names[0] = { name: 'Andere Person', pid: 'p-x' }
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 409, body: { error: 'slot-taken' } })
    expect(geschrieben()).toEqual([])
  })

  it('die Woche hat sich zwischen Lesen und Schreiben geändert → 409, keine Zusage', async () => {
    konkurrent = () => {
      stand = '2026-09-07T08:00:00.000000+00:00' // ein Planer hat gespeichert
    }
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 409, body: { error: 'slot-taken' } })
    expect(aufrufe.some((a) => a.path.startsWith('confirmations'))).toBe(false)
  })

  it('schreibt genau zwischen den beiden Versuchen ein anderer, bleibt dessen Woche — 409, keine Zusage (5.10.2026)', async () => {
    // Bis zum 5.10.2026 ging der zweite Versuch ohne Bedingung hinaus, sobald
    // beim Nachsehen noch der alte Stand dastand — und schrieb über das, was
    // ein Planer in genau diesem Augenblick gespeichert hatte.
    aussetzer = 1
    zwischendurch = () => {
      const fremd = frischeWoche()
      ;(fremd.mid!.sections![0]!.items![0] as { names: { name: string }[] }).names[0] = { name: 'Andere Person' }
      woche = fremd
      stand = '2026-09-07T08:00:00.000000+00:00'
    }
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 409, body: { error: 'slot-taken' } })
    expect(gespeichert().names[0]?.name).toBe('Andere Person')
    expect(aufrufe.some((a) => a.path.startsWith('confirmations'))).toBe(false)
  })

  it('eine ausgefallene Zusammenkunft → 409', async () => {
    woche.dev = { mid: { cancelled: true } }
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 409, body: { error: 'meeting-cancelled' } })
    expect(geschrieben()).toEqual([])
  })

  it('eine vergangene Zusammenkunft → 409 — am Tag selbst geht es noch', async () => {
    expect(await antwort(await fuellen(K_GEBET, U_ICH, '2026-09-09'))).toEqual({ status: 409, body: { error: 'past' } })
    expect(geschrieben()).toEqual([])
    expect((await fuellen(K_GEBET, U_ICH, '2026-09-08')).status).toBe(200)
  })

  it('an dem Tag abwesend → 409', async () => {
    abwesend = [{ person_id: 'p-ich', from_date: '2026-09-08', to_date: '2026-09-08' }]
    expect(await antwort(await fuellen(K_GEBET))).toEqual({ status: 409, body: { error: 'absent' } })
    expect(geschrieben()).toEqual([])
  })

  it.each([
    ['ein Hilfsdienst-Platz jenseits der Platzzahl', helferKey(MONTAG, 'mid', 'mik', 2)],
    ['ein Punkt, den es nicht gibt', punktKey(MONTAG, 'mid', 'weg', 0)],
    ['eine Woche, die es nicht gibt', punktKey('2027-01-04', 'mid', 'k1', 0)],
    ['ein Platz der Zusätzlichen Klasse, wenn es keine gibt', punktKey(MONTAG, 'mid', 'k3', 0, true)],
    ['ein Ratgeber ohne Zusätzliche Klasse', K_RATGEBER],
  ])('%s → 404', async (_name, key) => {
    expect((await fuellen(key)).status).toBe(404)
    expect(geschrieben()).toEqual([])
  })
})
