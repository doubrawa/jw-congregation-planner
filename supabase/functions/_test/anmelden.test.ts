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
import { codeVollstaendig, EINMAL_MINUTEN, pruefsumme } from '../_shared/anmeldung.ts'
import { anmeldeTexte, TEXT_NEUE_ANMELDUNG, TITEL_NEUE_ANMELDUNG } from '../anmelden/texte.ts'
import { filterWert, jsonRes, nurSpalten } from './attrappe.ts'
import { reset as pushZuruecksetzen, sent as gesendetePushes } from './web-push.stub.ts'

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
  { id: P_ANNA, fn: 'Anna', ln: 'Alt', congregation_id: CONG, admin_vorgemerkt: true, zuteiler_vorgemerkt: false },
  { id: P_BERT, fn: 'Bert', ln: 'Brand', congregation_id: CONG, admin_vorgemerkt: false, zuteiler_vorgemerkt: true },
  { id: P_CARL, fn: 'Carl', ln: 'Cohn', congregation_id: CONG, admin_vorgemerkt: false, zuteiler_vorgemerkt: false },
]

let links: LinkRow[]
let members: Array<{ user_id: string; congregation_id: string; person_id: string | null; admin: boolean; zuteiler: boolean; email: string }>
/** Konten bei Supabase Auth: Id → Adresse. */
let konten: Map<string, string>
let fehlversuche: Array<{ id: number; ip: string; at: string }>
/** Kann `anmelde_versuch` buchen? Sonst antwortet die Datenbank mit einem Fehler. */
let buchenKaputt: boolean
let glocke: Array<Record<string, unknown>>
let abos: Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string; lang: string | null }>
let angelegt: Array<{ id: string; email: string; email_confirm: boolean }>
/** Welcher `type` beim Einlösen gilt — neuere Fassungen von Auth nennen ihn „email". */
let verifyTyp: 'magiclink' | 'email'
let verifyKaputt: boolean
/** Eine zweite erste Anmeldung derselben Person schreibt ihre `members`-Zeile kurz vor dieser. */
let wettlauf: boolean
/** Auth legt kein Konto an. */
let kontoKaputt: boolean
/** Einmal-Codes: je Person einer, nur als Prüfsumme. */
let einmal: Array<{ person_id: string; congregation_id: string; code_hash: string; gueltig_bis: string }>
/** Mit welcher Sitzung „die übrigen Geräte abmelden" kam — je Aufruf. */
let abgemeldet: string[]
/** Supabase Auth meldet die übrigen Geräte nicht ab. */
let abmeldenKaputt: boolean
/** Jeder Aufruf an Auth und REST, in Reihenfolge: „METHODE pfad". */
let protokoll: string[]
/** Das Lesen eines Einmal-Codes sieht ihn noch gültig — er läuft erst danach ab. */
let einmalLaeuftGleichAb: boolean
/** Das Einlösen (DELETE) eines Einmal-Codes scheitert an der Datenbank. */
let einloesenKaputt: boolean
/**
 * Das Einlösen (DELETE) eines Einmal-Codes wartet, bis `noch` Anfragen ihn
 * gelesen haben. Ohne diese Schranke hängt die Reihenfolge zweier gleichzeitiger
 * Anfragen am Takt von `crypto.subtle`: In der CI löste eine schon ein, bevor die
 * andere las, und die bekam 404 statt 410.
 */
