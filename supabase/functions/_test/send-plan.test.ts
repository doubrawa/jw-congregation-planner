/*
 * Tests der Edge Function `send-plan` — „Plan senden" (T99).
 *
 * Sie ist die Stelle, an der die eingeteilte Person überhaupt von ihrer
 * Zuteilung erfährt. Bis dahin ging die Mitteilung „Zuteilung gesendet" an die
 * **Planer**, nicht an sie; sie erfuhr es frühestens über die zeitliche
 * Erinnerung, also `first` Tage vor der Zusammenkunft.
 *
 * Zwei Sorten von Fehlern kosten hier etwas, und beide sind still:
 *
 *  - **zu wenig**: Ein Platz wird übergangen, und jemand steht am Dienstag
 *    ahnungslos da. Nichts schlägt fehl — es geht nur eine Nachricht weniger
 *    hinaus.
 *  - **zu viel**: Wer schon Bescheid weiß, bekommt es noch einmal. Nach zwei
 *    Nachbesserungen hat die ganze Versammlung dieselbe Nachricht dreimal.
 *
 * Dazu die Sicherheitsgrenze: Die Function läuft mit der Service-Role und darf
 * deshalb nur einem **Planer** der eigenen Versammlung gehorchen.
 *
 * Aufbau wie substitute.test.ts: die echte index.ts wird geladen (`Deno` als
 * Global, `fetch` simuliert Auth und REST, web-push per Stub).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { reset as resetPush, sent as sentPush } from './web-push.stub'
import { TITEL_ENTZUG, TITEL_ZUTEILUNG } from '../send-plan/texte.ts'

/* ---- Fixture ------------------------------------------------------------- */

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'
const WOCHE = '2026-09-07' // Montag; mid = Di 8.9., we = So 13.9.
const SVC = 'mikro'

const U_PLANER = 'user-planer'
const U_ANNA = 'user-anna'
const U_BERND = 'user-bernd'
const U_FREMD = 'user-fremd' // Planer einer ANDEREN Versammlung
const U_MITGLIED = 'user-mitglied' // Mitglied ohne Planer-Recht

const MEMBERS = [
  { user_id: U_PLANER, person_id: 'p-planer', planner: true, congregation_id: CONG },
  { user_id: U_ANNA, person_id: 'p-anna', planner: false, congregation_id: CONG },
  { user_id: U_BERND, person_id: 'p-bernd', planner: false, congregation_id: CONG },
  { user_id: U_MITGLIED, person_id: 'p-mit', planner: false, congregation_id: CONG },
  { user_id: U_FREMD, person_id: 'p-fremd', planner: true, congregation_id: 'cong-2' },
]

const PERSONS = [
  { id: 'p-planer', fn: 'Paul', ln: 'Aner', dn: 'Paul Aner' },
  { id: 'p-anna', fn: 'Anna', ln: 'Berg', dn: 'Anna Berg' },
  { id: 'p-bernd', fn: 'Bernd', ln: 'Cohn', dn: 'Bernd Cohn' },
  { id: 'p-mit', fn: 'Mia', ln: 'Glied', dn: 'Mia Glied' },
  // Eingeteilt, aber ohne App-Konto — muss persönlich angesprochen werden.
  { id: 'p-ohne', fn: 'Karl', ln: 'Onto', dn: 'Karl Onto' },
]

const SERVICES = [{ key: SVC, name: 'Mikrofone', count: 1, groups: false }]
const CONGREGATIONS = [{ meeting_times: 'Di 19:00 · So 10:00' }]
const SUBS = [
  { id: 's1', user_id: U_ANNA, endpoint: 'https://push.test/anna', p256dh: 'k', auth: 'a', lang: 'de' },
]

/** Programmpunkt mit einem Platz. */
const punkt = (iid: string, titel: string, name: string, pid?: string) => ({
  iid,
  title: titel,
  names: [{ name, ...(pid ? { pid } : {}) }],
})

