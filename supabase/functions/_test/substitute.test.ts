/*
 * Negativtests der Edge Function `substitute` — die serverseitige
 * Sicherheitsgrenze des Ersatz-Features.
 *
 * Warum hier und nicht in src/: Wochen und Bestätigungen darf per RLS nur der
 * Planer schreiben, die Function umgeht das mit der Service-Role. Damit ist sie
 * die einzige Stelle, an der ein Verkündiger fremde Daten ändern könnte —
 * geprüft wird deshalb vor allem, was NICHT gehen darf.
 *
 * Getestet wird die echte index.ts (so wie deployt): `Deno` wird als Global
 * bereitgestellt, `fetch` simuliert Auth- und REST-Endpunkt, web-push ersetzt
 * ein Stub (test.alias in vite.config.ts). Jeder verweigerte Aufruf muss
 * zusätzlich schreibfrei bleiben — ein 403 nützt nichts, wenn vorher schon
 * gespeichert wurde.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { reset as resetPush, sent as sentPush } from './web-push.stub'
import { APP_LANGS } from '../../../src/i18n/langs'
import { makeTr } from '../../../src/i18n/translate'
import { dict, NOTIF_TITLE_KEY, loadOverlay } from '../../../src/i18n/ui'
import { filterWert, jsonRes, ohneFragment, schreibZugriff } from './attrappe.ts'

/* ---- Fixture ------------------------------------------------------------- */

const SUPABASE_URL = 'https://test.supabase.co'
const CONG = 'cong-1'
/** Kennung der Woche, um die es geht (T66): ihr Montag. */
const WI = '2026-09-07'
const SVC = 'mikro'
/** Hilfsdienst-Slot, um den es geht: `woche|tab|helper|svc|pos`. */
const KEY = `${WI}|mid|helper|${SVC}|0`

const U_ME = 'user-me' // qualifiziert, springt ein
const U_ORIG = 'user-orig' // steht im Slot und sagt ab
const U_UNQUAL = 'user-unqual' // Mitglied, aber nicht für den Dienst qualifiziert
const U_NOPERSON = 'user-noperson' // Konto ohne verknüpfte Person
const U_ABSENT = 'user-absent' // qualifiziert, aber in dieser Woche abwesend
const U_PLANNER = 'user-planner'
const U_FOREIGN = 'user-foreign' // Mitglied einer ANDEREN Versammlung
const U_ORIG_ZWILL = 'user-orig-zwill' // heißt wie der Absagende und kann denselben Dienst

const QUAL = { [`svc:${SVC}`]: true }

const MEMBERS = [
  { user_id: U_ME, person_id: 'p-me', planner: false, congregation_id: CONG },
  { user_id: U_ORIG, person_id: 'p-orig', planner: false, congregation_id: CONG },
  { user_id: U_UNQUAL, person_id: 'p-unqual', planner: false, congregation_id: CONG },
  { user_id: U_NOPERSON, person_id: null, planner: false, congregation_id: CONG },
  { user_id: U_ABSENT, person_id: 'p-absent', planner: false, congregation_id: CONG },
  { user_id: U_PLANNER, person_id: 'p-planner', planner: true, congregation_id: CONG },
  { user_id: U_ORIG_ZWILL, person_id: 'p-orig-zwill', planner: false, congregation_id: CONG },
]

const PERSONS = [
  /*
    Ein Namensvetter der Ursprungsperson, **vor** ihr in der Liste. Er trägt
    dieselbe Qualifikation und hat ein eigenes Konto — beides gehört zum Fall:

     - Wer den Eingeteilten über den **Namen** sucht, findet zuerst ihn.
     - Wer den Absagenden über den Namen **ausnimmt**, nimmt ihn mit heraus —
       und damit den, der am ehesten einspringen könnte.

    Kein Push-Abo, damit die Zustell-Prüfungen ihre Endpunkte behalten.
  */
  { id: 'p-orig-zwill', fn: 'Otto', ln: 'Riginal', dn: 'Otto Riginal', priv: QUAL },
  { id: 'p-me', fn: 'Ich', ln: 'Selbst', dn: 'Ich Selbst', priv: QUAL },
  { id: 'p-orig', fn: 'Otto', ln: 'Riginal', dn: 'Otto Riginal', priv: QUAL },
  { id: 'p-unqual', fn: 'Uwe', ln: 'Nqual', dn: 'Uwe Nqual', priv: {} },
  { id: 'p-absent', fn: 'Anna', ln: 'Bwesend', dn: 'Anna Bwesend', priv: QUAL },
  { id: 'p-planner', fn: 'Paul', ln: 'Aner', dn: 'Paul Aner', priv: {} },
  // qualifiziert, hat aber gar kein Konto → kann nicht benachrichtigt werden
  { id: 'p-noacct', fn: 'Karl', ln: 'Onto', dn: 'Karl Onto', priv: QUAL },
]

