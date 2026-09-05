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
import { pushTexte } from '../send-reminders/texte.ts'
import { APP_LANGS } from '../../../src/i18n/langs'
import { makeTr } from '../../../src/i18n/translate'
import { jsonRes, schreibZugriff } from './attrappe.ts'

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

/**
 * Zusammenkunft, deren Plätze **Rollen** tragen — eigene Vorgabe, damit die
 * Beschriftungs-Tests die Positionen der gemeinsamen nicht verschieben.
 * Beide Plätze gehören Max: so bleibt die Planer-Meldung unberührt.
 */
function midMitRollen(): unknown {
  return {
    date: 'Dienstag, 8. September · 19:00 · Königreichssaal',
    sections: [
      {
        // Zusammengesetzter Block-Titel: Lied und Einleitende Worte gehören
        // niemandem. Wer hier steht, hat Vorsitz — das gehört in die Erinnerung.
        label: 'ERÖFFNUNG',
        items: [
          {
            title: 'Lied 27 · Gebet · Einleitende Worte',
            names: [{ name: 'Max Mustermann', rolle: 'Vorsitz' }],
          },
        ],
      },
      {
        label: 'UNSER LEBEN ALS CHRIST',
        items: [
          {
            title: 'Versammlungsbibelstudium',
            names: [{ name: 'Max Mustermann', rolle: 'Leiter' }],
          },
        ],
      },
    ],
    helpers: {},
  }
}

/**
 * Zusammenkunft mit einer **Schriftstelle** im Titel — so legt der Import die
 * Bibellesung an („Bibellesung · Jer 38:1-13"). Eigene Vorgabe, damit die
 * übrigen Prüfungen ihre Positionen behalten.
 */
function midMitSchriftstelle(): unknown {
  return {
    date: 'Dienstag, 8. September · 19:00 · Königreichssaal',
    sections: [
      {
        label: 'SCHÄTZE AUS GOTTES WORT',
        items: [
          { title: 'Bibellesung · Jer 38:1-13', names: [{ name: 'Max Mustermann' }] },
        ],
      },
    ],
    helpers: {},
  }
}

/* ---- Simulierte Umgebung ------------------------------------------------- */

interface Write {
  method: string
  path: string
  body: unknown
}

let writes: Write[]
/*
  Die Kennung steht als **Spalte** neben dem Blob, nicht darin (T66) — und in
  diesen Vorgaben absichtlich NUR dort. `data.start` gab es bis migration-017,
  bei alten Zeilen fehlt es; wer wieder danach greift, bekommt hier sofort eine
  Reihe roter Tests statt später einen stummen Ausfall des Versands.
*/
let weeks: { start: string; data: unknown }[]
let fsWeeks: { start: string; data: unknown }[]
let confirmations: { task_key: string; status: string }[]
let reminderLog: { user_id: string; kind: string }[]
let subs: typeof SUBS
/** Erinnerungs-Einstellungen der Versammlung — je Test überschreibbar. */
let reminders: { first: number; last: number; repeat: boolean }

const { writesTo } = schreibZugriff(() => writes)

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
      { id: CONG, meeting_times: 'Di 19:00 · So 10:00', settings: { reminders } },
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
  failed?: number
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
  weeks = [{ start: WEEK_START, data: { mid: midMeeting() } }]
  fsWeeks = []
  confirmations = []
  reminderLog = []
  subs = [...SUBS]
  reminders = { first: 7, last: 1, repeat: true }
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

/*
 * Was in der Erinnerung steht. Bis 091eb9f stand dort für jede Zuteilung mit
 * Rolle nur „ · ": ein Refactoring hatte `${title} · ${rolle}` zu ` · `
 * verkürzt, die Platzhalter fielen weg. Aufgefallen ist es niemandem, weil
 * kein einziger Platz dieser Vorgaben eine Rolle trug — geprüft wurde bis
 * dahin nur, wer NICHT erinnert wird, nie, was der Erinnerte liest.
 */
