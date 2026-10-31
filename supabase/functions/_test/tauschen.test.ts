/*
 * Die Edge Function `tauschen` — Hilfsdienste tauschen (T153, 29.10.2026).
 *
 * Sie schreibt mit der Dienstrolle zwei Plätze, Zusagen, Tagebuch und
 * Mitteilungen — an RLS vorbei. Zwei Fehlerarten kosten hier etwas:
 *
 *  - **zu viel Recht**: Wer den Platz nicht hat, tauscht ihn trotzdem weg;
 *    wer nicht gefragt ist, nimmt an; ein Platz wird getauscht, obwohl der
 *    Neue an dem Tag fehlt oder schon eingeteilt ist.
 *  - **halb getauscht**: Ein Platz ist umgeschrieben, der andere nicht — dann
 *    stünde einer doppelt da und der andere Tag ohne ihn.
 *
 * Zuerst die Regeln (`regeln.ts`) an einer gebauten Lage, dann der Ablauf
 * über die echte index.ts (Aufbau wie `trolley.test.ts`: `Deno` als Global,
 * `fetch` stellt Anmeldung und REST nach und wertet die Filter aus).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { helferKey } from '../_shared/aufgaben-schluessel.ts'
import { STANDARD_ZEITEN } from '../_shared/planung.ts'
import type { ServiceRow, Week } from '../_shared/zuteilungen.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { type Lage, type TauschPerson, type TauschWoche, tauschAngebote, tauschAnwenden, tauschPruefen } from '../tauschen/regeln.ts'
import { TITEL_ABGELEHNT, TITEL_ANGEFRAGT, TITEL_GETAUSCHT } from '../tauschen/texte.ts'
import { TITEL_GESUCHT } from '../substitute/texte.ts'
import { reset as resetPush, sent as sentPush } from './web-push.stub'
import { filterWert, jsonRes, likeMuster, ohneFragment, passtAufMuster } from './attrappe.ts'

/* ---- Fixture ------------------------------------------------------------- */

const CONG = 'cong-1'
const W1 = '2026-09-07' // Dienstag 8.9., Sonntag 13.9.
const W2 = '2026-09-14' // Dienstag 15.9., Sonntag 20.9.
const HEUTE = '2026-09-07'

