/*
 * Tests der Edge Function `trolley` — Trolley-Termine (T121, Phase 7).
 *
 * Sie ist der einzige Weg, auf dem ein Termin entsteht, sich ändert oder
 * verschwindet: Mitglieder dürfen die Tabelle nur lesen. Zwei Fehlerarten
 * kosten hier etwas:
 *
 *  - **zu viel Recht**: Wer kein Trolley-Recht hat, trägt sich trotzdem ein;
 *    wer nicht im Termin steht, trägt einen anderen aus; ein Mitglied entfernt
 *    einen Trolley. Und jede Aktion schickt einem anderen eine Nachricht —
 *    ein offener Weg hieße Mitteilungen mit fremdem Absender.
 *  - **zu wenig Bescheid**: Der Partner erfährt nicht, dass er eingetragen
 *    wurde; wer bleibt, erfährt nicht, dass der andere abgesagt hat.
 *
 * Aufbau wie `send-plan.test.ts`: die echte index.ts wird geladen (`Deno` als
 * Global, `fetch` stellt Anmeldung und REST nach, web-push per Stub). Die
 * REST-Attrappe führt die Termine als Tabelle und wertet die Filter der
 * schreibenden Aufrufe aus — die bedingten Änderungen sind der Kern.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { reset as resetPush, sent as sentPush } from './web-push.stub'
import { TITEL_ABGESAGT, TITEL_DAZU, TITEL_EINGETRAGEN, TITEL_ENTFAELLT } from '../trolley/texte.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { filterWert, jsonRes, ohneFragment } from './attrappe.ts'

/* ---- Fixture ------------------------------------------------------------- */

const CONG = 'cong-1'
const U_ADMIN = 'user-admin'
const U_JONAS = 'user-jonas' // Trolley-Recht
const U_SIMON = 'user-simon' // Trolley-Recht
const U_LENA = 'user-lena' // Trolley-Recht
const U_OHNE = 'user-ohne' // ohne Trolley-Recht
const U_FREMD = 'user-fremd' // Admin einer anderen Versammlung
const U_OHNE_PERSON = 'user-ohne-person' // Admin, dessen Konto keiner Person zugeordnet ist

const MEMBERS: { user_id: string; person_id: string | null; planner: boolean; congregation_id: string }[] = [
  { user_id: U_ADMIN, person_id: 'p-admin', planner: true, congregation_id: CONG },
  { user_id: U_JONAS, person_id: 'p-jonas', planner: false, congregation_id: CONG },
  { user_id: U_SIMON, person_id: 'p-simon', planner: false, congregation_id: CONG },
  { user_id: U_LENA, person_id: 'p-lena', planner: false, congregation_id: CONG },
  { user_id: U_OHNE, person_id: 'p-ohne', planner: false, congregation_id: CONG },
  { user_id: U_FREMD, person_id: 'p-fremd', planner: true, congregation_id: 'cong-2' },
  { user_id: U_OHNE_PERSON, person_id: null, planner: true, congregation_id: CONG },
]

const recht = { zeugnis: true }
const PERSONS = [
  { id: 'p-admin', fn: 'Ada', ln: 'Min', priv: {}, congregation_id: CONG },
  { id: 'p-jonas', fn: 'Jonas', ln: 'Berger', priv: recht, congregation_id: CONG },
  { id: 'p-simon', fn: 'Simon', ln: 'Krüger', priv: recht, congregation_id: CONG },
  { id: 'p-lena', fn: 'Lena', ln: 'Hoffmann', priv: recht, congregation_id: CONG },
  { id: 'p-ohne', fn: 'Otto', ln: 'Hne', priv: {}, congregation_id: CONG },
  // Mit Recht, aber ohne Konto: Ihm sagt es der andere persönlich.
  { id: 'p-karl', fn: 'Karl', ln: 'Onto', priv: recht, congregation_id: CONG },
  { id: 'p-fremd', fn: 'Fritz', ln: 'Remd', priv: recht, congregation_id: 'cong-2' },
]

const TROLLEYS = [{ id: 'tr3', name: 'Trolley 3', congregation_id: CONG }]
const SUBS = [
  { id: 's1', user_id: U_SIMON, endpoint: 'https://push.test/simon', p256dh: 'k', auth: 'a', lang: 'de' },
  { id: 's2', user_id: U_JONAS, endpoint: 'https://push.test/jonas', p256dh: 'k', auth: 'a', lang: 'de' },
]

