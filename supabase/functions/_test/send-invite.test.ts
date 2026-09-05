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
import { inviteTexte } from '../send-invite/texte.ts'
import { jsonRes } from './attrappe.ts'

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
/** Lässt die Personen-Abfrage scheitern — für den Fehlerpfad. */
let personenFehler: boolean

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
  if (path.startsWith('persons')) {
    // Der rohe PostgREST-Rumpf, wie ihn `restKlient.get` an die Meldung hängt.
    if (personenFehler) return new Response('{"message":"permission denied for table persons"}', { status: 403 })
    return jsonRes(PERSONS)
  }
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
  personenFehler = false
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

  it('ohne Sprachangabe bleibt es beim Deutschen', async () => {
    // Der Rückfall: Aufrufer von vor dieser Änderung schicken kein `lang` mit,
    // und eine Mail in einer Sprache, die niemand gewählt hat, wäre schlechter
    // als die bisherige.
    await call(einladung)
    const mail = mails[0]
    expect(mail?.subject).toBe(inviteTexte('de').subject)
    expect(mail?.text).toMatch(/^Hallo /)
  })
})

/**
 * **Die Einladung spricht die Sprache der Versammlung.**
 *
 * Sie ist die Stelle, an der fertiger Text das Haus verlässt und sich
 * nachträglich nicht mehr übersetzen lässt — und die heikelste davon: Für den
 * Empfänger ist sie die **erste** Berührung mit dieser App. Er hat noch kein
 * Konto und also auch keine eingestellte Sprache; maßgeblich ist die der
 * Versammlung, in der er zusammenkommt.
 *
 * Bis zum 28.8.2026 ging sie immer deutsch hinaus, während der mailto-Rückfall
 * im Client (ohne eigene Absender-Domain) längst übersetzt war: **dieselbe
 * Handlung, zwei Ergebnisse**, je nachdem ob `INVITE_FROM` gesetzt ist.
 *
 * Erfunden werden musste dafür nichts — die zwei Sätze stehen seit jeher im
 * Wörterbuch (`inviteMailSubject`, `inviteMailBody`); `texte.ts` ist eine
 * Abschrift daraus, und der letzte Test unten hält beide zusammen.
 */
describe('send-invite: in der Sprache der Versammlung', () => {
  const mitSprache = (lang: string) => ({ ...einladung, lang })

  it.each(['en', 'es', 'ko', 'ar'])('%s: Betreff und Rumpf kommen übersetzt an', async (lang) => {
    await call(mitSprache(lang))
    const mail = mails[0]
    expect(mail?.subject, lang).toBe(inviteTexte(lang).subject)
    expect(mail?.subject, `${lang} blieb deutsch`).not.toBe(inviteTexte('de').subject)
    expect(mail?.text, lang).not.toMatch(/^Hallo /)
  })

  it.each(['en', 'es', 'ko', 'ar'])('%s: Name, Link und Code stehen trotzdem drin', async (lang) => {
    // Der Rumpf ist eine Vorlage mit drei Platzhaltern. Eine Sprache, deren
    // Vorlage einen davon verschluckt, verschickt eine Einladung ohne Code —
    // und der Empfänger kommt nicht hinein.
    await call(mitSprache(lang))
    const text = mails[0]?.text ?? ''
    expect(text, `${lang}: Name fehlt`).toContain('Anna')
    expect(text, `${lang}: Link fehlt`).toContain('https://app.test/')
    expect(text, `${lang}: Code fehlt`).toContain('ABC-123')
    expect(text, `${lang}: Platzhalter blieb stehen`).not.toMatch(/\{\w+\}/)
  })

  it('jede App-Sprache hat ihren eigenen Text — kein stiller Rückfall auf Deutsch', async () => {
    const { APP_LANGS } = await import('../../../src/i18n/langs')
    const deutsch = inviteTexte('de')
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      expect(inviteTexte(code).subject, `${code}: Betreff`).not.toBe(deutsch.subject)
      expect(inviteTexte(code).body, `${code}: Rumpf`).not.toBe(deutsch.body)
    }
  })

  it('jede Vorlage trägt alle drei Platzhalter', async () => {
    // Gemessen an der Vorlage selbst, nicht am Versand: Eine Sprache, die nur
    // selten eingeladen wird, fiele sonst erst beim Empfänger auf.
    const { APP_LANGS } = await import('../../../src/i18n/langs')
    for (const { code } of APP_LANGS) {
      for (const platz of ['{name}', '{url}', '{code}']) {
        expect(inviteTexte(code).body, `${code}: ${platz}`).toContain(platz)
      }
    }
  })

  it('ein unbekannter Sprachcode fällt auf Deutsch zurück, statt leer zu bleiben', async () => {
    await call(mitSprache('gibt-es-nicht'))
    expect(mails[0]?.subject).toBe(inviteTexte('de').subject)
  })

  it('die Tabelle ist die Abschrift des Wörterbuchs — Zeichen für Zeichen', async () => {
    /*
      Zwei Fassungen desselben Textes: die des Clients (mailto) aus dem
      Wörterbuch, die des Servers aus `texte.ts`. Laufen sie auseinander,
      bekommt derselbe Empfänger je nach Konfiguration einen anderen Wortlaut —
      genau die Sorte stiller Doppelung, aus der hier schon B8 entstanden ist.
    */
    const { dict, loadOverlay } = await import('../../../src/i18n/ui')
    const { APP_LANGS } = await import('../../../src/i18n/langs')
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
    for (const { code } of APP_LANGS) {
      expect(inviteTexte(code).subject, `${code}: Betreff`).toBe(dict(code).inviteMailSubject)
      expect(inviteTexte(code).body, `${code}: Rumpf`).toBe(dict(code).inviteMailBody)
    }
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

describe('send-invite: was der Fehlertext preisgibt', () => {
  /*
    **Der rohe Fehler gehört in die Logs, nicht in die Antwort.**

    `restKlient.get` hängt bei einem Fehlschlag Pfad und PostgREST-Rumpf an die
    Meldung — beim Suchen nützlich, beim Angreifen genauso: Er verrät Tabellen,
    Spalten und die Bedingung, an der ein Versuch scheiterte. `substitute`,
    `send-plan` und `import-week` halten ihn deshalb längst zurück; diese
    Function war als einzige der vier noch bei der alten Fassung.

    Der Aufrufer verliert nichts: Er wertet nur aus, **ob** gesendet wurde —
    bei `ok: false` fällt der Client auf das Mail-Programm zurück (KontoCard).
  */
  it('nennt weder Tabelle noch Pfad noch Status', async () => {
    personenFehler = true
    const r = await call(einladung)
    expect(r.status).toBe(500)
    expect(r.body.error).toBe('server-error')
    const text = JSON.stringify(r.body)
    expect(text).not.toContain('persons')
    expect(text).not.toContain('permission denied')
    expect(text).not.toMatch(/\b40\d\b/)
  })

  it('und es geht dabei keine Mail hinaus', async () => {
    personenFehler = true
    await call(einladung)
    expect(mails).toEqual([])
  })
})
