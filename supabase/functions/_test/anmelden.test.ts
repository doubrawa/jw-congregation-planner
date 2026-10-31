/*
 * Tests der Edge Function `anmelden` (T121, Phase 8) — die Tür ohne Kennwort.
 * Wer einen gültigen Link oder Code vorzeigt, bekommt eine Sitzung; das Konto
 * entsteht dabei beim ersten Mal. Öffentlich erreichbar, also vor allem: was
 * NICHT gehen darf — ein falscher, ein abgelaufener Link, Raten. (Einen Link
 * per E-Mail anfordern ging bis zum 31.10.2026.)
 *
 * Aufbau wie send-invite.test.ts: die echte index.ts, `fetch` simuliert Auth
 * und REST; die Attrappe wertet Filter aus und hält ihren Stand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { codeVollstaendig, pruefsumme } from '../_shared/anmeldung.ts'
import { filterWert, jsonRes, nurSpalten } from './attrappe.ts'

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'

const P_ANNA = '11111111-1111-4111-8111-111111111111' // hat einen Link
const P_BERT = '22222222-2222-4222-8222-222222222222' // hat ein Konto, keinen Link
const P_CARL = '33333333-3333-4333-8333-333333333333' // weder noch

const TOKEN_ANNA = 'A'.repeat(43)
const CODE_ANNA = 'K7RD2QWM'

interface LinkRow {
  person_id: string
  congregation_id: string
  token_hash: string
  code_hash: string
  gueltig_bis: string
  gesendet_at: string | null
  benutzt_at: string | null
}

const PERSONS = [
  { id: P_ANNA, fn: 'Anna', ln: 'Alt', congregation_id: CONG, planner_vorgemerkt: true, zuteiler_vorgemerkt: false },
  { id: P_BERT, fn: 'Bert', ln: 'Brand', congregation_id: CONG, planner_vorgemerkt: false, zuteiler_vorgemerkt: true },
  { id: P_CARL, fn: 'Carl', ln: 'Cohn', congregation_id: CONG, planner_vorgemerkt: false, zuteiler_vorgemerkt: false },
]

let links: LinkRow[]
let members: Array<{ user_id: string; congregation_id: string; person_id: string | null; planner: boolean; zuteiler: boolean; email: string }>
/** Konten bei Supabase Auth: Id → Adresse. */
let konten: Map<string, string>
let fehlversuche: Array<{ ip: string; at: string }>
let angelegt: Array<{ id: string; email: string; email_confirm: boolean }>
/** Welcher `type` beim Einlösen gilt — neuere Fassungen von Auth nennen ihn „email". */
let verifyTyp: 'magiclink' | 'email'
let verifyKaputt: boolean
/** Eine zweite erste Anmeldung derselben Person schreibt ihre `members`-Zeile kurz vor dieser. */
let wettlauf: boolean
/** Auth legt kein Konto an. */
let kontoKaputt: boolean

const zukunft = () => new Date(Date.now() + 10 * 864e5).toISOString()

async function linkZeile(person: string, token: string, code: string, over: Partial<LinkRow> = {}): Promise<LinkRow> {
  return {
    person_id: person,
    congregation_id: CONG,
    token_hash: await pruefsumme(token),
    code_hash: await pruefsumme(code),
    gueltig_bis: zukunft(),
    gesendet_at: null,
    benutzt_at: null,
    ...over,
  }
}

const sichtbar = (l: LinkRow) => ({
  person_id: l.person_id,
  congregation_id: l.congregation_id,
  gueltig_bis: l.gueltig_bis,
  gesendet_at: l.gesendet_at,
  benutzt_at: l.benutzt_at,
})