const SERVICES = [{ key: SVC, name: 'Mikrofone' }]

const CONGREGATIONS = [{ meeting_times: 'Di 19:00 · So 10:00' }]

/**
 * Abwesenheit als Zeitraum (nicht mehr als Wochenindex): die Zusammenkunft der
 * Woche liegt am Dienstag, 8.9.2026 — Anna ist vom 7. bis 9.9. weg.
 */
const ABSENCES = [{ person_id: 'p-absent', from_date: '2026-09-07', to_date: '2026-09-09' }]
const SUBS = [{ user_id: U_ME, endpoint: 'https://push.test/me', p256dh: 'k', auth: 'a' }]

/**
 * Die Woche so, wie der Import sie anlegt.
 *
 * **Im `date`-Feld steht die Wochenspanne, kein Termin** — die
 * jw.org-Überschrift nennt weder Wochentag noch Uhrzeit (`date: range` in
 * parse.ts). Hier stand einmal „Di, 8. Sep · 19:00", also ein fertiger Termin
 * in einer Schreibweise, die die App nirgends erzeugt. Damit sah der Test
 * einen Wert, den es im Betrieb nicht gibt — und deckte zu, dass die Function
 * das Feld ungeprüft übernahm: Ihre Meldungen nannten die ganze Woche statt
 * des Tages. Der Termin muss aus `start` + Wochentag + Uhrzeit gerechnet
 * werden, genau wie in `send-reminders` und `send-plan`.
 */
function freshWeek(): unknown {
  return {
    start: '2026-09-07',
    mid: { date: '7.–13. September', helpers: { [SVC]: [{ name: 'Otto Riginal', pid: 'p-orig' }] } },
    we: { date: '7.–13. September', helpers: {} },
  }
}

/** Der Termin, den die Woche oben bedeutet: Montag + „Di 19:00". */
const TERMIN = 'Dienstag, 8. September · 19:00'

/*
 * Namen gehen als **gekennzeichneter Freitext** hinaus (`_shared/i18n/freitext.ts`):
 * Die Glocke übersetzt beim Anzeigen jedes „ · "-Atom, und sehr viele
 * Bibelbücher heißen wie ein Vorname. Der Rumpf trägt die Marke deshalb schon
 * hier — sie ist unsichtbar und wird beim Anzeigen wieder abgenommen.
 */

/* ---- Simulierte Umgebung ------------------------------------------------- */

interface Write {
  method: string
  path: string
  body: unknown
}

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let week: unknown
let writes: Write[]
/** Vorhandene `verhindert`-Zeilen (Tabelle confirmations). */
let absagen: { user_id: string; task_key: string }[]
/** Wird einmal ausgeführt, nachdem die Woche gelesen wurde (Wettlauf). */
let konkurrent: (() => void) | null

/** Alle schreibenden REST-Aufrufe (PATCH/POST/DELETE) dieses Testlaufs. */
const { writesTo } = schreibZugriff(() => writes)

