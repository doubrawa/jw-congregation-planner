/*
 * Negativtests der Edge Function `substitute` — die serverseitige
 * Sicherheitsgrenze des Ersatz-Features.
 *
 * Warum hier und nicht in src/: Wochen und Bestätigungen darf per RLS nur der
 * Planer schreiben, die Function umgeht das mit der Service-Role. Damit ist sie
 * die einzige Stelle, an der ein Verkündiger fremde Daten ändern könnte —
 * geprüft wird deshalb vor allem, was NICHT gehen darf.
 *
 * Getestet wird die echte index.ts (so wie deployt): `Deno` wird als Global
 * bereitgestellt, `fetch` simuliert Auth- und REST-Endpunkt, web-push ersetzt
 * ein Stub (test.alias in vite.config.ts). Jeder verweigerte Aufruf muss
 * zusätzlich schreibfrei bleiben — ein 403 nützt nichts, wenn vorher schon
 * gespeichert wurde.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { reset as resetPush, sent as sentPush } from './web-push.stub'

/* ---- Fixture ------------------------------------------------------------- */

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'
const WI = 3
const SVC = 'mikro'
/** Hilfsdienst-Slot, um den es geht: `wi|tab|helper|svc|pos`. */
const KEY = `${WI}|mid|helper|${SVC}|0`

const U_ME = 'user-me' // qualifiziert, springt ein
const U_ORIG = 'user-orig' // steht im Slot und sagt ab
const U_UNQUAL = 'user-unqual' // Mitglied, aber nicht für den Dienst qualifiziert
const U_NOPERSON = 'user-noperson' // Konto ohne verknüpfte Person
const U_ABSENT = 'user-absent' // qualifiziert, aber in dieser Woche abwesend
const U_PLANNER = 'user-planner'
const U_FOREIGN = 'user-foreign' // Mitglied einer ANDEREN Versammlung

const QUAL = { [`svc:${SVC}`]: true }

const MEMBERS = [
  { user_id: U_ME, person_id: 'p-me', planner: false },
  { user_id: U_ORIG, person_id: 'p-orig', planner: false },
  { user_id: U_UNQUAL, person_id: 'p-unqual', planner: false },
  { user_id: U_NOPERSON, person_id: null, planner: false },
  { user_id: U_ABSENT, person_id: 'p-absent', planner: false },
  { user_id: U_PLANNER, person_id: 'p-planner', planner: true },
]

const PERSONS = [
  { id: 'p-me', fn: 'Ich', ln: 'Selbst', dn: 'Ich Selbst', priv: QUAL, absent: [] },
  { id: 'p-orig', fn: 'Otto', ln: 'Riginal', dn: 'Otto Riginal', priv: QUAL, absent: [] },
  { id: 'p-unqual', fn: 'Uwe', ln: 'Nqual', dn: 'Uwe Nqual', priv: {}, absent: [] },
  { id: 'p-absent', fn: 'Anna', ln: 'Bwesend', dn: 'Anna Bwesend', priv: QUAL, absent: [WI] },
  { id: 'p-planner', fn: 'Paul', ln: 'Aner', dn: 'Paul Aner', priv: {}, absent: [] },
  // qualifiziert, hat aber gar kein Konto → kann nicht benachrichtigt werden
  { id: 'p-noacct', fn: 'Karl', ln: 'Onto', dn: 'Karl Onto', priv: QUAL, absent: [] },
]

const SERVICES = [{ key: SVC, name: 'Mikrofone' }]
const SUBS = [{ user_id: U_ME, endpoint: 'https://push.test/me', p256dh: 'k', auth: 'a' }]

function freshWeek(): unknown {
  return {
    start: '2026-09-07',
    mid: { date: 'Di, 8. Sep · 19:00', helpers: { [SVC]: [{ name: 'Otto Riginal', pid: 'p-orig' }] } },
    we: { date: 'So, 13. Sep · 10:00', helpers: {} },
  }
}

/* ---- Simulierte Umgebung ------------------------------------------------- */

