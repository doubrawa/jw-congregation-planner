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
import {
  filterWert,
  jsonRes,
  likeMuster,
  ohneFragment,
  passtAufMuster,
  schreibZugriff,
} from './attrappe.ts'

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
const U_TIM_A = 'user-tim-a' // zwei Konten, ein Anzeigename
const U_TIM_B = 'user-tim-b'

const MEMBERS = [
  { user_id: U_PLANER, person_id: 'p-planer', planner: true, congregation_id: CONG },
  { user_id: U_ANNA, person_id: 'p-anna', planner: false, congregation_id: CONG },
  { user_id: U_BERND, person_id: 'p-bernd', planner: false, congregation_id: CONG },
  { user_id: U_MITGLIED, person_id: 'p-mit', planner: false, congregation_id: CONG },
  { user_id: U_FREMD, person_id: 'p-fremd', planner: true, congregation_id: 'cong-2' },
  { user_id: U_TIM_A, person_id: 'p-tim-a', planner: false, congregation_id: CONG },
  // ZULETZT: Über den Namen gewinnt der letzte Eintrag. Am Namen allein landete
  // die Nachricht für Tim A also immer hier bei Tim B.
  { user_id: U_TIM_B, person_id: 'p-tim-b', planner: false, congregation_id: CONG },
]

const PERSONS = [
  { id: 'p-planer', fn: 'Paul', ln: 'Aner', dn: 'Paul Aner' },
  { id: 'p-anna', fn: 'Anna', ln: 'Berg', dn: 'Anna Berg' },
  { id: 'p-bernd', fn: 'Bernd', ln: 'Cohn', dn: 'Bernd Cohn' },
  { id: 'p-mit', fn: 'Mia', ln: 'Glied', dn: 'Mia Glied' },
  // Eingeteilt, aber ohne App-Konto — muss persönlich angesprochen werden.
  { id: 'p-ohne', fn: 'Karl', ln: 'Onto', dn: 'Karl Onto' },
  // Zwei Brüder mit demselben Anzeigenamen. Die App warnt den Planer davor,
  // verbietet es aber nicht.
  { id: 'p-tim-a', fn: 'Tim', ln: 'Zwill', dn: 'Tim Zwill' },
  { id: 'p-tim-b', fn: 'Tim', ln: 'Zwill', dn: 'Tim Zwill' },
  // Der dritte trägt denselben Namen und hat **kein** Konto. An ihm hängt die
  // Frage, was gilt, wenn die Id zu niemandem führt.
  { id: 'p-tim-c', fn: 'Tim', ln: 'Zwill', dn: 'Tim Zwill' },
]

const SERVICES = [{ key: SVC, name: 'Mikrofone', count: 1, groups: false }]
const CONGREGATIONS = [{ meeting_times: 'Di 19:00 · So 10:00' }]
const SUBS = [
  { id: 's1', user_id: U_ANNA, endpoint: 'https://push.test/anna', p256dh: 'k', auth: 'a', lang: 'de' },
  { id: 's2', user_id: U_TIM_A, endpoint: 'https://push.test/tim-a', p256dh: 'k', auth: 'a', lang: 'de' },
  { id: 's3', user_id: U_TIM_B, endpoint: 'https://push.test/tim-b', p256dh: 'k', auth: 'a', lang: 'de' },
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
  headers: Record<string, string>
}

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let woche: unknown
let writes: Write[]
let confirmations: { task_key: string; status: string }[]
let log: { task_key: string; name: string }[]
/** Treffpunkte der Woche (`fs_weeks`) — zweite Datenquelle, eigener Schlüsselraum. */
let fsWoche: unknown[]
/** Die Lesepfade auf `confirmations`/`assignment_log` eines Laufs. */
let gelesen: string[]

const { writesTo, zeilenIn } = schreibZugriff(() => writes)