let einloesenSchranke: { noch: number; offen: Promise<void>; oeffnen: () => void } | null

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
  protokoll.push(`${method} ${url.replace(/^.*\/(auth|rest)\/v1\//, '')}`)

  // Die Sitzung eines Kontos heißt hier „Bearer sitzung:<Konto-Id>".
  if (url.endsWith('/auth/v1/user')) {
    const id = /^Bearer sitzung:(.+)$/.exec(init?.headers?.Authorization ?? '')?.[1]
    return id ? jsonRes({ id }) : new Response('{"msg":"invalid JWT"}', { status: 401 })
  }
  if (url.endsWith('/auth/v1/logout?scope=others') && method === 'POST') {
    if (abmeldenKaputt) return new Response('{"msg":"kaputt"}', { status: 500 })
    abgemeldet.push(init?.headers?.Authorization ?? '')
    return new Response(null, { status: 204 })
  }
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
    if (method === 'DELETE') {
      const pid = filterWert(path, 'person_id')
      const weg = links.filter((l) => l.person_id === pid)
      links = links.filter((l) => l.person_id !== pid)
      return jsonRes(weg.map(sichtbar))
    }
  }
  if (path.startsWith('anmelde_einmalcodes')) {
    const c = filterWert(path, 'code_hash')
    const pid = filterWert(path, 'person_id')
    const nach = /[?&]gueltig_bis=gt\.([^&]*)/.exec(path)?.[1]
    const trifft = (z: (typeof einmal)[number]) =>
      (c === null || z.code_hash === c) && (pid === null || z.person_id === pid) && (nach === undefined || z.gueltig_bis > decodeURIComponent(nach))
    const ohneSumme = (z: (typeof einmal)[number]) => ({ person_id: z.person_id, congregation_id: z.congregation_id, gueltig_bis: z.gueltig_bis })
    if (method === 'GET') {
      const gelesen = einmal.filter(trifft).map(ohneSumme)
      if (einloesenSchranke && --einloesenSchranke.noch === 0) einloesenSchranke.oeffnen()
      return jsonRes(einmalLaeuftGleichAb ? gelesen.map((z) => ({ ...z, gueltig_bis: zukunft() })) : gelesen)
    }
    if (method === 'DELETE') {
      // Kommen keine zwei Lesezugriffe, geht es nach einer Sekunde weiter: Dann
      // scheitert der Test an der Zählung der Lesezugriffe, statt bis zum
      // Timeout zu hängen, ohne zu sagen, was fehlt.
      if (einloesenSchranke) await Promise.race([einloesenSchranke.offen, new Promise((weiter) => setTimeout(weiter, 1000))])
      if (einloesenKaputt) return new Response('{"message":"kaputt"}', { status: 500 })
      const weg = einmal.filter(trifft)
      einmal = einmal.filter((z) => !trifft(z))
      return jsonRes(weg.map(ohneSumme))
    }
    if (method === 'POST') {
      // Upsert über `person_id` — wie `on_conflict=person_id`; die Prüfsumme ist eindeutig.
      for (const z of body as typeof einmal) {
        if (einmal.some((e) => e.code_hash === z.code_hash && e.person_id !== z.person_id)) return new Response('{"code":"23505"}', { status: 409 })
        einmal = [...einmal.filter((e) => e.person_id !== z.person_id), z]
      }
      return new Response(null, { status: 201 })
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
    const uid = filterWert(path, 'user_id')
    if (uid) return jsonRes(nurSpalten(members.filter((m) => m.user_id === uid), path))
    const pid = filterWert(path, 'person_id')
    const ids = inListe(path, 'person_id')
    return jsonRes(members.filter((m) => (pid ? m.person_id === pid : ids.includes(m.person_id ?? ''))))
  }
  // Wie `anmelde_versuch` in schema.sql: in der letzten Stunde zählen, dann buchen.
  if (path.startsWith('rpc/anmelde_versuch')) {
    if (buchenKaputt) return new Response('{"message":"kaputt"}', { status: 500 })
    const seit = Date.now() - 3600e3
    const juengst = fehlversuche.filter((f) => new Date(f.at).getTime() >= seit)
    if (juengst.filter((f) => f.ip === body.p_ip).length >= body.p_je_absender || juengst.length >= body.p_gesamt) return jsonRes([])
    const id = (fehlversuche.at(-1)?.id ?? 0) + 1
    fehlversuche.push({ id, ip: body.p_ip, at: new Date().toISOString() })
    return jsonRes([{ id }])
  }
  if (path.startsWith('anmelde_fehlversuche') && method === 'DELETE') {
    const id = Number(filterWert(path, 'id'))
    fehlversuche = fehlversuche.filter((f) => f.id !== id)
    return new Response(null, { status: 204 })
  }
  if (path.startsWith('notifications') && method === 'POST') {
    glocke.push(...(body as Array<Record<string, unknown>>))
    return new Response(null, { status: 201 })
  }
  if (path.startsWith('push_subscriptions')) {
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return jsonRes(nurSpalten(abos.filter((a) => a.user_id === filterWert(path, 'user_id')), path))
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
  code?: string
  zettelUrl?: string
  gueltigBis?: string
}

/** `sitzung`: das Konto, als das gefragt wird — sonst wie ohne Anmeldung. */
async function call(
  body: unknown,
  opts: { ip?: string; env?: Record<string, string>; sitzung?: string } = {},
): Promise<{ status: number; body: Antwort }> {
  const handler = await loadFn(opts.env)
  const res = await handler(
    new Request('https://fn.test/anmelden', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `${opts.ip ?? '203.0.113.7'}, 10.0.0.1`,
        ...(opts.sitzung ? { Authorization: `Bearer sitzung:${opts.sitzung}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: (await res.json()) as Antwort }
}

beforeEach(async () => {
  links = [await linkZeile(P_ANNA, TOKEN_ANNA, CODE_ANNA)]
  members = [{ user_id: 'konto-bert', congregation_id: CONG, person_id: P_BERT, admin: false, zuteiler: true, email: '' }]
  konten = new Map([['konto-bert', 'bert-alt@example.org']])
  fehlversuche = []
  buchenKaputt = false
  glocke = []
  abos = []
  pushZuruecksetzen()
  angelegt = []
  verifyTyp = 'magiclink'
  verifyKaputt = false
  wettlauf = false
  kontoKaputt = false
  einmal = []
  abgemeldet = []
  abmeldenKaputt = false
  protokoll = []
  einmalLaeuftGleichAb = false
  einloesenKaputt = false
  einloesenSchranke = null
})

describe('anmelden: mit dem Link aus der Nachricht', () => {
  it('ein gültiger Link gibt eine Sitzung — und legt beim ersten Mal das Konto an', async () => {
    const r = await call({ aktion: 'link', token: TOKEN_ANNA })
    expect(r.status).toBe(200)
    expect(r.body.sitzung?.refresh_token).toBe('auffrischen')
    // Konto-Id = Person-Id, interne Adresse, bestätigt, ohne Kennwort.
    expect(angelegt).toEqual([{ id: P_ANNA, email: `${P_ANNA}@konten.invalid`, email_confirm: true }])
    expect(members.find((m) => m.person_id === P_ANNA)).toEqual({
      user_id: P_ANNA, congregation_id: CONG, person_id: P_ANNA, admin: true, zuteiler: false, email: '',
    })
  })

  it('die Rechte kommen aus der Vormerkung an der Person', async () => {
    links.push(await linkZeile(P_CARL, 'C'.repeat(43), 'M3ZE7KQR'))
    await call({ aktion: 'link', token: 'C'.repeat(43) })
    expect(members.find((m) => m.person_id === P_CARL)).toMatchObject({ admin: false, zuteiler: false })
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

  it('ein richtiger Code zählt nicht als Fehlversuch — weder beim Prüfen noch beim Anmelden', async () => {
    expect((await call({ aktion: 'code', code: CODE_ANNA, pruefen: true })).status).toBe(200)
    expect((await call({ aktion: 'code', code: CODE_ANNA })).body.sitzung).toBeDefined()
    expect(fehlversuche).toEqual([])
  })

  it('gleichzeitig geschickte falsche Codes kommen nicht an der Grenze vorbei', async () => {
    // Bis dahin las die Function erst und trug danach ein: 30 Versuche auf
    // einmal sahen alle eine leere Liste. Jetzt bucht jeder vorab.
    fehlversuche = Array.from({ length: 18 }, (_, i) => ({ id: i + 1, ip: '203.0.113.7', at: new Date().toISOString() }))
    const handler = await loadFn()
    const versuch = () =>
      handler(
        new Request('https://fn.test/anmelden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
          body: JSON.stringify({ aktion: 'code', code: 'ZZZZ9999' }),
        }),
      )
    const status = (await Promise.all(Array.from({ length: 6 }, versuch))).map((r) => r.status)
    expect(status.filter((s) => s === 404)).toHaveLength(2)
    expect(status.filter((s) => s === 429)).toHaveLength(4)
    expect(fehlversuche.filter((f) => f.ip === '203.0.113.7')).toHaveLength(20)
  })

  it('lässt sich der Versuch nicht buchen, meldet nichts an und rät nichts (503)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      buchenKaputt = true
      expect(await call({ aktion: 'code', code: CODE_ANNA })).toEqual({ status: 503, body: { error: 'server-error' } })
      expect(angelegt).toEqual([])
    } finally {
      err.mockRestore()
    }
  })

  it('nach 20 Fehlversuchen eines Absenders → 429, auch mit dem richtigen Code', async () => {
    fehlversuche = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, ip: '203.0.113.7', at: new Date().toISOString() }))
    const r = await call({ aktion: 'code', code: CODE_ANNA })
    expect(r.status).toBe(429)
    expect(r.body.sitzung).toBeUndefined()
    // Ein anderer Absender ist davon nicht betroffen.
    const anderer = await call({ aktion: 'code', code: CODE_ANNA }, { ip: '198.51.100.9' })
    expect(anderer.body.sitzung).toBeDefined()
  })

  it('nach 500 Fehlversuchen insgesamt → 429 für alle', async () => {
    fehlversuche = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, ip: `198.51.100.${i % 250}`, at: new Date().toISOString() }))
    const r = await call({ aktion: 'code', code: CODE_ANNA }, { ip: '192.0.2.1' })
    expect(r.status).toBe(429)
  })
})

/*
 * **Eine weitere Anmeldung erfährt das Konto**: Ein neuer Link
 * meldet am vorhandenen Konto an, und ausstellen kann ihn jeder Admin — ohne
 * Meldung könnte er sich unbemerkt als jedes Mitglied anmelden.
 */
describe('anmelden: eine weitere Anmeldung erfährt das Konto', () => {
  const BERT_LINK = 'B'.repeat(43)
  const VAPID = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }

  beforeEach(async () => {
    links.push(await linkZeile(P_BERT, BERT_LINK, 'Q2LF6JXD'))
  })

  it('eine Anmeldung an einem bestehenden Konto steht in seiner Glocke — kanonisch deutsch, übersetzt wird beim Anzeigen', async () => {
    expect((await call({ aktion: 'link', token: BERT_LINK })).body.sitzung).toBeDefined()
    expect(glocke).toEqual([
      { congregation_id: CONG, user_id: 'konto-bert', type: 'anmeldung', title: TITEL_NEUE_ANMELDUNG, body: TEXT_NEUE_ANMELDUNG },
    ])
  })

  it('… und geht per Push an seine Geräte, in der Sprache jedes Geräts', async () => {
    abos = [
      { id: 'a1', user_id: 'konto-bert', endpoint: 'https://push.test/de', p256dh: 'k', auth: 'a', lang: null },
      { id: 'a2', user_id: 'konto-bert', endpoint: 'https://push.test/en', p256dh: 'k', auth: 'a', lang: 'en' },
      { id: 'a3', user_id: 'konto-fremd', endpoint: 'https://push.test/fremd', p256dh: 'k', auth: 'a', lang: null },
    ]
    await call({ aktion: 'link', token: BERT_LINK }, { env: VAPID })
    const nachEndpunkt = new Map(gesendetePushes.map((p) => [p.endpoint, JSON.parse(p.payload) as { title: string; body: string; url: string }]))
    expect([...nachEndpunkt.keys()].sort()).toEqual(['https://push.test/de', 'https://push.test/en'])
    expect(nachEndpunkt.get('https://push.test/de')).toMatchObject({ title: TITEL_NEUE_ANMELDUNG, body: TEXT_NEUE_ANMELDUNG, url: 'https://app.test/#go=mitteilungen' })
    expect(nachEndpunkt.get('https://push.test/en')).toMatchObject({ title: anmeldeTexte('en').titel, body: anmeldeTexte('en').text })
  })

  it('auch mit dem Code vom Zettel', async () => {
    await call({ aktion: 'code', code: 'Q2LF6JXD' })
    expect(glocke.map((z) => z.user_id)).toEqual(['konto-bert'])
  })

  it('Gegenprobe: die allererste Anmeldung meldet nichts — das ist das erste Gerät', async () => {
    abos = [{ id: 'a1', user_id: P_ANNA, endpoint: 'https://push.test/anna', p256dh: 'k', auth: 'a', lang: null }]
    expect((await call({ aktion: 'link', token: TOKEN_ANNA }, { env: VAPID })).body.sitzung).toBeDefined()
    expect(glocke).toEqual([])
    expect(gesendetePushes).toEqual([])
    // Das zweite Gerät mit demselben Link dagegen schon.
    await call({ aktion: 'link', token: TOKEN_ANNA }, { env: VAPID })
    expect(glocke.map((z) => z.user_id)).toEqual([P_ANNA])
  })

  it('Gegenprobe: nur Prüfen meldet niemanden an und meldet deshalb auch nichts', async () => {
    await call({ aktion: 'code', code: 'Q2LF6JXD', pruefen: true })
    expect(glocke).toEqual([])
  })

  it('scheitert die Meldung, bleibt die Anmeldung gültig', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      abos = [{ id: 'a1', user_id: 'konto-bert', endpoint: 'https://push.test/de', p256dh: 'k', auth: 'a', lang: null }]
      const handler = await loadFn(VAPID)
      const echt = globalThis.fetch
      ;(globalThis as Record<string, unknown>).fetch = (input: unknown, init?: RequestInit) =>
        String(input).includes('push_subscriptions') ? Promise.reject(new Error('weg')) : echt(input as string, init)
      const res = await handler(
        new Request('https://fn.test/anmelden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'link', token: BERT_LINK }) }),
      )
      expect(res.status).toBe(200)
      expect(((await res.json()) as Antwort).sitzung).toBeDefined()
      expect(err).toHaveBeenCalledWith('anmelden: Meldung', 'weg')
    } finally {
      err.mockRestore()
    }
  })
})

/*
 * **Der eigene Zugang im Profil**: ein Einmal-Code fürs nächste Gerät
 * und „Zugang erneuern". Beides nur mit Sitzung, und die Person kommt aus ihr —
 * nie aus der Anfrage.
 */
describe('anmelden: ein Einmal-Code fürs nächste Gerät', () => {
  const BERT = { sitzung: 'konto-bert' }
  const holen = async () => (await call({ aktion: 'einmalcode' }, BERT)).body

  it('ohne Sitzung → 401, nichts angelegt', async () => {
    const r = await call({ aktion: 'einmalcode' })
    expect(r.status).toBe(401)
    expect(einmal).toEqual([])
  })

  it('ein Konto ohne Person (der Betreiber) → 403, nichts angelegt', async () => {
    members.push({ user_id: 'konto-betreiber', congregation_id: CONG, person_id: null, admin: true, zuteiler: false, email: '' })
    const r = await call({ aktion: 'einmalcode' }, { sitzung: 'konto-betreiber' })
    expect(r.status).toBe(403)
    expect(einmal).toEqual([])
  })

  it('gibt den Code, die Adresse für den QR-Code und die Frist — gespeichert nur die Prüfsumme', async () => {
    const vorher = Date.now()
    const r = await holen()
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{4} [A-HJ-NP-Z2-9]{4}$/)
    const code = r.code!.replace(' ', '')
    expect(r.zettelUrl).toBe(`https://app.test/#code=${code}`)
    const frist = new Date(r.gueltigBis!).getTime() - vorher
    expect(frist).toBeGreaterThan((EINMAL_MINUTEN - 1) * 60e3)
    expect(frist).toBeLessThanOrEqual(EINMAL_MINUTEN * 60e3 + 1000)
    expect(einmal).toEqual([{ person_id: P_BERT, congregation_id: CONG, code_hash: await pruefsumme(code), gueltig_bis: r.gueltigBis }])
  })

  it('die Person kommt aus der Sitzung — eine mitgeschickte fremde zählt nicht', async () => {
    await call({ aktion: 'einmalcode', personId: P_ANNA, person_id: P_ANNA }, BERT)
    expect(einmal.map((z) => z.person_id)).toEqual([P_BERT])
  })

  it('ein neuer ersetzt den noch offenen — der alte meldet niemanden mehr an', async () => {
    const alt = (await holen()).code!
    const neu = (await holen()).code!
    expect(einmal).toHaveLength(1)
    expect((await call({ aktion: 'code', code: alt })).status).toBe(404)
    expect((await call({ aktion: 'code', code: neu })).body.sitzung).toBeDefined()
  })

  it('meldet ein weiteres Gerät an — als das eigene Konto, und nur einmal', async () => {
    const code = (await holen()).code!
    const r = await call({ aktion: 'code', code })
    expect(r.body.sitzung?.access_token).toBe('zugang:h:bert-alt@example.org')
    expect(einmal).toEqual([])
    expect(angelegt).toEqual([])
    // Das zweite Mal ist er fort — und zählt als Fehlversuch wie jeder unbekannte.
    const zweites = await call({ aktion: 'code', code })
    expect(zweites.status).toBe(404)
    expect(fehlversuche).toHaveLength(1)
  })

  it('„prüfen" nennt Name und Versammlung und löst nicht ein', async () => {
    const code = (await holen()).code!
    const r = await call({ aktion: 'code', code, pruefen: true })
    expect(r.body).toEqual({ ok: true, name: 'Bert Brand', versammlung: 'Musterstadt' })
    expect(einmal).toHaveLength(1)
  })

  it('die Anmeldung steht in der Glocke des Kontos — wie bei jedem weiteren Gerät', async () => {
    await call({ aktion: 'code', code: (await holen()).code! })
    expect(glocke.map((z) => [z.user_id, z.type])).toEqual([['konto-bert', 'anmeldung']])
  })

  it('berührt den Link der Person nicht', async () => {
    links.push(await linkZeile(P_BERT, 'B'.repeat(43), 'Q2LF6JXD'))
    await call({ aktion: 'code', code: (await holen()).code! })
    expect(links.find((l) => l.person_id === P_BERT)?.benutzt_at).toBeNull()
    expect(protokoll.filter((z) => z.startsWith('PATCH anmelde_links'))).toEqual([])
  })

  it('abgelaufen → 410, keine Sitzung, kein Fehlversuch', async () => {
    const code = (await holen()).code!
    einmal[0]!.gueltig_bis = new Date(Date.now() - 1000).toISOString()
    const r = await call({ aktion: 'code', code })
    expect(r.status).toBe(410)
    expect(r.body.sitzung).toBeUndefined()
    expect(fehlversuche).toEqual([])
  })

  it('läuft er zwischen Lesen und Einlösen ab, meldet er niemanden an (410)', async () => {
    const code = (await holen()).code!
    einmal[0]!.gueltig_bis = new Date(Date.now() - 1000).toISOString()
    einmalLaeuftGleichAb = true
    const r = await call({ aktion: 'code', code })
    expect(r.status).toBe(410)
    expect(r.body.sitzung).toBeUndefined()
  })

  it('scheitert das Einlösen an der Datenbank → 500, nicht „abgelaufen" — und der Code gilt weiter', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const code = (await holen()).code!
      einloesenKaputt = true
      const r = await call({ aktion: 'code', code })
      expect(r.status).toBe(500)
      expect(r.body.sitzung).toBeUndefined()
      einloesenKaputt = false
      expect((await call({ aktion: 'code', code })).body.sitzung).toBeDefined()
    } finally {
      err.mockRestore()
    }
  })

  it('zwei Geräte zugleich mit demselben Code: nur eines kommt hinein', async () => {
    const code = (await holen()).code!
    // Eine Function, zwei Anfragen zugleich — die Schranke lässt beide den Code
    // lesen, bevor eine ihn einlöst.
    let oeffnen = () => {}
    const offen = new Promise<void>((los) => {
      oeffnen = los
    })
    einloesenSchranke = { noch: 2, offen, oeffnen }
    const handler = await loadFn()
    const anfrage = () =>
      handler(new Request('https://fn.test/anmelden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'code', code }) }))
    const [a, b] = await Promise.all([anfrage(), anfrage()])
    expect([a.status, b.status].sort()).toEqual([200, 410])
    expect(protokoll.filter((z) => z.startsWith('GET anmelde_einmalcodes'))).toHaveLength(2)
  })

  it('ein Code, den schon ein Zettel trägt, wird nicht vergeben — die Function zieht einen neuen', async () => {
    // Der Zufall liefert zuerst Annas Zettelcode, dann einen freien.
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const zuge = [CODE_ANNA, 'M3ZE7KQR'].map((c) => [...c].map((z) => ALPHABET.indexOf(z)))
    const zufall = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(feld: T): T => {
      ;(feld as unknown as Uint8Array).set(zuge.shift() ?? [])
      return feld
    })
    try {
      expect((await holen()).code).toBe('M3ZE 7KQR')
    } finally {
      zufall.mockRestore()
    }
  })
})

describe('anmelden: Zugang erneuern', () => {
  const BERT = { sitzung: 'konto-bert' }

  beforeEach(async () => {
    links.push(await linkZeile(P_BERT, 'B'.repeat(43), 'Q2LF6JXD'))
  })

  it('ohne Sitzung → 401: nichts gesperrt, niemand abgemeldet', async () => {
    expect((await call({ aktion: 'erneuern' })).status).toBe(401)
    expect(links.map((l) => l.person_id).sort()).toEqual([P_ANNA, P_BERT].sort())
    expect(abgemeldet).toEqual([])
  })

  it('sperrt Link und offenen Einmal-Code der eigenen Person und meldet die übrigen Geräte ab — mit der eigenen Sitzung', async () => {
    await call({ aktion: 'einmalcode' }, BERT)
    const r = await call({ aktion: 'erneuern' }, BERT)
    expect(r.body).toEqual({ ok: true })
    expect(links.map((l) => l.person_id)).toEqual([P_ANNA])
    expect(einmal).toEqual([])
    expect(abgemeldet).toEqual(['Bearer sitzung:konto-bert'])
  })

  it('danach meldet der alte Zettel niemanden mehr an', async () => {
    await call({ aktion: 'erneuern' }, BERT)
    expect((await call({ aktion: 'code', code: 'Q2LF6JXD' })).status).toBe(404)
    expect((await call({ aktion: 'link', token: 'B'.repeat(43) })).status).toBe(404)
  })

  it('erst sperren, dann abmelden — dazwischen meldet sich mit dem alten Code niemand mehr an', async () => {
    await call({ aktion: 'erneuern' }, BERT)
    const sperren = protokoll.findIndex((z) => z.startsWith('DELETE anmelde_links'))
    const abmelden = protokoll.findIndex((z) => z.startsWith('POST logout'))
    expect(sperren).toBeGreaterThanOrEqual(0)
    expect(abmelden).toBeGreaterThan(sperren)
  })

  it('scheitert das Abmelden, sagt es die Antwort (500) — ein zweiter Versuch meldet ab', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      abmeldenKaputt = true
      expect((await call({ aktion: 'erneuern' }, BERT)).status).toBe(500)
      abmeldenKaputt = false
      expect((await call({ aktion: 'erneuern' }, BERT)).body).toEqual({ ok: true })
      expect(abgemeldet).toEqual(['Bearer sitzung:konto-bert'])
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
