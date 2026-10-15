/*
 * Tests der Edge Function `anmelden` (T121, Phase 8) — die Tür ohne Kennwort.
 * Wer einen gültigen Link oder Code vorzeigt, bekommt eine Sitzung; das Konto
 * entsteht dabei beim ersten Mal. Öffentlich erreichbar, also vor allem: was
 * NICHT gehen darf — ein falscher, ein abgelaufener Link, Raten, eine Adresse
 * ausforschen, jemanden hereinholen, den der Admin noch nicht hereingelassen hat.
 *
 * Aufbau wie send-invite.test.ts: die echte index.ts, `fetch` simuliert Auth,
 * REST und Resend; die Attrappe wertet Filter aus und hält ihren Stand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pruefsumme } from '../_shared/anmeldung.ts'
import { filterWert, jsonRes } from './attrappe.ts'

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'

const P_ANNA = '11111111-1111-4111-8111-111111111111' // hat einen Link
const P_BERT = '22222222-2222-4222-8222-222222222222' // hat ein Konto, keinen Link
const P_CARL = '33333333-3333-4333-8333-333333333333' // weder noch
const P_DORA = '44444444-4444-4444-8444-444444444444' // teilt die Adresse mit Anna, hat einen Link
const P_ERIK = '55555555-5555-4555-8555-555555555555' // eine Adresse, die Carls nur im Platzhalter gleicht

const TOKEN_ANNA = 'A'.repeat(43)
const CODE_ANNA = 'K7RD2QWM'
const TOKEN_DORA = 'D'.repeat(43)
const CODE_DORA = 'HX4P9VTA'

interface LinkRow {
  person_id: string
  congregation_id: string
  token_hash: string
  code_hash: string
  gueltig_bis: string
  gesendet_at: string | null
  benutzt_at: string | null
}

interface Mail {
  to: string
  subject: string
  text: string
}

const PERSONS = [
  { id: P_ANNA, fn: 'Anna', ln: 'Alt', mail: 'anna@example.org', congregation_id: CONG, planner_vorgemerkt: true, zuteiler_vorgemerkt: false },
  { id: P_BERT, fn: 'Bert', ln: 'Brand', mail: 'bert@example.org', congregation_id: CONG, planner_vorgemerkt: false, zuteiler_vorgemerkt: true },
  { id: P_CARL, fn: 'Carl', ln: 'Cohn', mail: 'carl_c@example.org', congregation_id: CONG, planner_vorgemerkt: false, zuteiler_vorgemerkt: false },
  { id: P_DORA, fn: 'Dora', ln: 'Alt', mail: 'Anna@Example.org', congregation_id: CONG, planner_vorgemerkt: false, zuteiler_vorgemerkt: false },
]

let links: LinkRow[]
let members: Array<{ user_id: string; congregation_id: string; person_id: string | null; planner: boolean; zuteiler: boolean; email: string }>
/** Konten bei Supabase Auth: Id → Adresse. */
let konten: Map<string, string>
let fehlversuche: Array<{ ip: string; at: string }>
let mails: Mail[]
let angelegt: Array<{ id: string; email: string; email_confirm: boolean }>
/** Welcher `type` beim Einlösen gilt — neuere Fassungen von Auth nennen ihn „email". */
let verifyTyp: 'magiclink' | 'email'
let verifyKaputt: boolean
/** Eine zweite erste Anmeldung derselben Person schreibt ihre `members`-Zeile kurz vor dieser. */
let wettlauf: boolean

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

  if (url.startsWith('https://api.resend.com/')) {
    mails.push({ to: body.to, subject: body.subject, text: body.text })
    return jsonRes({ id: 'mail' })
  }
  if (url.includes('/auth/v1/admin/users/')) {
    const id = decodeURIComponent(url.split('/auth/v1/admin/users/')[1] ?? '')
    return konten.has(id) ? jsonRes({ id, email: konten.get(id) }) : new Response('{"msg":"User not found"}', { status: 404 })
  }
  if (url.endsWith('/auth/v1/admin/users') && method === 'POST') {
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
    if (method === 'POST') {
      for (const z of body as LinkRow[]) links = [...links.filter((l) => l.person_id !== z.person_id), z]
      return new Response(null, { status: 201 })
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
    const ilike = /[?&]mail=ilike\.([^&]*)/.exec(path)?.[1]
    if (ilike) {
      // Wie Postgres: `_` ist ein Platzhalter, `\_` ein wörtlicher Unterstrich.
      const muster = decodeURIComponent(ilike)
      const re = new RegExp(`^${muster.replace(/\\_|_|[.+?^${}()|[\]\\]/g, (z) => (z === '\\_' ? '_' : z === '_' ? '.' : `\\${z}`))}$`, 'i')
      return jsonRes(PERSONS.filter((p) => re.test(p.mail)))
    }
    return jsonRes(PERSONS.filter((p) => p.id === id && p.congregation_id === filterWert(path, 'congregation_id')))
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
    RESEND_API_KEY: 'resend-key',
    INVITE_FROM: 'Versammlung.app <anmelden@example.org>',
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
  links = [await linkZeile(P_ANNA, TOKEN_ANNA, CODE_ANNA), await linkZeile(P_DORA, TOKEN_DORA, CODE_DORA)]
  members = [{ user_id: 'konto-bert', congregation_id: CONG, person_id: P_BERT, planner: false, zuteiler: true, email: '' }]
  konten = new Map([['konto-bert', 'bert-alt@example.org']])
  fehlversuche = []
  mails = []
  angelegt = []
  verifyTyp = 'magiclink'
  verifyKaputt = false
  wettlauf = false
})