function frischeWoche(): unknown {
  return {
    start: WOCHE,
    mid: {
      date: 'Dienstag, 8. September',
      sections: [
        {
          label: 'SCHÄTZE AUS GOTTES WORT',
          items: [
            punkt('i1', 'Bibellesung', 'Anna Berg', 'p-anna'),
            punkt('i2', 'Schatz', 'Karl Onto', 'p-ohne'),
          ],
        },
      ],
      helpers: { [SVC]: [{ name: 'Bernd Cohn', pid: 'p-bernd' }] },
    },
    we: { date: 'Sonntag, 13. September', sections: [], helpers: {} },
  }
}

/** Aufgaben-Schlüssel der drei Plätze oben. */
const KEY_ANNA = `${WOCHE}|mid|part|i1|0`
const KEY_OHNE = `${WOCHE}|mid|part|i2|0`
const KEY_BERND = `${WOCHE}|mid|helper|${SVC}|0`

/* ---- Simulierte Umgebung ------------------------------------------------- */

interface Write {
  method: string
  path: string
  body: unknown
}

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let woche: unknown
let writes: Write[]
let confirmations: { task_key: string; status: string }[]
let log: { task_key: string; name: string }[]

const writesTo = (table: string) => writes.filter((w) => w.path.startsWith(table))
const zeilenIn = (table: string): Record<string, unknown>[] =>
  writesTo(table).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]) as Record<string, unknown>[])

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function filterWert(path: string, spalte: string): string | null {
  const m = new RegExp(`[?&]${spalte}=eq\\.([^&]*)`).exec(path)
  return m ? decodeURIComponent(m[1]) : null
}

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  // Ein rohes `#` schnitte hier ab, genau wie im echten URL-Parser — dadurch
  // fällt ein nicht kodierter Filterwert im Test überhaupt auf.
  const url = String(input).split('#')[0]
  const method = init?.method ?? 'GET'

  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }

  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  if (method !== 'GET') {
    writes.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(null, { status: 204 })
  }

  // Die Versammlung wird an jeder Tabelle geprüft: Fällt der Filter weg oder
  // steht ein fremder Wert darin, gibt es hier nichts.
  const cong = filterWert(path, 'congregation_id')
  const fremd = cong !== null && cong !== CONG

  if (path.startsWith('members')) {
    const wer = filterWert(path, 'user_id')
    if (wer !== null) return jsonRes(MEMBERS.filter((m) => m.user_id === wer))
    return jsonRes(fremd ? [] : MEMBERS)
  }
  if (path.startsWith('persons')) return jsonRes(fremd ? [] : PERSONS)
  if (path.startsWith('push_subscriptions')) return jsonRes(fremd ? [] : SUBS)
  if (path.startsWith('services')) return jsonRes(fremd ? [] : SERVICES)
  if (path.startsWith('congregations')) return jsonRes(fremd ? [] : CONGREGATIONS)
  if (path.startsWith('confirmations')) return jsonRes(fremd ? [] : confirmations)
  if (path.startsWith('assignment_log')) return jsonRes(fremd ? [] : log)
  if (path.startsWith('fs_weeks')) return jsonRes([])
  if (path.startsWith('weeks')) {
    const start = filterWert(path, 'start')
    return jsonRes(start === WOCHE && !fremd ? [{ start: WOCHE, data: woche }] : [])
  }
  return jsonRes([])
}

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
  }
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h
    },
  }
  g.fetch = fakeFetch
  await import('../send-plan/index.ts')
})

beforeEach(() => {
  authUser = U_PLANER
  woche = frischeWoche()
  writes = []
  confirmations = []
  log = []
  resetPush()
})

const ruf = async (body: unknown): Promise<Response> =>
  handler(
    new Request('https://test.functions/send-plan', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }),
  )

const plan = () => ruf({ action: 'plan', weekStart: WOCHE })

/* ---- Wer bekommt was ----------------------------------------------------- */

