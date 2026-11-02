import { beforeEach, describe, expect, it } from 'vitest'
import type { Rest } from '../_shared/rest.ts'
import { wocheSchreiben } from '../_shared/woche-schreiben.ts'
import { filterWert } from './attrappe.ts'

/*
 * Das bedingte Schreiben einer Woche, das `substitute` und `tauschen` teilen.
 * Die Attrappe ist eine einzige Wochenzeile. Was die Datenbank mit dem Inhalt
 * tut, tut sie auch: Über die Leitung geht JSON, also kein `undefined`, und
 * `jsonb` ordnet die Schlüssel beim Speichern neu.
 */

const CONG = '00000000-0000-4000-8000-000000000001'
const MONTAG = '2026-09-07'
const STAND = '2026-09-01T10:00:00.000000+00:00'

const INHALT = {
  start: MONTAG,
  mid: { helpers: { mik: [{ name: 'Andere Person', pid: 'p-x' }, { name: 'Ich Selbst', pid: 'p-ich' }] } },
  we: { sections: [] },
}

/** Wie `jsonb` die Schlüssel ordnet: erst nach Länge, dann nach Zeichen. */
function ordnen(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(ordnen)
  if (x === null || typeof x !== 'object') return x
  const eintraege = Object.entries(x).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(eintraege.map(([k, v]) => [k, ordnen(v)]))
}

/** Was mit einem Schreibversuch geschieht: Er kommt an, setzt aus (nichts geschrieben), oder er schreibt, und seine Antwort geht verloren. */
type Versuch = 'ankommen' | 'aussetzen' | 'antwortVerlieren'

let zeile: { data: unknown; updated_at: string }
let staende: number
let aufrufe: string[]
let versuche: Versuch[]
/** Läuft einmal nach dem ersten Versuch — ein anderer schreibt genau zwischen den beiden. */
let zwischendurch: (() => void) | null
let nachsehenKaputt: boolean

const speichern = (data: unknown) => {
  zeile = { data: ordnen(JSON.parse(JSON.stringify(data))), updated_at: `${STAND}+${++staende}` }
}

const nichtGebraucht = (weg: string) => async (): Promise<never> => {
  throw new Error(`wocheSchreiben schreibt nicht über ${weg}`)
}

const rest: Rest = {
  async get<T>(path: string): Promise<T> {
    aufrufe.push(`GET ${path}`)
    if (nachsehenKaputt) throw new Error('Netz weg')
    const trifft = filterWert(path, 'congregation_id') === CONG && filterWert(path, 'start') === MONTAG
    return (trifft ? [zeile] : []) as T
  },
  async patchZeilen<T>(path: string, body: unknown): Promise<T[] | null> {
    aufrufe.push(`PATCH ${path}`)
    try {
      const wie = versuche.shift() ?? 'ankommen'
      if (wie === 'aussetzen') throw new Error('Zeitüberschreitung')
      if (filterWert(path, 'updated_at') !== zeile.updated_at) return []
      speichern((body as { data: unknown }).data)
      if (wie === 'antwortVerlieren') throw new Error('Netz weg, nachdem geschrieben war')
      return [{ updated_at: zeile.updated_at }] as T[]
    } finally {
      zwischendurch?.()
      zwischendurch = null
    }
  },
  insert: nichtGebraucht('insert'),
  upsert: nichtGebraucht('upsert'),
  send: nichtGebraucht('send'),
  zeilenSchreiben: nichtGebraucht('zeilenSchreiben'),
  userId: nichtGebraucht('userId'),
}

beforeEach(() => {
  zeile = { data: { start: MONTAG, mid: { helpers: {} }, we: { sections: [] } }, updated_at: STAND }
  staende = 0
  aufrufe = []
  versuche = []
  zwischendurch = null
  nachsehenKaputt = false
})

const schreiben = (data: unknown = INHALT) => wocheSchreiben(rest, CONG, MONTAG, STAND, data)
const patches = () => aufrufe.filter((a) => a.startsWith('PATCH'))

describe('wocheSchreiben', () => {
  it('trifft der erste Versuch, bleibt es bei ihm — mit der Bedingung auf den gelesenen Stand', async () => {
    expect(await schreiben()).toBe(`${STAND}+1`)
    expect(aufrufe).toHaveLength(1)
    expect(filterWert(patches()[0]!, 'updated_at')).toBe(STAND)
  })

  it('ein Aussetzer verwirft nichts: Der zweite Versuch trägt dieselbe Bedingung', async () => {
    versuche = ['aussetzen']
    expect(await schreiben()).toBe(`${STAND}+1`)
    expect(patches().map((p) => filterWert(p, 'updated_at'))).toEqual([STAND, STAND])
    expect(zeile.data).toEqual(INHALT)
  })

  it('kam der erste Versuch an und ging nur seine Antwort verloren, gilt er — nicht als Konflikt', async () => {
    // Der zweite verfehlt dann den Stand, den der erste gesetzt hat. Was in
    // der Woche steht, ist trotzdem das Eigene, nur anders geordnet, und ein
    // `undefined` ist gar nicht erst angekommen.
    versuche = ['antwortVerlieren']
    expect(await schreiben({ ...INHALT, notiz: undefined })).toBe(`${STAND}+1`)
    expect(patches()).toHaveLength(2)
    expect(JSON.stringify(zeile.data)).not.toBe(JSON.stringify(INHALT))
  })

  it('schreibt zwischen den beiden Versuchen ein anderer, bleibt seine Woche — und es ist ein Konflikt', async () => {
    versuche = ['aussetzen']
    const fremd = { ...INHALT, mid: { helpers: { mik: [{ name: 'Andere Person', pid: 'p-x' }, { name: 'Noch Jemand', pid: 'p-y' }] } } }
    zwischendurch = () => speichern(fremd)
    expect(await schreiben()).toBeNull()
    expect(zeile.data).toEqual(fremd)
  })

  it('dieselben Einträge in anderer Reihenfolge sind eine andere Woche', async () => {
    versuche = ['aussetzen']
    const getauscht = { ...INHALT, mid: { helpers: { mik: [...INHALT.mid.helpers.mik].reverse() } } }
    zwischendurch = () => speichern(getauscht)
    expect(await schreiben()).toBeNull()
  })

  it('scheitert auch das Nachsehen, bleibt es beim Konflikt', async () => {
    versuche = ['antwortVerlieren']
    nachsehenKaputt = true
    expect(await schreiben()).toBeNull()
  })
})