/** Name, der aktuell im simulierten Slot der Datenbank steht (null = keiner). */
function gespeicherterName(): string | null {
  const w = week as { mid?: { helpers?: Record<string, { name?: string }[]> } }
  return w.mid?.helpers?.[SVC]?.[0]?.name ?? null
}

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = ohneFragment(input)
  const method = init?.method ?? 'GET'

  // Auth: löst das JWT des Aufrufers auf.
  if (url.includes('/auth/v1/user')) {
    return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  }

  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  if (method !== 'GET') {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    writes.push({ method, path, body })
    // Bedingtes PATCH auf weeks nachbilden: der Filter `…->>name=eq."X"` darf
    // nur greifen, solange im gespeicherten Slot noch X steht. Ohne diese
    // Auswertung könnte der Vergleiche-und-Tausche im Test nie fehlschlagen.
    const bedingt = /helpers->[^&]*->\d+->>name=(eq\.%22(.*?)%22|is\.null)/.exec(path)
    if (method === 'PATCH' && path.startsWith('weeks') && bedingt) {
      const erwartet = bedingt[2] === undefined ? null : decodeURIComponent(bedingt[2])
      const aktuell = gespeicherterName()
      if (erwartet !== aktuell) return jsonRes([]) // niemand getroffen → jemand war schneller
      week = (body as { data: unknown }).data
      return jsonRes([{ start: WI, data: week }])
    }
    return new Response(null, { status: 204 })
  }

  // Die Versammlung wird an JEDER Tabelle geprüft: Fällt der Filter weg oder
  // steht ein fremder Wert darin, gibt es hier nichts. Vorher nahm die Function
  // die Kennung aus dem Anfrage-Rumpf — dann arbeitete sie mit dem, was der
  // Aufrufer behauptete, statt mit dem, wo er Mitglied ist.
  const cong = filterWert(path, 'congregation_id')
  const fremd = cong !== null && cong !== CONG

  if (path.startsWith('members')) {
    const wer = filterWert(path, 'user_id')
    if (wer !== null) return jsonRes(MEMBERS.filter((m) => m.user_id === wer))
    return jsonRes(fremd ? [] : MEMBERS)
  }
  if (path.startsWith('services')) return jsonRes(fremd ? [] : SERVICES)
  if (path.startsWith('persons')) return jsonRes(fremd ? [] : PERSONS)
  if (path.startsWith('push_subscriptions')) return jsonRes(fremd ? [] : SUBS)
  if (path.startsWith('congregations')) return jsonRes(CONGREGATIONS)
  if (path.startsWith('absences')) return jsonRes(fremd ? [] : ABSENCES)
  if (path.startsWith('confirmations')) {
    const wer = filterWert(path, 'user_id')
    const aufgabe = filterWert(path, 'task_key')
    let rows = fremd ? [] : absagen
    if (wer !== null) rows = rows.filter((a) => a.user_id === wer)
    if (aufgabe !== null) rows = rows.filter((a) => a.task_key === aufgabe)
    return jsonRes(rows)
  }
  if (path.startsWith('weeks')) {
    const pos = /start=eq\.([\d-]+)/.exec(path)?.[1]
    // Antwort steht mit dem Serialisieren fest; danach darf der Konkurrent den
    // Slot ändern. Genau dieses Zeitfenster — zwischen Lesen und Schreiben —
    // ist der Fall, den die Bedingung beim Schreiben abfangen muss.
    // Mit `start`-Spalte, wie die Datenbank sie seit T66 führt: die Kennung
    // steht neben dem Blob. Stand hier lange nur `data`, und die Function las
    // sie aus dem Blob — der Tag der Zusammenkunft (und damit die
    // Abwesenheitsprüfung) hing dadurch an einem Feld, das jederzeit wegfallen
    // kann. Ohne die Spalte hier bliebe der Fehler unbemerkt.
    const antwort = jsonRes(pos === WI ? [{ start: WI, data: week }] : []) // andere Woche → gibt es nicht
    if (pos === WI && konkurrent) {
      konkurrent()
      konkurrent = null
    }
    return antwort
  }
  return jsonRes([])
}

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    // VAPID bewusst leer: pushTo() steigt dann früh aus, es geht hier um
    // Autorisierung, nicht um den Versand.
  }
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h
    },
  }
  g.fetch = fakeFetch
  await import('../substitute/index.ts') // ruft Deno.serve → setzt handler
})

beforeEach(() => {
  authUser = U_ME
  week = freshWeek()
  writes = []
  // Ausgangslage für „take": Otto steht im Slot und hat abgesagt. Ohne eine
  // solche Absage gibt es nichts zu übernehmen — genau das prüft die Function
  // jetzt (siehe „Einspringen setzt ein Gesuch voraus").
  absagen = [{ user_id: U_ORIG, task_key: KEY }]
  konkurrent = null
  resetPush()
})