const inListe = (path: string, spalte: string): string[] =>
  new RegExp(`[?&]${spalte}=in\\.\\(([^)]*)\\)`).exec(path)?.[1]?.split(',').map(decodeURIComponent) ?? []

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<Response> => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))

  if (url.includes('/auth/v1/admin/users/')) {
    const id = decodeURIComponent(url.split('/auth/v1/admin/users/')[1] ?? '')
    return konten.has(id) ? jsonRes({ id, email: konten.get(id) }) : new Response('{"msg":"User not found"}', { status: 404 })
  }
  if (url.endsWith('/auth/v1/admin/users') && method === 'POST') {
    if (kontoKaputt) return new Response('{"msg":"kaputt"}', { status: 500 })
    angelegt.push(body)
    konten.set(body.id, body.email)
    return jsonRes({ id: body.id, email: body.email })
  }
  if (url.endsWith('/auth/v1/admin/generate_link')) {
    const bekannt = [...konten.values()].includes(body.email)
    return bekannt ? jsonRes({ hashed_token: `h:${body.email}` }) : new Response('{"msg":"User not found"}', { status: 404 })
  }
  if (url.endsWith('/auth/v1/verify')) {
    if (verifyKaputt || body.type !== verifyTyp) return new Response('{"msg":"bad"}', { status: 403 })
    return jsonRes({ access_token: `zugang:${body.token_hash}`, refresh_token: 'auffrischen' })
  }

  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  if (path.startsWith('anmelde_links')) {
    if (method === 'GET') {
      const t = filterWert(path, 'token_hash')
      const c = filterWert(path, 'code_hash')
      const ids = inListe(path, 'person_id')
      const treffer = links.filter((l) => (t ? l.token_hash === t : c ? l.code_hash === c : ids.includes(l.person_id)))
      return jsonRes(treffer.map(sichtbar))
    }
    if (method === 'PATCH') {
      const pid = filterWert(path, 'person_id')
      const getroffen = links.filter((l) => l.person_id === pid)
      for (const l of getroffen) Object.assign(l, body)
      return jsonRes(getroffen.map((l) => ({ person_id: l.person_id })))
    }
  }
  if (path.startsWith('persons')) {
    const id = filterWert(path, 'id')
    return jsonRes(nurSpalten(PERSONS.filter((p) => p.id === id && p.congregation_id === filterWert(path, 'congregation_id')), path))
  }
  if (path.startsWith('congregations')) return jsonRes([{ name: 'Musterstadt' }])
  if (path.startsWith('members')) {
    if (method === 'POST') {
      if (wettlauf) {
        wettlauf = false
        members.push({ ...body })
      }
      if (members.some((m) => m.user_id === body.user_id)) return new Response('{"code":"23505"}', { status: 409 })
      members.push(body)
      return jsonRes([{ user_id: body.user_id }])
    }
    const pid = filterWert(path, 'person_id')
    const ids = inListe(path, 'person_id')
    return jsonRes(members.filter((m) => (pid ? m.person_id === pid : ids.includes(m.person_id ?? ''))))
  }
  if (path.startsWith('anmelde_fehlversuche')) {
    if (method === 'POST') {
      for (const z of body as Array<{ ip: string }>) fehlversuche.push({ ip: z.ip, at: new Date().toISOString() })
      return new Response(null, { status: 201 })
    }
    if (method === 'DELETE') return new Response(null, { status: 204 })
    const ip = filterWert(path, 'ip')
    const limit = Number(/[?&]limit=(\d+)/.exec(path)?.[1] ?? '1000')
    return jsonRes(fehlversuche.filter((f) => !ip || f.ip === ip).slice(0, limit).map((_, i) => ({ id: i })))
  }
  return jsonRes([])
}

async function loadFn(extraEnv: Record<string, string> = {}): Promise<(req: Request) => Promise<Response>> {
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    APP_URL: 'https://app.test/',
    ...extraEnv,
  }
  let captured: ((req: Request) => Promise<Response>) | undefined
  const g = globalThis as Record<string, unknown>
  g.Deno = { env: { get: (k: string) => env[k] }, serve: (h: (req: Request) => Promise<Response>) => (captured = h) }
  g.fetch = fakeFetch
  vi.resetModules()
  await import('../anmelden/index.ts')
  return captured as (req: Request) => Promise<Response>
}

