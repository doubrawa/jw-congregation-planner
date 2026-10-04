/*
 * Die Edge Function `zuteilen`, Aufruf 'woche' (`zuteilen/woche.ts`): der
 * Schreibweg der Rechte-Stufe „Planer" (4.10.2026).
 *
 * Die Function schreibt mit der Service-Role Wochen — an RLS vorbei, die das
 * nur dem Admin erlaubt. Geprüft wird deshalb vor allem, was **nicht** gehen
 * darf, und dass jede Abweisung schreibfrei bleibt. Was als Zuteilung gilt,
 * prüft `src/app/zuteilen-grenze.test.ts` an den echten Aktionen; hier geht es
 * um Recht, Versammlung, Stand und Schreiben.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Rest } from '../_shared/rest.ts'
import { wocheZuteilen } from '../zuteilen/woche.ts'
import { filterWert } from './attrappe.ts'

const CONG = 'cong-1'
const FREMD = 'cong-2'
const MONTAG = '2026-09-07'

const U_PLANER = 'user-planer'
const U_ADMIN = 'user-admin'
const U_VERK = 'user-verkuendiger'
const U_FREMD = 'user-fremd'

const MEMBERS = [
  { user_id: U_PLANER, congregation_id: CONG, planner: false, zuteiler: true },
  { user_id: U_ADMIN, congregation_id: CONG, planner: true, zuteiler: false },
  { user_id: U_VERK, congregation_id: CONG, planner: false, zuteiler: false },
  { user_id: U_FREMD, congregation_id: FREMD, planner: false, zuteiler: true },
]

function frischeWoche() {
  return {
    start: MONTAG,
    range: '7.–13. September',
    mid: {
      date: '',
      end: '',
      sections: [
        {
          label: 'ERÖFFNUNG',
          farbe: 'neutral',
          items: [{ iid: 'k1', title: 'Lied 1 · Gebet', names: [{ name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] }],
        },
      ],
      helpers: {},
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

/* ---- Attrappe ------------------------------------------------------------ */

interface Aufruf {
  method: string
  path: string
  body?: unknown
}

let woche: ReturnType<typeof frischeWoche>
let stand: string
let aufrufe: Aufruf[]
/** Ändert die Woche zwischen Lesen und Schreiben. */
let konkurrent: (() => void) | null
/** Der Vergleich trifft nicht, obwohl sich nichts geändert hat. */
let vergleichHakt: boolean