/** Ruft die Function so auf, wie es die App tut. */
function call(body: unknown, opts?: { auth?: string | null }): Promise<Response> {
  if (opts && 'auth' in opts) authUser = opts.auth ?? null
  return handler(
    new Request('https://fn.test/substitute', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

const take = (extra?: Record<string, unknown>) => ({
  action: 'take',
  congregationId: CONG,
  taskKey: KEY,
  ...extra,
})

/**
 * Name im Hilfsdienst-Slot, so wie er GESPEICHERT wurde — gelesen aus dem
 * PATCH-Body. Das lokale Fixture taugt dafür nicht: die Function arbeitet auf
 * der JSON-Kopie aus der simulierten Antwort, eine Prüfung darauf könnte gar
 * nicht fehlschlagen. Ohne PATCH (= abgelehnt) gibt es null.
 */
function savedSlotName(): string | null {
  const body = writesTo('weeks').find((w) => w.method === 'PATCH')?.body as
    | { data: { mid: { helpers: Record<string, { name?: string }[]> } } }
    | undefined
  return body?.data.mid.helpers[SVC][0]?.name ?? null
}

/* ---- Tests --------------------------------------------------------------- */

describe('substitute: Authentifizierung', () => {
  it('ohne gültiges JWT → 401, kein Schreibzugriff', async () => {
    const res = await call(take(), { auth: null })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(writes).toEqual([])
  })

  it('Nutzer einer anderen Versammlung → 403, Slot unverändert', async () => {
    const res = await call(take(), { auth: U_FOREIGN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' })
    expect(writes).toEqual([])
    expect(savedSlotName()).toBeNull() // Slot wurde nie überschrieben
  })
})

describe('substitute: ungültige Anfragen', () => {
  it('Aufgaben-Key wird abgelehnt — nur Hilfsdienste laufen über diese Function', async () => {
    // Programmpunkte teilt der Planer zu; ein Aufgaben-Key (6 Teile, „part")
    // darf hier nicht durchkommen.
    const res = await call(take({ taskKey: `${WI}|mid|part|0|1|0` }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'bad-request' })
    expect(writes).toEqual([])
  })

  it.each([
    ['unbekannte Aktion', { action: 'delete' }],
    ['leerer taskKey', { taskKey: '' }],
    ['taskKey mit unbekanntem Tab', { taskKey: `${WI}|xx|helper|${SVC}|0` }],
  ])('%s → 400, kein Schreibzugriff', async (_name, extra) => {
    const res = await call(take(extra))
    expect(res.status).toBe(400)
    expect(writes).toEqual([])
  })

  it('kein JSON-Body → 400 statt Absturz', async () => {
    const res = await handler(
      new Request('https://fn.test/substitute', {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt' },
        body: 'kein json',
      }),
    )
    expect(res.status).toBe(400)
    expect(writes).toEqual([])
  })
})

describe('substitute: die Versammlung kommt nicht aus dem Rumpf', () => {
  /*
   * Der gemessene Missbrauch: `congregationId` ging ungeprüft in jeden
   * REST-Pfad. Ein angehängtes `#` machte beim URL-Parser alles Folgende zum
   * Fragment — und Fragmente werden nicht gesendet. Aus
   *   weeks?congregation_id=eq.X#&start=eq.…&…->>name=eq."Otto"
   * wurde beim Server
   *   weeks?congregation_id=eq.X
   * Das PATCH verlor damit Woche UND Vergleiche-und-Tausche und überschrieb
   * JEDE Woche der Versammlung; die beiden DELETEs verloren ihren task_key und
   * räumten sämtliche Bestätigungen und Mitteilungen ab. Alles mit
   * Service-Role, also an RLS vorbei, und alles für ein einfaches Mitglied.
   *
   * Die Function liest die Versammlung jetzt aus der eigenen Mitgliedszeile.
   * Der Rumpfwert ist damit wirkungslos — das prüfen die drei Fälle hier.
   */
  const boese = `${CONG}#`

  it('ein angehängtes # bleibt wirkungslos — die Übernahme läuft normal', async () => {
    const res = await call(take({ congregationId: boese }))
    expect(res.status).toBe(200)
    expect(savedSlotName()).toBe('Ich Selbst')
  })

  it('kein Pfad verliert seine Filter — jeder Schreibzugriff bleibt eng', async () => {
    await call(take({ congregationId: boese }))

    const patch = writesTo('weeks').find((w) => w.method === 'PATCH')!
    // Die Woche und der erwartete Name müssen im Pfad ankommen, sonst trifft
    // das PATCH mehr als den einen Platz.
    expect(patch.path).toContain(`start=eq.${WI}`)
    expect(patch.path).toContain('->>name=eq.')

    // Beide DELETEs nennen die Aufgabe. Ohne diesen Filter löschen sie die
    // Bestätigungen bzw. Mitteilungen der ganzen Versammlung.
    for (const w of writes.filter((x) => x.method === 'DELETE')) {
      expect(w.path, `DELETE ohne task_key: ${w.path}`).toContain('task_key=eq.')
    }
  })

  it('eine fremde Versammlung im Rumpf ändert nichts — gearbeitet wird in der eigenen', async () => {
    // Früher entschied dieser Wert, welche Zeilen die Function anfasst.
    const res = await call(take({ congregationId: 'cong-fremd' }))
    expect(res.status).toBe(200)
    expect(savedSlotName()).toBe('Ich Selbst')
    // Gegenprobe: Die genannte Versammlung taucht nirgends auf — weder in
    // einem Pfad noch in einer geschriebenen Zeile.
    for (const w of writes) {
      expect(w.path, w.path).not.toContain('cong-fremd')
      expect(JSON.stringify(w.body ?? null), w.path).not.toContain('cong-fremd')
      // Filternde Pfade (PATCH/DELETE) grenzen auf die eigene Versammlung ein;
      // die beiden POSTs tragen sie stattdessen in jeder Zeile.
      if (w.path.includes('?')) expect(w.path).toContain(`congregation_id=eq.${CONG}`)
      else {
        const rows = w.body as { congregation_id: string }[]
        for (const r of rows) expect(r.congregation_id).toBe(CONG)
      }
    }
  })
})

describe('substitute: Einspringen setzt ein Gesuch voraus', () => {
  /*
   * Bisher genügten Mitgliedschaft und Qualifikation. Wer einen Hilfsdienst
   * kann, konnte sich damit in JEDEN Platz dieses Dienstes schreiben: den
   * Eingeteilten verdrängen, dessen Bestätigung löschen und ihm und allen
   * Planern „Ersatz gefunden" schicken — ohne dass je jemand abgesagt hätte.
   * Die App bietet den Knopf zwar nur bei offenen Gesuchen an, aber ein Knopf
   * ist keine Rechteprüfung.
   */
  it('ohne Absage → 409, der Slot behält die ursprüngliche Person', async () => {
    absagen = []
    const res = await call(take())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'not-sought' })
    expect(gespeicherterName()).toBe('Otto Riginal')
    expect(savedSlotName()).toBeNull() // nichts umgeschrieben
  })

  it('ohne Absage wird auch nichts gelöscht und niemand benachrichtigt', async () => {
    absagen = []
    await call(take())
    // Der eigentliche Schaden lag nicht im Slot, sondern hier: fremde
    // Bestätigung weg, fremde Mitteilungen weg, falsche Push an die Planer.
    expect(writesTo('confirmations')).toEqual([])
    expect(writesTo('notifications')).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('eine Absage zu einer ANDEREN Aufgabe zählt nicht', async () => {
    // Sonst genügte irgendeine offene Absage in der Versammlung, um sich in
    // jeden beliebigen Platz zu schreiben.
    absagen = [{ user_id: U_ORIG, task_key: `${WI}|we|helper|${SVC}|0` }]
    const res = await call(take())
    expect(res.status).toBe(409)
    expect(savedSlotName()).toBeNull()
  })

  it('ein leerer Slot lässt sich nicht übernehmen', async () => {
    // Einspringen setzt voraus, dass jemand da war. Für einen leeren Platz
    // gibt es niemanden, der abgesagt haben könnte — er gehört dem Planer.
    const w = week as { mid: { helpers: Record<string, unknown[]> } }
    w.mid.helpers[SVC][0] = {}
    const res = await call(take())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'not-sought' })
    expect(writes).toEqual([])
  })

  it('mit Absage geht es — sonst prüfte hier nichts mehr etwas', async () => {
    absagen = [{ user_id: U_ORIG, task_key: KEY }]
    const res = await call(take())
    expect(res.status).toBe(200)
    expect(savedSlotName()).toBe('Ich Selbst')
  })
})

describe('substitute: Slot muss existieren', () => {
  it.each([
    ['Position außerhalb der Liste', `${WI}|mid|helper|${SVC}|7`],
    ['unbekannter Dienst', `${WI}|mid|helper|gibtsnicht|0`],
    ['Zusammenkunft ohne diesen Dienst', `${WI}|we|helper|${SVC}|0`],
    ['Woche, die es nicht gibt', `2026-12-28|mid|helper|${SVC}|0`],
  ])('%s → 404, kein Schreibzugriff', async (_name, taskKey) => {
    const res = await call(take({ taskKey }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'slot-not-found' })
    expect(writes).toEqual([])
  })
})

describe('substitute: Einspringen nur mit Qualifikation', () => {
  it('nicht qualifiziert → 403, Slot behält die ursprüngliche Person', async () => {
    const res = await call(take(), { auth: U_UNQUAL })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'not-qualified' })
    expect(writes).toEqual([])
    expect(savedSlotName()).toBeNull() // nichts umgeschrieben
    expect(sentPush).toEqual([])
  })

  it('Konto ohne verknüpfte Person → 403', async () => {
    const res = await call(take(), { auth: U_NOPERSON })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'not-qualified' })
    expect(writes).toEqual([])
  })

  it('Planer ohne Qualifikation darf ebenfalls nicht einspringen', async () => {
    // Planer-Rechte gelten fürs Zuteilen, nicht fürs Selbst-Eintragen.
    const res = await call(take(), { auth: U_PLANNER })
    expect(res.status).toBe(403)
    expect(writes).toEqual([])
  })

  it('schon selbst eingetragen → idempotent, kein zweiter Schreibzugriff', async () => {
    const w = week as { mid: { helpers: Record<string, { name?: string; pid?: string }[]> } }
    w.mid.helpers[SVC][0] = { name: 'Ich Selbst', pid: 'p-me' }
    const res = await call(take())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, already: true })
    expect(writes).toEqual([])
  })
})