/** Montag, 7. September 2026 — „heute"; die Termine liegen danach. */
const HEUTE = new Date('2026-09-07T08:00:00Z')

interface Zeile {
  id: string
  congregation_id: string
  trolley_id: string
  datum: string
  von: string
  bis: string
  person_id: string
  partner_id: string | null
  gemeinsam: boolean
}

/** Ein Termin, wie er in der Datenbank steht (Zeiten mit Sekunden). */
const zeile = (patch: Partial<Zeile> = {}): Zeile => ({
  id: 'r1',
  congregation_id: CONG,
  trolley_id: 'tr3',
  datum: '2026-09-19',
  von: '09:00:00',
  bis: '11:00:00',
  person_id: 'p-jonas',
  partner_id: null,
  gemeinsam: false,
  ...patch,
})

/* ---- Simulierte Umgebung ------------------------------------------------- */

interface Schreiben {
  method: string
  path: string
  body: unknown
}

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let termine: Zeile[]
let trolleys: typeof TROLLEYS
let geschrieben: Schreiben[]
/** Die Datenbank weist das nächste Anlegen ab (der Trigger: jemand war schneller). */
let abweisen: boolean
/** Ein bedingtes Ändern oder Löschen trifft keine Zeile mehr — jemand war dazwischen. */
let nichtsGetroffen: boolean
/** Ändern scheitert an der Datenbank. */
let aendernScheitert: boolean
/** Jeder Zugriff nach der Anmeldung scheitert am Netz. */
let netzWeg: boolean

/** Trifft eine Zeile alle `spalte=eq.…`/`is.null`-Filter des Pfads? */
function passt(path: string, z: Record<string, unknown>): boolean {
  const query = path.split('?')[1] ?? ''
  for (const teil of query.split('&')) {
    const [spalte, bedingung] = teil.split('=') as [string, string | undefined]
    if (!bedingung || spalte === 'select') continue
    const wert = decodeURIComponent(bedingung.slice(bedingung.indexOf('.') + 1))
    if (bedingung.startsWith('eq.') && String(z[spalte]) !== wert) return false
    if (bedingung === 'is.null' && z[spalte] !== null) return false
    if (bedingung.startsWith('gte.') && String(z[spalte]) < wert) return false
  }
  return true
}

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

  if ((path.startsWith('trolley_termine') || path.startsWith('trolleys')) && (method === 'PATCH' || method === 'DELETE')) {
    if (aendernScheitert) return new Response('{"message":"kaputt"}', { status: 500 })
    if (nichtsGetroffen) return jsonRes([])
  }
  if (path.startsWith('trolley_termine')) {
    if (method === 'POST') {
      if (abweisen) return new Response('{"message":"trolley_belegt"}', { status: 400 })
      termine.push(...(body as Zeile[]))
      return jsonRes(body)
    }
    const treffer = termine.filter((z) => passt(path, z as unknown as Record<string, unknown>))
    if (method === 'PATCH') {
      for (const z of treffer) Object.assign(z, body)
      return jsonRes(treffer)
    }
    if (method === 'DELETE') {
      termine = termine.filter((z) => !treffer.includes(z))
      return jsonRes(treffer)
    }
    return jsonRes(treffer)
  }
  if (path.startsWith('trolleys')) {
    const treffer = trolleys.filter((t) => passt(path, t as unknown as Record<string, unknown>))
    if (method === 'DELETE') {
      trolleys = trolleys.filter((t) => !treffer.includes(t))
      // Kaskade wie in der Datenbank.
      termine = termine.filter((z) => !treffer.some((t) => t.id === z.trolley_id))
    }
    return jsonRes(treffer)
  }
  if (method !== 'GET') return new Response(null, { status: 204 })

  const cong = filterWert(path, 'congregation_id')
  const fremd = cong !== null && cong !== CONG
  if (path.startsWith('members')) {
    const wer = filterWert(path, 'user_id')
    return jsonRes(wer !== null ? MEMBERS.filter((m) => m.user_id === wer) : fremd ? [] : MEMBERS)
  }
  if (path.startsWith('persons')) {
    const id = filterWert(path, 'id')
    return jsonRes(PERSONS.filter((p) => (cong === null || p.congregation_id === cong) && (id === null || p.id === id)))
  }
  if (path.startsWith('push_subscriptions')) return jsonRes(fremd ? [] : SUBS)
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
  await import('../trolley/index.ts')
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(HEUTE)
  authUser = U_JONAS
  termine = []
  trolleys = [...TROLLEYS]
  geschrieben = []
  abweisen = false
  nichtsGetroffen = false
  aendernScheitert = false
  netzWeg = false
  resetPush()
})

