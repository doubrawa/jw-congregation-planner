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
/** Kennung der Woche, um die es geht (T66): ihr Montag. */
const WI = '2026-09-07'
const SVC = 'mikro'
/** Hilfsdienst-Slot, um den es geht: `woche|tab|helper|svc|pos`. */
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
  { id: 'p-me', fn: 'Ich', ln: 'Selbst', dn: 'Ich Selbst', priv: QUAL },
  { id: 'p-orig', fn: 'Otto', ln: 'Riginal', dn: 'Otto Riginal', priv: QUAL },
  { id: 'p-unqual', fn: 'Uwe', ln: 'Nqual', dn: 'Uwe Nqual', priv: {} },
  { id: 'p-absent', fn: 'Anna', ln: 'Bwesend', dn: 'Anna Bwesend', priv: QUAL },
  { id: 'p-planner', fn: 'Paul', ln: 'Aner', dn: 'Paul Aner', priv: {} },
  // qualifiziert, hat aber gar kein Konto → kann nicht benachrichtigt werden
  { id: 'p-noacct', fn: 'Karl', ln: 'Onto', dn: 'Karl Onto', priv: QUAL },
]

const SERVICES = [{ key: SVC, name: 'Mikrofone' }]

const CONGREGATIONS = [{ meeting_times: 'Di 19:00 · So 10:00' }]

/**
 * Abwesenheit als Zeitraum (nicht mehr als Wochenindex): die Zusammenkunft der
 * Woche liegt am Dienstag, 8.9.2026 — Anna ist vom 7. bis 9.9. weg.
 */
const ABSENCES = [{ person_id: 'p-absent', from_date: '2026-09-07', to_date: '2026-09-09' }]
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
/** Vorhandene `verhindert`-Zeilen (Tabelle confirmations). */
let absagen: { user_id: string }[]
/** Wird einmal ausgeführt, nachdem die Woche gelesen wurde (Wettlauf). */
let konkurrent: (() => void) | null

/** Alle schreibenden REST-Aufrufe (PATCH/POST/DELETE) dieses Testlaufs. */
const writesTo = (table: string) => writes.filter((w) => w.path.startsWith(table))

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Name, der aktuell im simulierten Slot der Datenbank steht (null = keiner). */
function gespeicherterName(): string | null {
  const w = week as { mid?: { helpers?: Record<string, { name?: string }[]> } }
  return w.mid?.helpers?.[SVC]?.[0]?.name ?? null
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
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    writes.push({ method, path, body })
    // Bedingtes PATCH auf weeks nachbilden: der Filter `…->>name=eq."X"` darf
    // nur greifen, solange im gespeicherten Slot noch X steht. Ohne diese
    // Auswertung könnte der Vergleiche-und-Tausche im Test nie fehlschlagen.
    const bedingt = /helpers->[^&]*->\d+->>name=(eq\.%22(.*?)%22|is\.null)/.exec(path)
    if (method === 'PATCH' && path.startsWith('weeks') && bedingt) {
      const erwartet = bedingt[2] === undefined ? null : decodeURIComponent(bedingt[2])
      const aktuell = gespeicherterName()
      if (erwartet !== aktuell) return jsonRes([]) // niemand getroffen → jemand war schneller
      week = (body as { data: unknown }).data
      return jsonRes([{ start: WI, data: week }])
    }
    return new Response(null, { status: 204 })
  }

  if (path.startsWith('members')) return jsonRes(MEMBERS)
  if (path.startsWith('services')) return jsonRes(SERVICES)
  if (path.startsWith('persons')) return jsonRes(PERSONS)
  if (path.startsWith('push_subscriptions')) return jsonRes(SUBS)
  if (path.startsWith('congregations')) return jsonRes(CONGREGATIONS)
  if (path.startsWith('absences')) return jsonRes(ABSENCES)
  if (path.startsWith('confirmations')) return jsonRes(absagen)
  if (path.startsWith('weeks')) {
    const pos = /start=eq\.([\d-]+)/.exec(path)?.[1]
    // Antwort steht mit dem Serialisieren fest; danach darf der Konkurrent den
    // Slot ändern. Genau dieses Zeitfenster — zwischen Lesen und Schreiben —
    // ist der Fall, den die Bedingung beim Schreiben abfangen muss.
    // Mit `start`-Spalte, wie die Datenbank sie seit T66 führt: die Kennung
    // steht neben dem Blob. Stand hier lange nur `data`, und die Function las
    // sie aus dem Blob — der Tag der Zusammenkunft (und damit die
    // Abwesenheitsprüfung) hing dadurch an einem Feld, das jederzeit wegfallen
    // kann. Ohne die Spalte hier bliebe der Fehler unbemerkt.
    const antwort = jsonRes(pos === WI ? [{ start: WI, data: week }] : []) // andere Woche → gibt es nicht
    if (pos === WI && konkurrent) {
      konkurrent()
      konkurrent = null
    }
    return antwort
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
  absagen = []
  konkurrent = null
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
    ['Woche, die es nicht gibt', `2026-12-28|mid|helper|${SVC}|0`],
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

  /*
   * Verlegte Zusammenkunft (T30): Die Abwesenheit gilt einem **Tag**, nicht
   * einer Woche. Die Ersatzsuche rechnete den Tag lange mit einer eigenen
   * Fassung des Wochentag-Versatzes aus, die die Abweichung nicht kannte —
   * sie prüfte also den regulären Dienstag, während die Zusammenkunft am
   * Freitag stattfand. Anna (7.–9.9. weg) galt damit als verhindert, obwohl
   * sie am 11.9. längst wieder da ist.
   */
  it('rechnet mit dem verlegten Tag, nicht mit dem regulären', async () => {
    const w = week as { dev?: Record<string, { day: string }> }
    w.dev = { mid: { day: 'Freitag' } } // 11.9. — nach Annas Abwesenheit
    const res = await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    expect(res.status).toBe(200)
    const rows = writesTo('notifications')[0]?.body as { user_id: string }[]
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U_ME, U_ABSENT]))
  })
})