describe('substitute: seek benachrichtigt nur die richtigen Personen', () => {
  it('weder den Absagenden noch Unqualifizierte, Abwesende oder Kontolose', async () => {
    const res = await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, notified: 2 })

    const rows = writesTo('notifications')[0]?.body as { user_id: string }[]
    // Der gleichnamige Bruder ist **nicht** der Absagende: Er kann denselben
    // Dienst und wird gefragt (siehe `istAbsager`).
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U_ME, U_ORIG_ZWILL]))
    // Gegenprobe: niemand aus den ausgeschlossenen Gruppen ist dabei.
    const got = new Set(rows.map((r) => r.user_id))
    for (const u of [U_ORIG, U_UNQUAL, U_ABSENT, U_PLANNER]) expect(got.has(u)).toBe(false)
  })

  /*
   * Verlegte Zusammenkunft (T30): Die Abwesenheit gilt einem **Tag**, nicht
   * einer Woche. Die Ersatzsuche rechnete den Tag lange mit einer eigenen
   * Fassung des Wochentag-Versatzes aus, die die Abweichung nicht kannte —
   * sie prüfte also den regulären Dienstag, während die Zusammenkunft am
   * Freitag stattfand. Anna (7.–9.9. weg) galt damit als verhindert, obwohl
   * sie am 11.9. längst wieder da ist.
   */
  it('eine ausgefallene Zusammenkunft wird abgewiesen — niemand wird gesucht', async () => {
    // Entfällt die Zusammenkunft (T30), gibt es nichts zu vertreten. Die App
    // zeigt solche Aufgaben gar nicht an; hier landet nur, wer den Ausfall
    // noch nicht gesehen hat.
    const w = week as { dev?: Record<string, { cancelled: boolean }> }
    w.dev = { mid: { cancelled: true } }
    const res = await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'meeting-cancelled' })
    expect(writes).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('rechnet mit dem verlegten Tag, nicht mit dem regulären', async () => {
    const w = week as { dev?: Record<string, { day: string }> }
    w.dev = { mid: { day: 'Freitag' } } // 11.9. — nach Annas Abwesenheit
    const res = await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    expect(res.status).toBe(200)
    const rows = writesTo('notifications')[0]?.body as { user_id: string }[]
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U_ME, U_ABSENT, U_ORIG_ZWILL]))
  })

})

