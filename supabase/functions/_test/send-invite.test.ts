/*
 * Tests der Edge Function `send-invite` — die einzige, die **an Menschen
 * hinausgeht**, und bis zur Abdeckungs-Messung (T67) die einzige ganz ohne
 * Test: 0 % über 137 Zeilen. Ungefährlich war das nur, weil sie mangels
 * `INVITE_FROM` bisher gar nicht sendet; mit der Domain wird sie scharf, und
 * dann sind es echte E-Mails an echte Adressen.
 *
 * Geprüft wird deshalb dasselbe wie bei `substitute`: was NICHT gehen darf.
 * Die Empfängeradresse kommt **immer** aus der Personen-Tabelle der eigenen
 * Versammlung — frei wählbar ist allein der Code in der Vorlage. Wäre das
 * anders, hätte die Versammlung ein offenes Mail-Relay im Netz stehen.
 *
 * Aufbau wie substitute.test.ts: die echte index.ts wird geladen (`Deno` als
 * Global, `fetch` simuliert Auth, REST und Resend). Die Umgebung liest die
 * Function beim Laden, deshalb wird das Modul je Szenario frisch importiert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ---- Fixture ------------------------------------------------------------- */

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'

const U_PLANER = 'user-planer'
const U_VERK = 'user-verkuendiger' // Mitglied, aber kein Planer
const U_FREMD = 'user-fremd' // Konto ohne Mitgliedschaft

const MEMBERS: Record<string, { congregation_id: string; planner: boolean }[]> = {
  [U_PLANER]: [{ congregation_id: CONG, planner: true }],
  [U_VERK]: [{ congregation_id: CONG, planner: false }],
  [U_FREMD]: [],
}

/** Die Versammlung des Aufrufers — und nur sie. */
const PERSONS = [
  { id: 'p-anna', fn: 'Anna', mail: 'anna@example.org' },
  { id: 'p-bert', fn: 'Bert', mail: 'bert@example.org' },
  { id: 'p-ohne', fn: 'Ohne', mail: '' }, // keine Adresse → übersprungen
]

interface Mail {
  from: string
  to: string
  subject: string
  text: string
}

let authUser: string | null
let mails: Mail[]
/** REST-Pfade, die die Function abgefragt hat — zeigt den Zuschnitt. */
let restPfade: string[]
let resendAntwort: number

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = String(input)

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
  restPfade.push(path)
  if (path.startsWith('members')) return jsonRes(MEMBERS[authUser ?? ''] ?? [])
  if (path.startsWith('persons')) return jsonRes(PERSONS)
  return jsonRes([])
}