const fakeFetch = async (
  input: unknown,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> => {
  const url = ohneFragment(input)
  const method = init?.method ?? 'GET'

  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }

  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  if (method !== 'GET') {
    writes.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      // Die Kopfzeilen gehören dazu: In `Prefer` steht, ob ein Stapel bei einer
      // Dublette **ganz** scheitert oder nur sie überspringt.
      headers: init?.headers ?? {},
    })
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
  /*
   * **Die Wochen-Filter werden ausgewertet, nicht überlesen.**
   *
   * Beide Tabellen wachsen ohne Grenze und wurden hier je Knopfdruck ganz
   * gelesen. Gäbe die Attrappe weiterhin alles zurück, sähe „ganze Tabelle"
   * genauso aus wie „eine Woche" — der Filter wäre eine Zusicherung ohne
   * Deckung. Ohne Filter im Pfad bleibt es beim ganzen Bestand: So sieht der
   * Test denselben Unterschied wie der Server.
   */
  const zurWoche = <T extends { task_key: string }>(rows: T[]): T[] => {
    const muster = likeMuster(path, 'task_key')
    if (muster.length === 0) return rows
    return rows.filter((r) => muster.some((m) => passtAufMuster(r.task_key, m)))
  }
  if (path.startsWith('confirmations')) {
    gelesen.push(path)
    return jsonRes(fremd ? [] : zurWoche(confirmations))
  }
  if (path.startsWith('assignment_log')) {
    gelesen.push(path)
    return jsonRes(fremd ? [] : zurWoche(log))
  }
  if (path.startsWith('fs_weeks')) {
    const start = filterWert(path, 'start')
    return jsonRes(start === WOCHE && !fremd ? [{ start: WOCHE, data: fsWoche }] : [])
  }
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
  fsWoche = []
  gelesen = []
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
    await plan()
    const bernd = zeilenIn('notifications').find((z) => z.user_id === U_BERND)!
    expect(bernd.task_key).toBe(KEY_BERND)
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

/* ---- Wochenfilter -------------------------------------------------------- */

/**
 * **Ein Druck holt eine Woche, nicht das ganze Archiv.**
 *
 * `confirmations` und `assignment_log` wurden hier ganz gelesen. Beide wachsen
 * mit jeder geplanten Woche (gut 35 Plätze, und das Tagebuch wird nie
 * aufgeräumt) — nach ein paar Jahren holte ein Knopfdruck Zehntausende Zeilen,
 * um in dreißig davon nachzusehen.
 *
 * Der Filter darf dabei nach **beiden** Seiten nicht danebenliegen: Zu weit,
 * und das Wachstum bleibt; zu eng, und eine Zeile dieser Woche fehlt — dann
 * gilt ein längst bestätigter Platz als unbestätigt und die Nachricht geht ein
 * zweites Mal hinaus. Die Treffpunkte hängen daran besonders, weil ihr
 * Schlüssel als einziger **nicht** mit dem Montag beginnt (`fs|<Montag>|…`).
 */