describe('send-reminders: was in der Erinnerung steht', () => {
  /** Lauf gegen die Woche mit Rollen; liefert Max' Erinnerungstext. */
  const textFuerMax = async (): Promise<string> => {
    weeks = [{ start: WEEK_START, data: { mid: midMitRollen() } }]
    const r = await run()
    return (r.preview ?? []).filter((p) => p.userId === U_MAX).map((p) => p.body).join(' | ')
  }

  it('nennt in ERÖFFNUNG die Rolle allein — ohne Lied und Einleitende Worte', async () => {
    const text = await textFuerMax()
    expect(text).toContain('Vorsitz')
    expect(text).not.toContain('Lied 27')
    expect(text).not.toContain('Einleitende Worte')
  })

  it('nennt sonst Titel und Rolle', async () => {
    expect(await textFuerMax()).toContain('Versammlungsbibelstudium · Leiter')
  })

  it('lässt keine Erinnerung ohne Aufgabenbezeichnung hinaus', async () => {
    weeks = [{ start: WEEK_START, data: { mid: midMitRollen() } }]
    for (const p of (await run()).preview ?? []) {
      // „<Termin>:  · " — ein Doppelpunkt, dem nur ein Trenner folgt, heißt:
      // der Empfänger erfährt nicht, wofür er erinnert wird.
      expect(p.body, p.body).not.toMatch(/:\s*·/)
    }
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
    // Vorn steht die Kennung der Woche (T66), nicht mehr ihre Position.
    confirmations = [
      { task_key: `${WEEK_START}|mid|part|0|1|0`, status: 'bestätigt' }, // Max, Schatzgraben
      { task_key: `${WEEK_START}|mid|helper|mikro|0`, status: 'bestätigt' }, // Max, Mikrofone
      { task_key: `${WEEK_START}|mid|part|0|3|0`, status: 'verhindert' }, // Nina
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

  /*
   * **„Letzte Erinnerung" heißt letzte.**
   *
   * Geprüft wurde nur `days < first`, und damit deckte die Wiederholung auch
   * die Tage **nach** der letzten Erinnerung ab: Bei `7 · 1 · wiederholen` ging
   * am Tag der Zusammenkunft selbst (Tag 0 < 7) noch eine hinaus. Wer „1 Tag
   * vorher" einstellt, hat sich ausdrücklich gegen den Tag selbst entschieden —
   * dafür gibt es den eigenen Wert `last = 0`. Die Einstellung blieb also
   * folgenlos, ohne dass irgendwo etwas fehlschlug: Die Erinnerung kam ja an.
   *
   * Der Tag der Zusammenkunft ist der Fall, an dem es zählt: Wer am Morgen eine
   * Erinnerung für den Abend bekommt, kann nichts mehr ändern — genau deshalb
   * kann man diesen Tag abwählen.
   */
  describe('die Wiederholung deckt die Tage dazwischen ab — nicht die danach', () => {
    // mid liegt am Di 8.9.: der 8.9. ist Tag 0, der 7.9. Tag 1 (= last).
    const AM_TAG = '2026-09-08T09:00:00Z'

    it('am Tag der Zusammenkunft schweigt sie (last = 1)', async () => {
      vi.setSystemTime(new Date(AM_TAG))
      expect((await run()).preview).toEqual([])
    })

    it('mit „am Tag" (last = 0) kommt sie sehr wohl — die Einstellung wirkt', async () => {
      // Gegenprobe, damit der Test nicht bloß eine stumme Function prüft.
      reminders = { first: 7, last: 0, repeat: true }
      vi.setSystemTime(new Date(AM_TAG))
      expect(previewFor(await run(), U_MAX)).toBeDefined()
    })

    it('dazwischen kommt sie weiterhin', async () => {
      vi.setSystemTime(new Date('2026-09-04T09:00:00Z')) // mid in 4 Tagen
      expect(previewFor(await run(), U_MAX)).toBeDefined()
    })

    it('vor der ersten Erinnerung bleibt es still', async () => {
      vi.setSystemTime(new Date('2026-08-31T09:00:00Z')) // mid in 8 Tagen (> first)
      expect((await run()).preview).toEqual([])
    })

    it('an den beiden Haupttagen selbst kommt sie immer', async () => {
      for (const tag of ['2026-09-01T09:00:00Z', '2026-09-07T09:00:00Z']) {
        vi.setSystemTime(new Date(tag)) // 7 bzw. 1 Tag vorher
        expect(previewFor(await run(), U_MAX), tag).toBeDefined()
      }
    })
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

/*
 * Ausgefallene Zusammenkunft (T30). Die Regel selbst (`istAusgefallenFuer`)
 * war geprüft, ihre **Anwendung** hier nicht: Die Mutationsprobe konnte
 * `if (istAusgefallenFuer(...)) continue` ersatzlos streichen, ohne dass ein
 * einziger Test rot wurde. Es ist derselbe Zuschnitt wie bei den vier
 * Platzsorten — die zentrale Regel steht, der Aufrufer ist vergessen.
 *
 * Wirkung im Betrieb: Erinnerungen an einen Abend, an dem niemand kommt, und
 * die Planer-Meldung „nicht erreichbar" gleich hinterher.
 */
describe('send-reminders: die ausgefallene Zusammenkunft erinnert nicht (T30)', () => {
  /** Woche mit beiden Zusammenkünften; `mid` fällt aus, `we` findet statt. */
  const midFaelltAus = (): void => {
    weeks = [
      {
        start: WEEK_START,
        data: {
          mid: midMeeting(),
          we: {
            date: 'Sonntag, 13. September · 10:00 · Königreichssaal',
            sections: [{ items: [{ title: 'Öffentlicher Vortrag', names: [{ name: 'Max Mustermann' }] }] }],
            helpers: {},
          },
          dev: { mid: { cancelled: true, reason: 'Kongress in Nürnberg' } },
        },
      },
    ]
  }

  it('kein Wort über die ausgefallene Zusammenkunft', async () => {
    midFaelltAus()
    const texte = ((await run()).preview ?? []).map((p) => p.body).join(' | ')
    expect(texte).not.toContain('Dienstag')
  })

  it('die andere Zusammenkunft derselben Woche bleibt unberührt', async () => {
    // Sonst hätte man den Ausfall auch dadurch „bestanden", dass die ganze
    // Woche stumm bleibt — und das wäre der umgekehrte Fehler.
    midFaelltAus()
    const texte = ((await run()).preview ?? []).map((p) => p.body).join(' | ')
    expect(texte).toContain('Sonntag')
  })

  it('niemand wird den Planern als „nicht erreichbar" gemeldet', async () => {
    // Nina (Konto ohne Abo) und Otto (ohne Konto) stehen nur in der
    // ausgefallenen Zusammenkunft. Ohne die Regel bekämen die Planer am
    // letzten Erinnerungstag eine Liste zum persönlichen Nachfassen — für
    // einen Abend, den es nicht gibt.
    midFaelltAus()
    const anPlaner = ((await run()).preview ?? []).filter((p) => p.userId === U_PLANER)
    expect(anPlaner).toEqual([])
  })

  it('Gegenprobe: ohne Ausfall wird für dieselbe Woche erinnert', async () => {
    midFaelltAus()
    const w = weeks[0].data as { dev?: unknown }
    delete w.dev
    const texte = ((await run()).preview ?? []).map((p) => p.body).join(' | ')
    expect(texte).toContain('Dienstag')
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
  // Wochen-Kennung wie weeks. Die Function las sie gar nicht: ein zugeteilter
  // Leiter bekam nie eine Erinnerung und konnte nichts bestätigen.
  const montag = (patch: Record<string, unknown> = {}) => ({
    start: WEEK_START,
    data: [
      { id: 'i1', grp: '', wd: 1, time: '14:00', place: 'Königreichssaal', leader: 'Max Mustermann', lpid: 'p-max', ...patch },
    ],
  })

  it('erinnert den Leiter am fälligen Tag — Ort im Termin, nicht in der Bezeichnung', async () => {
    // Woche beginnt Mo 07.09., wd 1 = Montag = heute → days 0 … also nicht
    // fällig (last = 1). Mittwoch (wd 3) liegt 2 Tage weg → repeat.
    //
    // **Der Ort gehört zum Termin.** Hier stand einmal
    // `Treffpunkt-Leiter · Nebenraum` bei ortlosem Termin, während der Client
    // in „Meine Aufgaben" und im Entzug den Ort in den Termin schrieb —
    // dieselbe Auskunft in zwei Reihenfolgen, je nachdem, woher die Nachricht
    // kam. Deshalb hier der **ganze** Satz und nicht nur ein `toContain`: Nur
    // so fällt eine wieder abweichende Reihenfolge auf.
    fsWeeks = [montag({ wd: 3, place: 'Nebenraum' })]
    const body = previewFor(await run(), U_MAX)?.body ?? ''
    // Die Zeile steht als letzte im Rumpf — als Ganzes geprüft, nicht als
    // Teilzeichenkette: Ein `toContain` überstünde ein angehängtes
    // „ · Nebenraum" hinter der Bezeichnung, und genau das war der Fehler.
    expect(body.endsWith('Mittwoch, 9. September · 14:00 · Nebenraum: Treffpunkt-Leiter')).toBe(
      true,
    )
    // Und der Ort steht **einmal** da, nicht zweimal.
    expect(body.split('Nebenraum')).toHaveLength(2)
  })

  it('ohne Ort bleibt der Termin sauber — kein „ · " am Ende', async () => {
    // Der Rand, an dem die zwei Fassungen einmal auseinanderliefen: Ein
    // Treffpunkt ohne Ort endete auf einem hängenden Trenner.
    fsWeeks = [montag({ wd: 3, place: '' })]
    const body = previewFor(await run(), U_MAX)?.body ?? ''
    expect(body).toContain('Mittwoch, 9. September · 14:00: Treffpunkt-Leiter')
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
      { start: WEEK_START, data: { mid: midMeeting() } },
      { start: '2026-09-14', data: {} },
    ]
    fsWeeks = [{ start: '2026-09-14', data: [{ id: 'i9', grp: '', wd: 1, time: '14:00', place: 'Saal', leader: 'Max Mustermann', lpid: 'p-max' }] }]
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

  it('auch mit alter Kennung im Blob greift die Bestätigung (T87)', async () => {
    // Der Client hebt beim Laden beides — Kennung und Schlüssel. Diese Zeile
    // liest aber die Datenbank, und die trägt die alte Kennung so lange, bis
    // ein Planer die Woche anfasst. Ohne den Griff nach der stabilen Kennung
    // erinnerte der Versand in der Zwischenzeit einen Leiter, der längst
    // bestätigt hat.
    fsWeeks = [montag({ wd: 3, id: '0|i1' })]
    confirmations = [{ task_key: `fs|${WEEK_START}|i1`, status: 'bestätigt' }]
    expect(previewFor(await run(), U_MAX)?.body ?? '').not.toContain('Treffpunkt-Leiter')
  })

  it('… und ohne Bestätigung wird weiter erinnert', async () => {
    fsWeeks = [montag({ wd: 3, id: '0|i1' })]
    expect(previewFor(await run(), U_MAX)?.body ?? '').toContain('Treffpunkt-Leiter')
  })

  /*
    Der Treffpunkt braucht die Zusammenkunft nicht mehr. Bis T66 holte sich der
    Versand das Datum über die gleiche **Positionsnummer** aus `weeks` — fehlte
    dort das `start`, fiel die Erinnerung aus, obwohl mit dem Treffpunkt selbst
    alles in Ordnung war. Jetzt trägt die Zeile ihre eigene Kennung; ohne die
    gibt es nichts zu terminieren, und nur das bleibt als Bedingung.
  */
  it('ohne eigene Kennung kein Termin und keine Erinnerung', async () => {
    // Die Spalte ist `not null` — hier steht sie trotzdem leer, weil die
    // Function rohes REST-JSON liest und daran nicht zerbrechen darf.
    fsWeeks = [{ ...montag({ wd: 3 }), start: '' }]
    expect(previewFor(await run(), U_MAX)?.body ?? '').not.toContain('Treffpunkt-Leiter')
  })

  it('eine Woche ohne Zusammenkunfts-Zeile hält den Treffpunkt nicht auf', async () => {
    weeks = []
    fsWeeks = [montag({ wd: 3 })]
    expect(previewFor(await run(), U_MAX)?.body ?? '').toContain('Treffpunkt-Leiter')
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

/**
 * **Was von einer Erinnerung in der Sprache des Lesers ankommt — und was nicht.**
 *
 * Eine Push-Nachricht ist fertiger Text, sobald sie das Gerät erreicht: Anders
 * als die Glocke in der App lässt sie sich beim Anzeigen nicht mehr übersetzen.
 * Der Service Worker zeigt `title` und `body` unverändert an
 * (`public/sw.js`).
 *
 * Der **Titel** wird deshalb serverseitig übersetzt, je Abo (`push_subscriptions.lang`
 * — die Sprache hängt am Gerät, nicht am Nutzer). `texte.test.ts` prüft die
 * Vollständigkeit dieser Tabelle. Was dort nicht steht: ob der Versand sie auch
 * wirklich benutzt, und was mit dem **Rumpf** geschieht.
 */
describe('send-reminders: die Sprache am Push-Abo', () => {
  const abo = (id: string, lang: string | null) => ({
    id, user_id: U_MAX, endpoint: `https://push.test/${id}`, p256dh: 'k', auth: 'a', lang,
  })

  it('der Titel steht in der Sprache des Geräts', async () => {
    subs = [abo('s-ko', 'ko')]
    const p = previewFor(await run(), U_MAX)
    expect(p?.title).toBe(pushTexte('ko').erinnerung)
    expect(p?.title).not.toBe(pushTexte('de').erinnerung)
  })

  it('zwei Geräte in zwei Sprachen bekommen zwei Nachrichten', async () => {
    // Die Sprache gehört zum Abo. Wer die App auf dem Handy koreanisch und am
    // Tablet englisch nutzt, soll auf jedem Gerät seine Sprache lesen — ein
    // Versand je Sprache, nicht einer für den Nutzer.
    subs = [abo('s-ko', 'ko'), abo('s-en', 'en'), abo('s-ko2', 'ko')]
    const titel = (await run()).preview?.filter((p) => p.userId === U_MAX).map((p) => p.title) ?? []
    expect(titel.sort()).toEqual([pushTexte('en').erinnerung, pushTexte('ko').erinnerung].sort())
  })

  it('ein Abo ohne Sprache bekommt Deutsch (Abos von vor migration-014)', async () => {
    subs = [abo('s-alt', null)]
    expect(previewFor(await run(), U_MAX)?.title).toBe(pushTexte('de').erinnerung)
  })

  /**
   * **Der Rumpf spricht dieselbe Sprache wie der Titel.**
   *
   * Bis zum 28.8.2026 tat er das nicht: Der Titel wurde je Abo übersetzt, der
   * Rumpf ging kanonisch deutsch hinaus — ein koreanischer Verkündiger las
   * einen koreanischen Titel über einer deutschen Zeile. Grund war eine
   * Trennung, keine Absicht: Der Fragment-Übersetzer lag im Client-Bündel, und
   * die Edge-Laufzeit kommt nicht an `src/` heran.
   *
   * Er liegt jetzt in `_shared/i18n/` — **dieselbe** Datei, die der Client
   * benutzt, keine zweite Abschrift (siehe den Kopf von `translate.ts`).
   */
  it('der Rumpf kommt in der Sprache des Geräts', async () => {
    subs = [abo('s-ko', 'ko')]
    const koreanisch = previewFor(await run(), U_MAX)
    subs = [abo('s-de', 'de')]
    const deutsch = previewFor(await run(), U_MAX)

    expect(koreanisch?.body, 'der Rumpf ist leer — dann prüft das hier nichts').toBeTruthy()
    expect(koreanisch?.title).not.toBe(deutsch?.title)
    expect(koreanisch?.body).not.toBe(deutsch?.body)
    // Kein deutscher Wochentag, kein deutscher Monat mehr.
    expect(koreanisch?.body).not.toMatch(/Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag/)
    expect(koreanisch?.body).not.toMatch(/Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember/)
    // Die deutsche Fassung dagegen sehr wohl — sonst prüfte die Zeile darüber
    // nur, dass irgendetwas anders ist.
    expect(deutsch?.body).toMatch(/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), /)
  })

  it('die Uhrzeit und die Struktur bleiben, wie sie sind', async () => {
    // Übersetzt werden Wochentag, Monat und die Rollen — nicht die Uhrzeit und
    // nicht die Trennzeichen. Sonst stünde in der Erinnerung eine andere Zeit
    // als in der App.
    subs = [abo('s-ko', 'ko')]
    const p = previewFor(await run(), U_MAX)
    expect(p?.body).toContain('19:00')
    expect(p?.body).toContain(': ')
  })

  it('jedes Stück des Rumpfs wird übersetzt, keins bleibt deutsch hängen', async () => {
    /*
      Der Rumpf entsteht aus zwei **Hälften** je Zeile: Termin und Bezeichnung.
      Zusammengefügt ließe er sich gar nicht übersetzen — der Zerleger trennt an
      „ · ", und „…19:00: Bibellesung" wäre dann ein einziges, unbekanntes
      Stück. Genau das prüft diese Zeile: Kommt jemand auf die Idee, erst zu
      verbinden und dann zu übersetzen, bleibt der mittlere Teil deutsch.
    */
    subs = [abo('s-ko', 'ko')]
    const p = previewFor(await run(), U_MAX)
    const teile = (p?.body ?? '').split(' · ')
    expect(teile.length, 'nur ein Stück — dann prüft das hier nichts').toBeGreaterThan(1)
    for (const teil of teile) {
      expect(teil, `„${teil}" blieb deutsch`).not.toMatch(
        /Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag/,
      )
    }
  })

  it('auch der Buchname einer Schriftstelle', async () => {
    /*
      Die Bibellesung heißt „Bibellesung · Jer 38:1-13" — eine Schriftstelle im
      Titel. Ihre Buchnamen liegen in einem eigenen Modul, das der Client erst
      bei Bedarf nachlädt; hier gibt es kein „bei Bedarf", die Erinnerung
      entsteht in einem Zug. Ohne das Nachladen bliebe ausgerechnet der
      Buchname als einziges Stück deutsch stehen.

      Kapitel und Verse bleiben unangetastet — ein verschobener Vers wäre
      schlimmer als ein deutscher Buchname.
    */
    weeks = [{ start: WEEK_START, data: { mid: midMitSchriftstelle() } }]
    subs = [abo('s-ko', 'ko')]
    const body = previewFor(await run(), U_MAX)?.body ?? ''
    expect(body, `Rumpf: ${body}`).not.toContain('Jer ')
    expect(body).toContain('38:1-13')
  })

  it('zwei Geräte in zwei Sprachen bekommen zwei verschiedene Rümpfe', async () => {
    subs = [abo('s-ko', 'ko'), abo('s-ar', 'ar')]
    const rumpfe = (await run()).preview?.filter((p) => p.userId === U_MAX).map((p) => p.body) ?? []
    expect(rumpfe).toHaveLength(2)
    expect(rumpfe[0]).not.toBe(rumpfe[1])
  })

  it('die Glocke bleibt kanonisch deutsch — sie wird beim Anzeigen übersetzt', async () => {
    /*
      Die andere Hälfte derselben Regel, und sie darf sich **nicht** ändern:
      Eine Mitteilung steht kanonisch deutsch in der Datenbank; welche Sprache
      der Leser eingestellt hat, entscheidet sich erst beim Anzeigen
      (`tu` in `NotificationsPanel`). Wer sie hier mitübersetzte, legte die
      Sprache eines *Geräts* auf einen Datensatz fest, den alle Geräte lesen.
    */
    subs = [abo('s-ko', 'ko')]
    await live()
    const notifs = writesTo('notifications')
      .filter((w) => w.method === 'POST')
      .flatMap((w) => (w.body as { body?: string }[]).map((n) => n.body ?? ''))
    expect(notifs.length).toBeGreaterThan(0)
    expect(notifs.join(' ')).toMatch(/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), /)
  })
})

/**
 * **Die Glocke wird beim Anzeigen übersetzt — also muss sie übersetzbar sein.**
 *
 * Anders als der Push steht eine Mitteilung kanonisch deutsch in der Datenbank
 * und geht erst in der App durch `tu` (`NotificationsPanel`). Das ist der
 * bessere Weg — er kommt ohne serverseitige Wörterbücher aus —, aber er hat
 * eine Bedingung: **Jedes Stück, das der Versand schreibt, muss im
 * Fragment-Wörterbuch stehen.** Sonst steht es in 33 Sprachen deutsch da, ohne
 * dass irgendwo ein Fehler entsteht.
 *
 * Genau so blieb „vor 3 Std." monatelang unübersetzt: Im Wörterbuch stand
 * ausgerechnet „vor 2 Std." — weil diese eine Zeichenkette in den Testdaten
 * vorkam. Die Wörterbücher waren aus den eigenen Vorgaben gefüllt worden statt
 * aus dem, was der Code erzeugt.
 *
 * Deshalb nimmt diese Prüfung **nicht** eine Liste erwarteter Texte, sondern
 * das, was die Function in diesem Lauf tatsächlich schreibt.
 */
describe('send-reminders: was in der Glocke steht, ist übersetzbar', () => {
  /** Alle Mitteilungs-Rümpfe eines scharfen Laufs. */
  async function rumpfe(): Promise<string[]> {
    await live()
    return writesTo('notifications')
      .filter((w) => w.method === 'POST')
      .flatMap((w) => (w.body as { body?: string }[]).map((n) => n.body ?? ''))
      .filter(Boolean)
  }

  /** Ein Atom, das kein Eigenname ist — Namen werden nie übersetzt. */
  const NAMEN = ['Max Mustermann', 'Nina Nolink', 'Otto Ohnekonto', 'Fremder Bruder']
  const uebersetzbar = (atom: string) =>
    atom !== '' && !NAMEN.includes(atom) && !/^\d{1,2}:\d{2}$/.test(atom)

  it('der Lauf schreibt überhaupt Mitteilungen', async () => {
    // Sonst liefe die Prüfung darunter über eine leere Liste.
    const alle = await rumpfe()
    expect(alle.length).toBeGreaterThan(0)
  })

  it.each(APP_LANGS.map((l) => l.code).filter((c) => c !== 'de'))(
    '%s: jedes Stück des Rumpfs wird übersetzt',
    async (code) => {
      const tr = makeTr(code)
      const deutsch: string[] = []
      let geprueft = 0
      for (const rumpf of await rumpfe()) {
        // Die Glocke zeigt `tu(notif.text)` — genau dieser Aufruf, mit
        // demselben Zerlegen an „ · " und „: ".
        for (const teil of rumpf.split(/ · |: /)) {
          const atom = teil.trim()
          if (!uebersetzbar(atom)) continue
          geprueft++
          if (tr(atom) === atom) deutsch.push(atom)
        }
      }
      // Der Titel des Programmpunkts steht in der Sprache der **Versammlung**
      // und ist keine Übersetzungslücke — hier ist er frei erfunden
      // („Schatzgraben") und bleibt naturgemäß stehen.
      const erwartetOffen = ['Schatzgraben', 'Bibellesung', 'Gespräch', 'Leerer Teil', 'Vortrag']
      const echteLuecken = deutsch.filter((a) => !erwartetOffen.includes(a))
      // Ohne diese Zahl bliebe unbemerkt, wenn das Zerlegen ins Leere liefe und
      // die Prüfung gar nichts ansieht.
      expect(geprueft, `${code}: nichts zu prüfen`).toBeGreaterThan(3)
      expect(echteLuecken, `${code}: ${[...new Set(echteLuecken)].join(', ')}`).toEqual([])
    },
  )

  it('die erwartet offenen Stücke sind wirklich nur die Programmtitel', async () => {
    /*
      Ausnahmelisten wachsen, wenn niemand hinsieht. Diese hier darf nur Titel
      enthalten, die die Vorgabe oben selbst erfindet — käme ein echter
      Fachbegriff hinein, wäre die Lücke damit stillgelegt statt behoben.
    */
    const titelDerVorgabe = ['Schatzgraben', 'Bibellesung', 'Gespräch', 'Leerer Teil', 'Vortrag']
    const roh = JSON.stringify(midMeeting())
    for (const titel of titelDerVorgabe) expect(roh, titel).toContain(titel)
  })
})

/**
 * **Ein Lauf, in dem nichts ankommt, darf nicht wie Ruhe aussehen.**
 *
 * `zustellen` zählt die abgewiesenen Zustellungen seit je; die Zahl wurde hier
 * als einziger der drei Functions weggeworfen. Ein Lauf ohne VAPID-Schlüssel
 * — der Betreiber schaltet `SEND_PUSH` ein und vergisst die Schlüssel —
 * antwortete deshalb mit `ok: true, pushes: 0`, also genau so wie ein Tag, an
 * dem nichts anstand. Die Glocken-Zeilen entstehen dabei trotzdem; sie sind
 * der Teil, der bleibt.
 */
describe('send-reminders: der Bericht sagt, was nicht ankam', () => {
  it('ohne VAPID-Schlüssel: keine Sendung, aber die Zahl steht da', async () => {
    const r = await run({ SEND_PUSH: 'true' }) // Schlüssel fehlen absichtlich
    expect(r.dryRun).toBe(false)
    expect(r.pushes).toBe(0)
    expect(r.failed, 'abgewiesene Zustellungen').toBeGreaterThan(0)
    // Und es ging wirklich nichts hinaus.
    expect(sentPush).toEqual([])
    // Die Glocke bleibt: sie hängt nicht am Push.
    expect(r.notifications).toBeGreaterThan(0)
  })

  it('mit Schlüsseln bleibt die Zahl auf null', async () => {
    // Gegenprobe: Ohne sie wäre der Fall oben auch dann grün, wenn `failed`
    // schlicht immer hochgezählt würde.
    const r = await live()
    expect(r.pushes).toBeGreaterThan(0)
    expect(r.failed).toBe(0)
  })
})