describe('Plan senden: jede eingeteilte Person erfährt von ihrer Aufgabe', () => {
  it('eine Nachricht je Person — mit Termin und Bezeichnung', async () => {
    const res = await plan()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { personen: number; aufgaben: number; ohneKonto: string[] }
    // Anna und Bernd haben Konten; Karl nicht.
    expect(body.personen).toBe(2)
    expect(body.aufgaben).toBe(3)
    expect(body.ohneKonto).toEqual(['Karl Onto'])

    const zeilen = zeilenIn('notifications')
    expect(zeilen).toHaveLength(2)
    expect(zeilen.every((z) => z.title === TITEL_ZUTEILUNG)).toBe(true)
    const anna = zeilen.find((z) => z.user_id === U_ANNA)!
    expect(String(anna.body)).toContain('Bibellesung')
    expect(String(anna.body)).toContain('8. September')
  })

  it('wer zwei Aufgaben hat, bekommt EINE Nachricht mit beiden', async () => {
    // Die eigentliche Zumutung wäre, je Platz eine zu schicken: Wer an einem
    // Wochenende dreimal dran ist, soll einmal hinsehen müssen.
    const w = frischeWoche() as { mid: { sections: { items: unknown[] }[] } }
    w.mid.sections[0]!.items.push(punkt('i3', 'Gebet', 'Anna Berg', 'p-anna'))
    woche = w
    await plan()
    const anna = zeilenIn('notifications').filter((z) => z.user_id === U_ANNA)
    expect(anna).toHaveLength(1)
    expect(String(anna[0]!.body)).toContain('Bibellesung')
    expect(String(anna[0]!.body)).toContain('Gebet')
  })

  it('bei genau einer Aufgabe trägt die Mitteilung den Schlüssel — dann gibt es den Bestätigen-Knopf', async () => {
    const zeilen = zeilenIn('notifications')
    await plan()
    const bernd = zeilenIn('notifications').find((z) => z.user_id === U_BERND)!
    expect(bernd.task_key).toBe(KEY_BERND)
    expect(zeilen).toHaveLength(0) // vor dem Lauf war nichts geschrieben
  })

  it('bei mehreren keinen — ein Knopf zeigte sonst auf eine willkürliche davon', async () => {
    const w = frischeWoche() as { mid: { sections: { items: unknown[] }[] } }
    w.mid.sections[0]!.items.push(punkt('i3', 'Gebet', 'Anna Berg', 'p-anna'))
    woche = w
    await plan()
    const anna = zeilenIn('notifications').find((z) => z.user_id === U_ANNA)!
    expect(anna.task_key).toBeUndefined()
  })

  it('und ein Push geht an die Geräte des Empfängers', async () => {
    await plan()
    expect(sentPush.map((p) => p.endpoint)).toEqual(['https://push.test/anna'])
  })
})

/* ---- Nicht zweimal ------------------------------------------------------- */

describe('Was schon gemeldet ist, bleibt liegen', () => {
  it('ein zweiter Druck ohne Änderung schickt nichts', async () => {
    log = [
      { task_key: KEY_ANNA, name: 'Anna Berg' },
      { task_key: KEY_OHNE, name: 'Karl Onto' },
      { task_key: KEY_BERND, name: 'Bernd Cohn' },
    ]
    const res = await plan()
    expect((await res.json()) as { personen: number }).toMatchObject({ personen: 0, aufgaben: 0 })
    expect(writesTo('notifications')).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('nach einer Nachbesserung nur die neue Person — nicht die ganze Woche noch einmal', async () => {
    log = [
      { task_key: KEY_ANNA, name: 'Anna Berg' },
      { task_key: KEY_OHNE, name: 'Karl Onto' },
      { task_key: KEY_BERND, name: 'Bernd Cohn' },
    ]
    // Der Planer teilt den Hilfsdienst um.
    const w = frischeWoche() as { mid: { helpers: Record<string, unknown[]> } }
    w.mid.helpers[SVC] = [{ name: 'Mia Glied', pid: 'p-mit' }]
    woche = w
    await plan()
    const zeilen = zeilenIn('notifications')
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]!.user_id).toBe(U_MITGLIED)
  })

  it('wer bestätigt hat, bekommt nichts mehr', async () => {
    confirmations = [{ task_key: KEY_ANNA, status: 'bestätigt' }]
    await plan()
    expect(zeilenIn('notifications').map((z) => z.user_id)).toEqual([U_BERND])
  })

  it('das Tagebuch bekommt jeden gemeldeten Platz — auch die ohne Konto', async () => {
    // Sonst zeigte der Knopf für sie auf ewig „noch nicht gesendet", obwohl
    // niemand sie erreichen kann.
    await plan()
    const eintraege = zeilenIn('assignment_log')
    expect(eintraege.map((e) => e.task_key).sort()).toEqual([KEY_BERND, KEY_ANNA, KEY_OHNE].sort())
    const karl = eintraege.find((e) => e.name === 'Karl Onto')!
    expect(karl.user_id).toBeNull()
    expect(karl.person_id).toBe('p-ohne')
  })
})