describe('Plan senden liest nur die Woche, die es sendet', () => {
  const ANDERE = '2026-09-14' // die Woche danach

  it('beide Tabellen werden nur mit Wochenfilter gelesen — keine Voll-Lesung', async () => {
    await plan()
    for (const tabelle of ['confirmations', 'assignment_log']) {
      const pfade = gelesen.filter((p) => p.startsWith(tabelle))
      expect(pfade.length, `${tabelle} gar nicht gelesen`).toBeGreaterThan(0)
      // Keine einzige Abfrage ohne Filter — eine genügte, um wieder alles zu holen.
      for (const pfad of pfade) {
        expect(likeMuster(pfad, 'task_key'), `ohne Wochenfilter: ${pfad}`).toHaveLength(1)
      }
      // Und zusammen decken sie **beide** Schlüsselformen ab (T66): der Montag
      // vorn für die Zusammenkünfte, `fs|` davor für die Treffpunkte.
      const muster = pfade.flatMap((p) => likeMuster(p, 'task_key')).sort()
      expect(muster, tabelle).toEqual([`${WOCHE}|*`, `fs|${WOCHE}|*`].sort())
    }
  })

  it('eine Bestätigung der Nachbarwoche hält niemanden zurück', async () => {
    // Derselbe Platz, andere Woche: Wer nächste Woche zugesagt hat, hat für
    // diese noch nichts gehört.
    confirmations = [{ task_key: `${ANDERE}|mid|part|i1|0`, status: 'bestätigt' }]
    const res = (await (await plan()).json()) as { aufgaben: number }
    expect(res.aufgaben).toBe(3)
  })

  it('aber die Bestätigung DIESER Woche hält ihn zurück', async () => {
    // Die Gegenprobe: Ein Filter, der zu viel wegschneidet, bestünde die
    // Prüfung darüber und fiele hier.
    confirmations = [{ task_key: KEY_ANNA, status: 'bestätigt' }]
    const res = (await (await plan()).json()) as { aufgaben: number }
    expect(res.aufgaben).toBe(2)
  })

  it('ein Treffpunkt-Eintrag im Tagebuch wird gefunden — trotz `fs|`-Schlüssel', async () => {
    /*
     * Der Schlüssel eines Treffpunkts beginnt mit `fs|`, nicht mit dem Montag.
     * Ein Filter, der nur `<Montag>|*` kennt, findet ihn nie — der Leiter
     * bekäme bei jedem Druck erneut dieselbe Nachricht, und das dauerhaft.
     */
    fsWoche = [
      { id: 'r1', grp: '', wd: 6, time: '09:30', place: 'Bahnhof', leader: 'Bernd Cohn', lpid: 'p-bernd' },
    ]
    const key = `fs|${WOCHE}|r1`
    log = [{ task_key: key, name: 'Bernd Cohn' }]
    const res = (await (await plan()).json()) as { aufgaben: number }
    // Anna und Karl bleiben; der Treffpunkt UND der Hilfsdienst von Bernd …
    expect(res.aufgaben).toBe(3)
    expect(zeilenIn('assignment_log').map((z) => z.task_key)).not.toContain(key)
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

  /*
   * **Zwei Gleichnamige.** Über den Namen gewinnt der zuletzt gelesene
   * Mitgliedseintrag — Tim B bekäme also den Entzug, den Tim A angeht: Der eine
   * erschrickt über einen Verlust, den es nie gab, der andere übt weiter für
   * einen Platz, den er nicht mehr hat. Deshalb die Id zuerst, genau wie beim
   * „Plan senden".
   */
  it('mit Person-Id erreicht der Entzug den Richtigen, nicht den Namensvetter', async () => {
    const res = await ruf({
      action: 'entzug',
      taskKey: KEY_ANNA,
      name: 'Tim Zwill',
      pid: 'p-tim-a',
      label: 'Bibellesung',
      datum: 'Dienstag, 8. September · 19:00',
    })
    expect(res.status).toBe(200)
    expect(zeilenIn('notifications')[0]).toMatchObject({ user_id: U_TIM_A })
    expect(sentPush.map((p) => p.endpoint)).toEqual(['https://push.test/tim-a'])
  })

  it('führt die Id zu niemandem, ist niemand zu erreichen — nicht der Namensvetter', async () => {
    /*
      Der Fall, den die Prüfung darüber nicht erwischt: Dort haben **beide**
      Gleichnamigen ein Konto, die Id trifft also. Hat die gemeinte Person
      keines, stand hier ein `??`, das den Namensweg trotzdem nachschob — und
      der kann dann nur einen anderen treffen: Wer kein Konto hat, steht in
      keiner der beiden Tabellen.

      Richtig ist „nicht erreichbar". Der Planer erfährt den Namen und spricht
      ihn selbst an; genau dafür gibt es `ohneKonto`.
    */
    const res = await ruf({
      action: 'entzug',
      taskKey: KEY_ANNA,
      name: 'Tim Zwill',
      pid: 'p-tim-c',
      label: 'Bibellesung',
      datum: 'Dienstag, 8. September · 19:00',
    })
    expect(res.status).toBe(200)
    expect((await res.json()) as { ohneKonto: string[] }).toMatchObject({ ohneKonto: ['Tim Zwill'] })
    expect(zeilenIn('notifications')).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('ohne Person-Id bleibt der Name der Weg — Altdaten und Hilfsdienste', async () => {
    const res = await ruf({
      action: 'entzug',
      taskKey: KEY_ANNA,
      name: 'Anna Berg',
      label: 'Mikrofone',
      datum: 'Dienstag, 8. September · 19:00',
    })
    expect(res.status).toBe(200)
    expect(zeilenIn('notifications')[0]).toMatchObject({ user_id: U_ANNA })
  })
})

/**
 * **Mehrere Entzüge, ein Aufruf.**
 *
 * Der Client schickte je zurückgezogenem Platz einen eigenen `invoke`, und die
 * Function las davor jedes Mal aufs Neue alle Mitglieder, alle Personen und
 * alle Push-Abos der Versammlung. Wer eine Zusammenkunft neu besetzt oder die
 * Zusätzliche Klasse umstellt, löste damit ein Dutzend voller Aufrufe aus —
 * für Nachrichten, die ohnehin alle aus demselben Bestand zugestellt werden.
 *
 * Die Prüfungen darüber schicken weiter die **alte Einzelform**; das ist kein
 * Versehen, sondern der zweite Anwendungsfall: Ein Browser-Tab, der seit Tagen
 * offen liegt, kennt die Liste noch nicht und muss weiter durchkommen.
 */
describe('Entzug als Liste: ein Aufruf für alle', () => {
  it('zwei Betroffene bekommen je ihre eigene Nachricht', async () => {
    const res = await ruf({
      action: 'entzug',
      entzuege: [
        { taskKey: KEY_ANNA, name: 'Anna Berg', pid: 'p-anna', label: 'Bibellesung', datum: 'Di' },
        { taskKey: KEY_BERND, name: 'Bernd Cohn', pid: 'p-bernd', label: 'Mikrofone', datum: 'Di' },
      ],
    })
    expect(res.status).toBe(200)
    const zeilen = zeilenIn('notifications')
    expect(zeilen.map((z) => z.user_id).sort()).toEqual([U_ANNA, U_BERND].sort())
    expect(zeilen.every((z) => z.title === TITEL_ENTZUG)).toBe(true)
  })

  it('wer zwei Plätze verliert, bekommt EINE Nachricht mit beiden', async () => {
    // Dieselbe Regel wie beim „Plan senden": einmal hinsehen, nicht zweimal
    // erschrecken.
    const res = await ruf({
      action: 'entzug',
      entzuege: [
        { taskKey: KEY_ANNA, name: 'Anna Berg', pid: 'p-anna', label: 'Bibellesung', datum: 'Di' },
        { taskKey: KEY_BERND, name: 'Anna Berg', pid: 'p-anna', label: 'Mikrofone', datum: 'Di' },
      ],
    })
    expect(res.status).toBe(200)
    const zeilen = zeilenIn('notifications')
    expect(zeilen).toHaveLength(1)
    expect(String(zeilen[0]!.body)).toContain('Bibellesung')
    expect(String(zeilen[0]!.body)).toContain('Mikrofone')
  })

  it('jeder Platz der Liste verschwindet aus dem Tagebuch', async () => {
    /*
     * Der Eintrag sagt „diese Person weiß von diesem Platz". Bliebe einer
     * stehen, bekäme sie bei einer erneuten Zuteilung auf denselben Platz
     * keine Nachricht mehr — er zählte als gemeldet. Eine Fassung, die nur den
     * ersten der Liste löscht, bestünde jede Prüfung oben und fiele hier.
     */
    await ruf({
      action: 'entzug',
      entzuege: [
        { taskKey: KEY_ANNA, name: 'Anna Berg', pid: 'p-anna', label: 'Bibellesung', datum: 'Di' },
        { taskKey: KEY_BERND, name: 'Bernd Cohn', pid: 'p-bernd', label: 'Mikrofone', datum: 'Di' },
      ],
    })
    const geloescht = writes
      .filter((w) => w.method === 'DELETE' && w.path.startsWith('assignment_log'))
      .map((w) => w.path)
    expect(geloescht).toHaveLength(2)
    expect(geloescht.some((p) => p.includes(encodeURIComponent(KEY_ANNA)))).toBe(true)
    expect(geloescht.some((p) => p.includes(encodeURIComponent(KEY_BERND)))).toBe(true)
  })

  it('wer kein Konto hat, steht in der Antwort — die anderen gehen trotzdem hinaus', async () => {
    const res = await ruf({
      action: 'entzug',
      entzuege: [
        { taskKey: KEY_OHNE, name: 'Karl Onto', pid: 'p-ohne', label: 'Schatz', datum: 'Di' },
        { taskKey: KEY_ANNA, name: 'Anna Berg', pid: 'p-anna', label: 'Bibellesung', datum: 'Di' },
      ],
    })
    const body = (await res.json()) as { personen: number; ohneKonto: string[] }
    expect(body).toMatchObject({ personen: 1, ohneKonto: ['Karl Onto'] })
    expect(zeilenIn('notifications')[0]).toMatchObject({ user_id: U_ANNA })
  })

  it('eine Liste ohne brauchbaren Eintrag ist ein Fehler, kein stiller Nichtversand', async () => {
    // Sonst quittierte die Function einen kaputten Rumpf mit „ok" — und der
    // Betroffene erführe nie von seinem Verlust.
    expect((await ruf({ action: 'entzug', entzuege: [] })).status).toBe(400)
    expect((await ruf({ action: 'entzug', entzuege: [{ name: 'Anna Berg' }] })).status).toBe(400)
    expect(writes).toEqual([])
  })

  it('auch die Liste ist Planern vorbehalten', async () => {
    authUser = U_MITGLIED
    const res = await ruf({
      action: 'entzug',
      entzuege: [{ taskKey: KEY_ANNA, name: 'Anna Berg', label: 'x', datum: 'Di' }],
    })
    expect(res.status).toBe(403)
    expect(writes).toEqual([])
  })
})

/*
 * **Das Tagebuch muss geschrieben werden können, auch wenn eine Zeile schon
 * dasteht.**
 *
 * Ein INSERT ist in Postgres ganz oder gar nicht. Eine einzige Dublette verwarf
 * damit den ganzen Stapel — und `restInsert` schluckt den Fehler, die Antwort
 * meldete weiter Erfolg. Der teure Teil kommt danach: Ohne Tagebuch-Zeilen gilt
 * jeder Platz weiter als ungemeldet, und **jeder** weitere Druck schickt allen
 * dieselbe Nachricht erneut. Für immer, denn die störende Zeile bleibt liegen.
 */
describe('Das Versand-Tagebuch verträgt eine Dublette', () => {
  it('der Stapel bittet um „überspringen", nicht um „alles verwerfen"', async () => {
    await plan()
    const eintrag = writes.find((w) => w.method === 'POST' && w.path.startsWith('assignment_log'))
    expect(eintrag, 'kein POST auf assignment_log').toBeTruthy()
    expect(String(eintrag!.headers['Prefer'] ?? '')).toContain('resolution=ignore-duplicates')
  })

  it('die Mitteilungen dagegen sollen vollständig geschrieben werden', async () => {
    // Gegenprobe: Die Bitte gilt nur dem Tagebuch. Bei den Mitteilungen gibt es
    // keine Eindeutigkeit zu verletzen, und ein stilles Überspringen verdeckte
    // dort einen echten Fehler.
    await plan()
    const zeile = writes.find((w) => w.method === 'POST' && w.path.startsWith('notifications'))
    expect(zeile, 'kein POST auf notifications').toBeTruthy()
    expect(String(zeile!.headers['Prefer'] ?? '')).not.toContain('ignore-duplicates')
  })
})
