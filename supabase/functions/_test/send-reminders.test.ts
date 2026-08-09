/*
 * Tests der Edge Function `send-reminders` — Schwerpunkt auf dem, was NICHT
 * passieren darf. Die Function läuft täglich per Cron mit Service-Role und
 * verschickt echte Push-Nachrichten an die ganze Versammlung; ein Fehler hier
 * bedeutet Fehlalarm bei vielen Menschen (oder ausbleibende Erinnerungen).
 *
 * Aufbau wie substitute.test.ts: die echte index.ts wird geladen (Deno als
 * Global, fetch simuliert die REST-Schicht, web-push per Stub). Die Uhr ist
 * fest gestellt, damit die Terminberechnung deterministisch ist.
 *
 * SEND_PUSH und CRON_SECRET liest die Function beim Laden, deshalb wird das
 * Modul je Szenario mit passender Umgebung neu importiert (loadFn).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { reset as resetPush, sent as sentPush } from './web-push.stub'

/* ---- Fixture ------------------------------------------------------------- */

const SUPABASE_URL = 'https://test.supabase.co'
const SECRET = 'geheim'
const CONG = 'cong-1'

// Woche beginnt Montag 07.09.2026 → mid (Di) = 08.09., we (So) = 13.09.
const WEEK_START = '2026-09-07'
// „Heute" = 07.09. → mid in 1 Tag (= last), we in 6 Tagen (= repeat).
const TODAY = '2026-09-07T09:00:00Z'

const U_MAX = 'user-max' // Konto + Push-Abo → erreichbar
const U_NINA = 'user-nina' // Konto, aber KEIN Push-Abo → nicht erreichbar
const U_PLANER = 'user-planer'
// „Otto Ohnekonto" hat gar kein Konto → ebenfalls nicht erreichbar

const MEMBERS = [
  { user_id: U_MAX, person_id: 'p-max', planner: false },
  { user_id: U_NINA, person_id: 'p-nina', planner: false },
  { user_id: U_PLANER, person_id: 'p-planer', planner: true },
]

const PERSONS = [
  { id: 'p-max', fn: 'Max', ln: 'Mustermann', dn: 'Max Mustermann' },
  { id: 'p-nina', fn: 'Nina', ln: 'Nolink', dn: 'Nina Nolink' },
  { id: 'p-planer', fn: 'Paula', ln: 'Planer', dn: 'Paula Planer' },
]

const SERVICES = [
  { key: 'mikro', name: 'Mikrofone', count: 2, groups: false },
  { key: 'reinigung', name: 'Reinigung', count: 1, groups: true }, // Gruppen-Rotation
]

const SUBS = [{ id: 's1', user_id: U_MAX, endpoint: 'https://push.test/max', p256dh: 'k', auth: 'a' }]

/** Zusammenkunft mit allen Sonderfällen, die NICHT erinnert werden dürfen. */
function midMeeting(): unknown {
  return {
    date: 'Dienstag, 8. September · 19:00 · Königreichssaal',
    sections: [
      {
        items: [
          { song: 'Lied 1', title: 'LIED 1' }, // Lied → kein Slot
          { title: 'Schatzgraben', names: [{ name: 'Max Mustermann', rolle: '' }] }, // si0 ii1 ni0
          { title: 'Vortrag', names: [{ name: 'Fremder Bruder', rolle: 'Gastredner' }] }, // extern
          { title: 'Bibellesung', names: [{ name: 'Nina Nolink' }] }, // si0 ii3 ni0
          { title: 'Gespräch', names: [{ name: 'Otto Ohnekonto' }] }, // si0 ii4 ni0
          { title: 'Leerer Teil', names: [{ name: '' }] }, // unbesetzt
        ],
      },
    ],
    // Slot-Objekte wie im echten Datenmodell ({ name: '' } = offen)
    helpers: {
      mikro: [{ name: 'Max Mustermann' }, { name: '' }],
      reinigung: [{ name: 'Gruppe 1' }],
    },
  }
}

/* ---- Simulierte Umgebung ------------------------------------------------- */

interface Write {
  method: string
  path: string
  body: unknown
}

