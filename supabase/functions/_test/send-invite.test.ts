/*
 * Tests der Edge Function `send-invite` — seit T121 (Phase 8) stellt sie
 * Anmelde-Links aus: je Person ein neuer Link, der den alten ersetzt, und, wo
 * eine Adresse dasteht, die E-Mail dazu. Sie ist eine der beiden Functions,
 * die **an Menschen hinausgehen**.
 *
 * Geprüft wird vor allem, was NICHT gehen darf: Die Empfängeradresse kommt
 * **immer** aus der Personen-Tabelle der eigenen Versammlung, und den Link
 * erzeugt die Function selbst — vom Client kommen nur Personen-Ids. Bis zum
 * Umbau schickte er den Code mit, und frei wählbar war damit der Text der Mail.
 *
 * Aufbau wie substitute.test.ts: die echte index.ts wird geladen (`Deno` als
 * Global, `fetch` simuliert Auth, REST und Resend). Die Umgebung liest die
 * Function beim Laden, deshalb wird das Modul je Szenario frisch importiert.
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
const P_OHNE = '33333333-3333-4333-8333-333333333333'
const P_FREMD = '44444444-4444-4444-8444-444444444444' // gehört einer anderen Versammlung
const P_KRUEGER = '55555555-5555-4555-8555-555555555555' // nur mit Nachnamen angelegt

/** Die Versammlung des Aufrufers — und nur sie. */
const PERSONS = [
  { id: P_ANNA, fn: 'Anna', ln: 'Alt', mail: 'anna@example.org' },
  { id: P_BERT, fn: 'Bert', ln: 'Brand', mail: ' bert@example.org ' },
  { id: P_OHNE, fn: 'Ohne', ln: 'Adresse', mail: '' }, // keine Adresse → Zettel
  { id: P_KRUEGER, fn: '', ln: 'Krüger', mail: 'krueger@example.org' },
]

interface Mail {
  from: string
  to: string
  subject: string
  text: string
}

let authUser: string | null
let mails: Mail[]
/** REST-Aufrufe der Function: Methode, Pfad, Rumpf. */
let aufrufe: Array<{ method: string; path: string; body: unknown }>
let resendAntwort: number
/** Lässt das Schreiben der Links scheitern. */
let linkFehler: boolean

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = String(input)
  const method = init?.method ?? 'GET'

  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }
  if (url.startsWith('https://api.resend.com/')) {
    const body = JSON.parse(String(init?.body)) as Mail
    if (resendAntwort >= 400) return new Response('abgelehnt', { status: resendAntwort })
    mails.push(body)
    return jsonRes({ id: 'mail-1' })
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
  if (path.startsWith('congregations')) return jsonRes([{ name: 'Musterstadt' }])
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
    RESEND_API_KEY: 'resend-key',
    INVITE_FROM: 'Versammlung.app <anmelden@example.org>',
    APP_URL: 'https://app.test/',
    MAIL_ABSTAND_MS: '0',
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
  gesendet: boolean
}

interface Ergebnis {
  links?: Link[]
  mailBereit?: boolean
  error?: string
}