const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const rest: Rest = {
  async get<T>(path: string): Promise<T> {
    aufrufe.push({ method: 'GET', path })
    let rows: unknown[] = []
    if (path.startsWith('members')) {
      rows = MEMBERS.filter((m) => m.user_id === filterWert(path, 'user_id'))
    } else if (path.startsWith('weeks') && filterWert(path, 'congregation_id') === CONG && filterWert(path, 'start') === MONTAG) {
      rows = path.startsWith('weeks?select=updated_at') ? [{ updated_at: stand }] : [{ data: kopie(woche), updated_at: stand }]
      if (konkurrent && !path.startsWith('weeks?select=updated_at')) {
        konkurrent()
        konkurrent = null
      }
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
    return ((await this.patchZeilen(path, body)) ?? []).length > 0
  },
  async patchZeilen<T>(path: string, body: unknown): Promise<T[] | null> {
    aufrufe.push({ method: 'PATCH', path, body })
    if (!path.startsWith('weeks') || filterWert(path, 'congregation_id') !== CONG) return []
    const bedingung = filterWert(path, 'updated_at')
    if (bedingung !== null && (bedingung !== stand || vergleichHakt)) return []
    woche = (body as { data: typeof woche }).data
    stand = `${stand}+1`
    return [{ updated_at: stand }] as T[]
  },
  async userId(): Promise<string | null> {
    return null
  },
}

beforeEach(() => {
  woche = frischeWoche()
  stand = '2026-09-01T10:00:00.000000+00:00'
  aufrufe = []
  konkurrent = null
  vergleichHakt = false
})

/** Die Woche, wie der Planer sie schickt: Gebet zugeteilt. */
function zugeteilt() {
  const w = frischeWoche()
  w.mid.sections[0]!.items[0]!.names[0] = { name: 'Paul Beispiel', pid: 'p1', rolle: 'Gebet', bereichsKey: 'gebet' } as never
  return w
}

/** Die Woche mit einem geänderten Ablauf: ein Titel getauscht. */
function umgebaut() {
  const w = zugeteilt()
  w.mid.sections[0]!.items[0]!.title = 'Lied 1 · Gebet · Eigener Zusatz'
  return w
}

const aufruf = (wer: string, rumpf: Record<string, unknown>) => wocheZuteilen(rest, wer, { action: 'woche', ...rumpf })
const antwort = async (res: Response) => ({ status: res.status, body: await res.json() })
const geschrieben = () => aufrufe.filter((a) => a.method !== 'GET')

describe('zuteilen: Rumpf', () => {
  it.each([
    ['ohne Woche', { stand: 'x', data: zugeteilt() }],
    ['Woche kein Datum', { woche: 'nächste', stand: 'x', data: zugeteilt() }],
    ['ohne Stand', { woche: MONTAG, data: zugeteilt() }],
    ['leerer Stand', { woche: MONTAG, stand: '', data: zugeteilt() }],
    ['ohne Daten', { woche: MONTAG, stand: 'x' }],
    ['Daten als Liste', { woche: MONTAG, stand: 'x', data: [] }],
  ])('%s → 400, nichts geschrieben', async (_name, rumpf) => {
    expect(await antwort(await aufruf(U_PLANER, rumpf))).toEqual({ status: 400, body: { error: 'bad-request' } })
    expect(geschrieben()).toEqual([])
  })
})

describe('zuteilen: wer darf', () => {
  it('ein Verkündiger nicht', async () => {
    const res = await aufruf(U_VERK, { woche: MONTAG, stand, data: zugeteilt() })
    expect(await antwort(res)).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(geschrieben()).toEqual([])
  })

  it('ein Konto ohne Versammlung nicht', async () => {
    const res = await aufruf('user-niemand', { woche: MONTAG, stand, data: zugeteilt() })
    expect(res.status).toBe(403)
    expect(geschrieben()).toEqual([])
  })

  it('ein Planer einer anderen Versammlung findet die Woche nicht — und schreibt nichts', async () => {
    const res = await aufruf(U_FREMD, { woche: MONTAG, stand, data: zugeteilt() })
    expect(await antwort(res)).toEqual({ status: 404, body: { error: 'week-not-found' } })
    expect(geschrieben()).toEqual([])
  })
})

describe('zuteilen: die Grenze', () => {
  it('ein Planer, der nur zuteilt, schreibt — mit Vergleich auf den Stand — und bekommt den neuen', async () => {
    const vorher = stand
    const res = await aufruf(U_PLANER, { woche: MONTAG, stand, data: zugeteilt() })
    expect(await antwort(res)).toEqual({ status: 200, body: { ok: true, stand: `${vorher}+1` } })
    const [patch] = geschrieben()
    expect(patch?.method).toBe('PATCH')
    expect(filterWert(patch!.path, 'updated_at')).toBe(vorher)
    expect(filterWert(patch!.path, 'congregation_id')).toBe(CONG)
    expect(filterWert(patch!.path, 'start')).toBe(MONTAG)
    expect(woche.mid.sections[0]!.items[0]!.names[0]).toMatchObject({ name: 'Paul Beispiel', pid: 'p1' })
  })

  it('ein Planer, der den Ablauf ändert, wird abgewiesen — nichts geschrieben', async () => {
    const res = await aufruf(U_PLANER, { woche: MONTAG, stand, data: umgebaut() })
    expect(await antwort(res)).toEqual({ status: 403, body: { error: 'nur-zuteilen' } })
    expect(geschrieben()).toEqual([])
    expect(woche).toEqual(frischeWoche())
  })

  it('der Admin darf auch umbauen', async () => {
    const res = await aufruf(U_ADMIN, { woche: MONTAG, stand, data: umgebaut() })
    expect(res.status).toBe(200)
    expect(woche.mid.sections[0]!.items[0]!.title).toBe('Lied 1 · Gebet · Eigener Zusatz')
  })
})

describe('zuteilen: der Stand', () => {
  it('ein veralteter Stand → 409, nichts geschrieben', async () => {
    const res = await aufruf(U_PLANER, { woche: MONTAG, stand: 'ein-alter-stand', data: zugeteilt() })
    expect(await antwort(res)).toEqual({ status: 409, body: { error: 'conflict' } })
    expect(geschrieben()).toEqual([])
  })

  it('schreibt ein anderer zwischen Lesen und Schreiben, gewinnt er — 409, kein zweiter Versuch ohne Bedingung', async () => {
    konkurrent = () => {
      stand = `${stand}+fremd`
    }
    const res = await aufruf(U_PLANER, { woche: MONTAG, stand, data: zugeteilt() })
    expect(await antwort(res)).toEqual({ status: 409, body: { error: 'conflict' } })
    const patches = geschrieben().filter((a) => a.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(filterWert(patches[0]!.path, 'updated_at')).not.toBeNull()
  })

  it('verfehlt der Vergleich ohne Änderung, wird ohne Bedingung geschrieben (kein falscher Alarm)', async () => {
    vergleichHakt = true
    const res = await aufruf(U_PLANER, { woche: MONTAG, stand, data: zugeteilt() })
    expect(res.status).toBe(200)
    const patches = geschrieben().filter((a) => a.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(filterWert(patches[1]!.path, 'updated_at')).toBeNull()
    expect(woche.mid.sections[0]!.items[0]!.names[0]).toMatchObject({ name: 'Paul Beispiel' })
  })
})
