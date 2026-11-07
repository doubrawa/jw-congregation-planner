import { describe, expect, it } from 'vitest'
import {
  functionsBefunde,
  katalogBefunde,
  rauchtest,
  rauchtestBefunde,
  RAUCHTEST_RUMPF,
  verlaufBefunde,
} from './ausrollen-pruefen.mjs'

/**
 * **Die Prüfungen nach dem Ausrollen** — ohne Netz: Was die CLI und die
 * Functions antworten, steht hier als Probe. Die Antworten des Rauchtests sind
 * die, die am 7.11.2026 live gemessen wurden.
 */

describe('verlaufBefunde', () => {
  const versionen = ['20261107120000', '20261107134500']

  it('nichts, wenn jede Migration eingespielt ist', () => {
    const liste = versionen.map((v) => ({ local: v, remote: v }))
    expect(verlaufBefunde(liste, versionen)).toEqual([])
  })

  it('nennt eine, die fehlt, und eine, die nur das Projekt kennt', () => {
    const liste = [
      { local: '20261107120000', remote: '20261107120000' },
      { local: '20261107134500', remote: '' },
      { local: '', remote: '20261101000000' },
    ]
    expect(verlaufBefunde(liste, versionen)).toEqual([
      '20261107134500 ist nicht eingespielt',
      '20261101000000 steht im Projekt, aber nicht im Repo',
    ])
  })
})

describe('katalogBefunde', () => {
  it('schreibt jede Abweichung als Zeile, die Produktion zuerst', () => {
    expect(
      katalogBefunde([
        { abschnitt: 'spalten', nurLinks: ['persons.veraltet'], nurRechts: [], anders: [{ name: 'persons.fn', feld: 'attacl', links: 'x', rechts: null }] },
      ]),
    ).toEqual(['spalten: nur in der Produktion: persons.veraltet', 'spalten: persons.fn.attacl: Produktion "x" ≠ Migrationen null'])
  })
})

describe('functionsBefunde', () => {
  const soll = [
    { name: 'send-plan', verifyJwt: true },
    { name: 'send-reminders', verifyJwt: false },
  ]
  const liste = [
    { slug: 'send-plan', status: 'ACTIVE', verify_jwt: true, updated_at: 2000 },
    { slug: 'send-reminders', status: 'ACTIVE', verify_jwt: false, updated_at: 2000 },
  ]

  it('nichts, wenn jede aktiv ist und verify_jwt stimmt', () => {
    expect(functionsBefunde(liste, soll)).toEqual([])
    expect(functionsBefunde(liste, soll, 1000)).toEqual([])
  })

  it('nennt eine fehlende, eine stillgelegte, ein vertauschtes verify_jwt und eine fremde', () => {
    const kaputt = [
      { slug: 'send-reminders', status: 'INACTIVE', verify_jwt: true, updated_at: 2000 },
      { slug: 'alt', status: 'ACTIVE', verify_jwt: true, updated_at: 2000 },
    ]
    expect(functionsBefunde(kaputt, soll)).toEqual([
      'send-plan fehlt im Projekt',
      'send-reminders: Status INACTIVE',
      'send-reminders: verify_jwt true, config.toml sagt false',
      'alt läuft im Projekt, steht aber nicht in config.toml',
    ])
  })

  it('nach einem Ausrollen: eine, die älter ist als sein Beginn, blieb stehen', () => {
    expect(functionsBefunde(liste, soll, 3000)).toHaveLength(2)
    expect(functionsBefunde(liste, soll, 3000)[0]).toMatch(/^send-plan: Stand vom .* älter als dieses Ausrollen$/)
  })
})

/** Die Antworten vom 7.11.2026, so wie sie live kamen. */
const HANDLER_CORS = 'authorization, x-client-info, apikey, content-type'
const GEMESSEN = {
  mitglied: { options: { status: 200, text: 'ok', cors: HANDLER_CORS }, post: { status: 401, text: '{"error":"unauthorized"}' } },
  anmelden: { options: { status: 200, text: 'ok', cors: HANDLER_CORS }, post: { status: 400, text: '{"error":"bad-request"}' } },
  cron: { options: { status: 401, text: 'Unauthorized', cors: null }, post: { status: 401, text: 'Unauthorized' } },
}

describe('rauchtestBefunde', () => {
  it('die gemessenen Antworten bestehen', () => {
    expect(rauchtestBefunde({ name: 'send-plan', verifyJwt: true }, GEMESSEN.mitglied)).toEqual([])
    expect(rauchtestBefunde({ name: 'anmelden', verifyJwt: true }, GEMESSEN.anmelden)).toEqual([])
    expect(rauchtestBefunde({ name: 'send-reminders', verifyJwt: false }, GEMESSEN.cron)).toEqual([])
  })

  it('eine Antwort der Plattform statt des Handlers fällt auf — das Modul kam nicht hoch', () => {
    const plattform = { ...GEMESSEN.mitglied, options: { status: 200, text: 'ok', cors: 'authorization, x-client-info, apikey' } }
    expect(rauchtestBefunde({ name: 'send-plan', verifyJwt: true }, plattform)).toEqual([
      'send-plan: OPTIONS ohne die CORS-Kopfzeile des Handlers — das Modul kam nicht hoch',
    ])
  })

  it('ein Startfehler fällt auf', () => {
    const boot = { options: { status: 503, text: 'BOOT_ERROR', cors: null }, post: { status: 503, text: '{"code":"BOOT_ERROR"}' } }
    expect(rauchtestBefunde({ name: 'trolley', verifyJwt: true }, boot)).toHaveLength(2)
  })

  it('eine Function, die den öffentlichen Schlüssel durchlässt, fällt auf', () => {
    // So stand es bis zum 2.10.2026 bei `import-week`: 200 mit einer ganzen Woche.
    const offen = { ...GEMESSEN.mitglied, post: { status: 200, text: '{"week":{}}' } }
    expect(rauchtestBefunde({ name: 'import-week', verifyJwt: true }, offen)).toEqual([
      'import-week: POST 200 "{\\"week\\":{}}" statt 401 {"error":"unauthorized"}',
    ])
  })
})

describe('rauchtest', () => {
  it('schickt OPTIONS und einen POST mit unbekannter Aktion — den Schlüssel nur in den Kopfzeilen', async () => {
    const anfragen: { adresse: string; methode: string; kopf: Record<string, string>; rumpf?: string }[] = []
    const holen = async (adresse: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      anfragen.push({ adresse: String(adresse), methode: String(init?.method), kopf: init?.headers as Record<string, string>, rumpf: init?.body as string | undefined })
      const g = GEMESSEN.mitglied
      return init?.method === 'OPTIONS'
        ? new Response(g.options.text, { status: g.options.status, headers: { 'access-control-allow-headers': HANDLER_CORS } })
        : new Response(g.post.text, { status: g.post.status })
    }
    const befunde = await rauchtest('https://probe.invalid/', 'sb_publishable_probe', [{ name: 'send-plan', verifyJwt: true }], holen)
    expect(befunde).toEqual([])
    expect(anfragen.map((a) => `${a.methode} ${a.adresse}`)).toEqual([
      'OPTIONS https://probe.invalid/functions/v1/send-plan',
      'POST https://probe.invalid/functions/v1/send-plan',
    ])
    expect(anfragen[1]!.kopf.Authorization).toBe('Bearer sb_publishable_probe')
    expect(JSON.parse(anfragen[1]!.rumpf!)).toEqual(RAUCHTEST_RUMPF)
  })
})
