/*
 * Tests der Edge Function `send-invite` — seit T121 (Phase 8) stellt sie
 * Anmelde-Links aus: je Person ein neuer Link, der den alten ersetzt. Bis zum
 * 31.10.2026 schickte sie ihn, wo eine Adresse dastand, auch per E-Mail;
 * seitdem gibt die App Link und Code per Nachricht oder auf dem Zettel weiter.
 *
 * Geprüft wird vor allem, was NICHT gehen darf: ausstellen ohne Admin-Recht,
 * für Personen einer fremden Versammlung — und den Link erzeugt die Function
 * selbst, vom Client kommen nur Personen-Ids.
 *
 * Aufbau wie substitute.test.ts: die echte index.ts wird geladen (`Deno` als
 * Global, `fetch` simuliert Auth und REST). Die Umgebung liest die Function
 * beim Laden, deshalb wird das Modul je Szenario frisch importiert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pruefsumme } from '../_shared/anmeldung.ts'
import { filterWert, jsonRes, nurSpalten } from './attrappe.ts'

/* ---- Fixture ------------------------------------------------------------- */

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'

const U_PLANER = 'user-planer'
const U_VERK = 'user-verkuendiger' // Mitglied, aber kein Admin
const U_FREMD = 'user-fremd' // Konto ohne Mitgliedschaft

const MEMBERS: Record<string, { congregation_id: string; planner: boolean }[]> = {
  [U_PLANER]: [{ congregation_id: CONG, planner: true }],
  [U_VERK]: [{ congregation_id: CONG, planner: false }],
  [U_FREMD]: [],
}

const P_ANNA = '11111111-1111-4111-8111-111111111111'
const P_BERT = '22222222-2222-4222-8222-222222222222'
const P_FREMD = '44444444-4444-4444-8444-444444444444' // gehört einer anderen Versammlung

/** Die Versammlung des Aufrufers — und nur sie. */
const PERSONS = [{ id: P_ANNA }, { id: P_BERT }]

let authUser: string | null
/** REST-Aufrufe der Function: Methode, Pfad, Rumpf. */
let aufrufe: Array<{ method: string; path: string; body: unknown }>
/** Andere Adressen als Auth und REST — eine Mail ginge hierhin. */
let fremdeAufrufe: string[]
/** Lässt das Schreiben der Links scheitern. */
let linkFehler: boolean

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = String(input)
  const method = init?.method ?? 'GET'

  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }
  if (!url.startsWith(SUPABASE_URL)) {
    fremdeAufrufe.push(url)
    return jsonRes({})
  }

  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  aufrufe.push({ method, path, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
  if (path.startsWith('members')) return jsonRes(MEMBERS[authUser ?? ''] ?? [])
  if (path.startsWith('persons')) {
    // Die Attrappe wertet den Filter aus: nur die eigene Versammlung, nur die Ids, nur die verlangten Spalten.
    if (filterWert(path, 'congregation_id') !== CONG) return jsonRes([])
    const ids = /[?&]id=in\.\(([^)]*)\)/.exec(path)?.[1]?.split(',').map(decodeURIComponent) ?? []
    return jsonRes(nurSpalten(PERSONS.filter((p) => ids.includes(p.id)), path))
  }
  if (path.startsWith('anmelde_links')) {
    if (method === 'POST' && linkFehler) return new Response('{"message":"kaputt"}', { status: 500 })
    return method === 'GET' ? jsonRes([]) : new Response(null, { status: 201 })
  }
  return jsonRes([])
}

/** Modul mit gegebener Umgebung frisch laden (Env wird beim Import gelesen). */
async function loadFn(extraEnv: Record<string, string> = {}): Promise<(req: Request) => Promise<Response>> {
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    APP_URL: 'https://app.test/',
    // Läge der Schlüssel des Mail-Dienstes noch in der Umgebung, schickte sie trotzdem nichts.
    RESEND_API_KEY: 'resend-key',
    INVITE_FROM: 'Versammlung.app <anmelden@example.org>',
    ...extraEnv,
  }
  let captured: ((req: Request) => Promise<Response>) | undefined
  const g = globalThis as Record<string, unknown>
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      captured = h
    },
  }
  g.fetch = fakeFetch
  vi.resetModules()
  await import('../send-invite/index.ts')
  return captured as (req: Request) => Promise<Response>
}