interface Antwort {
  ok?: boolean
  error?: string
  sitzung?: { access_token: string; refresh_token: string }
  name?: string
  versammlung?: string
}

async function call(body: unknown, opts: { ip?: string; env?: Record<string, string> } = {}): Promise<{ status: number; body: Antwort }> {
  const handler = await loadFn(opts.env)
  const res = await handler(
    new Request('https://fn.test/anmelden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `${opts.ip ?? '203.0.113.7'}, 10.0.0.1` },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: (await res.json()) as Antwort }
}

beforeEach(async () => {
  links = [await linkZeile(P_ANNA, TOKEN_ANNA, CODE_ANNA)]
  members = [{ user_id: 'konto-bert', congregation_id: CONG, person_id: P_BERT, planner: false, zuteiler: true, email: '' }]
  konten = new Map([['konto-bert', 'bert-alt@example.org']])
  fehlversuche = []
  angelegt = []
  verifyTyp = 'magiclink'
  verifyKaputt = false
  wettlauf = false
  kontoKaputt = false
})

describe('anmelden: mit dem Link aus der Nachricht', () => {
  it('ein gültiger Link gibt eine Sitzung — und legt beim ersten Mal das Konto an', async () => {
    const r = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(r.status).toBe(200)
    expect(r.body.sitzung?.refresh_token).toBe('auffrischen')
    // Konto-Id = Person-Id, interne Adresse, bestätigt, ohne Kennwort.
    expect(angelegt).toEqual([{ id: P_ANNA, email: `${P_ANNA}@konten.invalid`, email_confirm: true }])
    expect(members.find((m) => m.person_id === P_ANNA)).toEqual({
      user_id: P_ANNA, congregation_id: CONG, person_id: P_ANNA, planner: true, zuteiler: false, email: '',
    })
  })

  it('die Rechte kommen aus der Vormerkung an der Person', async () => {
    links.push(await linkZeile(P_CARL, 'C'.repeat(43), 'M3ZE7KQR'))
    await call({ aktion: 'link', token: 'C'.repeat(43) })
    expect(members.find((m) => m.person_id === P_CARL)).toMatchObject({ planner: false, zuteiler: false })
  })

  it('wer schon ein Konto hat, bekommt seins — kein zweites', async () => {
    links.push(await linkZeile(P_BERT, 'B'.repeat(43), 'Q2LF6JXD'))
    const r = await call({ aktion: 'link', token: 'B'.repeat(43) })
    expect(r.body.sitzung?.access_token).toBe('zugang:h:bert-alt@example.org')
    expect(angelegt).toEqual([])
    expect(members.filter((m) => m.person_id === P_BERT)).toHaveLength(1)
  })

  it('der Link gilt mehrfach (Handy und Tablet) — beim zweiten Mal kein neues Konto', async () => {
    await call({ aktion: 'link', token: TOKEN_ANNA })
    const zweites = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(zweites.body.sitzung).toBeDefined()
    expect(angelegt).toHaveLength(1)
    expect(members.filter((m) => m.person_id === P_ANNA)).toHaveLength(1)
  })

  it('vermerkt, wann er benutzt wurde', async () => {
    await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(links.find((l) => l.person_id === P_ANNA)?.benutzt_at).toBeTruthy()
  })

  it('zwei erste Anmeldungen zugleich (Doppeltipp): Auch die zweite ist angemeldet, ein Konto, eine Zeile', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    wettlauf = true
    const r = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(r.status).toBe(200)
    expect(r.body.sitzung).toBeDefined()
    expect(members.filter((m) => m.person_id === P_ANNA)).toHaveLength(1)
    err.mockRestore()
  })

  it.each([
    ['ein unbekannter', { aktion: 'link', token: 'X'.repeat(43) }],
    ['kein Token', { aktion: 'link' }],
    ['ein Token in falscher Form', { aktion: 'link', token: 'a b/c' }],
  ])('%s Link → 404, keine Sitzung, kein Konto', async (_fall, body) => {
    const r = await call(body)
    expect(r.status).toBe(404)
    expect(r.body.sitzung).toBeUndefined()
    expect(angelegt).toEqual([])
  })

  it('ein abgelaufener → 410, kein Konto', async () => {
    links[0]!.gueltig_bis = new Date(Date.now() - 1000).toISOString()
    const r = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(r.status).toBe(410)
    expect(r.body.error).toBe('abgelaufen')
    expect(angelegt).toEqual([])
  })

  it('neuere Fassungen von Auth lösen den Link als „email" ein — der Rückweg greift', async () => {
    verifyTyp = 'email'
    const r = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(r.body.sitzung).toBeDefined()
  })

  it('geht das Einlösen schief → 500, keine Sitzung', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    verifyKaputt = true
    const r = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(r.status).toBe(500)
    expect(r.body.sitzung).toBeUndefined()
    err.mockRestore()
  })
})