let writes: Write[]
let weeks: { position: number; data: unknown }[]
let fsWeeks: { position: number; data: unknown }[]
let confirmations: { task_key: string; status: string }[]
let reminderLog: { user_id: string; kind: string }[]
let subs: typeof SUBS

const writesTo = (table: string) => writes.filter((w) => w.path.startsWith(table))

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)

  if (method !== 'GET') {
    writes.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(null, { status: 204 })
  }
  if (path.startsWith('congregations')) {
    return jsonRes([
      {
        id: CONG,
        meeting_times: 'Di 19:00 · So 10:00',
        settings: { reminders: { first: 7, last: 1, repeat: true } },
      },
    ])
  }
  if (path.startsWith('reminder_log')) return jsonRes(reminderLog)
  if (path.startsWith('weeks')) return jsonRes(weeks)
  if (path.startsWith('fs_weeks')) return jsonRes(fsWeeks)
  if (path.startsWith('confirmations')) return jsonRes(confirmations)
  if (path.startsWith('members')) return jsonRes(MEMBERS)
  if (path.startsWith('persons')) return jsonRes(PERSONS)
  if (path.startsWith('services')) return jsonRes(SERVICES)
  if (path.startsWith('push_subscriptions')) return jsonRes(subs)
  return jsonRes([])
}

interface Result {
  ok?: boolean
  dryRun?: boolean
  pushes?: number
  skipped?: number
  notifications?: number
  preview?: { userId: string; title: string; body: string; url?: string }[]
}

/** Modul mit gegebener Umgebung frisch laden (Env wird beim Import gelesen). */
async function loadFn(extraEnv: Record<string, string> = {}): Promise<(req: Request) => Promise<Response>> {
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    CRON_SECRET: SECRET,
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
  await import('../send-reminders/index.ts')
  return captured as (req: Request) => Promise<Response>
}

function request(auth: string | null = `Bearer ${SECRET}`): Request {
  return new Request('https://fn.test/send-reminders', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  })
}

/** Lauf mit gegebener Umgebung; liefert die geparste Antwort. */
async function run(extraEnv: Record<string, string> = {}): Promise<Result> {
  const handler = await loadFn(extraEnv)
  const res = await handler(request())
  return (await res.json()) as Result
}

const live = () => run({ SEND_PUSH: 'true', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })

/** Erinnerung an einen bestimmten Nutzer aus der Vorschau. */
const previewFor = (r: Result, userId: string) => r.preview?.find((p) => p.userId === userId)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(TODAY))
  writes = []
  weeks = [{ position: 0, data: { start: WEEK_START, mid: midMeeting() } }]
  fsWeeks = []
  confirmations = []
  reminderLog = []
  subs = [...SUBS]
  resetPush()
})

afterAll(() => {
  vi.useRealTimers()
})

/* ---- Tests --------------------------------------------------------------- */