interface Link {
  personId: string
  url: string
  zettelUrl: string
  code: string
  gueltigBis: string
}

interface Ergebnis {
  links?: Link[]
  error?: string
}

/** Aufruf wie aus der App; liefert Status und geparste Antwort. */
async function call(body: unknown, opts: { als?: string | null } = {}): Promise<{ status: number; body: Ergebnis }> {
  if ('als' in opts) authUser = opts.als ?? null
  const handler = await loadFn()
  const res = await handler(
    new Request('https://fn.test/send-invite', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: (await res.json()) as Ergebnis }
}

const fuerAnna = { personIds: [P_ANNA] }

/** Die geschriebenen Link-Zeilen (Upsert). */
const geschriebeneLinks = () =>
  aufrufe.filter((a) => a.method === 'POST' && a.path.startsWith('anmelde_links')).flatMap((a) => a.body as Array<Record<string, unknown>>)

beforeEach(() => {
  authUser = U_PLANER
  aufrufe = []
  fremdeAufrufe = []
  linkFehler = false
})

/* ---- Tests --------------------------------------------------------------- */

describe('send-invite: wer ausstellen darf', () => {
  it('ein Admin darf', async () => {
    const r = await call(fuerAnna)
    expect(r.status).toBe(200)
    expect(r.body.links).toHaveLength(1)
  })

  it.each([
    ['ein Verkündiger', U_VERK],
    ['ein Konto ohne Mitgliedschaft', U_FREMD],
  ])('%s nicht — 403, kein Link', async (_wer, als) => {
    const r = await call(fuerAnna, { als })
    expect(r.status).toBe(403)
    expect(geschriebeneLinks()).toEqual([])
  })

  it('ohne gültiges Login nicht — 401, und zwar vor jeder Datenbank-Abfrage', async () => {
    const r = await call(fuerAnna, { als: null })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('unauthorized')
    expect(aufrufe).toEqual([])
  })
})

describe('send-invite: nur die eigene Versammlung, kein fremder Text', () => {
  it('gelesen wird nur die eigene Versammlung — eine fremde Id fällt still heraus', async () => {
    const r = await call({ personIds: [P_ANNA, P_FREMD] })
    const personenAbfrage = aufrufe.find((a) => a.path.startsWith('persons'))?.path ?? ''
    expect(personenAbfrage).toContain(`congregation_id=eq.${CONG}`)
    expect(r.body.links?.map((l) => l.personId)).toEqual([P_ANNA])
    expect(geschriebeneLinks().map((z) => z.person_id)).toEqual([P_ANNA])
  })

  it('der Link entsteht hier — ein mitgeschickter Code oder Text kommt nicht in die Antwort', async () => {
    // Bis zum Umbau schickte der Client den Einladungscode mit.
    const r = await call({ ...fuerAnna, code: 'BOESER-TEXT', text: 'Hier klicken: https://fremd.test' })
    expect(JSON.stringify(r.body)).not.toContain('BOESER-TEXT')
    expect(JSON.stringify(r.body)).not.toContain('fremd.test')
  })

  it('keine E-Mail mehr (31.10.2026) — auch mit „senden" und den Schlüsseln des Mail-Dienstes geht nichts hinaus', async () => {
    const r = await call({ ...fuerAnna, senden: true })
    expect(r.body.links).toHaveLength(1)
    expect(fremdeAufrufe).toEqual([])
    // Nach einer Adresse fragt sie gar nicht erst.
    expect(aufrufe.find((a) => a.path.startsWith('persons'))?.path).toMatch(/select=id&/)
    expect(r.body).not.toHaveProperty('mailBereit')
  })

  it.each([
    ['leere Liste', { personIds: [] }],
    ['keine Liste', {}],
    ['keine Kennungen', { personIds: ['p-anna; drop table'] }],
    ['mehr als 200', { personIds: Array.from({ length: 201 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`) }],
  ])('%s → 400, nichts ausgestellt', async (_fall, body) => {
    const r = await call(body)
    expect(r.status).toBe(400)
    expect(geschriebeneLinks()).toEqual([])
  })
})

describe('send-invite: der Link', () => {
  it('ein neuer ersetzt den alten: Upsert je Person, Token und Code nur als Prüfsumme', async () => {
    const r = await call(fuerAnna)
    const [zeile] = geschriebeneLinks()
    const link = r.body.links?.[0]
    expect(aufrufe.find((a) => a.method === 'POST' && a.path.startsWith('anmelde_links'))?.path).toContain('on_conflict=person_id')
    expect(zeile?.person_id).toBe(P_ANNA)
    expect(zeile?.congregation_id).toBe(CONG)
    // Im Klartext steht nichts in der Datenbank.
    const token = new URL(link?.url ?? 'https://x/').hash.replace('#anmelden=', '')
    expect(JSON.stringify(zeile)).not.toContain(token)
    expect(JSON.stringify(zeile)).not.toContain(link?.code.replace('-', '') ?? '?')
    expect(zeile?.token_hash).toBe(await pruefsumme(token))
    expect(zeile?.code_hash).toBe(await pruefsumme(link?.code.replace('-', '') ?? ''))
    // Ein neuer Link ist ungeöffnet und ungesendet — auch wenn der alte es nicht war.
    expect(zeile?.gesendet_at).toBeNull()
    expect(zeile?.benutzt_at).toBeNull()
  })

  it('gilt ein Jahr', async () => {
    const vorher = Date.now()
    const r = await call(fuerAnna)
    const bis = new Date(r.body.links?.[0]?.gueltigBis ?? 0).getTime()
    expect(bis - vorher).toBeGreaterThanOrEqual(365 * 864e5 - 5000)
    expect(bis - vorher).toBeLessThanOrEqual(365 * 864e5 + 5000)
  })

  it('der Link trägt das Token hinter #, der Zettel den Code — beide in der App', async () => {
    const r = await call(fuerAnna)
    const link = r.body.links?.[0]
    expect(link?.url).toMatch(/^https:\/\/app\.test\/#anmelden=[A-Za-z0-9_-]{43}$/)
    expect(link?.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(link?.zettelUrl).toBe(`https://app.test/#code=${link?.code.replace('-', '')}`)
  })

  it('jede Person ihren eigenen — zwei Personen, zwei verschiedene Links, in einem Schreiben', async () => {
    const r = await call({ personIds: [P_ANNA, P_BERT] })
    const [a, b] = r.body.links ?? []
    expect(a?.url).not.toBe(b?.url)
    expect(a?.code).not.toBe(b?.code)
    // Ohne E-Mail braucht es keine Pause zwischen zwei Personen — alle Zeilen gehen auf einmal hinaus.
    expect(aufrufe.filter((x) => x.method === 'POST' && x.path.startsWith('anmelde_links'))).toHaveLength(1)
    expect(geschriebeneLinks().map((z) => z.person_id)).toEqual([P_ANNA, P_BERT])
  })

  it('scheitert das Schreiben, gibt es keinen Link — und die App erfährt es (500), statt still leer auszugehen', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      linkFehler = true
      const r = await call({ personIds: [P_ANNA, P_BERT] })
      expect(r.status).toBe(500)
      expect(r.body).toEqual({ error: 'server-error' })
    } finally {
      err.mockRestore()
    }
  })
})

describe('send-invite: Fehler gehen nicht in die Antwort', () => {
  it('ein Ausfall der Datenbank → 500 ohne Einzelheiten', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = globalThis as Record<string, unknown>
    const handler = await loadFn()
    g.fetch = async (input: unknown) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonRes({ id: U_PLANER })
      return new Response('{"message":"permission denied for table members"}', { status: 403 })
    }
    const res = await handler(new Request('https://fn.test/send-invite', { method: 'POST', body: JSON.stringify(fuerAnna) }))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('permission denied')
    err.mockRestore()
  })
})