describe('anmelden: mit dem Code vom Zettel', () => {
  it('„prüfen" nennt Name und Versammlung — ohne Sitzung, ohne Konto', async () => {
    const r = await call({ aktion: 'code', code: 'k7rd-2qwm', pruefen: true })
    expect(r.body).toEqual({ ok: true, name: 'Anna Alt', versammlung: 'Musterstadt' })
    expect(angelegt).toEqual([])
  })

  it('danach meldet derselbe Code an — getippt, mit Strich und klein', async () => {
    const r = await call({ aktion: 'code', code: ' k7rd-2qwm ' })
    expect(r.body.sitzung).toBeDefined()
  })

  it('ein unbekannter Code → 404 und ein Fehlversuch', async () => {
    const r = await call({ aktion: 'code', code: 'ZZZZ-ZZZZ' })
    expect(r.status).toBe(404)
    expect(fehlversuche).toHaveLength(1)
    expect(fehlversuche[0]?.ip).toBe('203.0.113.7')
  })

  it('ein unvollständiger zählt nicht als Versuch', async () => {
    const r = await call({ aktion: 'code', code: 'K7RD' })
    expect(r.status).toBe(404)
    expect(fehlversuche).toEqual([])
  })

  it('ein abgelaufener → 410, kein Fehlversuch (er war ja richtig)', async () => {
    links[0]!.gueltig_bis = new Date(Date.now() - 1000).toISOString()
    const r = await call({ aktion: 'code', code: CODE_ANNA })
    expect(r.status).toBe(410)
    expect(fehlversuche).toEqual([])
  })

  it('nach 20 Fehlversuchen eines Absenders → 429, auch mit dem richtigen Code', async () => {
    fehlversuche = Array.from({ length: 20 }, () => ({ ip: '203.0.113.7', at: new Date().toISOString() }))
    const r = await call({ aktion: 'code', code: CODE_ANNA })
    expect(r.status).toBe(429)
    expect(r.body.sitzung).toBeUndefined()
    // Ein anderer Absender ist davon nicht betroffen.
    const anderer = await call({ aktion: 'code', code: CODE_ANNA }, { ip: '198.51.100.9' })
    expect(anderer.body.sitzung).toBeDefined()
  })

  it('nach 500 Fehlversuchen insgesamt → 429 für alle', async () => {
    fehlversuche = Array.from({ length: 500 }, (_, i) => ({ ip: `198.51.100.${i % 250}`, at: new Date().toISOString() }))
    const r = await call({ aktion: 'code', code: CODE_ANNA }, { ip: '192.0.2.1' })
    expect(r.status).toBe(429)
  })
})

describe('anmelden: sonst', () => {
  it('eine unbekannte Aktion → 400', async () => {
    expect((await call({ aktion: 'loeschen' })).status).toBe(400)
    expect((await call(null)).status).toBe(400)
  })

  it('„Link senden" per E-Mail gibt es seit dem 31.10.2026 nicht mehr → 400, nichts ausgestellt', async () => {
    const vorher = JSON.stringify(links)
    expect(await call({ aktion: 'mail', email: 'anna@example.org' })).toEqual({ status: 400, body: { error: 'bad-request' } })
    expect(JSON.stringify(links)).toBe(vorher)
  })
})