/** Modul mit gegebener Umgebung frisch laden (Env wird beim Import gelesen). */
async function loadFn(extraEnv: Record<string, string> = {}): Promise<(req: Request) => Promise<Response>> {
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    RESEND_API_KEY: 'resend-key',
    INVITE_FROM: 'Planer <einladung@example.org>',
    APP_URL: 'https://app.test/',
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

interface Ergebnis {
  sent?: number
  skipped?: number
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

const einladung = { invites: [{ personId: 'p-anna', code: 'ABC-123' }] }

beforeEach(() => {
  authUser = U_PLANER
  mails = []
  restPfade = []
  resendAntwort = 200
})

/* ---- Tests --------------------------------------------------------------- */

describe('send-invite: wer senden darf', () => {
  it('ein Planer darf', async () => {
    const r = await call(einladung)
    expect(r.body).toEqual({ sent: 1, skipped: 0 })
    expect(mails.length).toBe(1)
  })

  it('ein Verkündiger nicht — 403 und keine Mail', async () => {
    const r = await call(einladung, { als: U_VERK })
    expect(r.status).toBe(403)
    expect(mails).toEqual([])
  })

  it('ohne Mitgliedschaft nicht', async () => {
    const r = await call(einladung, { als: U_FREMD })
    expect(r.status).toBe(403)
    expect(mails).toEqual([])
  })

  it('ohne gültiges Login nicht — 401 und keine Mail', async () => {
    const r = await call(einladung, { als: null })
    expect(r.status).toBe(401)
    expect(mails).toEqual([])
  })
})

describe('send-invite: kein offenes Mail-Relay', () => {
  it('die Adresse kommt aus der Personen-Tabelle, nicht aus dem Aufruf', async () => {
    // Der Aufrufer gibt eine fremde Adresse mit — sie darf nirgends ankommen.
    await call({ invites: [{ personId: 'p-anna', code: 'ABC-123', mail: 'fremd@woanders.test' }] })
    expect(mails[0]?.to).toBe('anna@example.org')
  })

  it('eine unbekannte Person sendet gar nichts', async () => {
    const r = await call({ invites: [{ personId: 'p-fremd', code: 'ABC-123' }] })
    expect(r.body).toEqual({ sent: 0, skipped: 1 })
    expect(mails).toEqual([])
  })

  it('gelesen wird nur die eigene Versammlung', async () => {
    await call(einladung)
    const personenAbfrage = restPfade.find((p) => p.startsWith('persons'))
    expect(personenAbfrage).toContain(`congregation_id=eq.${CONG}`)
  })

  it('höchstens 200 Einladungen je Aufruf', async () => {
    const viele = Array.from({ length: 250 }, () => ({ personId: 'p-anna', code: 'ABC-123' }))
    const r = await call({ invites: viele })
    expect((r.body.sent ?? 0) + (r.body.skipped ?? 0)).toBe(200)
  })
})

describe('send-invite: ohne Absender wird nicht gesendet', () => {
  it('fehlendes INVITE_FROM → not-configured, die App fällt auf mailto zurück', async () => {
    const r = await call(einladung, { env: { INVITE_FROM: '' } })
    expect(r.body.error).toBe('not-configured')
    expect(mails).toEqual([])
  })

  it('fehlender RESEND_API_KEY ebenso', async () => {
    const r = await call(einladung, { env: { RESEND_API_KEY: '' } })
    expect(r.body.error).toBe('not-configured')
    expect(mails).toEqual([])
  })

  it('… und zwar vor jeder Datenbank-Abfrage', async () => {
    // Sonst stünde in den Logs eine Leseabfrage für einen Versand, den es
    // gar nicht gibt.
    await call(einladung, { env: { INVITE_FROM: '' } })
    expect(restPfade).toEqual([])
  })
})

describe('send-invite: was in der Einladung steht', () => {
  it('Vorname, App-Link und Code — mehr nicht', async () => {
    await call(einladung)
    const mail = mails[0]
    expect(mail?.to).toBe('anna@example.org')
    expect(mail?.from).toBe('Planer <einladung@example.org>')
    expect(mail?.text).toContain('Anna')
    expect(mail?.text).toContain('https://app.test/')
    expect(mail?.text).toContain('ABC-123')
  })

  it('ohne Code wird nicht gesendet — eine Einladung ohne Code ist keine', async () => {
    const r = await call({ invites: [{ personId: 'p-anna', code: '  ' }] })
    expect(r.body).toEqual({ sent: 0, skipped: 1 })
    expect(mails).toEqual([])
  })

  it('Person ohne E-Mail-Adresse wird übersprungen, nicht gemeldet', async () => {
    const r = await call({ invites: [{ personId: 'p-ohne', code: 'ABC-123' }] })
    expect(r.body).toEqual({ sent: 0, skipped: 1 })
  })

  it('leere Liste → 400, nicht etwa „0 gesendet"', async () => {
    const r = await call({ invites: [] })
    expect(r.status).toBe(400)
  })
})

describe('send-invite: wenn Resend nicht mitspielt', () => {
  it('zählt als übersprungen, nicht als gesendet', async () => {
    resendAntwort = 422
    const stumm = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await call({
      invites: [
        { personId: 'p-anna', code: 'ABC-123' },
        { personId: 'p-bert', code: 'DEF-456' },
      ],
    })
    expect(r.body).toEqual({ sent: 0, skipped: 2 })
    stumm.mockRestore()
  })
})