describe('substitute: seek darf nur auslösen, wen es angeht', () => {
  const seek = { action: 'seek', congregationId: CONG, taskKey: KEY }

  it('Fremder ohne eigene Absage → 403, niemand wird angepingt', async () => {
    // Sonst könnte jedes Mitglied für jeden beliebigen Slot behaupten lassen,
    // die eingeteilte Person könne nicht — per Push an alle Qualifizierten.
    const res = await call(seek, { auth: U_UNQUAL })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' })
    expect(writes).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('auch ein Planer nicht — Zuteilen ist etwas anderes als Absagen', async () => {
    const res = await call(seek, { auth: U_PLANNER })
    expect(res.status).toBe(403)
    expect(writes).toEqual([])
  })

  it('die eingeteilte Person darf', async () => {
    const res = await call(seek, { auth: U_ORIG })
    expect(res.status).toBe(200)
  })

  it('wer für genau diesen Slot abgesagt hat, darf ebenfalls', async () => {
    // Der Slot kann inzwischen neu besetzt sein; die Absage bleibt der Beleg.
    absagen = [{ user_id: U_UNQUAL }]
    const res = await call(seek, { auth: U_UNQUAL })
    expect(res.status).toBe(200)
  })
})

describe('substitute: zwei Übernahmen gleichzeitig', () => {
  it('der Zweite bekommt 409 und löscht nichts', async () => {
    // Zwischen Lesen und Schreiben trägt sich jemand anderes ein. Ohne
    // Bedingung beim Schreiben hätte der Zweite den Ersten überschrieben —
    // und mit `DELETE confirmations?task_key=…` dessen Bestätigung gelöscht.
    konkurrent = () => {
      const w = week as { mid: { helpers: Record<string, { name?: string; pid?: string }[]> } }
      w.mid.helpers[SVC][0] = { name: 'Karl Onto', pid: 'p-noacct' }
    }
    const res = await call(take())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'slot-taken' })
    // Der Slot gehört weiterhin dem Ersten …
    expect(gespeicherterName()).toBe('Karl Onto')
    // … und seine Bestätigung ist unangetastet.
    expect(writesTo('confirmations')).toEqual([])
    expect(writesTo('notifications')).toEqual([])
  })

  it('ohne Wettlauf schreibt die Übernahme wie bisher durch', async () => {
    const res = await call(take())
    expect(res.status).toBe(200)
    expect(gespeicherterName()).toBe('Ich Selbst')
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

describe('substitute: Meldungen sind übersetzbar (T24)', () => {
  // Titel und Rumpf waren fest deutsch und dynamisch — sie konnten weder über
  // NOTIF_TITLE_KEY noch über den Fragment-Übersetzer laufen. Glocke UND Push
  // erschienen deshalb in allen 33 Sprachen deutsch.
  it('Glocken-Titel ist der feste, kanonisch deutsche Schlüssel', async () => {
    await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    const rows = writesTo('notifications')[0]?.body as { title: string; body: string }[]
    expect(rows[0].title).toBe('Ersatz gesucht') // ohne Dienstnamen
    // Rumpf nur aus ' · '-Atomen, die der Fragment-Übersetzer erledigt.
    expect(rows[0].body).toBe('Mikrofone · Di, 8. Sep · 19:00 · Otto Riginal')
  })

  it('dasselbe beim Einspringen', async () => {
    await call(take())
    const rows = writesTo('notifications')[0]?.body as { title: string; body: string }[]
    expect(rows[0].title).toBe('Ersatz gefunden')
    expect(rows[0].body).toBe('Mikrofone · Di, 8. Sep · 19:00 · Ich Selbst')
  })
})