describe('anmelden: am Rand (31.10.2026)', () => {
  const P_WEG = '77777777-7777-4777-8777-777777777777' // hat einen Link, die Person ist gelöscht
  const TOKEN_WEG = 'W'.repeat(43)
  const CODE_WEG = 'M3ZE7KQR'

  it('OPTIONS antwortet dem Browser, ohne etwas zu lesen', async () => {
    const handler = await loadFn()
    const res = await handler(new Request('https://fn.test/anmelden', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('der Link einer gelöschten Person meldet niemanden an — weder per Link noch per Code, auch nicht beim Prüfen', async () => {
    // Gegenprobe der Voraussetzung: Ein unvollständiger Code ergäbe dieselbe 404, ohne nach der Person zu fragen.
    expect(codeVollstaendig(CODE_WEG)).toBe(true)
    links.push(await linkZeile(P_WEG, TOKEN_WEG, CODE_WEG))
    expect(await call({ aktion: 'link', token: TOKEN_WEG })).toEqual({ status: 404, body: { error: 'ungueltig' } })
    expect(await call({ aktion: 'code', code: CODE_WEG, pruefen: true })).toEqual({ status: 404, body: { error: 'ungueltig' } })
    expect(await call({ aktion: 'code', code: CODE_WEG })).toEqual({ status: 404, body: { error: 'ungueltig' } })
    expect(angelegt).toEqual([])
    expect(members.map((m) => m.person_id)).toEqual([P_BERT])
  })

  it('legt Auth kein Konto an, gibt es keine Sitzung und keine Mitgliedschaft (500)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      kontoKaputt = true
      expect(await call({ aktion: 'link', token: TOKEN_ANNA })).toEqual({ status: 500, body: { error: 'server-error' } })
      expect(members.map((m) => m.person_id)).toEqual([P_BERT])
      expect(links.find((l) => l.person_id === P_ANNA)?.benutzt_at).toBeNull()
      expect(err).toHaveBeenCalledWith(expect.stringContaining('admin/users anlegen 500'))
    } finally {
      err.mockRestore()
    }
  })

  it('ist das Konto eines Mitglieds bei Auth verschwunden, gibt es keine Sitzung — und kein zweites Konto', async () => {
    links.push(await linkZeile(P_BERT, 'B'.repeat(43), 'HX4P9VTB'))
    konten.delete('konto-bert')
    expect(await call({ aktion: 'link', token: 'B'.repeat(43) })).toEqual({ status: 500, body: { error: 'server-error' } })
    expect(angelegt).toEqual([])
  })

  it('ohne Weiterleitungs-Kopf zählt der Fehlversuch unter cf-connecting-ip — ohne beide unter „unbekannt"', async () => {
    const handler = await loadFn()
    const versuch = (headers: Record<string, string>) =>
      handler(new Request('https://fn.test/anmelden', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ aktion: 'code', code: 'ZZZZ9999' }) }))
    expect((await versuch({ 'cf-connecting-ip': '198.51.100.4' })).status).toBe(404)
    expect((await versuch({})).status).toBe(404)
    expect(fehlversuche.map((f) => f.ip)).toEqual(['198.51.100.4', 'unbekannt'])
  })

  it('wirft das Netz, antwortet sie 500 — die Einzelheiten stehen nur im Log', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const handler = await loadFn()
      ;(globalThis as Record<string, unknown>).fetch = async () => {
        throw new Error('Netz weg')
      }
      const res = await handler(
        new Request('https://fn.test/anmelden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'link', token: TOKEN_ANNA }) }),
      )
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'server-error' })
      expect(err).toHaveBeenCalledWith('anmelden:', 'Netz weg')
    } finally {
      err.mockRestore()
    }
  })
})