describe('anmelden: mit dem Link aus der E-Mail', () => {
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

describe('anmelden: „Link senden" auf der Anmeldeseite', () => {
  it('ohne eingerichteten Versand → not-configured, nichts verändert', async () => {
    const vorher = JSON.stringify(links)
    const r = await call({ aktion: 'mail', email: 'anna@example.org' }, { env: { INVITE_FROM: '' } })
    expect(r.body.error).toBe('not-configured')
    expect(JSON.stringify(links)).toBe(vorher)
    expect(mails).toEqual([])
  })

  it('eine unbekannte Adresse → dieselbe Antwort, keine Mail', async () => {
    const r = await call({ aktion: 'mail', email: 'niemand@example.org' })
    expect(r.body).toEqual({ ok: true })
    expect(mails).toEqual([])
  })

  it('zwei, die sich eine Adresse teilen, bekommen je ihren eigenen Link — Groß und klein egal', async () => {
    const r = await call({ aktion: 'mail', email: ' ANNA@example.org ' })
    expect(r.body).toEqual({ ok: true })
    expect(mails.map((m) => m.text.split('\n')[0])).toEqual(['Hallo Anna,', 'Hallo Dora,'])
    expect(mails.every((m) => m.to === 'anna@example.org')).toBe(true)
    const [a, d] = mails.map((m) => /#anmelden=([A-Za-z0-9_-]+)/.exec(m.text)?.[1])
    expect(a).not.toBe(d)
  })

  /*
    Die Mail trägt den Code (T121, Phase 10): Auf dem iPhone öffnet der Link
    Safari, nie die App vom Home-Bildschirm — dort meldet nur der Code an. Den
    Code gibt es nur beim Ausstellen im Klartext, also stellt „Link senden"
    einen neuen Link aus, und der Zettel gilt nicht mehr (Betreiber, 15.10.2026).
  */
  it('stellt einen neuen Link aus — Token und Code; der Code steht in der Mail', async () => {
    await call({ aktion: 'mail', email: 'anna@example.org' })
    const link = links.find((l) => l.person_id === P_ANNA)!
    const text = mails[0]?.text ?? ''
    const token = /#anmelden=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? ''
    const code = /\n([0-9A-Z]{4}-[0-9A-Z]{4})\n/.exec(text)?.[1] ?? ''
    expect(link.token_hash).toBe(await pruefsumme(token))
    expect(link.code_hash).toBe(await pruefsumme(code.replace('-', '')))
    expect(link.gesendet_at).toBeTruthy()
  })

  it('mit dem Code aus der Mail meldet man sich an — mit dem vom Zettel nicht mehr', async () => {
    await call({ aktion: 'mail', email: 'anna@example.org' })
    const code = /\n([0-9A-Z]{4}-[0-9A-Z]{4})\n/.exec(mails[0]?.text ?? '')?.[1] ?? ''
    expect((await call({ aktion: 'code', code: CODE_ANNA })).status).toBe(404)
    expect((await call({ aktion: 'code', code })).body.sitzung).toBeDefined()
  })

  it('ein abgelaufener Link gilt danach wieder dreißig Tage', async () => {
    links[0]!.gueltig_bis = new Date(Date.now() - 1000).toISOString()
    await call({ aktion: 'mail', email: 'anna@example.org' })
    const bis = new Date(links.find((l) => l.person_id === P_ANNA)!.gueltig_bis).getTime()
    expect(bis - Date.now()).toBeGreaterThan(29 * 864e5)
  })

  it('ein abgelaufener Zettel lebt dabei nicht wieder auf — wer ihn gefunden hat, kommt nicht herein', async () => {
    // Der Angriff: einen alten Zettel aufheben, die Adresse seines Besitzers
    // kennen, „Link senden" drücken — und mit dem Code vom Zettel anmelden.
    links[0]!.gueltig_bis = new Date(Date.now() - 1000).toISOString()
    await call({ aktion: 'mail', email: 'anna@example.org' })
    const link = links.find((l) => l.person_id === P_ANNA)!
    expect(link.code_hash).not.toBe(await pruefsumme(CODE_ANNA))
    const r = await call({ aktion: 'code', code: CODE_ANNA })
    expect(r.status).toBe(404)
    expect(r.body.sitzung).toBeUndefined()
  })

  it('wer ein Konto hat, aber keinen Link, bekommt einen neuen', async () => {
    await call({ aktion: 'mail', email: 'bert@example.org' })
    expect(mails).toHaveLength(1)
    expect(links.some((l) => l.person_id === P_BERT)).toBe(true)
  })

  it('wen der Admin noch nicht hereingelassen hat (kein Konto, kein Link), bekommt nichts', async () => {
    const r = await call({ aktion: 'mail', email: 'carl_c@example.org' })
    expect(r.body).toEqual({ ok: true })
    expect(mails).toEqual([])
    expect(links.some((l) => l.person_id === P_CARL)).toBe(false)
  })

  it('höchstens eine Mail in zehn Minuten je Person', async () => {
    await call({ aktion: 'mail', email: 'bert@example.org' })
    await call({ aktion: 'mail', email: 'bert@example.org' })
    expect(mails).toHaveLength(1)
  })

  it('der Unterstrich ist kein Platzhalter: carl_c@… trifft nicht auch carlxc@…', async () => {
    // Im Muster von `ilike` steht `_` für ein beliebiges Zeichen. Unmaskiert
    // bekäme Erik (carlxc@…) eine Mail, die für Carl (carl_c@…) bestimmt war.
    PERSONS.push({ id: P_ERIK, fn: 'Erik', ln: 'Ernst', mail: 'carlxc@example.org', congregation_id: CONG, planner_vorgemerkt: false, zuteiler_vorgemerkt: false })
    try {
      links.push(await linkZeile(P_CARL, 'C'.repeat(43), 'M3ZE7KQR'), await linkZeile(P_ERIK, 'E'.repeat(43), 'W8NB4TGC'))
      await call({ aktion: 'mail', email: 'carl_c@example.org' })
      expect(mails.map((m) => m.text.split('\n')[0])).toEqual(['Hallo Carl,'])
    } finally {
      PERSONS.pop()
    }
  })

  it.each([['*@*'], ['%@example.org'], ['keine-adresse'], ['']])('„%s" → 400, keine Abfrage nach Mustern', async (email) => {
    const r = await call({ aktion: 'mail', email })
    expect(r.status).toBe(400)
    expect(mails).toEqual([])
  })

  it('in der Sprache, die auf der Anmeldeseite eingestellt ist', async () => {
    await call({ aktion: 'mail', email: 'bert@example.org', lang: 'en' })
    expect(mails[0]?.text).toMatch(/^Hello Bert,/)
  })

  /*
    Die Antwort verrät nicht, ob es die Adresse gibt — auch nicht über ihre
    Dauer. Auf der Plattform kommt sie, bevor gesucht und gesendet wird
    (`EdgeRuntime.waitUntil`); hier hängt der Versand, und die Antwort ist
    trotzdem da.
  */
  it('die Antwort wartet nicht auf Suche und Versand — ihre Dauer verrät nichts', async () => {
    const g = globalThis as Record<string, unknown>
    const arbeiten: Promise<unknown>[] = []
    g.EdgeRuntime = { waitUntil: (arbeit: Promise<unknown>) => arbeiten.push(arbeit) }
    let freigeben: () => void = () => {}
    const gesperrt = new Promise<void>((r) => (freigeben = r))
    try {
      const handler = await loadFn()
      // Erst nach `loadFn` — das setzt `fetch` neu: Jede Abfrage hängt, bis die Antwort da ist.
      g.fetch = async (...a: Parameters<typeof fetch>) => {
        await gesperrt
        return (fakeFetch as unknown as typeof fetch)(...a)
      }
      const res = await Promise.race([
        handler(
          new Request('https://fn.test/anmelden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
            body: JSON.stringify({ aktion: 'mail', email: 'anna@example.org' }),
          }),
        ),
        new Promise<never>((_, nein) => setTimeout(() => nein(new Error('die Antwort wartet auf den Versand')), 2000)),
      ])
      expect(await res.json()).toEqual({ ok: true })
      expect(mails).toEqual([])
      expect(arbeiten).toHaveLength(1)
      freigeben()
      await arbeiten[0]
      expect(mails.map((m) => m.text.split('\n')[0])).toEqual(['Hallo Anna,', 'Hallo Dora,'])
    } finally {
      freigeben()
      delete g.EdgeRuntime
    }
  })

  it('scheitert die Suche, bleibt die Antwort dieselbe — der Fehler geht nur in die Logs', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const handler = await loadFn()
      ;(globalThis as Record<string, unknown>).fetch = async () => new Response('{"message":"kaputt"}', { status: 500 })
      const res = await handler(
        new Request('https://fn.test/anmelden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aktion: 'mail', email: 'anna@example.org' }),
        }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(err).toHaveBeenCalledWith('anmelden (mail):', expect.stringContaining('500'))
    } finally {
      err.mockRestore()
    }
  })
})

describe('anmelden: sonst', () => {
  it('eine unbekannte Aktion → 400', async () => {
    expect((await call({ aktion: 'loeschen' })).status).toBe(400)
    expect((await call(null)).status).toBe(400)
  })
})