/* ---- Sicherheitsgrenze --------------------------------------------------- */

describe('Senden darf nur ein Planer der eigenen Versammlung', () => {
  it('ohne Anmeldung: 401 und kein Schreibvorgang', async () => {
    authUser = null
    expect((await plan()).status).toBe(401)
    expect(writes).toEqual([])
  })

  it('als einfaches Mitglied: 403 und kein Schreibvorgang', async () => {
    authUser = U_MITGLIED
    expect((await plan()).status).toBe(403)
    expect(writes).toEqual([])
  })

  it('ein Planer einer anderen Versammlung erreicht diese Woche nicht', async () => {
    // Die Versammlung stammt aus seiner Mitgliedszeile, nie aus dem Rumpf: Er
    // bekommt cong-2 und findet dort keine Woche.
    authUser = U_FREMD
    expect((await plan()).status).toBe(404)
    expect(writesTo('notifications')).toEqual([])
  })

  it('eine unbekannte Aktion wird abgewiesen', async () => {
    expect((await ruf({ action: 'irgendwas' })).status).toBe(400)
    expect(writes).toEqual([])
  })

  it('ein unbrauchbares Datum ebenso', async () => {
    expect((await ruf({ action: 'plan', weekStart: 'morgen' })).status).toBe(400)
    expect(writes).toEqual([])
  })
})

/* ---- Ausfall ------------------------------------------------------------- */

describe('Eine ausgefallene Zusammenkunft wird nicht gemeldet (T30)', () => {
  it('kein Platz der ausgefallenen Zusammenkunft geht hinaus', async () => {
    const w = frischeWoche() as Record<string, unknown>
    w.dev = { mid: { cancelled: true } }
    woche = w
    const res = await plan()
    expect((await res.json()) as { aufgaben: number }).toMatchObject({ aufgaben: 0 })
    expect(writesTo('notifications')).toEqual([])
  })
})

/* ---- Entzug -------------------------------------------------------------- */

describe('Eine zurückgezogene Zusage erreicht den Betroffenen sofort', () => {
  const entzug = () =>
    ruf({
      action: 'entzug',
      taskKey: KEY_ANNA,
      name: 'Anna Berg',
      label: 'Bibellesung',
      datum: 'Dienstag, 8. September · 19:00',
    })

  it('Mitteilung und Push an die betroffene Person', async () => {
    const res = await entzug()
    expect(res.status).toBe(200)
    const zeilen = zeilenIn('notifications')
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]).toMatchObject({ user_id: U_ANNA, title: TITEL_ENTZUG })
    expect(String(zeilen[0]!.body)).toContain('Bibellesung')
    expect(sentPush.map((p) => p.endpoint)).toEqual(['https://push.test/anna'])
  })

  it('der Tagebuch-Eintrag wird gelöscht — sonst bekäme sie den Platz stumm zurück', async () => {
    await entzug()
    const del = writes.find((w) => w.method === 'DELETE' && w.path.startsWith('assignment_log'))
    expect(del, 'kein DELETE auf assignment_log').toBeTruthy()
    expect(del!.path).toContain(encodeURIComponent(KEY_ANNA))
    expect(del!.path).toContain(encodeURIComponent('Anna Berg'))
  })

  it('ohne Konto: kein Fehler, aber der Name kommt zurück', async () => {
    const res = await ruf({
      action: 'entzug',
      taskKey: KEY_OHNE,
      name: 'Karl Onto',
      label: 'Schatz',
      datum: 'Dienstag, 8. September',
    })
    expect(res.status).toBe(200)
    expect((await res.json()) as { ohneKonto: string[] }).toMatchObject({ ohneKonto: ['Karl Onto'] })
    expect(writesTo('notifications')).toEqual([])
  })

  it('auch der Entzug ist Planern vorbehalten', async () => {
    authUser = U_MITGLIED
    expect((await entzug()).status).toBe(403)
    expect(writes).toEqual([])
  })
})