describe('substitute: seek darf nur auslösen, wen es angeht', () => {
  const seek = { action: 'seek', congregationId: CONG, taskKey: KEY }

  it('Fremder ohne eigene Absage → 403, niemand wird angepingt', async () => {
    // Sonst könnte jedes Mitglied für jeden beliebigen Slot behaupten lassen,
    // die eingeteilte Person könne nicht — per Push an alle Qualifizierten.
    const res = await call(seek, { auth: U_UNQUAL })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' })
    expect(writes).toEqual([])
    expect(sentPush).toEqual([])
  })

  it('auch ein Planer nicht — Zuteilen ist etwas anderes als Absagen', async () => {
    const res = await call(seek, { auth: U_PLANNER })
    expect(res.status).toBe(403)
    expect(writes).toEqual([])
  })

  it('die eingeteilte Person darf', async () => {
    const res = await call(seek, { auth: U_ORIG })
    expect(res.status).toBe(200)
  })

  it('wer für genau diesen Slot abgesagt hat, darf ebenfalls', async () => {
    // Der Slot kann inzwischen neu besetzt sein; die Absage bleibt der Beleg.
    absagen = [{ user_id: U_UNQUAL, task_key: KEY }]
    const res = await call(seek, { auth: U_UNQUAL })
    expect(res.status).toBe(200)
  })
})