interface Write {
  method: string
  path: string
  body: unknown
}

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let week: unknown
let writes: Write[]

/** Alle schreibenden REST-Aufrufe (PATCH/POST/DELETE) dieses Testlaufs. */
const writesTo = (table: string) => writes.filter((w) => w.path.startsWith(table))

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = String(input)
  const method = init?.method ?? 'GET'

  // Auth: löst das JWT des Aufrufers auf.
  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }

  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  if (method !== 'GET') {
    writes.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(null, { status: 204 })
  }

  if (path.startsWith('members')) return jsonRes(MEMBERS)
  if (path.startsWith('services')) return jsonRes(SERVICES)
  if (path.startsWith('persons')) return jsonRes(PERSONS)
  if (path.startsWith('push_subscriptions')) return jsonRes(SUBS)
  if (path.startsWith('weeks')) {
    const pos = Number(/position=eq\.(\d+)/.exec(path)?.[1])
    return jsonRes(pos === WI ? [{ data: week }] : []) // andere Position → nicht geladen
  }
  return jsonRes([])
}

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    // VAPID bewusst leer: pushTo() steigt dann früh aus, es geht hier um
    // Autorisierung, nicht um den Versand.
  }
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h
    },
  }
  g.fetch = fakeFetch
  await import('../substitute/index.ts') // ruft Deno.serve → setzt handler
})

beforeEach(() => {
  authUser = U_ME
  week = freshWeek()
  writes = []
  resetPush()
})

/** Ruft die Function so auf, wie es die App tut. */
function call(body: unknown, opts?: { auth?: string | null }): Promise<Response> {
  if (opts && 'auth' in opts) authUser = opts.auth ?? null
  return handler(
    new Request('https://fn.test/substitute', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

const take = (extra?: Record<string, unknown>) => ({
  action: 'take',
  congregationId: CONG,
  taskKey: KEY,
  ...extra,
})

/**
 * Name im Hilfsdienst-Slot, so wie er GESPEICHERT wurde — gelesen aus dem
 * PATCH-Body. Das lokale Fixture taugt dafür nicht: die Function arbeitet auf
 * der JSON-Kopie aus der simulierten Antwort, eine Prüfung darauf könnte gar
 * nicht fehlschlagen. Ohne PATCH (= abgelehnt) gibt es null.
 */
function savedSlotName(): string | null {
  const body = writesTo('weeks').find((w) => w.method === 'PATCH')?.body as
    | { data: { mid: { helpers: Record<string, { name?: string }[]> } } }
    | undefined
  return body?.data.mid.helpers[SVC][0]?.name ?? null
}

/* ---- Tests --------------------------------------------------------------- */

describe('substitute: Authentifizierung', () => {
  it('ohne gültiges JWT → 401, kein Schreibzugriff', async () => {
    const res = await call(take(), { auth: null })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(writes).toEqual([])
  })

  it('Nutzer einer anderen Versammlung → 403, Slot unverändert', async () => {
    const res = await call(take(), { auth: U_FOREIGN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' })
    expect(writes).toEqual([])
    expect(savedSlotName()).toBeNull() // Slot wurde nie überschrieben
  })
})

describe('substitute: ungültige Anfragen', () => {
  it('Aufgaben-Key wird abgelehnt — nur Hilfsdienste laufen über diese Function', async () => {
    // Programmpunkte teilt der Planer zu; ein Aufgaben-Key (6 Teile, „part")
    // darf hier nicht durchkommen.
    const res = await call(take({ taskKey: `${WI}|mid|part|0|1|0` }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'bad-request' })
    expect(writes).toEqual([])
  })

  it.each([
    ['fehlende congregationId', { congregationId: '' }],
    ['unbekannte Aktion', { action: 'delete' }],
    ['leerer taskKey', { taskKey: '' }],
    ['taskKey mit unbekanntem Tab', { taskKey: `${WI}|xx|helper|${SVC}|0` }],
  ])('%s → 400, kein Schreibzugriff', async (_name, extra) => {
    const res = await call(take(extra))
    expect(res.status).toBe(400)
    expect(writes).toEqual([])
  })

  it('kein JSON-Body → 400 statt Absturz', async () => {
    const res = await handler(
      new Request('https://fn.test/substitute', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt' },
        body: 'kein json',
      }),
    )
    expect(res.status).toBe(400)
    expect(writes).toEqual([])
  })
})

describe('substitute: Slot muss existieren', () => {
  it.each([
    ['Position außerhalb der Liste', `${WI}|mid|helper|${SVC}|7`],
    ['unbekannter Dienst', `${WI}|mid|helper|gibtsnicht|0`],
    ['Zusammenkunft ohne diesen Dienst', `${WI}|we|helper|${SVC}|0`],
    ['nicht geladene Woche', `99|mid|helper|${SVC}|0`],
  ])('%s → 404, kein Schreibzugriff', async (_name, taskKey) => {
    const res = await call(take({ taskKey }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'slot-not-found' })
    expect(writes).toEqual([])
  })
})

describe('substitute: Einspringen nur mit Qualifikation', () => {
  it('nicht qualifiziert → 403, Slot behält die ursprüngliche Person', async () => {
    const res = await call(take(), { auth: U_UNQUAL })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'not-qualified' })
    expect(writes).toEqual([])
    expect(savedSlotName()).toBeNull() // nichts umgeschrieben
    expect(sentPush).toEqual([])
  })

  it('Konto ohne verknüpfte Person → 403', async () => {
    const res = await call(take(), { auth: U_NOPERSON })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'not-qualified' })
    expect(writes).toEqual([])
  })

  it('Planer ohne Qualifikation darf ebenfalls nicht einspringen', async () => {
    // Planer-Rechte gelten fürs Zuteilen, nicht fürs Selbst-Eintragen.
    const res = await call(take(), { auth: U_PLANNER })
    expect(res.status).toBe(403)
    expect(writes).toEqual([])
  })

  it('schon selbst eingetragen → idempotent, kein zweiter Schreibzugriff', async () => {
    const w = week as { mid: { helpers: Record<string, { name?: string; pid?: string }[]> } }
    w.mid.helpers[SVC][0] = { name: 'Ich Selbst', pid: 'p-me' }
    const res = await call(take())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, already: true })
    expect(writes).toEqual([])
  })
})