const ruf = async (body: unknown, wer: string | null = authUser): Promise<Response> => {
  authUser = wer
  return handler(
    new Request('https://test.functions/trolley', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }),
  )
}

const antwort = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> })

/** Die Glocken-Zeilen eines Laufs. */
const glocke = () =>
  geschrieben
    .filter((w) => w.path.startsWith('notifications'))
    .flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])) as Record<string, unknown>[]

const eintrag = (patch: Record<string, unknown> = {}) => ({
  aktion: 'eintragen',
  termin: { id: 'r-neu', trolleyId: 'tr3', datum: '2026-09-19', von: '09:00', bis: '11:00', partner: 'p-simon', ...patch },
})

/* ---- Eintragen ----------------------------------------------------------- */

describe('eintragen', () => {
  it('mit Partner: beide stehen im Termin, der Partner bekommt Glocke und Push', async () => {
    const { status, body } = await antwort(await ruf(eintrag()))
    expect(status).toBe(200)
    expect(body.termin).toMatchObject({ id: 'r-neu', person_id: 'p-jonas', partner_id: 'p-simon', gemeinsam: true, von: '09:00' })
    expect(termine).toHaveLength(1)
    expect(glocke()).toEqual([
      expect.objectContaining({
        user_id: U_SIMON,
        title: TITEL_EINGETRAGEN,
        body: `${alsFreitext('Jonas Berger')} · ${alsFreitext('Trolley 3')} · Samstag, 19. September · 09:00–11:00`,
      }),
    ])
    expect(sentPush.map((p) => p.endpoint)).toEqual(['https://push.test/simon'])
  })

  it('allein („Partner gesucht"): niemand bekommt etwas', async () => {
    const { status, body } = await antwort(await ruf(eintrag({ partner: null })))
    expect(status).toBe(200)
    expect(body.termin).toMatchObject({ partner_id: null, gemeinsam: false })
    expect(glocke()).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('die eigene Person kommt aus dem Konto, nie aus dem Rumpf', async () => {
    await ruf({ ...eintrag(), termin: { ...eintrag().termin, pid: 'p-lena' } })
    expect(termine[0]?.person_id).toBe('p-jonas')
  })

  it('ohne Trolley-Recht: 403, nichts geschrieben', async () => {
    expect(await antwort(await ruf(eintrag(), U_OHNE))).toEqual({ status: 403, body: { error: 'kein-recht' } })
    expect(geschrieben).toEqual([])
  })

  it('der Partner ohne Trolley-Recht wird abgewiesen', async () => {
    expect((await antwort(await ruf(eintrag({ partner: 'p-ohne' })))).body).toEqual({ error: 'partner-ohne-recht' })
    expect(termine).toEqual([])
  })

  it.each([
    ['außerhalb des Rasters', { von: '05:30' }],
    ['keine halbe Stunde', { bis: '11:15' }],
    ['Bis vor Von', { von: '11:00', bis: '09:00' }],
    ['sich selbst als Partner', { partner: 'p-jonas' }],
    ['ohne Tag', { datum: '19.9.2026' }],
  ])('%s → 400', async (_was, patch) => {
    expect((await ruf(eintrag(patch))).status).toBe(400)
    expect(geschrieben).toEqual([])
  })

  it('ein Tag, der vorbei ist, nimmt niemanden mehr auf', async () => {
    expect((await antwort(await ruf(eintrag({ datum: '2026-09-06' })))).body).toEqual({ error: 'vorbei' })
  })

  it('belegt, doppelt, Partner doppelt — je der Grund, und nichts geschrieben', async () => {
    termine = [zeile({ id: 'r-da', person_id: 'p-lena', von: '10:00:00', bis: '12:00:00' })]
    expect((await antwort(await ruf(eintrag()))).body).toEqual({ error: 'belegt' })
    termine = [zeile({ id: 'r-da', trolley_id: 'tr-anderer', person_id: 'p-jonas', von: '10:00:00', bis: '12:00:00' })]
    expect((await antwort(await ruf(eintrag()))).body).toEqual({ error: 'doppelt' })
    termine = [zeile({ id: 'r-da', trolley_id: 'tr-anderer', person_id: 'p-lena', partner_id: 'p-simon', von: '10:00:00', bis: '12:00:00' })]
    expect((await antwort(await ruf(eintrag()))).body).toEqual({ error: 'partner-doppelt' })
    expect(geschrieben).toEqual([])
  })

  it('wer um 11 Uhr übernimmt, wo einer um 11 Uhr aufhört, stört niemanden', async () => {
    termine = [zeile({ id: 'r-vorher', person_id: 'p-lena', von: '07:00:00', bis: '09:00:00' })]
    expect((await ruf(eintrag())).status).toBe(200)
  })

  it('weist die Datenbank ab (zwei zugleich), heißt es „stand" — die App lädt nach', async () => {
    abweisen = true
    expect((await antwort(await ruf(eintrag()))).body).toEqual({ error: 'stand' })
    expect(glocke()).toEqual([])
  })

  it('ein Trolley einer anderen Versammlung ist hier keiner', async () => {
    trolleys = [{ id: 'tr3', name: 'Trolley 3', congregation_id: 'cong-2' }]
    expect((await antwort(await ruf(eintrag()))).body).toEqual({ error: 'weg' })
  })

  it('ein Partner ohne Konto steht im Termin, bekommt aber nichts — ihm sagt es Jonas persönlich', async () => {
    const { status, body } = await antwort(await ruf(eintrag({ partner: 'p-karl' })))
    expect(status).toBe(200)
    expect(body.termin).toMatchObject({ person_id: 'p-jonas', partner_id: 'p-karl', gemeinsam: true })
    expect(geschrieben.filter((w) => w.path.startsWith('notifications'))).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('ein Partner mit Konto, aber ohne Push-Abo, bekommt die Glocke — und keinen Push', async () => {
    // Die Gegenprobe mit Push ist Simon (ganz oben): Er hat ein Abo.
    expect((await ruf(eintrag({ partner: 'p-lena' }))).status).toBe(200)
    expect(glocke()).toEqual([expect.objectContaining({ user_id: U_LENA, title: TITEL_EINGETRAGEN })])
    expect(sentPush).toEqual([])
  })

  it('ohne Termin im Rumpf: 400, nichts geschrieben', async () => {
    expect(await antwort(await ruf({ aktion: 'eintragen' }))).toEqual({ status: 400, body: { error: 'bad-request' } })
    expect(geschrieben).toEqual([])
  })

  it('ohne Anmeldung 401', async () => {
    expect((await ruf(eintrag(), null)).status).toBe(401)
  })
})

/* ---- Dazukommen ---------------------------------------------------------- */

describe('dazukommen', () => {
  beforeEach(() => {
    termine = [zeile()] // Jonas sucht einen Partner.
  })

  it('Simon kommt dazu: er steht im Termin, Jonas erfährt es', async () => {
    const { status, body } = await antwort(await ruf({ aktion: 'dazukommen', id: 'r1' }, U_SIMON))
    expect(status).toBe(200)
    expect(body.termin).toMatchObject({ person_id: 'p-jonas', partner_id: 'p-simon', gemeinsam: false })
    expect(glocke()).toEqual([expect.objectContaining({ user_id: U_JONAS, title: TITEL_DAZU })])
    expect(String(glocke()[0]?.body)).toContain(alsFreitext('Simon Krüger'))
  })

  it('bedingt geschrieben: nur, solange noch niemand dazugekommen ist', async () => {
    await ruf({ aktion: 'dazukommen', id: 'r1' }, U_SIMON)
    const patch = geschrieben.find((w) => w.method === 'PATCH')!
    expect(patch.path).toContain('partner_id=is.null')
  })

  it('war schon jemand schneller: „schon-partner", niemand erfährt etwas', async () => {
    termine = [zeile({ partner_id: 'p-lena' })]
    expect((await antwort(await ruf({ aktion: 'dazukommen', id: 'r1' }, U_SIMON))).body).toEqual({ error: 'schon-partner' })
    expect(glocke()).toEqual([])
  })

  it('zum eigenen Termin kommt man nicht dazu', async () => {
    expect((await ruf({ aktion: 'dazukommen', id: 'r1' }, U_JONAS)).status).toBe(400)
  })

  it('ohne Trolley-Recht nicht — und wer zur selben Zeit schon steht, auch nicht', async () => {
    expect((await antwort(await ruf({ aktion: 'dazukommen', id: 'r1' }, U_OHNE))).status).toBe(403)
    termine = [zeile(), zeile({ id: 'r-lena', trolley_id: 'tr-anderer', person_id: 'p-lena' })]
    expect((await antwort(await ruf({ aktion: 'dazukommen', id: 'r1' }, U_LENA))).body).toEqual({ error: 'doppelt' })
  })
})

/* ---- Austragen ----------------------------------------------------------- */

describe('austragen', () => {
  it('der Partner geht: Jonas bleibt, sucht wieder — und erfährt es', async () => {
    termine = [zeile({ partner_id: 'p-simon', gemeinsam: true })]
    const { status, body } = await antwort(await ruf({ aktion: 'austragen', id: 'r1' }, U_SIMON))
    expect(status).toBe(200)
    expect(body.termin).toMatchObject({ person_id: 'p-jonas', partner_id: null, gemeinsam: false })
    expect(glocke()).toEqual([expect.objectContaining({ user_id: U_JONAS, title: TITEL_ABGESAGT })])
  })

  it('wer eingetragen hat, geht: der Partner bleibt und sucht wieder — und erfährt es', async () => {
    termine = [zeile({ partner_id: 'p-simon', gemeinsam: true })]
    const { body } = await antwort(await ruf({ aktion: 'austragen', id: 'r1' }, U_JONAS))
    expect(body.termin).toMatchObject({ person_id: 'p-simon', partner_id: null, gemeinsam: false })
    expect(glocke()).toEqual([expect.objectContaining({ user_id: U_SIMON, title: TITEL_ABGESAGT })])
  })

  it('der Letzte geht: der Termin ist weg, niemand erfährt etwas', async () => {
    termine = [zeile()]
    const { body } = await antwort(await ruf({ aktion: 'austragen', id: 'r1' }, U_JONAS))
    expect(body).toEqual({ ok: true, termin: null })
    expect(termine).toEqual([])
    expect(glocke()).toEqual([])
  })

  it('wer nicht im Termin steht, trägt niemanden aus', async () => {
    termine = [zeile({ partner_id: 'p-simon' })]
    expect((await ruf({ aktion: 'austragen', id: 'r1' }, U_LENA)).status).toBe(403)
    expect(termine[0]).toMatchObject({ person_id: 'p-jonas', partner_id: 'p-simon' })
  })

  it('bedingt auf den gelesenen Stand — hat sich inzwischen etwas geändert, trifft es nichts', async () => {
    termine = [zeile({ partner_id: 'p-simon' })]
    await ruf({ aktion: 'austragen', id: 'r1' }, U_SIMON)
    const patch = geschrieben.find((w) => w.method === 'PATCH')!
    expect(patch.path).toContain('person_id=eq.p-jonas')
    expect(patch.path).toContain('partner_id=eq.p-simon')
  })

  it('auch ohne Trolley-Recht kann man sich austragen', async () => {
    termine = [zeile({ person_id: 'p-ohne' })]
    expect((await ruf({ aktion: 'austragen', id: 'r1' }, U_OHNE)).status).toBe(200)
  })

  it('was vorbei ist, bleibt', async () => {
    termine = [zeile({ datum: '2026-09-05' })]
    expect((await antwort(await ruf({ aktion: 'austragen', id: 'r1' }, U_JONAS))).body).toEqual({ error: 'vorbei' })
  })
})

/* ---- Einen Trolley entfernen --------------------------------------------- */

describe('entfernen', () => {
  it('nur der Admin — ein Mitglied bekommt 403, und der Trolley bleibt', async () => {
    expect((await antwort(await ruf({ aktion: 'entfernen', trolleyId: 'tr3' }, U_JONAS))).status).toBe(403)
    expect(trolleys).toHaveLength(1)
  })

  it('der Admin entfernt: kommende Termine gehen mit, alle Eingetragenen erfahren es — Vergangenes nicht', async () => {
    termine = [
      zeile({ id: 'r-kommend', partner_id: 'p-simon' }),
      zeile({ id: 'r-vorbei', datum: '2026-09-01', person_id: 'p-lena' }),
    ]
    const { status } = await antwort(await ruf({ aktion: 'entfernen', trolleyId: 'tr3' }, U_ADMIN))
    expect(status).toBe(200)
    expect(trolleys).toEqual([])
    expect(termine).toEqual([])
    const zeilen = glocke()
    expect(zeilen.map((z) => z.user_id).sort()).toEqual([U_JONAS, U_SIMON].sort())
    expect(zeilen.every((z) => z.title === TITEL_ENTFAELLT)).toBe(true)
    expect(String(zeilen[0]?.body)).toBe(`${alsFreitext('Trolley 3')} · Samstag, 19. September · 09:00–11:00`)
  })

  it('wer selbst entfernt, weiß es schon — auch wenn er in einem der Termine steht', async () => {
    termine = [zeile({ person_id: 'p-admin', partner_id: 'p-simon' })]
    await ruf({ aktion: 'entfernen', trolleyId: 'tr3' }, U_ADMIN)
    expect(glocke().map((z) => z.user_id)).toEqual([U_SIMON])
  })

  it('der Admin einer anderen Versammlung findet den Trolley nicht', async () => {
    expect((await antwort(await ruf({ aktion: 'entfernen', trolleyId: 'tr3' }, U_FREMD))).body).toEqual({ error: 'weg' })
    expect(trolleys).toHaveLength(1)
  })

  it('ein Admin ohne eigene Person entfernt trotzdem — Bescheid bekommen alle Eingetragenen', async () => {
    termine = [zeile({ partner_id: 'p-simon' })]
    expect((await antwort(await ruf({ aktion: 'entfernen', trolleyId: 'tr3' }, U_OHNE_PERSON))).status).toBe(200)
    expect(trolleys).toEqual([])
    expect(glocke().map((z) => z.user_id).sort()).toEqual([U_JONAS, U_SIMON].sort())
  })

  it('hat der Trolley nur Vergangenes, ist er entfernt — gezählt wird nichts, und niemand erfährt etwas', async () => {
    termine = [zeile({ id: 'r-vorbei', datum: '2026-09-01', partner_id: 'p-simon' })]
    expect(await antwort(await ruf({ aktion: 'entfernen', trolleyId: 'tr3' }, U_ADMIN))).toEqual({ status: 200, body: { ok: true, termine: 0 } })
    expect(trolleys).toEqual([])
    expect(geschrieben.filter((w) => w.path.startsWith('notifications'))).toEqual([])
    expect(sentPush).toEqual([])
  })
})

describe('ohne eigene Person', () => {
  it('trägt sich niemand ein: 403, nichts geschrieben', async () => {
    expect((await antwort(await ruf(eintrag(), U_OHNE_PERSON))).body).toEqual({ error: 'no-person' })
    expect(geschrieben).toEqual([])
  })
})

describe('was kein Auftrag ist', () => {
  it('unbekannte Aktion → 400', async () => {
    expect((await ruf({ aktion: 'loeschen', id: 'r1' })).status).toBe(400)
  })
})

describe('am Rand (31.10.2026)', () => {
  const fehler = async (body: unknown, wer = authUser) => (await antwort(await ruf(body, wer))).body

  it('OPTIONS antwortet dem Browser; ohne Aktion 400, ohne Versammlung 403 — und nichts geschrieben', async () => {
    const res = await handler(new Request('https://test.functions/trolley', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect((await ruf({})).status).toBe(400)
    expect(await antwort(await ruf({ aktion: 'eintragen' }, 'user-unbekannt'))).toEqual({ status: 403, body: { error: 'no-congregation' } })
    expect(geschrieben).toEqual([])
  })

  it('ist die eigene Person gelöscht, trägt man sich nicht ein', async () => {
    MEMBERS.push({ user_id: 'user-geloescht', person_id: 'p-geloescht', planner: false, congregation_id: CONG })
    try {
      expect(await antwort(await ruf(eintrag(), 'user-geloescht'))).toEqual({ status: 403, body: { error: 'no-person' } })
    } finally {
      MEMBERS.pop()
    }
  })

  it('eintragen: ein Partner, den es in der Versammlung nicht gibt, ist „weg"', async () => {
    expect(await fehler(eintrag({ partner: 'p-fremd' }))).toEqual({ error: 'weg' })
    expect(termine).toEqual([])
  })

  it('dazukommen: ungültige Kennung, kein Termin, vorbei', async () => {
    termine = [zeile({ datum: '2026-09-05' })]
    expect((await ruf({ aktion: 'dazukommen', id: 42 }, U_SIMON)).status).toBe(400)
    expect(await fehler({ aktion: 'dazukommen', id: 'r-gibt-es-nicht' }, U_SIMON)).toEqual({ error: 'weg' })
    expect(await fehler({ aktion: 'dazukommen', id: 'r1' }, U_SIMON)).toEqual({ error: 'vorbei' })
  })

  it('dazukommen: kam einer zwischen Lesen und Schreiben dazu, heißt es „schon-partner" — scheitert das Schreiben, „stand"', async () => {
    termine = [zeile()]
    nichtsGetroffen = true
    expect(await fehler({ aktion: 'dazukommen', id: 'r1' }, U_SIMON)).toEqual({ error: 'schon-partner' })
    nichtsGetroffen = false
    aendernScheitert = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fehler({ aktion: 'dazukommen', id: 'r1' }, U_SIMON)).toEqual({ error: 'stand' })
    log.mockRestore()
    expect(glocke()).toEqual([])
  })

  it('austragen: ungültige Kennung, kein Termin — und hat sich der Termin inzwischen geändert, „stand"', async () => {
    expect((await ruf({ aktion: 'austragen', id: 42 }, U_JONAS)).status).toBe(400)
    expect(await fehler({ aktion: 'austragen', id: 'r-gibt-es-nicht' }, U_JONAS)).toEqual({ error: 'weg' })
    termine = [zeile({ partner_id: 'p-simon' })]
    nichtsGetroffen = true
    expect(await fehler({ aktion: 'austragen', id: 'r1' }, U_SIMON)).toEqual({ error: 'stand' })
    expect(glocke()).toEqual([])
  })

  it('entfernen: ungültige Kennung — und hat ihn inzwischen ein anderer entfernt, „stand", niemand erfährt etwas', async () => {
    expect((await ruf({ aktion: 'entfernen', trolleyId: 42 }, U_ADMIN)).status).toBe(400)
    termine = [zeile()]
    nichtsGetroffen = true
    expect(await fehler({ aktion: 'entfernen', trolleyId: 'tr3' }, U_ADMIN)).toEqual({ error: 'stand' })
    expect(glocke()).toEqual([])
  })

  it('wirft das Netz, antwortet sie 500 — die Einzelheiten stehen nur im Log', async () => {
    netzWeg = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await antwort(await ruf(eintrag()))).toEqual({ status: 500, body: { error: 'server-error' } })
    expect(log).toHaveBeenCalledWith('trolley:', expect.stringContaining('Netz weg'))
    log.mockRestore()
  })

  it('ein Rumpf, der kein JSON ist, ist 400 — kein Serverfehler, und nichts geschrieben', async () => {
    const res = await handler(
      new Request('https://test.functions/trolley', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: '{kaputt' }),
    )
    expect(await antwort(res)).toEqual({ status: 400, body: { error: 'bad-request' } })
    expect(geschrieben).toEqual([])
  })
})

/**
 * **Ohne VAPID-Schlüssel bleibt es bei der Glocke** (wie in `send-plan`):
 * Fehlen die Schlüssel (neues Projekt, Secret verloren), lässt sich kein Push
 * signieren — der Partner soll trotzdem in der Glocke erfahren, dass er
 * eingetragen ist, statt dass das Eintragen mit einem Fehler endet. Die
 * Schlüssel liest die Function beim Laden; deshalb wird sie hier ohne sie neu
 * geladen und danach wieder mit.
 */
describe('Ohne VAPID-Schlüssel bleibt es bei der Glocke', () => {
  const g = globalThis as Record<string, unknown>
  let mitSchluesseln: unknown

  beforeAll(async () => {
    mitSchluesseln = g.Deno
    const vorher = mitSchluesseln as { env: { get: (k: string) => string | undefined } }
    g.Deno = { ...vorher, env: { get: (k: string) => (k.startsWith('VAPID_') ? undefined : vorher.env.get(k)) } }
    vi.resetModules()
    await import('../trolley/index.ts')
  })

  afterAll(async () => {
    g.Deno = mitSchluesseln
    vi.resetModules()
    await import('../trolley/index.ts')
  })

  it('Simon erfährt es in der Glocke, einen Push gibt es nicht — und das Eintragen gelingt', async () => {
    const { status } = await antwort(await ruf(eintrag()))
    expect(status).toBe(200)
    expect(termine).toHaveLength(1)
    expect(glocke()).toEqual([expect.objectContaining({ user_id: U_SIMON, title: TITEL_EINGETRAGEN })])
    expect(sentPush).toEqual([])
  })
})