/** Aufruf wie aus der App; liefert Status und geparste Antwort. */
async function call(
  body: unknown,
  opts: { als?: string | null; env?: Record<string, string> } = {},
): Promise<{ status: number; body: Ergebnis }> {
  if ('als' in opts) authUser = opts.als ?? null
  const handler = await loadFn(opts.env)
  const res = await handler(
    new Request('https://fn.test/send-invite', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: (await res.json()) as Ergebnis }
}

const fuerAnna = { personIds: [P_ANNA], senden: true }

/** Die geschriebenen Link-Zeilen (Upsert). */
const geschriebeneLinks = () =>
  aufrufe.filter((a) => a.method === 'POST' && a.path.startsWith('anmelde_links')).flatMap((a) => a.body as Array<Record<string, unknown>>)

beforeEach(() => {
  authUser = U_PLANER
  mails = []
  aufrufe = []
  resendAntwort = 200
  linkFehler = false
})

/* ---- Tests --------------------------------------------------------------- */

describe('send-invite: wer ausstellen darf', () => {
  it('ein Admin darf', async () => {
    const r = await call(fuerAnna)
    expect(r.status).toBe(200)
    expect(r.body.links).toHaveLength(1)
    expect(mails).toHaveLength(1)
  })

  it.each([
    ['ein Verkündiger', U_VERK],
    ['ein Konto ohne Mitgliedschaft', U_FREMD],
  ])('%s nicht — 403, kein Link, keine Mail', async (_wer, als) => {
    const r = await call(fuerAnna, { als })
    expect(r.status).toBe(403)
    expect(geschriebeneLinks()).toEqual([])
    expect(mails).toEqual([])
  })

  it('ohne gültiges Login nicht — 401, und zwar vor jeder Datenbank-Abfrage', async () => {
    // Auch die Auskunft, ob der Versand eingerichtet ist, bekommt niemand ohne Anmeldung.
    const r = await call(fuerAnna, { als: null, env: { INVITE_FROM: '' } })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('unauthorized')
    expect(aufrufe).toEqual([])
  })
})

describe('send-invite: kein offenes Mail-Relay, kein fremder Text', () => {
  it('die Adresse kommt aus der Personen-Tabelle, nicht aus dem Aufruf', async () => {
    await call({ ...fuerAnna, mail: 'fremd@woanders.test', to: 'fremd@woanders.test' })
    expect(mails.map((m) => m.to)).toEqual(['anna@example.org'])
  })

  it('der Link entsteht hier — ein mitgeschickter Code oder Text kommt nicht in die Mail', async () => {
    // Bis zum Umbau schickte der Client den Einladungscode mit.
    await call({ ...fuerAnna, code: 'BOESER-TEXT', text: 'Hier klicken: https://fremd.test' })
    expect(mails[0]?.text).not.toContain('BOESER-TEXT')
    expect(mails[0]?.text).not.toContain('fremd.test')
  })

  it('gelesen wird nur die eigene Versammlung — eine fremde Id fällt still heraus', async () => {
    const r = await call({ personIds: [P_ANNA, P_FREMD], senden: true })
    const personenAbfrage = aufrufe.find((a) => a.path.startsWith('persons'))?.path ?? ''
    expect(personenAbfrage).toContain(`congregation_id=eq.${CONG}`)
    expect(r.body.links?.map((l) => l.personId)).toEqual([P_ANNA])
    expect(geschriebeneLinks().map((z) => z.person_id)).toEqual([P_ANNA])
  })

  it.each([
    ['leere Liste', { personIds: [], senden: true }],
    ['keine Liste', { senden: true }],
    ['keine Kennungen', { personIds: ['p-anna; drop table'], senden: true }],
    ['mehr als 200', { personIds: Array.from({ length: 201 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`), senden: true }],
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

  it('gilt dreißig Tage', async () => {
    const vorher = Date.now()
    const r = await call(fuerAnna)
    const bis = new Date(r.body.links?.[0]?.gueltigBis ?? 0).getTime()
    expect(bis - vorher).toBeGreaterThanOrEqual(30 * 864e5 - 5000)
    expect(bis - vorher).toBeLessThanOrEqual(30 * 864e5 + 5000)
  })

  it('der Link trägt das Token hinter #, der Zettel den Code — beide in der App', async () => {
    const r = await call(fuerAnna)
    const link = r.body.links?.[0]
    expect(link?.url).toMatch(/^https:\/\/app\.test\/#anmelden=[A-Za-z0-9_-]{43}$/)
    expect(link?.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(link?.zettelUrl).toBe(`https://app.test/#code=${link?.code.replace('-', '')}`)
  })

  it('jede Person ihren eigenen — zwei Aufrufe, zwei verschiedene Links', async () => {
    const r = await call({ personIds: [P_ANNA, P_BERT], senden: false })
    const [a, b] = r.body.links ?? []
    expect(a?.url).not.toBe(b?.url)
    expect(a?.code).not.toBe(b?.code)
  })

  it('scheitert das Schreiben, gibt es keinen Link — und keine Mail mit einem, der nicht gilt', async () => {
    linkFehler = true
    const r = await call(fuerAnna)
    expect(r.body.links).toEqual([])
    expect(mails).toEqual([])
  })
})

describe('send-invite: die E-Mail', () => {
  it('Vorname, Versammlung, Link, Code und das Datum, bis wann sie gelten', async () => {
    const r = await call(fuerAnna)
    const mail = mails[0]
    expect(mail?.to).toBe('anna@example.org')
    expect(mail?.from).toBe('Versammlung.app <anmelden@example.org>')
    expect(mail?.subject).toBe('Dein Zugang zur Versammlung Musterstadt')
    expect(mail?.text).toContain('Hallo Anna,')
    expect(mail?.text).toContain(r.body.links?.[0]?.url ?? '?')
    // Derselbe Code wie auf dem Zettel — für die App vom Home-Bildschirm des iPhones.
    expect(mail?.text).toContain(`\n${r.body.links?.[0]?.code ?? '?'}\n`)
    expect(mail?.text).not.toMatch(/\{\w+\}/)
    expect(r.body.links?.[0]?.gesendet).toBe(true)
  })

  it('in der Sprache der Versammlung', async () => {
    await call({ ...fuerAnna, lang: 'en' })
    expect(mails[0]?.subject).toBe('Your access to the Musterstadt Congregation')
    expect(mails[0]?.text).toMatch(/^Hello Anna,/)
  })

  it('ohne Sprachangabe oder mit unbekannter deutsch', async () => {
    await call({ ...fuerAnna, lang: 'gibt-es-nicht' })
    expect(mails[0]?.text).toMatch(/^Hallo Anna,/)
  })

  it('ohne Vornamen grüßt sie mit dem Nachnamen — bis zum 24.10.2026 stand „Hallo ," da', async () => {
    await call({ personIds: [P_KRUEGER], senden: true })
    expect(mails[0]?.to).toBe('krueger@example.org')
    expect(mails[0]?.text).toMatch(/^Hallo Krüger,\n/)
  })

  it('gesendet heißt: vermerkt (gesendet_at) — ein abgelehnter Versand nicht', async () => {
    await call(fuerAnna)
    expect(aufrufe.some((a) => a.method === 'PATCH' && a.path.includes(P_ANNA) && (a.body as { gesendet_at?: string })?.gesendet_at)).toBe(true)
    aufrufe = []
    resendAntwort = 422
    const r = await call(fuerAnna)
    expect(r.body.links?.[0]?.gesendet).toBe(false)
    expect(aufrufe.some((a) => a.method === 'PATCH')).toBe(false)
  })

  it('ohne Adresse keine Mail — der Link kommt für den Zettel zurück', async () => {
    const r = await call({ personIds: [P_OHNE], senden: true })
    expect(mails).toEqual([])
    expect(r.body.links?.[0]?.gesendet).toBe(false)
    expect(r.body.links?.[0]?.code).toMatch(/-/)
  })

  it('die Adresse ohne Leerraum drumherum', async () => {
    await call({ personIds: [P_BERT], senden: true })
    expect(mails[0]?.to).toBe('bert@example.org')
  })

  it('„senden: false" stellt nur aus (Zettel drucken)', async () => {
    const r = await call({ personIds: [P_ANNA], senden: false })
    expect(mails).toEqual([])
    expect(r.body.links?.[0]?.gesendet).toBe(false)
  })
})

describe('send-invite: ohne eingerichteten Versand', () => {
  it.each([
    ['INVITE_FROM fehlt', { INVITE_FROM: '' }],
    ['RESEND_API_KEY fehlt', { RESEND_API_KEY: '' }],
  ])('%s → wer senden will, dem wird nichts ausgestellt: Der alte Link gilt weiter', async (_fall, env) => {
    const r = await call(fuerAnna, { env })
    expect(r.status).toBe(200)
    expect(r.body.mailBereit).toBe(false)
    expect(r.body.links).toEqual([])
    expect(geschriebeneLinks()).toEqual([])
    expect(mails).toEqual([])
  })

  it('für den Zettel und das eigene Mail-Programm („senden: false") gibt es den Link trotzdem', async () => {
    const r = await call({ ...fuerAnna, senden: false }, { env: { INVITE_FROM: '' } })
    expect(r.body.mailBereit).toBe(false)
    expect(r.body.links?.[0]?.url).toContain('#anmelden=')
    expect(mails).toEqual([])
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