describe('substitute: zwei Übernahmen gleichzeitig', () => {
  it('der Zweite bekommt 409 und löscht nichts', async () => {
    // Zwischen Lesen und Schreiben trägt sich jemand anderes ein. Ohne
    // Bedingung beim Schreiben hätte der Zweite den Ersten überschrieben —
    // und mit `DELETE confirmations?task_key=…` dessen Bestätigung gelöscht.
    konkurrent = () => {
      const w = week as { mid: { helpers: Record<string, { name?: string; pid?: string }[]> } }
      w.mid.helpers[SVC][0] = { name: 'Karl Onto', pid: 'p-noacct' }
    }
    const res = await call(take())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'slot-taken' })
    // Der Slot gehört weiterhin dem Ersten …
    expect(gespeicherterName()).toBe('Karl Onto')
    // … und seine Bestätigung ist unangetastet.
    expect(writesTo('confirmations')).toEqual([])
    expect(writesTo('notifications')).toEqual([])
  })

  it('ohne Wettlauf schreibt die Übernahme wie bisher durch', async () => {
    const res = await call(take())
    expect(res.status).toBe(200)
    expect(gespeicherterName()).toBe('Ich Selbst')
  })
})

describe('substitute: Positivfall als Gegenprobe', () => {
  // Ohne diesen Test könnten alle Negativtests bestehen, obwohl die Function
  // gar nichts tut (z. B. weil das Fixture nicht greift).
  it('qualifiziertes Mitglied übernimmt: Slot umgeschrieben, Bestätigung gesetzt', async () => {
    const res = await call(take())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, taken: true })
    expect(savedSlotName()).toBe('Ich Selbst')

    expect(writesTo('weeks')[0]?.method).toBe('PATCH')
    // alte Bestätigung weg, eigene „bestätigt" gesetzt
    expect(writesTo('confirmations').map((w) => w.method)).toEqual(['DELETE', 'POST'])
    const conf = writesTo('confirmations')[1]?.body as { user_id: string; status: string }[]
    expect(conf[0]).toMatchObject({ user_id: U_ME, status: 'bestätigt' })
    // Die Suche ist beendet: „Ersatz gesucht" verschwindet aus den Glocken
    // aller Qualifizierten (T86) — vorher blieb die Zeile stehen, obwohl es
    // nichts mehr zu übernehmen gab.
    expect(writesTo('notifications').map((w) => w.method)).toEqual(['DELETE', 'POST'])
    expect(writesTo('notifications')[0]?.path).toContain('task_key=eq.')
    expect(writesTo('notifications')[0]?.path).toContain('Ersatz')
    // Ursprungsperson und Planer werden informiert
    const rows = writesTo('notifications')[1]?.body as { user_id: string }[]
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U_ORIG, U_PLANNER]))
  })
})

/**
 * **Wer verdrängt wurde, erfährt es — über die Id, nicht über den Namen.**
 *
 * Der Slot trägt eine `pid`; gesucht wurde die Ursprungsperson trotzdem mit
 * `persons.find((p) => displayName(p) === originalName)`. Gibt es einen
 * Namensvetter, entschied die Reihenfolge der Personenliste, wer die Nachricht
 * bekommt — und wenn der Vetter kein Konto hat, bekam sie **niemand**: Der
 * Eingeteilte verlor seinen Platz, ohne es zu erfahren.
 *
 * Dieselbe Grenze wie in `send-plan`, `send-reminders` und `idAufloeser`: Trägt
 * die Zuteilung eine Id, gilt sie — der Name ist dann kein schwächerer Anhalt,
 * sondern keiner.
 */
describe('substitute: die Id entscheidet, wer verdrängt wurde', () => {
  it('„Ersatz gefunden" erreicht den Eingeteilten, nicht den Namensvetter', async () => {
    await call(take())
    const rows = writesTo('notifications')[1]?.body as { user_id: string }[]
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U_ORIG, U_PLANNER]))
  })
})