describe('substitute: seek benachrichtigt nur die richtigen Personen', () => {
  it('weder den Absagenden noch Unqualifizierte, Abwesende oder Kontolose', async () => {
    const res = await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, notified: 1 })

    const rows = writesTo('notifications')[0]?.body as { user_id: string }[]
    expect(rows.map((r) => r.user_id)).toEqual([U_ME])
    // Gegenprobe: niemand aus den ausgeschlossenen Gruppen ist dabei.
    const got = new Set(rows.map((r) => r.user_id))
    for (const u of [U_ORIG, U_UNQUAL, U_ABSENT, U_PLANNER]) expect(got.has(u)).toBe(false)
  })
})

describe('substitute: Positivfall als Gegenprobe', () => {
  // Ohne diesen Test könnten alle Negativtests bestehen, obwohl die Function
  // gar nichts tut (z. B. weil das Fixture nicht greift).
  it('qualifiziertes Mitglied übernimmt: Slot umgeschrieben, Bestätigung gesetzt', async () => {
    const res = await call(take())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, taken: true })
    expect(savedSlotName()).toBe('Ich Selbst')

    expect(writesTo('weeks')[0]?.method).toBe('PATCH')
    // alte Bestätigung weg, eigene „bestätigt" gesetzt
    expect(writesTo('confirmations').map((w) => w.method)).toEqual(['DELETE', 'POST'])
    const conf = writesTo('confirmations')[1]?.body as { user_id: string; status: string }[]
    expect(conf[0]).toMatchObject({ user_id: U_ME, status: 'bestätigt' })
    // Ursprungsperson und Planer werden informiert
    const rows = writesTo('notifications')[0]?.body as { user_id: string }[]
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U_ORIG, U_PLANNER]))
  })
})