const SERVICES: ServiceRow[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

const mik = { 'svc:mik': true, 'svc:rein': true }
const PERSONEN: TauschPerson[] = [
  { id: 'p-simon', fn: 'Simon', ln: 'Krüger', priv: mik },
  { id: 'p-jonas', fn: 'Jonas', ln: 'Berger', priv: mik },
  // Mit Recht, aber ohne Konto — könnte nicht antworten.
  { id: 'p-lena', fn: 'Lena', ln: 'Hoffmann', priv: mik },
  { id: 'p-otto', fn: 'Otto', ln: 'Hne', priv: {} },
  { id: 'p-ada', fn: 'Ada', ln: 'Min', priv: {} },
  // Mit Recht und Konto, aber ohne Platz — bekommt einen, wenn der Planer umteilt.
  { id: 'p-karl', fn: 'Karl', ln: 'Probe', priv: mik },
]

/** Simon gibt ab (So 13.9.) — Jonas hat denselben Dienst eine Woche später (So 20.9.). */
const A = helferKey(W1, 'we', 'mik', 0)
const B = helferKey(W2, 'we', 'mik', 0)
/** Lena, Dienstag 15.9. — ohne Konto. */
const C = helferKey(W2, 'mid', 'mik', 0)
/** Ein zweiter Platz in Simons eigener Zusammenkunft. */
const A2 = helferKey(W1, 'we', 'mik', 1)

const slot = (pid: string) => {
  const p = PERSONEN.find((x) => x.id === pid)!
  return { name: `${p.fn} ${p.ln}`, pid }
}

function wochen(): Record<string, Week> {
  return {
    [W1]: {
      start: W1,
      mid: { helpers: { mik: [slot('p-jonas')] } },
      we: { helpers: { mik: [slot('p-simon'), slot('p-otto')], rein: [slot('p-simon')] } },
    },
    [W2]: {
      start: W2,
      mid: { helpers: { mik: [slot('p-lena')] } },
      we: { helpers: { mik: [slot('p-jonas')] } },
    },
  }
}

function lage(patch: Partial<Lage> = {}, daten = wochen()): Lage {
  return {
    wochen: new Map(Object.entries(daten).map(([start, data]) => [start, { start, data, updated_at: `S-${start}` }])),
    services: SERVICES,
    personen: new Map(PERSONEN.map((p) => [p.id, p])),
    abwesend: () => false,
    gesendet: new Set([W1, W2]),
    zeiten: STANDARD_ZEITEN,
    heute: HEUTE,
    ...patch,
  }
}

/* ---- Die Regeln ---------------------------------------------------------- */

describe('Regeln: wann zwei Plätze getauscht werden dürfen', () => {
  it('derselbe Dienst an einem anderen Tag — a ist der eigene, b der des Partners', () => {
    const u = tauschPruefen(lage(), A, B, 'p-simon')
    expect(u).toMatchObject({ ok: true, a: { key: A, tag: '2026-09-13' }, b: { key: B, tag: '2026-09-20' } })
    if (u.ok) expect([u.a.person.id, u.b.person.id]).toEqual(['p-simon', 'p-jonas'])
  })

  it.each([
    ['kein Hilfsdienst', `${W2}|we|part|v1|0`, 'bad-request'],
    ['ein anderer Dienst', helferKey(W2, 'we', 'ordner', 0), 'bad-request'],
    ['dieselbe Zusammenkunft', A2, 'bad-request'],
    ['ein Platz hinter der Platzzahl', helferKey(W2, 'we', 'mik', 2), 'slot-not-found'],
    ['eine Woche, die es nicht gibt', helferKey('2026-09-21', 'we', 'mik', 0), 'slot-not-found'],
    ['ein leerer Platz', helferKey(W2, 'we', 'mik', 1), 'no-partner'],
  ])('%s → %s', (_, nimmt, fehler) => {
    expect(tauschPruefen(lage(), A, nimmt, 'p-simon')).toEqual({ ok: false, fehler })
  })

  it('nur den eigenen Platz — über die Kennung, nicht den Namen', () => {
    expect(tauschPruefen(lage(), A, B, 'p-otto')).toEqual({ ok: false, fehler: 'not-yours' })
    const d = wochen()
    d[W1]!.we!.helpers!.mik![0] = { name: 'Simon Krüger' } // Altbestand ohne Kennung
    expect(tauschPruefen(lage({}, d), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'not-yours' })
  })

  it('mit sich selbst tauscht niemand', () => {
    const d = wochen()
    d[W2]!.we!.helpers!.mik![0] = slot('p-simon')
    expect(tauschPruefen(lage({}, d), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'no-partner' })
  })

  it('die Reinigung nicht: Sie übernimmt eine Gruppe', () => {
    expect(tauschPruefen(lage(), helferKey(W1, 'we', 'rein', 0), helferKey(W2, 'we', 'rein', 0), 'p-simon')).toEqual({
      ok: false,
      fehler: 'not-offered',
    })
  })

  it('nicht bei einer ausgefallenen Zusammenkunft — auf keiner der beiden Seiten', () => {
    const d = wochen()
    d[W2]!.dev = { we: { cancelled: true } }
    expect(tauschPruefen(lage({}, d), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'meeting-cancelled' })
  })

  it('nur in Wochen, deren Plan hinausging — beide', () => {
    expect(tauschPruefen(lage({ gesendet: new Set([W1]) }), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'not-published' })
    expect(tauschPruefen(lage({ gesendet: new Set([W2]) }), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'not-published' })
  })

  it('nichts, was vorbei ist — am Tag selbst geht es noch', () => {
    expect(tauschPruefen(lage({ heute: '2026-09-13' }), A, B, 'p-simon').ok).toBe(true)
    expect(tauschPruefen(lage({ heute: '2026-09-14' }), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'past' })
  })

  it('beide müssen den Dienst können', () => {
    const ohne = (pid: string) => new Map(PERSONEN.map((p) => [p.id, p.id === pid ? { ...p, priv: {} } : p]))
    expect(tauschPruefen(lage({ personen: ohne('p-simon') }), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'not-qualified' })
    expect(tauschPruefen(lage({ personen: ohne('p-jonas') }), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'not-qualified' })
  })

  it('beide müssen an ihrem neuen Tag da sein — nicht am alten', () => {
    const fehlt = (pid: string, tag: string) => lage({ abwesend: (p, t) => p === pid && t === tag })
    expect(tauschPruefen(fehlt('p-simon', '2026-09-20'), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'absent' })
    expect(tauschPruefen(fehlt('p-jonas', '2026-09-13'), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'absent' })
    // Wer am alten Tag fehlt, will gerade deshalb tauschen.
    expect(tauschPruefen(fehlt('p-simon', '2026-09-13'), A, B, 'p-simon').ok).toBe(true)
  })

  it('und dort nicht schon eingeteilt sein — Id vor Name', () => {
    const d = wochen()
    d[W2]!.we!.helpers!.ordner = [slot('p-simon')]
    expect(tauschPruefen(lage({ services: [...SERVICES, { key: 'ordner', name: 'Ordner', count: 1, groups: false }] }, d), A, B, 'p-simon')).toEqual({
      ok: false,
      fehler: 'busy',
    })
    const e = wochen()
    e[W1]!.we!.helpers!.mik![1] = slot('p-jonas')
    expect(tauschPruefen(lage({}, e), A, B, 'p-simon')).toEqual({ ok: false, fehler: 'busy' })
  })
})

describe('Regeln: die Angebote', () => {
  it('jeder passende Platz desselben Dienstes, der früheste zuerst — ohne die eigene Zusammenkunft', () => {
    expect(tauschAngebote(lage(), A, 'p-simon').map((b) => [b.key, b.person.id])).toEqual([
      [helferKey(W1, 'mid', 'mik', 0), 'p-jonas'],
      [C, 'p-lena'],
      [B, 'p-jonas'],
    ])
  })

  it('wer den Platz nicht hat, bekommt keine', () => {
    expect(tauschAngebote(lage(), A, 'p-jonas')).toEqual([])
  })
})

describe('Regeln: der Tausch selbst', () => {
  it('auf a steht der Partner, auf b der Fragende — mit Name und Kennung; die gelesene Lage bleibt', () => {
    const l = lage()
    const u = tauschPruefen(l, A, B, 'p-simon')
    if (!u.ok) throw new Error(u.fehler)
    const neu = tauschAnwenden(l, u.a, u.b)
    expect(neu.get(W1)?.we?.helpers?.mik?.[0]).toEqual({ name: 'Jonas Berger', pid: 'p-jonas' })
    expect(neu.get(W2)?.we?.helpers?.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    expect(l.wochen.get(W1)?.data.we?.helpers?.mik?.[0]?.pid).toBe('p-simon')
  })

  it('liegen beide Plätze in einer Woche, ist es eine geänderte Woche', () => {
    const d = wochen()
    d[W1]!.mid!.helpers!.mik = [slot('p-jonas')]
    const l = lage({}, d)
    const u = tauschPruefen(l, A, helferKey(W1, 'mid', 'mik', 0), 'p-simon')
    if (!u.ok) throw new Error(u.fehler)
    const neu = tauschAnwenden(l, u.a, u.b)
    expect([...neu.keys()]).toEqual([W1])
    expect(neu.get(W1)?.mid?.helpers?.mik?.[0]?.pid).toBe('p-simon')
    expect(neu.get(W1)?.we?.helpers?.mik?.[0]?.pid).toBe('p-jonas')
  })
})

/* ---- Der Ablauf über die Function ---------------------------------------- */

const U_SIMON = 'user-simon'
const U_JONAS = 'user-jonas'
const U_ADMIN = 'user-admin'
const U_OTTO = 'user-otto'
const U_OHNE = 'user-ohne-person'
const U_KARL = 'user-karl'

const MEMBERS = [
  { user_id: U_SIMON, person_id: 'p-simon', planner: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_JONAS, person_id: 'p-jonas', planner: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_OTTO, person_id: 'p-otto', planner: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_ADMIN, person_id: 'p-ada', planner: true, zuteiler: false, congregation_id: CONG },
  { user_id: U_OHNE, person_id: null, planner: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_KARL, person_id: 'p-karl', planner: false, zuteiler: false, congregation_id: CONG },
]
const SUBS = [
  { id: 's1', user_id: U_JONAS, endpoint: 'https://push.test/jonas', p256dh: 'k', auth: 'a', lang: 'de' },
  { id: 's2', user_id: U_SIMON, endpoint: 'https://push.test/simon', p256dh: 'k', auth: 'a', lang: 'en' },
]

interface Anfrage {
  id: string
  congregation_id: string
  von_user: string
  von_person: string
  an_person: string
  gibt_ab: string
  nimmt: string
  bis: string
}

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let bestand: Map<string, TauschWoche>
let anfragen: Anfrage[]
let geschrieben: { method: string; path: string; body: unknown }[]
let naechsteId: number
/** Die Datenbank weist das Schreiben der beiden Wochen ab — ein anderer war schneller. */
let wochenAbweisen: boolean
/** Abwesenheiten, wie `absences` sie liefert. */
let abwesenheiten: { person_id: string; from_date: string; to_date: string }[]
/** Eine zweite Anfrage zum selben Platz kam zwischen Prüfen und Anlegen an (unique). */
let anfrageAbweisen: boolean
/** Jeder Lesezugriff scheitert am Netz. */
let netzWeg: boolean

/** Werte eines `spalte=in.(…)`-Filters, dekodiert — oder null. */
const inWerte = (path: string, spalte: string): string[] | null => {
  const m = new RegExp(`[?&]${spalte}=in\\.\\(([^)]*)\\)`).exec(path)
  return m ? (m[1] ?? '').split(',').map(decodeURIComponent) : null
}

/** Trifft eine Zeile die `eq`-, `neq`-, `lt`- und `in`-Filter auf diesen Spalten? */
const trifft = (path: string, z: Record<string, unknown>, spalten: string[]): boolean =>
  spalten.every((s) => {
    const gleich = filterWert(path, s)
    const ungleich = new RegExp(`[?&]${s}=neq\\.([^&]*)`).exec(path)?.[1]
    const kleiner = new RegExp(`[?&]${s}=lt\\.([^&]*)`).exec(path)?.[1]
    const in_ = inWerte(path, s)
    return (
      (gleich === null || String(z[s]) === gleich) &&
      (ungleich === undefined || String(z[s]) !== decodeURIComponent(ungleich)) &&
      (kleiner === undefined || String(z[s]) < decodeURIComponent(kleiner)) &&
      (in_ === null || in_.includes(String(z[s])))
    )
  })

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = ohneFragment(input)
  const method = init?.method ?? 'GET'
  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }
  if (netzWeg) throw new Error('Netz weg: rest/v1')
  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (method !== 'GET') geschrieben.push({ method, path, body })
  const cong = filterWert(path, 'congregation_id')
  if (cong !== null && cong !== CONG) return jsonRes([])

  if (path.startsWith('rpc/wochen_tauschen')) {
    const r = body as Record<string, string>
    const a = bestand.get(r.p_woche_a!)
    const b = bestand.get(r.p_woche_b!)
    if (wochenAbweisen || !a || !b || a.updated_at !== r.p_stand_a || b.updated_at !== r.p_stand_b) {
      return jsonRes({ code: '40001', message: 'wochen_tauschen: Stand verfehlt' }, 409)
    }
    a.data = body.p_data_a as Week
    b.data = body.p_data_b as Week
    a.updated_at = `${a.updated_at}+`
    b.updated_at = `${b.updated_at}+`
    return jsonRes([a, b].map((w) => ({ woche: w.start, stand: w.updated_at })))
  }
  if (path.startsWith('weeks')) {
    const start = filterWert(path, 'start')
    if (method === 'PATCH') {
      const w = start ? bestand.get(start) : undefined
      if (wochenAbweisen || !w || w.updated_at !== filterWert(path, 'updated_at')) return jsonRes([])
      w.data = (body as { data: Week }).data
      w.updated_at = `${w.updated_at}+`
      return jsonRes([{ updated_at: w.updated_at }])
    }
    const ab = filterWert(path, 'start', 'gte')
    const liste = inWerte(path, 'start')
    return jsonRes(
      [...bestand.values()]
        .filter((w) => (start === null || w.start === start) && (ab === null || w.start >= ab) && (liste === null || liste.includes(w.start)))
        .map((w) => structuredClone(w)),
    )
  }
  if (path.startsWith('tausch_anfragen')) {
    const spalten = ['id', 'gibt_ab', 'nimmt', 'bis', 'von_person']
    if (method === 'POST') {
      const neu = (body as Omit<Anfrage, 'id'>[]).map((z) => ({ ...z, id: `a${++naechsteId}` }))
      if (anfrageAbweisen || neu.some((n) => anfragen.some((x) => x.gibt_ab === n.gibt_ab))) return jsonRes({ code: '23505' }, 409)
      anfragen.push(...neu)
      return jsonRes(neu)
    }
    const treffer = anfragen.filter((z) => trifft(path, z as unknown as Record<string, unknown>, spalten))
    if (method === 'DELETE') anfragen = anfragen.filter((z) => !treffer.includes(z))
    return jsonRes(treffer)
  }
  if (method !== 'GET') return new Response(null, { status: 204 })

  if (path.startsWith('members')) {
    const wer = filterWert(path, 'user_id')
    return jsonRes(MEMBERS.filter((m) => wer === null || m.user_id === wer))
  }
  if (path.startsWith('services')) return jsonRes(SERVICES)
  if (path.startsWith('persons')) return jsonRes(PERSONEN)
  if (path.startsWith('congregations')) return jsonRes([{ mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00' }])
  if (path.startsWith('absences')) return jsonRes(abwesenheiten)
  if (path.startsWith('assignment_log')) {
    const muster = likeMuster(path, 'task_key')
    return jsonRes([W1, W2].filter((w) => muster.every((m) => passtAufMuster(`${w}|we|helper|mik|0`, m))).map((w) => ({ task_key: `${w}|we|helper|mik|0` })))
  }
  if (path.startsWith('push_subscriptions')) {
    const an = inWerte(path, 'user_id')
    return jsonRes(SUBS.filter((s) => an === null || an.includes(s.user_id)))
  }
  return jsonRes([])
}

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    APP_URL: 'https://app.test/',
  }
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h
    },
  }
  g.fetch = fakeFetch
  await import('../tauschen/index.ts')
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${HEUTE}T08:00:00Z`))
  authUser = U_SIMON
  bestand = new Map(Object.entries(wochen()).map(([start, data]) => [start, { start, data, updated_at: `S-${start}` }]))
  anfragen = []
  geschrieben = []
  naechsteId = 0
  wochenAbweisen = false
  abwesenheiten = []
  anfrageAbweisen = false
  netzWeg = false
  resetPush()
})

const ruf = async (body: Record<string, unknown>, wer: string | null = authUser) => {
  authUser = wer
  const res = await handler(
    new Request('https://test.functions/tauschen', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ heute: HEUTE, ...body }),
    }),
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Die Glocken-Zeilen eines Laufs. */
const glocke = () =>
  geschrieben
    .filter((w) => w.method === 'POST' && w.path.startsWith('notifications'))
    .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])) as Record<string, unknown>[]
const zeilenIn = (tabelle: string, method = 'POST') =>
  geschrieben
    .filter((w) => w.method === method && w.path.startsWith(tabelle))
    .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])) as Record<string, unknown>[]

/** Simon fragt Jonas — der Ausgangspunkt der meisten Fälle. */
const simonFragtJonas = async () => {
  const r = await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_SIMON)
  geschrieben = []
  resetPush()
  return String((r.body.anfrage as Anfrage).id)
}

describe('Function: angemeldet und mit eigener Person', () => {
  it('ohne Anmeldung 401, ohne eigene Person 403 — und nichts geschrieben', async () => {
    expect((await ruf({ aktion: 'angebote', gibtAb: A }, null)).status).toBe(401)
    expect(await ruf({ aktion: 'angebote', gibtAb: A }, U_OHNE)).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(geschrieben).toEqual([])
  })

  it('eine unbekannte Aktion ist 400', async () => {
    expect(await ruf({ aktion: 'tauschen' })).toEqual({ status: 400, body: { error: 'bad-request' } })
  })
})

describe('Function: am Rand (31.10.2026)', () => {
  /** Ein Schlüssel, der kein Hilfsdienst ist — ein Programmpunkt. */
  const PUNKT = `${W1}|mid|part|abc|0`
  const BAD = { status: 400, body: { error: 'bad-request' } }

  it('OPTIONS antwortet dem Browser, ohne etwas zu lesen', async () => {
    const res = await handler(new Request('https://test.functions/tauschen', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(geschrieben).toEqual([])
  })

  it('ein Schlüssel, der kein Hilfsdienst ist, ist 400 — bei jeder Aktion, die Plätze nimmt', async () => {
    expect(await ruf({ aktion: 'angebote', gibtAb: PUNKT })).toEqual(BAD)
    expect(await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: PUNKT })).toEqual(BAD)
    expect(await ruf({ aktion: 'direkt', gibtAb: PUNKT, nimmt: C })).toEqual(BAD)
    expect(geschrieben).toEqual([])
  })

  it('annehmen: eine Anfrage mit kaputten Schlüsseln ist 400, ohne Kennung ist sie fort', async () => {
    anfragen.push({ id: 'x1', congregation_id: CONG, von_user: U_SIMON, von_person: 'p-simon', an_person: 'p-jonas', gibt_ab: 'kaputt', nimmt: 'auch', bis: '2026-09-13' })
    expect(await ruf({ aktion: 'annehmen', id: 'x1' }, U_JONAS)).toEqual(BAD)
    expect(await ruf({ aktion: 'annehmen' }, U_JONAS)).toEqual({ status: 404, body: { error: 'gone' } })
    expect(zeilenIn('weeks', 'PATCH')).toEqual([])
  })

  it('kam eine zweite Anfrage zum selben Platz zwischen Prüfen und Anlegen an, heißt es „schon angefragt" — ohne Glocke', async () => {
    anfrageAbweisen = true
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B })).toEqual({ status: 409, body: { error: 'already-asked' } })
    expect(glocke()).toEqual([])
    expect(sentPush).toEqual([])
    fehler.mockRestore()
  })

  it('wer an seinem neuen Tag fehlt, steht nicht unter den Angeboten — der Tag davor zählt nicht', async () => {
    const personen = async () => ((await ruf({ aktion: 'angebote', gibtAb: A })).body.angebote as { personId: string }[]).map((a) => a.personId)
    // Lena nähme Simons Sonntag, den 13.9.
    abwesenheiten = [{ person_id: 'p-lena', from_date: '2026-09-13', to_date: '2026-09-13' }]
    expect(await personen()).toEqual(['p-jonas', 'p-jonas'])
    abwesenheiten = [{ person_id: 'p-lena', from_date: '2026-09-10', to_date: '2026-09-12' }]
    expect(await personen()).toEqual(['p-jonas', 'p-lena', 'p-jonas'])
  })

  it('scheitert das Netz, antwortet sie 500 — die Einzelheiten stehen nur im Log', async () => {
    netzWeg = true
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const antwort = await ruf({ aktion: 'angebote', gibtAb: A })
    expect(antwort).toEqual({ status: 500, body: { error: 'server-error' } })
    expect(fehler).toHaveBeenCalledWith('tauschen:', expect.stringContaining('Netz weg'))
    fehler.mockRestore()
  })
})

describe('Function: angebote', () => {
  it('auch wer kein Konto hat — Lena; die App fragt sie nicht an, sondern tauscht nach Absprache gleich (30.10.2026)', async () => {
    expect(await ruf({ aktion: 'angebote', gibtAb: A })).toEqual({
      status: 200,
      body: {
        ok: true,
        angebote: [
          { nimmt: helferKey(W1, 'mid', 'mik', 0), personId: 'p-jonas', konto: true },
          { nimmt: C, personId: 'p-lena', konto: false },
          { nimmt: B, personId: 'p-jonas', konto: true },
        ],
      },
    })
    expect(geschrieben).toEqual([])
  })
})

describe('Function: direkt — mit jemandem ohne Konto (30.10.2026)', () => {
  it('Simon tauscht gleich mit Lena: beide Plätze, nur Simon hat zugesagt, das Tagebuch führt beide', async () => {
    const { status, body } = await ruf({ aktion: 'direkt', gibtAb: A, nimmt: C })
    expect(status).toBe(200)
    expect(body.wochen).toEqual([
      { woche: W1, vorher: `S-${W1}`, stand: `S-${W1}+` },
      { woche: W2, vorher: `S-${W2}`, stand: `S-${W2}+` },
    ])
    expect(bestand.get(W1)?.data.we?.helpers?.mik?.[0]).toEqual({ name: 'Lena Hoffmann', pid: 'p-lena' })
    expect(bestand.get(W2)?.data.mid?.helpers?.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    // Lena hat kein Konto: Zusagen kann nur Simon — für seinen neuen Platz.
    expect(geschrieben.find((w) => w.method === 'DELETE' && w.path.startsWith('confirmations'))?.path).toContain(
      `task_key=in.(${encodeURIComponent(A)},${encodeURIComponent(C)})`,
    )
    expect(zeilenIn('confirmations')).toEqual([expect.objectContaining({ user_id: U_SIMON, task_key: C, status: 'bestätigt' })])
    // Lena hat es mündlich abgesprochen: In den Zusagen ist sie gleich als
    // „weiß Bescheid" abgehakt (Review 30.10.2026) — sonst stünde ihr Platz
    // beim Planer als ungeklärt da.
    const log = zeilenIn('assignment_log')
    expect(log).toEqual([
      expect.objectContaining({ task_key: A, name: 'Lena Hoffmann', person_id: 'p-lena', user_id: null, persoenlich_at: new Date().toISOString() }),
      expect.objectContaining({ task_key: C, name: 'Simon Krüger', person_id: 'p-simon', user_id: U_SIMON, persoenlich_at: null }),
    ])
    // Ein Stapel mit verschiedenen Schlüsseln weist PostgREST ab (PGRST102).
    expect(Object.keys(log[0]!).sort()).toEqual(Object.keys(log[1]!).sort())
  })

  it('die Planer erfahren es — Lena nicht, sie hat kein Konto; Simon nicht, er hat es eben getan', async () => {
    await ruf({ aktion: 'direkt', gibtAb: A, nimmt: C })
    expect(glocke()).toEqual([
      expect.objectContaining({
        user_id: U_ADMIN,
        title: TITEL_GETAUSCHT,
        task_key: A,
        body: `Mikrofone · Sonntag, 13. September · 10:00 · ${alsFreitext('Lena Hoffmann')} · Dienstag, 15. September · 19:00 · ${alsFreitext('Simon Krüger')}`,
      }),
    ])
    expect(sentPush).toEqual([])
  })

  it('wer ein Konto hat, sagt selbst zu: mit Jonas tauscht niemand an ihm vorbei', async () => {
    expect(await ruf({ aktion: 'direkt', gibtAb: A, nimmt: B })).toEqual({ status: 409, body: { error: 'has-account' } })
    expect(geschrieben).toEqual([])
    expect(bestand.get(W2)?.data.we?.helpers?.mik?.[0]?.pid).toBe('p-jonas')
  })

  it('dieselben Regeln: nur den eigenen Platz, nur wer den Dienst kann', async () => {
    expect(await ruf({ aktion: 'direkt', gibtAb: A, nimmt: C }, U_OTTO)).toEqual({ status: 403, body: { error: 'not-yours' } })
    // Otto hat den Dienst nicht — dass er ein Konto hat, fragt die Function gar nicht erst.
    bestand.get(W2)!.data.mid!.helpers!.mik![0] = slot('p-otto')
    expect(await ruf({ aktion: 'direkt', gibtAb: A, nimmt: C }, U_SIMON)).toEqual({ status: 403, body: { error: 'not-qualified' } })
    expect(geschrieben).toEqual([])
  })

  it('offene Anfragen zu einem der beiden Plätze und ein Ersatzgesuch dafür sind danach erledigt', async () => {
    await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B })
    expect(anfragen).toHaveLength(1)
    geschrieben = []
    await ruf({ aktion: 'direkt', gibtAb: A, nimmt: C })
    expect(anfragen).toEqual([])
    const geloescht = geschrieben.filter((w) => w.method === 'DELETE' && w.path.startsWith('notifications')).map((w) => w.path)
    expect(geloescht).toEqual([expect.stringContaining(`title=eq.${encodeURIComponent(TITEL_GESUCHT)}`)])
  })

  it('schreibt ein anderer dazwischen, bleibt alles, wie es war', async () => {
    wochenAbweisen = true
    expect(await ruf({ aktion: 'direkt', gibtAb: A, nimmt: C })).toEqual({ status: 409, body: { error: 'stand' } })
    expect(geschrieben.map((w) => w.path.split('?')[0])).toEqual(['rpc/wochen_tauschen'])
  })
})

describe('Function: anfragen', () => {
  it('legt die Anfrage an — bis zum früheren Tag — und Jonas bekommt Glocke und Push', async () => {
    const { status, body } = await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B })
    expect(status).toBe(200)
    expect(body.anfrage).toMatchObject({ von_user: U_SIMON, von_person: 'p-simon', an_person: 'p-jonas', gibt_ab: A, nimmt: B, bis: '2026-09-13' })
    expect(glocke()).toEqual([
      expect.objectContaining({
        user_id: U_JONAS,
        title: TITEL_ANGEFRAGT,
        body: `Mikrofone · Sonntag, 13. September · 10:00 · ${alsFreitext('Simon Krüger')}`,
        task_key: `tausch|${anfragen[0]!.id}`,
      }),
    ])
    expect(sentPush.map((p) => p.endpoint)).toEqual(['https://push.test/jonas'])
  })

  it('die eigene Person kommt aus dem Konto: Otto kann Simons Platz nicht anbieten', async () => {
    expect(await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_OTTO)).toEqual({ status: 403, body: { error: 'not-yours' } })
    expect(anfragen).toEqual([])
    expect(glocke()).toEqual([])
  })

  it('wer kein Konto hat, wird nicht gefragt', async () => {
    expect(await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: C })).toEqual({ status: 409, body: { error: 'no-account' } })
    expect(anfragen).toEqual([])
  })

  it('je Platz eine Anfrage — eine verfallene sperrt aber nicht', async () => {
    await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B })
    expect(await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B })).toEqual({ status: 409, body: { error: 'already-asked' } })
    anfragen[0]!.bis = '2026-09-06'
    expect((await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B })).status).toBe(200)
    expect(anfragen).toHaveLength(1)
  })

  it('die Anfrage des vorigen Inhabers sperrt den neuen nicht — der Planer hat umgeteilt', async () => {
    await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_SIMON)
    bestand.get(W1)!.data.we!.helpers!.mik![0] = slot('p-karl')
    expect((await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_KARL)).status).toBe(200)
    expect(anfragen.map((a) => a.von_person)).toEqual(['p-karl'])
  })

  /*
   * Review 31.10.2026: Simon fragt Jonas, und bevor Jonas antwortet, teilt der
   * Planer Jonas' Platz Karl zu (oder Karl springt dort ein). Die App zeigt
   * Simons Anfrage nicht mehr (`gilt`), zurückziehen kann er sie also nicht —
   * und bis dahin scheiterte jede neue Anfrage zu seinem Platz an
   * „already-asked", bis zum Tag der Anfrage.
   */
  it('die eigene Anfrage sperrt nicht mehr, wenn der andere Platz inzwischen jemand anderem gehört', async () => {
    await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_SIMON)
    bestand.get(W2)!.data.we!.helpers!.mik![0] = slot('p-karl')
    const r = await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_SIMON)
    expect(r.status).toBe(200)
    expect(anfragen.map((a) => [a.von_person, a.an_person])).toEqual([['p-simon', 'p-karl']])
    // Gelöscht wurde genau die alte — ihre Glocke bei Jonas nimmt die Datenbank mit.
    const einzeln = geschrieben.filter((w) => w.method === 'DELETE' && w.path.startsWith('tausch_anfragen')).map((w) => filterWert(w.path, 'id'))
    expect(einzeln.filter(Boolean)).toEqual(['a1'])
  })

  it('… hat der Gefragte ihn noch, gilt weiter: eine je Platz, auch für einen anderen Platz desselben', async () => {
    await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: B }, U_SIMON)
    const zweiter = helferKey(W1, 'mid', 'mik', 0) // auch Jonas
    expect(await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: zweiter }, U_SIMON)).toEqual({ status: 409, body: { error: 'already-asked' } })
    expect(anfragen.map((a) => a.nimmt)).toEqual([B])
  })
})

describe('Function: annehmen', () => {
  it('tauscht beide Wochen auf einmal, beide haben zugesagt, das Tagebuch führt beide', async () => {
    const id = await simonFragtJonas()
    const { status, body } = await ruf({ aktion: 'annehmen', id }, U_JONAS)
    expect(status).toBe(200)
    expect(body.wochen).toEqual([
      { woche: W1, vorher: `S-${W1}`, stand: `S-${W1}+` },
      { woche: W2, vorher: `S-${W2}`, stand: `S-${W2}+` },
    ])
    expect(bestand.get(W1)?.data.we?.helpers?.mik?.[0]).toEqual({ name: 'Jonas Berger', pid: 'p-jonas' })
    expect(bestand.get(W2)?.data.we?.helpers?.mik?.[0]).toEqual({ name: 'Simon Krüger', pid: 'p-simon' })
    // In einem Aufruf, nicht in zweien: ganz oder gar nicht.
    expect(geschrieben.filter((w) => w.path.startsWith('weeks'))).toEqual([])
    expect(geschrieben.filter((w) => w.path.startsWith('rpc/wochen_tauschen'))).toHaveLength(1)

    expect(geschrieben.find((w) => w.method === 'DELETE' && w.path.startsWith('confirmations'))?.path).toContain(
      `task_key=in.(${encodeURIComponent(A)},${encodeURIComponent(B)})`,
    )
    expect(zeilenIn('confirmations')).toEqual([
      expect.objectContaining({ user_id: U_SIMON, task_key: B, status: 'bestätigt' }),
      expect.objectContaining({ user_id: U_JONAS, task_key: A, status: 'bestätigt' }),
    ])
    expect(zeilenIn('assignment_log')).toEqual([
      expect.objectContaining({ task_key: A, name: 'Jonas Berger', person_id: 'p-jonas', user_id: U_JONAS, persoenlich_at: null }),
      expect.objectContaining({ task_key: B, name: 'Simon Krüger', person_id: 'p-simon', user_id: U_SIMON, persoenlich_at: null }),
    ])
    expect(anfragen).toEqual([])
  })

  it('Simon und die Planer erfahren es — Jonas nicht, er hat es eben getan', async () => {
    const id = await simonFragtJonas()
    await ruf({ aktion: 'annehmen', id }, U_JONAS)
    expect(glocke()).toEqual([
      expect.objectContaining({ user_id: U_SIMON, title: TITEL_GETAUSCHT, task_key: B, body: `Mikrofone · Sonntag, 13. September · 10:00 · ${alsFreitext('Jonas Berger')}` }),
      expect.objectContaining({
        user_id: U_ADMIN,
        title: TITEL_GETAUSCHT,
        task_key: A,
        body: `Mikrofone · Sonntag, 13. September · 10:00 · ${alsFreitext('Jonas Berger')} · Sonntag, 20. September · 10:00 · ${alsFreitext('Simon Krüger')}`,
      }),
    ])
    expect(sentPush.map((p) => p.endpoint)).toEqual(['https://push.test/simon'])
  })

  it('die Anfragen zu beiden Plätzen und ein Ersatzgesuch dafür gehen mit', async () => {
    // Die Glocken-Zeile einer Anfrage nimmt der Trigger mit
    // (`tausch_glocke_loeschen`, tests/tausch-schema.test.ts).
    const id = await simonFragtJonas()
    await ruf({ aktion: 'annehmen', id }, U_JONAS)
    expect(anfragen).toEqual([])
    const geloescht = geschrieben.filter((w) => w.method === 'DELETE' && w.path.startsWith('notifications')).map((w) => w.path)
    expect(geloescht).toEqual([expect.stringContaining(`title=eq.${encodeURIComponent(TITEL_GESUCHT)}`)])
  })

  it('liegen beide Plätze in einer Woche, schreibt eine Bedingung auf ihren Stand', async () => {
    bestand.get(W1)!.data.mid!.helpers!.mik = [slot('p-jonas')]
    const r = await ruf({ aktion: 'anfragen', gibtAb: A, nimmt: helferKey(W1, 'mid', 'mik', 0) })
    const { status, body } = await ruf({ aktion: 'annehmen', id: (r.body.anfrage as Anfrage).id }, U_JONAS)
    expect(status).toBe(200)
    expect(body.wochen).toEqual([{ woche: W1, vorher: `S-${W1}`, stand: `S-${W1}+` }])
    expect(geschrieben.find((w) => w.method === 'PATCH')?.path).toContain(`updated_at=eq.${encodeURIComponent(`S-${W1}`)}`)
  })

  it('nur der Gefragte nimmt an — auch Simon selbst nicht', async () => {
    const id = await simonFragtJonas()
    for (const wer of [U_SIMON, U_OTTO, U_ADMIN]) {
      expect(await ruf({ aktion: 'annehmen', id }, wer)).toEqual({ status: 404, body: { error: 'gone' } })
    }
    expect(geschrieben).toEqual([])
    expect(bestand.get(W1)?.data.we?.helpers?.mik?.[0]?.pid).toBe('p-simon')
  })

  it('hat der Planer inzwischen umgeteilt, wird nicht getauscht — und die Anfrage ist erledigt', async () => {
    const id = await simonFragtJonas()
    bestand.get(W1)!.data.we!.helpers!.mik![0] = slot('p-lena')
    expect(await ruf({ aktion: 'annehmen', id }, U_JONAS)).toEqual({ status: 403, body: { error: 'not-yours' } })
    // Nichts getauscht, nichts zugesagt; fort ist nur die Anfrage (ihre
    // Glocken-Zeile nimmt der Trigger mit).
    expect(geschrieben.map((w) => `${w.method} ${w.path.split('?')[0]}`)).toEqual(['DELETE tausch_anfragen'])
    expect(anfragen).toEqual([])
  })

  it('wer den gefragten Platz inzwischen hat, nimmt trotzdem nicht an — die Anfrage galt einem anderen', async () => {
    const id = await simonFragtJonas()
    bestand.get(W2)!.data.we!.helpers!.mik![0] = slot('p-karl')
    expect(await ruf({ aktion: 'annehmen', id }, U_KARL)).toEqual({ status: 404, body: { error: 'gone' } })
    expect(geschrieben).toEqual([])
    expect(bestand.get(W1)?.data.we?.helpers?.mik?.[0]?.pid).toBe('p-simon')
    // Und der Gefragte selbst hat den Platz nicht mehr: erledigt.
    expect(await ruf({ aktion: 'annehmen', id }, U_JONAS)).toEqual({ status: 404, body: { error: 'gone' } })
    expect(anfragen).toEqual([])
  })

  it('schreibt ein anderer dazwischen, bleibt alles, wie es war: keine Zusage, kein Tagebuch, keine Mitteilung', async () => {
    const id = await simonFragtJonas()
    wochenAbweisen = true
    expect(await ruf({ aktion: 'annehmen', id }, U_JONAS)).toEqual({ status: 409, body: { error: 'stand' } })
    expect(geschrieben.map((w) => w.path.split('?')[0])).toEqual(['rpc/wochen_tauschen'])
    expect(anfragen).toHaveLength(1)
  })
})

describe('Function: ablehnen und zurückziehen', () => {
  it('Jonas lehnt ab: die Anfrage ist weg, Simon erfährt es', async () => {
    const id = await simonFragtJonas()
    expect(await ruf({ aktion: 'ablehnen', id }, U_JONAS)).toEqual({ status: 200, body: { ok: true } })
    expect(anfragen).toEqual([])
    expect(glocke()).toEqual([
      expect.objectContaining({ user_id: U_SIMON, title: TITEL_ABGELEHNT, task_key: A, body: `Mikrofone · Sonntag, 20. September · 10:00 · ${alsFreitext('Jonas Berger')}` }),
    ])
  })

  it('ablehnen kann nur der Gefragte, zurückziehen nur der Fragende', async () => {
    const id = await simonFragtJonas()
    expect(await ruf({ aktion: 'ablehnen', id }, U_SIMON)).toEqual({ status: 404, body: { error: 'gone' } })
    expect(await ruf({ aktion: 'zurueckziehen', id }, U_JONAS)).toEqual({ status: 404, body: { error: 'gone' } })
    expect(anfragen).toHaveLength(1)
    expect(await ruf({ aktion: 'zurueckziehen', id }, U_SIMON)).toEqual({ status: 200, body: { ok: true } })
    expect(anfragen).toEqual([])
    // Ohne neue Mitteilung; Jonas' Glocken-Zeile nimmt der Trigger mit.
    expect(glocke()).toEqual([])
  })
})