describe('send-reminders: Zugang', () => {
  it('falsches Secret → 401, nichts gelesen oder geschrieben', async () => {
    const handler = await loadFn({ SEND_PUSH: 'true' })
    const res = await handler(request('Bearer falsch'))
    expect(res.status).toBe(401)
    expect(writes).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('fehlender Authorization-Header → 401', async () => {
    const handler = await loadFn({ SEND_PUSH: 'true' })
    expect((await handler(request(null))).status).toBe(401)
    expect(sentPush).toEqual([])
  })

  it('fehlendes CRON_SECRET → 500, nicht etwa freier Zugang', async () => {
    // Die Function ist mit --no-verify-jwt deployt, die Plattform prüft also
    // nichts. Eine `if (CRON_SECRET && …)`-Konstruktion liesse bei fehlender
    // Konfiguration jeden durch — und der Dry-Run gibt die Vorschau ALLER
    // Versammlungen zurück.
    const stumm = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = await loadFn({ SEND_PUSH: 'true', CRON_SECRET: '' })
    for (const auth of [null, 'Bearer irgendwas', `Bearer ${SECRET}`]) {
      const res = await handler(request(auth))
      expect(res.status).toBe(500)
    }
    expect(writes).toEqual([])
    expect(sentPush).toEqual([])
    stumm.mockRestore()
  })
})

describe('send-reminders: Dry-Run ist die sichere Voreinstellung', () => {
  it('ohne SEND_PUSH wird nichts gesendet und nichts geschrieben', async () => {
    const r = await run()
    expect(r.dryRun).toBe(true)
    expect(r.preview?.length).toBeGreaterThan(0) // Vorschau ja …
    expect(sentPush).toEqual([]) // … Versand nein
    expect(writes).toEqual([]) // keine Glocke, kein reminder_log, kein Löschen
  })

  it('SEND_PUSH nur „true" schaltet scharf — „1" reicht nicht', async () => {
    const r = await run({ SEND_PUSH: '1' })
    expect(r.dryRun).toBe(true)
    expect(writes).toEqual([])
  })
})

describe('send-reminders: wer NICHT erinnert wird', () => {
  it('Lieder, externe Redner und leere Slots erzeugen keine Erinnerung', async () => {
    const r = await run()
    const all = (r.preview ?? []).map((p) => p.body).join(' | ')
    expect(all).not.toMatch(/LIED/i)
    expect(all).not.toMatch(/Fremder Bruder|Vortrag/)
    expect(all).not.toMatch(/Leerer Teil/)
  })

  it('Gruppen-Dienste (Reinigung) lösen nichts aus', async () => {
    const r = await run()
    expect((r.preview ?? []).map((p) => p.body).join(' | ')).not.toMatch(/Reinigung/)
  })

  it('bestätigte und verhinderte Zuteilungen lösen nichts aus', async () => {
    confirmations = [
      { task_key: '0|mid|part|0|1|0', status: 'bestätigt' }, // Max, Schatzgraben
      { task_key: '0|mid|helper|mikro|0', status: 'bestätigt' }, // Max, Mikrofone
      { task_key: '0|mid|part|0|3|0', status: 'verhindert' }, // Nina
    ]
    const r = await run()
    expect(previewFor(r, U_MAX)).toBeUndefined()
    expect(previewFor(r, U_NINA)).toBeUndefined()
  })

  it('vergangene Zusammenkünfte lösen nichts aus', async () => {
    vi.setSystemTime(new Date('2026-09-20T09:00:00Z')) // Woche liegt zurück
    const r = await run()
    expect(r.preview).toEqual([])
  })

  it('Tage ohne Fälligkeit lösen nichts aus (repeat: false)', async () => {
    // first=7, last=1, repeat=false → an Tag 6 ist nichts fällig.
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z')) // mid in 6 Tagen
    const handler = await loadFn()
    // Versammlung ohne Wiederholung liefern
    const origFetch = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = async (i: unknown, init?: { method?: string }) => {
      if (String(i).includes('congregations')) {
        return jsonRes([
          {
            id: CONG,
            meeting_times: 'Di 19:00 · So 10:00',
            settings: { reminders: { first: 7, last: 1, repeat: false } },
          },
        ])
      }
      return fakeFetch(i, init)
    }
    const r = (await (await handler(request())).json()) as Result
    ;(globalThis as Record<string, unknown>).fetch = origFetch
    expect(r.preview).toEqual([])
  })

  it('heute schon erinnert → übersprungen, kein zweiter Versand', async () => {
    reminderLog = [
      { user_id: U_MAX, kind: 'self' },
      { user_id: U_NINA, kind: 'self' },
      { user_id: U_PLANER, kind: 'planner' },
    ]
    const r = await live()
    expect(r.pushes).toBe(0)
    expect(sentPush).toEqual([])
    expect((r.skipped ?? 0)).toBeGreaterThan(0)
  })
})

describe('send-reminders: Planer-Meldung nur für nicht Erreichbare', () => {
  it('nennt Konto-ohne-Abo und Person-ohne-Konto, nicht die Erreichbaren', async () => {
    const r = await run()
    const planer = previewFor(r, U_PLANER)
    expect(planer?.title).toBe('Unbestätigte Zuteilungen (nicht erreichbar)')
    expect(planer?.body).toContain('Nina Nolink') // Konto, aber kein Push-Abo
    expect(planer?.body).toContain('Otto Ohnekonto') // gar kein Konto
    expect(planer?.body).not.toContain('Max Mustermann') // erreichbar
    expect(planer?.body).not.toContain('[object Object]') // Slot-Objekt sauber gelesen
  })

  it('sind alle erreichbar, gibt es keine Planer-Meldung', async () => {
    subs = [
      ...SUBS,
      { id: 's2', user_id: U_NINA, endpoint: 'https://push.test/nina', p256dh: 'k', auth: 'a' },
    ]
    // „Otto Ohnekonto" aus dem Programm nehmen → niemand mehr unerreichbar
    const week = weeks[0].data as { mid: { sections: { items: { names?: { name: string }[] }[] }[] } }
    week.mid.sections[0].items[4].names = [{ name: '' }]
    const r = await run()
    expect(previewFor(r, U_PLANER)).toBeUndefined()
  })

  it('nur am letzten Erinnerungstag, nicht an Wiederholungstagen', async () => {
    vi.setSystemTime(new Date('2026-09-04T09:00:00Z')) // mid in 4 Tagen (repeat)
    const r = await run()
    expect(previewFor(r, U_PLANER)).toBeUndefined()
  })
})

describe('send-reminders: Hilfsdienste erinnern (Slot-Objekte)', () => {
  // Regressionsschutz: helpers sind { name, pid }-Objekte, wurden aber als
  // Strings gelesen — dadurch bekam niemand je eine Hilfsdienst-Erinnerung und
  // der Planer sah "[object Object]".
  it('besetzter Platz erzeugt eine persönliche Erinnerung', async () => {
    const r = await run()
    expect(previewFor(r, U_MAX)?.body).toContain('Mikrofone')
  })

  it('unbesetzter Platz erzeugt nichts', async () => {
    const all = (await run()).preview?.map((p) => p.body).join(' | ') ?? ''
    // Position 1 der Mikrofone ist { name: '' } → nur EIN Mikrofone-Eintrag
    expect(all.match(/Mikrofone/g)).toHaveLength(1)
  })

  it('versteht auch das Alt-Format (reine Namens-Strings in der DB)', async () => {
    const week = weeks[0].data as { mid: { helpers: Record<string, unknown[]> } }
    week.mid.helpers.mikro = ['Max Mustermann', '']
    const r = await run()
    expect(previewFor(r, U_MAX)?.body).toContain('Mikrofone')
    expect((r.preview ?? []).map((p) => p.body).join(' | ').match(/Mikrofone/g)).toHaveLength(1)
  })
})

describe('send-reminders: abweichender Termin (Gedächtnismahl)', () => {
  // Eine Gedächtnismahl-Woche trägt ihren echten Termin im date-Feld. Der
  // Versand rechnete stattdessen mit dem Rhythmus aus den Einstellungen und
  // erinnerte deshalb an einem anderen Tag als Anzeige und Zeitleiste.
  const aufSamstag = () => {
    const w = weeks[0].data as { mid: { date: string } }
    w.mid.date = 'Samstag, 12. September · 19:30 · Königreichssaal'
  }

  // Unterschieden wird an der Glocke: die gibt es nur an den Haupttagen
  // (first/last), dazwischen läuft nur die Wiederholung per Push. Damit lässt
  // sich zeigen, WELCHEN Tag der Versand für die Zusammenkunft hält.
  it('Haupttag ist der Tag vor dem eigenen Termin (Freitag)', async () => {
    aufSamstag()
    vi.setSystemTime(new Date('2026-09-11T09:00:00Z')) // last = 1 → Freitag
    expect((await live()).notifications).toBeGreaterThan(0)
  })

  it('der Tag vor dem regulären Dienstag ist es nicht mehr', async () => {
    aufSamstag()
    vi.setSystemTime(new Date('2026-09-07T09:00:00Z')) // wäre „Dienstag minus 1"
    expect((await live()).notifications).toBe(0) // nur Wiederholung
  })

  it('Gegenprobe ohne eigenen Termin: dann gilt wieder der Dienstag', async () => {
    vi.setSystemTime(new Date('2026-09-07T09:00:00Z'))
    expect((await live()).notifications).toBeGreaterThan(0)
  })
})

describe('send-reminders: Termin statt Wochenspanne im Text', () => {
  it('rechnet den Tag, wenn die Woche nur ihre Spanne trägt', async () => {
    // Importierte Wochen tragen im date-Feld die Überschrift der jw.org-Seite:
    // „7.–13. September" — weder Jahr noch Wochentag noch Uhrzeit. Genau das
    // stand vorher in der Erinnerung.
    const w = weeks[0].data as { mid: { date: string } }
    w.mid.date = '7.–13. September'
    const r = await run()
    expect(previewFor(r, U_MAX)?.body).toContain('Dienstag, 8. September · 19:00')
    expect(previewFor(r, U_MAX)?.body).not.toContain('7.–13.')
  })

  it('ein eigener Termin bleibt unangetastet', async () => {
    const w = weeks[0].data as { mid: { date: string } }
    w.mid.date = 'Samstag, 12. September · 19:30 · Königreichssaal'
    vi.setSystemTime(new Date('2026-09-11T09:00:00Z'))
    expect(previewFor(await run(), U_MAX)?.body).toContain('Samstag, 12. September · 19:30')
  })
})

describe('send-reminders: Scharfbetrieb als Gegenprobe', () => {
  it('sendet, schreibt Glocke und Versand-Tagebuch, Deep-Links gesetzt', async () => {
    const r = await live()
    expect(r.dryRun).toBe(false)
    expect(sentPush.length).toBeGreaterThan(0)
    // Nur Max hat ein Abo → nur an ihn geht ein echter Push.
    expect(sentPush.every((p) => p.endpoint === 'https://push.test/max')).toBe(true)
    expect(JSON.parse(sentPush[0].payload).url).toBe('https://app.test/#go=aufgaben')

    const notifs = writesTo('notifications').find((w) => w.method === 'POST')?.body as {
      user_id: string
      type: string
    }[]
    expect(notifs.some((n) => n.user_id === U_MAX && n.type === 'erinnerung')).toBe(true)
    expect(writesTo('reminder_log')[0]?.body).toBeDefined()
    // Wartung: alte Mitteilungen werden im selben Lauf gelöscht
    expect(writesTo('notifications').some((w) => w.method === 'DELETE')).toBe(true)
  })

  it('Glocke nur an Haupttagen — an Wiederholungstagen nur Push', async () => {
    vi.setSystemTime(new Date('2026-09-04T09:00:00Z')) // mid in 4 Tagen → repeat
    const r = await live()
    expect(r.pushes).toBeGreaterThan(0)
    expect(r.notifications).toBe(0)
  })
})

describe('send-reminders: Treffpunkte', () => {
  // Treffpunkte stehen in fs_weeks, einer zweiten Tabelle mit derselben
  // Positionsnummer wie weeks. Die Function las sie gar nicht: ein zugeteilter
  // Leiter bekam nie eine Erinnerung und konnte nichts bestätigen.
  const montag = (patch: Record<string, unknown> = {}) => ({
    position: 0,
    data: [
      { id: 'i1', grp: '', wd: 1, time: '14:00', place: 'Königreichssaal', leader: 'Max Mustermann', lpid: 'p-max', ...patch },
    ],
  })

  it('erinnert den Leiter am fälligen Tag', async () => {
    // Woche beginnt Mo 07.09., wd 1 = Montag = heute → days 0 … also nicht
    // fällig (last = 1). Mittwoch (wd 3) liegt 2 Tage weg → repeat.
    fsWeeks = [montag({ wd: 3, place: 'Nebenraum' })]
    const body = previewFor(await run(), U_MAX)?.body ?? ''
    expect(body).toContain('Treffpunkt-Leiter · Nebenraum')
    expect(body).toContain('Mittwoch, 9. September · 14:00')
  })

  it('rechnet mit dem Wochentag des Treffpunkts, nicht mit dem der Zusammenkunft', async () => {
    // Samstag (wd 6) ist 5 Tage weg → repeat; die Zusammenkunft am Dienstag
    // hätte einen ganz anderen Termin ergeben.
    fsWeeks = [montag({ wd: 6 })]
    expect(previewFor(await run(), U_MAX)?.body).toContain('Samstag, 12. September')
  })

  it('die Fälligkeit hängt am Tag des Treffpunkts, nicht am Zusammenkunftstag', async () => {
    // Zweite Woche (ab Mo 14.09.). Der Treffpunkt liegt auf dem Montag, also
    // genau 7 Tage weg = `first` → erste Erinnerung fällig. Rechnete die
    // Function stattdessen mit dem Dienstag der Zusammenkunft, wären es 8 Tage
    // und es käme gar nichts — der Leiter bekäme seine erste Erinnerung nie.
    weeks = [
      { position: 0, data: { start: WEEK_START, mid: midMeeting() } },
      { position: 1, data: { start: '2026-09-14' } },
    ]
    fsWeeks = [{ position: 1, data: [{ id: 'i9', grp: '', wd: 1, time: '14:00', place: 'Saal', leader: 'Max Mustermann', lpid: 'p-max' }] }]
    expect(previewFor(await run(), U_MAX)?.body).toContain('Montag, 14. September')
  })

  it('eine bestätigte Leitung löst nichts aus', async () => {
    fsWeeks = [montag({ wd: 3 })]
    // Seit T66 trägt der Schlüssel vorn die Kennung der Woche, nicht ihre
    // Position — `fs|2026-09-07|i1` statt `fs|0|i1`.
    confirmations = [{ task_key: `fs|${WEEK_START}|i1`, status: 'bestätigt' }]
    expect(previewFor(await run(), U_MAX)?.body ?? '').not.toContain('Treffpunkt-Leiter')
  })

  it('ein offener Treffpunkt löst nichts aus', async () => {
    fsWeeks = [montag({ wd: 3, leader: '', lpid: undefined })]
    expect(previewFor(await run(), U_MAX)?.body ?? '').not.toContain('Treffpunkt-Leiter')
  })

  it('ohne Startdatum der Woche kein Termin und keine Erinnerung', async () => {
    weeks = [{ position: 0, data: { mid: midMeeting() } }] // kein start
    fsWeeks = [montag({ wd: 3 })]
    expect(previewFor(await run(), U_MAX)?.body ?? '').not.toContain('Treffpunkt-Leiter')
  })

  it('fehlt die Tabelle ganz, laufen die Zusammenkünfte weiter', async () => {
    // Migration nicht eingespielt → REST antwortet mit Fehler. Der Lauf darf
    // deshalb nicht abbrechen, sonst bekäme die ganze Versammlung nichts.
    const echtesFetch = globalThis.fetch
    globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
      if (String(input).includes('fs_weeks')) return new Response('missing table', { status: 404 })
      return (echtesFetch as unknown as typeof fakeFetch)(input, init)
    }) as unknown as typeof globalThis.fetch
    try {
      const body = previewFor(await run(), U_MAX)?.body ?? ''
      expect(body).toContain('Schatzgraben') // Zusammenkunft erinnert weiter
    } finally {
      globalThis.fetch = echtesFetch
    }
  })

  it('ordnet über die Person-Id zu, nicht über den Namen', async () => {
    // Der Leiter heißt wie jemand anderes; die Id zeigt auf Max.
    fsWeeks = [montag({ wd: 3, leader: 'Nina Nolink', lpid: 'p-max' })]
    const body = previewFor(await run(), U_MAX)?.body ?? ''
    expect(body).toContain('Treffpunkt-Leiter')
    expect(previewFor(await run(), U_NINA)?.body ?? '').not.toContain('Treffpunkt-Leiter')
  })

  it('ohne Id (Altdaten) zählt weiter der Name', async () => {
    fsWeeks = [montag({ wd: 3, leader: 'Max Mustermann', lpid: undefined })]
    expect(previewFor(await run(), U_MAX)?.body).toContain('Treffpunkt-Leiter')
  })
})