describe('substitute: Meldungen sind übersetzbar (T24)', () => {
  // Titel und Rumpf waren fest deutsch und dynamisch — sie konnten weder über
  // NOTIF_TITLE_KEY noch über den Fragment-Übersetzer laufen. Glocke UND Push
  // erschienen deshalb in allen 33 Sprachen deutsch.
  it('Glocken-Titel ist der feste, kanonisch deutsche Schlüssel', async () => {
    await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    const rows = writesTo('notifications')[0]?.body as
      { title: string; body: string; task_key?: string }[]
    expect(rows[0].title).toBe('Ersatz gesucht') // ohne Dienstnamen
    // Rumpf nur aus ' · '-Atomen, die der Fragment-Übersetzer erledigt.
    expect(rows[0].body).toBe(`Mikrofone · ${TERMIN} · ${alsFreitext('Otto Riginal')}`)
    // Die Zeile weiß, worum es geht (migration-020) — sonst ließe sie sich
    // später weder aufräumen noch als abgelaufen erkennen.
    expect(rows[0].task_key).toBe(KEY)
  })

  it('nennt den Termin, nicht die Wochenspanne', async () => {
    /*
      Importierte Wochen tragen im `date`-Feld die Überschrift der
      jw.org-Seite: „7.–13. September" — weder Wochentag noch Uhrzeit (B4).
      Genau das stand vorher in beiden Meldungen dieser Function, während die
      App daneben „Dienstag, 8. September · 19:00" zeigte. Wer „Ersatz gesucht"
      bekam, wusste damit nicht, ob es um die Zusammenkunft unter der Woche
      oder die am Wochenende geht.

      Gegenstück zu „send-reminders: Termin statt Wochenspanne im Text".
    */
    await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
    const rows = writesTo('notifications')[0]?.body as { body: string }[]
    expect(rows[0].body).toContain(TERMIN)
    expect(rows[0].body).not.toContain('7.–13.')
  })

  it('dasselbe beim Einspringen', async () => {
    await call(take())
    // [0] ist das Aufräumen der Suche (DELETE), [1] die neue Mitteilung.
    const rows = writesTo('notifications')[1]?.body as { title: string; body: string }[]
    expect(rows[0].title).toBe('Ersatz gefunden')
    expect(rows[0].body).toBe(`Mikrofone · ${TERMIN} · ${alsFreitext('Ich Selbst')}`)
  })

  /*
   * **„Übersetzbar" ist eine Behauptung — hier wird sie gemessen.**
   *
   * Die beiden Prüfungen oben halten die Form fest: fester Titel, Rumpf aus
   * ' · '-Atomen. Ob der Fragment-Übersetzer diese Atome auch **kennt**, stand
   * darin nicht. Genau daran hing die Sache schon einmal: Die Wörterbücher
   * waren aus den eigenen Vorgaben gefüllt worden statt aus dem, was der Code
   * erzeugt — „vor 2 Std." war übersetzt, „vor 3 Std." nicht.
   *
   * Deshalb läuft der tatsächlich geschriebene Rumpf hier durch **jede** der 33
   * Fremdsprachen, Atom für Atom, so wie die Glocke ihn zeigt.
   */
  it.each(APP_LANGS.map((l) => l.code).filter((c) => c !== 'de'))(
    '%s: jedes Atom des Rumpfs wird übersetzt',
    async (code) => {
      await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
      const rows = writesTo('notifications')[0]?.body as { title: string; body: string }[]
      const tr = makeTr(code)
      // „Otto Riginal" ist ein Name und bleibt; „19:00" ist eine Uhrzeit.
      const NAME = 'Otto Riginal'
      const atome = (rows[0]?.body ?? '').split(' · ').filter((a) => a && a !== NAME && !/^\d/.test(a))
      expect(atome.length, `${code}: nichts zu prüfen`).toBeGreaterThan(1)
      const deutsch = atome.filter((a) => tr(a) === a)
      expect(deutsch, `${code}: ${deutsch.join(', ')}`).toEqual([])
    },
  )

  beforeAll(async () => {
    // Ohne Nachladen liefert `dict()` den EN-Rückfall: Der Titel wäre dann
    // englisch statt koreanisch — und der Vergleich „nicht deutsch" ginge
    // trotzdem durch. Genau dieser stille Rückfall ließ 92 Schlüssel
    // monatelang englisch dastehen.
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
  })

  it.each(APP_LANGS.map((l) => l.code).filter((c) => c !== 'de'))(
    '%s: und der Titel findet seinen Wörterbuch-Schlüssel',
    async (code) => {
      // Die Glocke übersetzt den Titel nicht über den Fragment-Übersetzer,
      // sondern über NOTIF_TITLE_KEY — eine zweite Zuordnung, die mit dem
      // Wortlaut der Function übereinstimmen muss.
      await call({ action: 'seek', congregationId: CONG, taskKey: KEY }, { auth: U_ORIG })
      const rows = writesTo('notifications')[0]?.body as { title: string }[]
      const key = NOTIF_TITLE_KEY[rows[0]?.title ?? '']
      expect(key, `kein Schlüssel für „${rows[0]?.title}"`).toBeDefined()
      const text = dict(code)[key as keyof ReturnType<typeof dict>]
      expect(text, `${code}/${key}`).toBeTruthy()
      expect(text, `${code}/${key} blieb deutsch`).not.toBe(dict('de')[key as keyof ReturnType<typeof dict>])
    },
  )
})
