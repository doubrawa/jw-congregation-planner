/*
 * Die Edge Function `substitute`, Aufruf 'absage' (`absage.ts`): Absagen
 * denen melden, die planen (13.11.2026).
 *
 * „Der Planer erfährt es sofort", verspricht das Blatt beim Absagen. Bis dahin
 * stand die Absage nur in der Glocke von Admin und Planern — ohne Push, und wer
 * als Gruppenaufseher den Treffpunkt geplant hatte, erfuhr nichts. Geprüft wird
 * hier, **wer** es erfährt und auf welchem Weg, und vor allem, was nicht gehen
 * darf: Die Function schreibt mit der Service-Role in fremde Glocken — im
 * Namen eines anderen absagen oder beliebige Leute anschreiben darf niemand.
 *
 * Seit dem 14.11.2026 nimmt ein Aufruf mehrere Plätze — wer eine Abwesenheit
 * einträgt, sagt alles darin zugleich ab. Die Glocke führt je Platz eine Zeile,
 * der Push kommt je Empfänger einmal (Betreiber: „ein push je planer").
 *
 * Der REST-Zugang ist eine Attrappe des `Rest`-Vertrags (`_shared/rest.ts`),
 * die Filter wirklich auswertet; das Zustellen fängt ein Mitschreiber ab.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_LANGS } from '../../../src/i18n/langs'
import { dict, loadOverlay, NOTIF_TITLE_KEY } from '../../../src/i18n/ui'
import { fsKey, helferKey, punktKey } from '../_shared/aufgaben-schluessel.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import { makeTr } from '../_shared/i18n/translate.ts'
import type { Rest } from '../_shared/rest.ts'
import type { FsInstance, SubscriptionRow, Week } from '../_shared/zuteilungen.ts'
import { NACHRICHT_MAX } from '../_shared/absage-nachricht.ts'
import { absageMelden, absageSchluessel, OHNE_VERMERK_MINUTEN, PLAETZE_MAX, type Sendung } from '../substitute/absage.ts'
import { substituteTexte, TITEL_ABGESAGT } from '../substitute/texte.ts'
import { erfuelltVergleiche, filterWert, nurSpalten } from './attrappe.ts'

const CONG = 'cong-1'
const MONTAG = '2026-09-07' // Dienstag 8.9., Samstag 12.9., Sonntag 13.9.
const WOCHE_2 = '2026-09-14' // die Woche danach
const ARCHIV = '2026-08-31' // davor — eine Absage für 7. und 14.9. liest sie nicht
const SPAETER = '2026-09-21' // danach — ebenso wenig
const HEUTE = '2026-09-07'
const APP = 'https://app.test/'

const U_ICH = 'user-ich' // sagt ab
const U_ADMIN = 'user-admin'
const U_PLANER = 'user-planer' // teilt zu, ohne Admin zu sein — und ohne eigene Person
const U_AUFSEHER = 'user-aufseher' // leitet Gruppe 1
const U_GEHILFE = 'user-gehilfe' // Gehilfe der Gruppe 1
const U_AUFSEHER_2 = 'user-aufseher-2' // leitet Gruppe 2 — geht die Sache nichts an
const U_OHNE = 'user-ohne-person'
const U_FREMD = 'user-fremd' // kein Mitglied

const MEMBERS = [
  { user_id: U_ICH, person_id: 'p-ich', admin: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_ADMIN, person_id: 'p-admin', admin: true, zuteiler: false, congregation_id: CONG },
  { user_id: U_PLANER, person_id: null, admin: false, zuteiler: true, congregation_id: CONG },
  { user_id: U_AUFSEHER, person_id: 'p-auf', admin: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_GEHILFE, person_id: 'p-geh', admin: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_AUFSEHER_2, person_id: 'p-auf2', admin: false, zuteiler: false, congregation_id: CONG },
  { user_id: U_OHNE, person_id: null, admin: false, zuteiler: false, congregation_id: CONG },
]

const PERSONS = [
  { id: 'p-ich', fn: 'Ich', ln: 'Selbst' },
  { id: 'p-admin', fn: 'Paul', ln: 'Aner' },
  { id: 'p-auf', fn: 'Gustav', ln: 'Ruppe' },
]

const GROUPS = [
  { id: 'g1', overseer_id: 'p-auf', assistant_id: 'p-geh' },
  { id: 'g2', overseer_id: 'p-auf2', assistant_id: null },
]

const SERVICES = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Je Konto ein Gerät; der Admin liest Englisch. */
const SUBS: SubscriptionRow[] = [U_ICH, U_ADMIN, U_PLANER, U_AUFSEHER, U_GEHILFE, U_AUFSEHER_2].map((user_id) => ({
  id: `abo-${user_id}`, user_id, endpoint: `https://push.test/${user_id}`, p256dh: 'k', auth: 'a', lang: user_id === U_ADMIN ? 'en' : null,
}))

const K_LESUNG = punktKey(MONTAG, 'mid', 'k3', 0) // mein Programmpunkt
const K_LESUNG_2 = punktKey(WOCHE_2, 'mid', 'k3', 0) // derselbe in der Woche danach
const K_FREMD = punktKey(MONTAG, 'mid', 'k2', 0) // der eines anderen
const K_OHNE_ID = punktKey(MONTAG, 'mid', 'k4', 0) // steht nur mit meinem Namen da (Altbestand)
const K_VETTER = punktKey(MONTAG, 'mid', 'k5', 0) // ein fremder Name ohne Person-Id
const K_MIK = helferKey(MONTAG, 'mid', 'mik', 0) // mein Hilfsdienst
const K_GRUPPE = fsKey(MONTAG, 'r1') // mein Treffpunkt der Gruppe 1
const K_VERSAMMLUNG = fsKey(MONTAG, 'r2') // mein Versammlungstreffpunkt
const K_GRUPPE_FREMD = fsKey(MONTAG, 'r3') // der Treffpunkt eines anderen

function frischeWoche(start = MONTAG): Week {
  return {
    start,
    mid: {
      date: 'Platzhalter-Spanne',
      sections: [
        { label: 'SCHÄTZE AUS GOTTES WORT', items: [
          { iid: 'k2', title: 'Platzhalter-Thema', names: [{ name: 'Andere Person', pid: 'p-x', bereichsKey: 'vortrag' }] },
          { iid: 'k3', title: 'Bibellesung', names: [{ name: 'Ich Selbst', pid: 'p-ich', bereichsKey: 'bibellesung' }] },
        ] },
        { label: 'UNSER LEBEN ALS CHRIST', items: [
          { iid: 'k4', title: 'Platzhalter-Besprechung', names: [{ name: 'Ich Selbst', bereichsKey: 'besprechung' }] },
          { iid: 'k5', title: 'Platzhalter-Punkt', names: [{ name: 'Jemand Anderes', bereichsKey: 'besprechung' }] },
        ] },
      ],
      helpers: { mik: [{ name: 'Ich Selbst', pid: 'p-ich' }] },
    },
    we: { date: 'Platzhalter-Spanne', sections: [], helpers: {} },
  } as Week
}

const TREFFPUNKTE: FsInstance[] = [
  { id: 'r1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie A', leader: 'Ich Selbst', lpid: 'p-ich' },
  { id: 'r2', wd: 3, time: '09:30', place: 'Saal', leader: 'Ich Selbst', lpid: 'p-ich' },
  { id: 'r3', grp: 'g1', wd: 0, time: '09:30', place: 'Park', leader: 'Andere Person', lpid: 'p-x' },
]

/* ---- Attrappe ------------------------------------------------------------ */

interface Glockenzeile {
  congregation_id: string
  user_id: string
  type: string
  title: string
  body: string
  task_key: string
}

/** Eine mitgeschriebene Sendung — `body` ist ihr Rumpf kanonisch deutsch, mit den Marken. */
interface Push {
  an: string[]
  titel: (lang: string | null) => string
  body: string
  rumpf: Sendung['rumpf']
  url: string
  tag?: string
}

let woche: Week
let glocken: Glockenzeile[]
let pushes: Push[]
let abfragen: string[]
/** Die Wochen (`start`), die eine Abfrage geliefert hat. */
let gelesen: string[]
/** Die Glocke nimmt nichts an (Datenbank weg). */
let glockeKaputt: boolean
/** Die Wechsel der Regelzeit (`congregations.zeiten_ab`) — ohne Angabe keiner. */
let zeitenAb: Array<{ ab: string; tab: 'mid' | 'we'; wd: number; time: string }>
/** Die Uhr: Zeitpunkt des Aufrufs (`jetzt`) und `created_at` jeder geschriebenen Glocken-Zeile. */
let uhr: number
/** Was die Datenbank in der Glocke führt — die geschriebenen Zeilen mit ihrer Zeit. */
let glockeMitZeit: (Glockenzeile & { created_at: string })[]
/** `absagen` (Trigger `absage_vermerken`): seit wann die Absage einer Person gilt. */
let vermerkt: { task_key: string; person_id: string; created_at: string }[]
/** `absagen` und die Glocke lassen sich nicht lesen. */
let lesenKaputt: boolean

/** Die Werte eines `spalte=in.(…)`-Filters, dekodiert und ohne Anführungszeichen — `null` ohne Filter. */
function inWerte(path: string, spalte: string): string[] | null {
  const roh = new URLSearchParams(path.slice(path.indexOf('?') + 1)).get(spalte)
  if (!roh?.startsWith('in.(') || !roh.endsWith(')')) return null
  return roh.slice(4, -1).split(',').map((w) => w.replace(/^"(.*)"$/, '$1'))
}
const vorMinuten = (min: number): string => new Date(uhr - min * 60e3).toISOString()

/**
 * Wie die Datenbank: nur die Wochen, die der Filter auf `start` durchlässt.
 * Ganz ohne Filter keine — ein vergessener fiele sonst nicht auf, weil die
 * Function die Wochen ohnehin nach ihrer Kennung nachschlägt.
 */
function wochenZeilen<D>(path: string, zeilen: { start: string; data: D }[]): Partial<{ start: string; data: D }>[] {
  if (!/[?&]start=(eq|gte|lte)\./.test(path)) return []
  const treffer = zeilen.filter((z) => erfuelltVergleiche(z, path, ['start']))
  gelesen.push(...treffer.map((z) => z.start))
  return nurSpalten(treffer, path)
}

const rest: Rest = {
  async get<T>(path: string): Promise<T> {
    abfragen.push(path)
    const cong = filterWert(path, 'congregation_id') ?? filterWert(path, 'id')
    let rows: unknown[] = []
    if (path.startsWith('members') && filterWert(path, 'user_id') !== null) {
      rows = MEMBERS.filter((m) => m.user_id === filterWert(path, 'user_id'))
    } else if (cong !== CONG) {
      rows = []
    } else if (path.startsWith('members')) {
      rows = MEMBERS
    } else if (path.startsWith('weeks')) {
      const kopie = (w: Week): Week => JSON.parse(JSON.stringify(w)) as Week
      rows = wochenZeilen(path, [
        { start: ARCHIV, data: frischeWoche(ARCHIV) },
        { start: MONTAG, data: kopie(woche) },
        { start: WOCHE_2, data: frischeWoche(WOCHE_2) },
        { start: SPAETER, data: frischeWoche(SPAETER) },
      ])
    } else if (path.startsWith('fs_weeks')) {
      rows = wochenZeilen(path, [{ start: MONTAG, data: TREFFPUNKTE }])
    } else if (path.startsWith('services')) {
      rows = SERVICES
    } else if (path.startsWith('persons')) {
      rows = PERSONS.filter((p) => p.id === filterWert(path, 'id'))
    } else if (path.startsWith('congregations')) {
      // Nur die verlangten Spalten: Fehlte `zeiten_ab` in der Abfrage, gälte
      // nach einem Wechsel still der alte Tag.
      rows = nurSpalten([{ mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00', zeiten_ab: zeitenAb }], path)
    } else if (path.startsWith('groups')) {
      rows = GROUPS
    } else if (path.startsWith('push_subscriptions')) {
      rows = SUBS
    } else if (path.startsWith('absagen')) {
      if (lesenKaputt) throw new Error('absagen nicht lesbar')
      // Nur mit beiden Filtern: ohne Person zählte die Absage eines anderen.
      const keys = inWerte(path, 'task_key')
      rows = keys ? vermerkt.filter((a) => a.person_id === filterWert(path, 'person_id') && keys.includes(a.task_key)) : []
    } else if (path.startsWith('notifications')) {
      if (lesenKaputt) throw new Error('notifications nicht lesbar')
      const keys = inWerte(path, 'task_key')
      const ab = filterWert(path, 'created_at', 'gte')
      rows = keys
        ? glockeMitZeit.filter(
            (z) => z.type === filterWert(path, 'type') && keys.includes(z.task_key) && (ab === null || z.created_at >= ab),
          )
        : []
    }
    return rows as T
  },
  async insert(path): Promise<void> {
    throw new Error(`absage schreibt nicht über insert: ${path}`)
  },
  async upsert(path): Promise<boolean> {
    throw new Error(`absage schreibt nicht über upsert: ${path}`)
  },
  async send(method, path): Promise<void> {
    throw new Error(`absage schreibt nicht über send: ${method} ${path}`)
  },
  async patchZeilen(path): Promise<null> {
    throw new Error(`absage ändert keine Zeilen: ${path}`)
  },
  async zeilenSchreiben<T>(method: string, path: string, body?: unknown): Promise<T[] | null> {
    if (method !== 'POST' || !path.startsWith('notifications')) throw new Error(`unerwartet: ${method} ${path}`)
    if (glockeKaputt) return null
    glocken.push(...(body as Glockenzeile[]))
    glockeMitZeit.push(...(body as Glockenzeile[]).map((z) => ({ ...z, created_at: new Date(uhr).toISOString() })))
    return (body as Glockenzeile[]).map((_, i) => ({ id: `n${i}` })) as T[]
  },
  async userId(): Promise<string | null> {
    return null
  },
}

const zustellen = async (sendungen: readonly Sendung[]) => {
  for (const { subs, titel, rumpf, url, tag } of sendungen) {
    pushes.push({ an: subs.map((s) => s.user_id), titel, body: rumpf((s) => s, 'de'), rumpf, url, tag })
  }
}

beforeEach(() => {
  woche = frischeWoche()
  glocken = []
  pushes = []
  abfragen = []
  gelesen = []
  glockeKaputt = false
  zeitenAb = []
  uhr = Date.parse('2026-09-07T08:00:00.000Z')
  glockeMitZeit = []
  vermerkt = []
  lesenKaputt = false
})

const absagenAlle = (taskKeys: string[], wer = U_ICH, nachricht = '', heute = HEUTE) =>
  absageMelden(rest, wer, { taskKeys, nachricht, heute, appUrl: APP, jetzt: uhr }, zustellen)
const absagen = (taskKey: string, wer = U_ICH, nachricht = '', heute = HEUTE) => absagenAlle([taskKey], wer, nachricht, heute)
const antwort = async (res: Response) => ({ status: res.status, body: await res.json() })
const anWen = (): string[] => glocken.map((z) => z.user_id).sort()
const ICH = alsFreitext('Ich Selbst')

/* ---- Fälle --------------------------------------------------------------- */

describe('absage: ein Programmpunkt', () => {
  it('steht in der Glocke von Admin und Planer — mit Aufgabe, Namen und dem Schlüssel für den Sprung in die Woche', async () => {
    expect(await antwort(await absagen(K_LESUNG))).toEqual({ status: 200, body: { ok: true, gemeldet: 2 } })
    expect(anWen()).toEqual([U_ADMIN, U_PLANER].sort())
    for (const zeile of glocken) {
      expect(zeile).toEqual({
        congregation_id: CONG,
        user_id: zeile.user_id,
        type: 'verhindert',
        title: 'Verhinderung gemeldet',
        body: `Bibellesung — ${ICH}`,
        task_key: K_LESUNG,
      })
    }
  })

  it('und geht als Push an ihre Geräte — mit dem Termin, in ihrer Sprache, nicht an den Absagenden', async () => {
    await absagen(K_LESUNG)
    expect(pushes).toHaveLength(1)
    const push = pushes[0]!
    expect([...push.an].sort()).toEqual([U_ADMIN, U_PLANER].sort())
    expect(push.body).toBe(`Bibellesung · Dienstag, 8. September · 19:00 · ${ICH}`)
    expect(push.titel(null)).toBe('Verhinderung gemeldet')
    expect(push.titel('en')).toBe('Can’t take part')
    // In die Mitteilungen: Von dort führt ein Tipp in die Woche der Absage.
    expect(push.url).toBe(`${APP}#go=mitteilungen`)
    // Je Platz eine eigene Meldung — zwei Absagen am selben Abend ersetzen einander nicht.
    expect(push.tag).toBe(K_LESUNG)
  })

  it('die Nachricht an den Planer hängt als ein Atom an — ohne „ · " darin und begrenzt', async () => {
    await absagen(K_LESUNG, U_ICH, '  bin verreist · ab Montag wieder da  ')
    const text = alsFreitext('bin verreist, ab Montag wieder da')
    expect(glocken[0]!.body).toBe(`Bibellesung — ${ICH} · ${text}`)
    expect(pushes[0]!.body).toBe(`Bibellesung · Dienstag, 8. September · 19:00 · ${ICH} · ${text}`)
    // Eine leere Glocke: Dieselbe Absage ginge sonst kein zweites Mal hinaus.
    glocken = []
    glockeMitZeit = []
    await absagen(K_LESUNG, U_ICH, 'x'.repeat(NACHRICHT_MAX + 50))
    expect(glocken[0]!.body).toBe(`Bibellesung — ${ICH} · ${alsFreitext('x'.repeat(NACHRICHT_MAX))}`)
  })

  it('auch der Platz, an dem nur mein Name steht (Altbestand ohne Person-Id), ist meiner', async () => {
    expect((await absagen(K_OHNE_ID)).status).toBe(200)
    expect(glocken[0]!.body).toBe(`Platzhalter-Besprechung — ${ICH}`)
  })

  it('sagt ein Admin selbst ab, steht es in seiner Glocke — sein eigenes Gerät bekommt keinen Push', async () => {
    woche.mid!.sections![0]!.items![1] = { iid: 'k3', title: 'Bibellesung', names: [{ name: 'Paul Aner', pid: 'p-admin', bereichsKey: 'bibellesung' }] }
    expect((await absagen(K_LESUNG, U_ADMIN)).status).toBe(200)
    expect(anWen()).toEqual([U_ADMIN, U_PLANER].sort())
    expect(pushes[0]!.an).toEqual([U_PLANER])
  })
})

describe('absage: ein Treffpunkt', () => {
  it('der Gruppe: Aufseher und Gehilfe dieser Gruppe erfahren es wie Admin und Planer — der Aufseher einer anderen nicht', async () => {
    expect(await antwort(await absagen(K_GRUPPE))).toEqual({ status: 200, body: { ok: true, gemeldet: 4 } })
    const erwartet = [U_ADMIN, U_PLANER, U_AUFSEHER, U_GEHILFE].sort()
    expect(anWen()).toEqual(erwartet)
    expect(glocken[0]!.body).toBe(`Treffpunkt-Leiter — ${ICH}`)
    expect(glocken[0]!.task_key).toBe(K_GRUPPE)
    expect([...pushes[0]!.an].sort()).toEqual(erwartet)
    expect(pushes[0]!.body).toBe(`Treffpunkt-Leiter · Samstag, 12. September · 09:30 · Bei Familie A · ${ICH}`)
  })

  it('der Versammlung: nur Admin und Planer — eine Gruppe hat er nicht', async () => {
    await absagen(K_VERSAMMLUNG)
    expect(anWen()).toEqual([U_ADMIN, U_PLANER].sort())
    expect(pushes[0]!.body).toBe(`Treffpunkt-Leiter · Mittwoch, 9. September · 09:30 · Saal · ${ICH}`)
  })
})

describe('absage: ein Hilfsdienst', () => {
  it('steht in der Glocke, aber ohne Push — Ersatz sucht die App selbst', async () => {
    expect((await absagen(K_MIK)).status).toBe(200)
    expect(anWen()).toEqual([U_ADMIN, U_PLANER].sort())
    expect(glocken[0]!.body).toBe(`Mikrofone — ${ICH}`)
    expect(pushes).toEqual([])
  })
})

/*
 * **Mehrere Plätze in einem Aufruf** — so meldet die App die Absagen beim
 * Eintragen einer Abwesenheit (T181). Die Glocke behält je Platz eine Zeile:
 * Jede führt in ihre Woche, und dort teilt der Planer neu zu. Der Push dagegen
 * kommt je Empfänger einmal.
 */
describe('absage: mehrere Plätze auf einmal', () => {
  // In der Folge, in der die App sie schickt: nach dem Termin.
  const ALLE = [K_LESUNG, K_MIK, K_GRUPPE, K_LESUNG_2]

  it('je Platz eine Zeile in der Glocke, bei jedem, der von ihm erfährt', async () => {
    expect(await antwort(await absagenAlle(ALLE))).toEqual({ status: 200, body: { ok: true, gemeldet: 4 } })
    const zeilenJePlatz = (key: string) => glocken.filter((z) => z.task_key === key).map((z) => z.user_id).sort()
    expect(zeilenJePlatz(K_LESUNG)).toEqual([U_ADMIN, U_PLANER].sort())
    expect(zeilenJePlatz(K_MIK)).toEqual([U_ADMIN, U_PLANER].sort())
    expect(zeilenJePlatz(K_GRUPPE)).toEqual([U_ADMIN, U_PLANER, U_AUFSEHER, U_GEHILFE].sort())
    expect(zeilenJePlatz(K_LESUNG_2)).toEqual([U_ADMIN, U_PLANER].sort())
    expect(glocken).toHaveLength(10)
  })

  it('aber je Empfänger nur ein Push — mit allen seinen Plätzen, der Name vorn', async () => {
    await absagenAlle(ALLE)
    expect(pushes).toHaveLength(2)
    const anPlaner = pushes.find((p) => p.an.includes(U_ADMIN))!
    expect([...anPlaner.an].sort()).toEqual([U_ADMIN, U_PLANER].sort())
    // Ohne den Hilfsdienst: Dort sucht die App selbst Ersatz.
    expect(anPlaner.body).toBe(
      `${ICH} — Dienstag, 8. September · 19:00: Bibellesung · ` +
        'Samstag, 12. September · 09:30 · Bei Familie A: Treffpunkt-Leiter · ' +
        'Dienstag, 15. September · 19:00: Bibellesung',
    )
    expect(anPlaner.titel(null)).toBe(TITEL_ABGESAGT)
    expect(anPlaner.url).toBe(`${APP}#go=mitteilungen`)
    expect(anPlaner.tag).toBe(K_LESUNG)
    // Die Gruppe erfährt nur von ihrem Treffpunkt — wie bei einer einzelnen Absage.
    const anGruppe = pushes.find((p) => p.an.includes(U_AUFSEHER))!
    expect([...anGruppe.an].sort()).toEqual([U_AUFSEHER, U_GEHILFE].sort())
    expect(anGruppe.body).toBe(`Treffpunkt-Leiter · Samstag, 12. September · 09:30 · Bei Familie A · ${ICH}`)
    expect(anGruppe.tag).toBe(K_GRUPPE)
    expect(pushes.flatMap((p) => p.an)).not.toContain(U_ICH)
  })

  it('der Sammel-Push kommt in der Sprache des Geräts an — jeder Termin und jede Aufgabe für sich übersetzt', async () => {
    await absagenAlle([K_LESUNG, K_LESUNG_2], U_ICH, 'bin verreist')
    const rumpf = pushes[0]!.rumpf
    expect(rumpf(makeTr('en'), 'en')).toBe(
      'Ich Selbst — Tuesday, September 8 · 19:00: Bible Reading · Tuesday, September 15 · 19:00: Bible Reading · bin verreist',
    )
    // Deutsch ohne die unsichtbaren Marken um Name und Nachricht.
    expect(rumpf(makeTr('de'), 'de')).toBe(
      'Ich Selbst — Dienstag, 8. September · 19:00: Bibellesung · Dienstag, 15. September · 19:00: Bibellesung · bin verreist',
    )
  })

  it('liest nur die Wochen der Plätze — weder davor noch danach', async () => {
    await absagenAlle([K_LESUNG, K_LESUNG_2])
    expect([...new Set(gelesen)].sort()).toEqual([MONTAG, WOCHE_2])
  })

  it('ein Platz, der nicht geht, fällt für sich heraus — die übrigen werden gemeldet, die Antwort nennt ihn', async () => {
    const res = await absagenAlle([K_LESUNG, K_FREMD, 'quatsch'])
    expect(await antwort(res)).toEqual({
      status: 200,
      body: {
        ok: true,
        gemeldet: 2,
        abgewiesen: [
          { taskKey: K_FREMD, error: 'not-assigned' },
          { taskKey: 'quatsch', error: 'bad-request' },
        ],
      },
    })
    expect(new Set(glocken.map((z) => z.task_key))).toEqual(new Set([K_LESUNG]))
    // Bleibt einer übrig, ist es die Meldung für einen.
    expect(pushes[0]!.body).toBe(`Bibellesung · Dienstag, 8. September · 19:00 · ${ICH}`)
  })

  it('geht keiner, antwortet die Function mit dem Grund des ersten — und schreibt nichts', async () => {
    expect(await antwort(await absagenAlle([K_FREMD, K_GRUPPE_FREMD]))).toEqual({ status: 403, body: { error: 'not-assigned' } })
    expect(await antwort(await absagenAlle([K_LESUNG, K_LESUNG_2], U_ICH, '', '2026-09-30'))).toEqual({
      status: 409,
      body: { error: 'past' },
    })
    expect(glocken).toEqual([])
    expect(pushes).toEqual([])
  })

  it('derselbe Platz zweimal zählt einmal', async () => {
    await absagenAlle([K_LESUNG, K_LESUNG])
    expect(glocken).toHaveLength(2)
    expect(pushes[0]!.body).toBe(`Bibellesung · Dienstag, 8. September · 19:00 · ${ICH}`)
  })

  it(`mehr als ${PLAETZE_MAX} Plätze nimmt die Function nicht an`, async () => {
    const zuViele = Array.from({ length: PLAETZE_MAX + 1 }, (_, i) => punktKey(MONTAG, 'mid', `k${i}`, 0))
    expect((await absagenAlle(zuViele)).status).toBe(400)
    expect(abfragen).toEqual([])
    // Gegenprobe: genau so viele gehen durch die Prüfung.
    expect((await absagenAlle(zuViele.slice(0, PLAETZE_MAX))).status).not.toBe(400)
  })
})

describe('absage: welche Plätze ein Aufruf nennt', () => {
  it('`taskKeys` — oder `taskKey` von einer App, die noch je Platz meldete', () => {
    expect(absageSchluessel({ taskKeys: [K_LESUNG, K_MIK] })).toEqual([K_LESUNG, K_MIK])
    expect(absageSchluessel({ taskKey: K_LESUNG })).toEqual([K_LESUNG])
    // Was kein Text ist, ist kein Schlüssel.
    expect(absageSchluessel({ taskKeys: [K_LESUNG, 7, null] })).toEqual([K_LESUNG])
    expect(absageSchluessel({ taskKey: 7 })).toEqual([])
    expect(absageSchluessel({})).toEqual([])
  })
})

describe('absage: was nicht geht — und nichts schreibt', () => {
  const nichtsGeschehen = () => {
    expect(glocken).toEqual([])
    expect(pushes).toEqual([])
  }

  it('für den Platz eines anderen absagen', async () => {
    expect(await antwort(await absagen(K_FREMD))).toEqual({ status: 403, body: { error: 'not-assigned' } })
    expect(await antwort(await absagen(K_GRUPPE_FREMD))).toEqual({ status: 403, body: { error: 'not-assigned' } })
    // Ohne Person-Id zählt der Name — ein fremder ist nicht meiner.
    expect(await antwort(await absagen(K_VETTER))).toEqual({ status: 403, body: { error: 'not-assigned' } })
    nichtsGeschehen()
  })

  it('ohne Mitgliedschaft oder ohne eigene Person', async () => {
    expect(await antwort(await absagen(K_LESUNG, U_FREMD))).toEqual({ status: 403, body: { error: 'forbidden' } })
    expect(await antwort(await absagen(K_LESUNG, U_OHNE))).toEqual({ status: 403, body: { error: 'not-assigned' } })
    nichtsGeschehen()
  })

  it('ein Schlüssel, der keiner ist, kein Schlüssel oder ein Platz, den es nicht gibt', async () => {
    expect((await absagen('quatsch')).status).toBe(400)
    expect((await absagenAlle([])).status).toBe(400)
    expect(await antwort(await absagen(punktKey(MONTAG, 'mid', 'gibt-es-nicht', 0)))).toEqual({ status: 404, body: { error: 'slot-not-found' } })
    expect(await antwort(await absagen(punktKey('2026-09-28', 'mid', 'k3', 0)))).toEqual({ status: 404, body: { error: 'slot-not-found' } })
    expect(await antwort(await absagen(fsKey(MONTAG, 'r9')))).toEqual({ status: 404, body: { error: 'slot-not-found' } })
    nichtsGeschehen()
  })

  it('eine ausgefallene Zusammenkunft', async () => {
    woche.dev = { mid: { cancelled: true } }
    expect(await antwort(await absagen(K_LESUNG))).toEqual({ status: 409, body: { error: 'meeting-cancelled' } })
    nichtsGeschehen()
  })

  it('ein Termin, der vorbei ist — am Tag selbst geht es noch', async () => {
    expect(await antwort(await absagen(K_LESUNG, U_ICH, '', '2026-09-09'))).toEqual({ status: 409, body: { error: 'past' } })
    nichtsGeschehen()
    expect((await absagen(K_LESUNG, U_ICH, '', '2026-09-08')).status).toBe(200)
  })

  it('nach einem Wechsel der Regelzeit zählt der Tag dieser Woche — bei „vorbei" und im Text', async () => {
    // Seit dieser Woche am Donnerstag: Am Mittwoch ist die Zusammenkunft noch
    // nicht vorbei — nach dem alten Dienstag wäre sie es (Fall darüber).
    zeitenAb = [{ ab: MONTAG, tab: 'mid', wd: 4, time: '19:30' }]
    expect((await absagen(K_LESUNG, U_ICH, '', '2026-09-09')).status).toBe(200)
    expect(pushes[0]!.body).toBe(`Bibellesung · Donnerstag, 10. September · 19:30 · ${ICH}`)
  })

  it('Gegenprobe: Ein Wechsel erst ab der nächsten Woche lässt diese beim Dienstag', async () => {
    zeitenAb = [{ ab: '2026-09-14', tab: 'mid', wd: 4, time: '19:30' }]
    expect(await antwort(await absagen(K_LESUNG, U_ICH, '', '2026-09-09'))).toEqual({ status: 409, body: { error: 'past' } })
  })

  it('nimmt die Glocke nichts an, meldet der Aufruf den Fehler — und schickt keinen Push ohne Zeile', async () => {
    glockeKaputt = true
    expect((await absagen(K_LESUNG)).status).toBe(500)
    nichtsGeschehen()
  })

  it('die Versammlung kommt aus der eigenen Mitgliedszeile — jede Abfrage ist auf sie begrenzt', async () => {
    await absagen(K_GRUPPE)
    await absagenAlle([K_LESUNG, K_LESUNG_2])
    const ohneGrenze = abfragen.filter((p) => !p.startsWith('members?select=person_id') && filterWert(p, 'congregation_id') !== CONG && filterWert(p, 'id') !== CONG)
    expect(ohneGrenze).toEqual([])
  })
})

describe('absage: der Titel', () => {
  it('ist in der Glocke der, den die App übersetzt — und im Push je Sprache derselbe Wortlaut wie dort', async () => {
    expect(NOTIF_TITLE_KEY[TITEL_ABGESAGT]).toBe('notifVerhindert')
    for (const { code } of APP_LANGS) {
      await loadOverlay(code)
      expect(substituteTexte(code).abgesagt, code).toBe(dict(code).notifVerhindert)
    }
    // Positivkontrolle: Es wird wirklich übersetzt.
    expect(substituteTexte('fr').abgesagt).not.toBe(substituteTexte('de').abgesagt)
  })
})

/*
 * **Jede Absage einmal** (Gesamt-Review 14.11.2026): Bis dahin meldete jeder
 * Aufruf aufs Neue — wer die Function für seinen Platz wiederholt rief, schickte
 * allen, die planen, denselben Push noch einmal, beliebig oft. Gemessen wurde
 * das an der echten Logik: drei Aufrufe, sechs Zeilen, sechs Pushes.
 *
 * Seit wann die Absage gilt, steht in `absagen` (Trigger `absage_vermerken`,
 * gemessen in `supabase/absage-einmal.test.ts`); die Attrappe führt es in
 * `vermerkt`.
 */
describe('absage: jede Absage geht einmal hinaus', () => {
  /** Die Absage gilt seit `min` Minuten — die App hat die Zusage geschrieben. */
  const abgesagtVor = (min: number, key = K_LESUNG) =>
    vermerkt.push({ task_key: key, person_id: 'p-ich', created_at: vorMinuten(min) })

  it('ein zweiter Aufruf für dieselbe Absage schreibt keine Zeile und schickt keinen Push — und ist kein Fehler', async () => {
    abgesagtVor(1)
    await absagen(K_LESUNG)
    expect(glocken).toHaveLength(2)
    expect(pushes).toHaveLength(1)
    uhr += 3 * 60e3
    expect(await antwort(await absagen(K_LESUNG))).toEqual({
      status: 200,
      body: { ok: true, gemeldet: 0, schonGemeldet: [K_LESUNG] },
    })
    uhr += 60 * 60e3
    await absagen(K_LESUNG)
    expect(glocken).toHaveLength(2)
    expect(pushes).toHaveLength(1)
  })

  it('Gegenprobe: zurückgenommen und neu abgesagt ist eine neue Absage — sie geht wieder hinaus', async () => {
    abgesagtVor(1)
    await absagen(K_LESUNG)
    // „Doch bestätigen", dann wieder „Ich kann nicht": Der Vermerk beginnt neu.
    uhr += 5 * 60e3
    vermerkt = []
    abgesagtVor(0)
    uhr += 1000
    expect(await antwort(await absagen(K_LESUNG))).toEqual({ status: 200, body: { ok: true, gemeldet: 2 } })
    expect(glocken).toHaveLength(4)
    expect(pushes).toHaveLength(2)
  })

  it('die Meldung über den Vorgänger am selben Platz hält die eigene nicht auf', async () => {
    // Ein anderer hatte den Platz und sagte vor einer Stunde ab; der Planer gab ihn mir.
    glockeMitZeit.push({
      congregation_id: CONG, user_id: U_ADMIN, type: 'verhindert', title: TITEL_ABGESAGT,
      body: 'Bibellesung — Vorgänger', task_key: K_LESUNG, created_at: vorMinuten(60),
    })
    abgesagtVor(1)
    expect(await antwort(await absagen(K_LESUNG))).toEqual({ status: 200, body: { ok: true, gemeldet: 2 } })
    expect(pushes).toHaveLength(1)
  })

  it('ohne Vermerk — die Zusage der App ist noch unterwegs — wird gemeldet, ein Aufruf gleich danach aber nicht', async () => {
    await absagen(K_LESUNG)
    expect(pushes).toHaveLength(1)
    uhr += 5 * 60e3
    await absagen(K_LESUNG)
    expect(pushes).toHaveLength(1)
    // Wer die Zusage nie schreibt, kommt erst nach zehn Minuten wieder durch.
    uhr += (OHNE_VERMERK_MINUTEN - 5) * 60e3 + 1000
    await absagen(K_LESUNG)
    expect(pushes).toHaveLength(2)
  })

  it('aus einer Abwesenheit: nur der Platz, der noch nicht gemeldet ist — als Meldung für einen', async () => {
    abgesagtVor(2)
    await absagen(K_LESUNG)
    abgesagtVor(0, K_LESUNG_2)
    uhr += 60e3
    expect(await antwort(await absagenAlle([K_LESUNG, K_LESUNG_2]))).toEqual({
      status: 200,
      body: { ok: true, gemeldet: 2, schonGemeldet: [K_LESUNG] },
    })
    expect(glocken.filter((z) => z.task_key === K_LESUNG)).toHaveLength(2)
    expect(glocken.filter((z) => z.task_key === K_LESUNG_2)).toHaveLength(2)
    expect(pushes).toHaveLength(2)
    expect(pushes[1]!.body).toBe(`Bibellesung · Dienstag, 15. September · 19:00 · ${ICH}`)
  })

  it('mehrere Plätze, verschieden lange abgesagt: Jeder zählt nur Meldungen seit seiner eigenen Absage', async () => {
    // Die Lesung sagte ich vor einer Stunde ab, gemeldet ist sie seitdem.
    abgesagtVor(60)
    uhr -= 59 * 60e3
    await absagen(K_LESUNG)
    uhr += 59 * 60e3
    // Den Platz der Woche danach hatte vor einer halben Stunde ein anderer, der absagte;
    // seit einer Minute ist er meiner, und ich sage ab.
    glockeMitZeit.push({
      congregation_id: CONG, user_id: U_ADMIN, type: 'verhindert', title: TITEL_ABGESAGT,
      body: 'Bibellesung — Vorgänger', task_key: K_LESUNG_2, created_at: vorMinuten(30),
    })
    abgesagtVor(1, K_LESUNG_2)
    expect(await antwort(await absagenAlle([K_LESUNG, K_LESUNG_2]))).toEqual({
      status: 200,
      body: { ok: true, gemeldet: 2, schonGemeldet: [K_LESUNG] },
    })
    expect(glocken.filter((z) => z.task_key === K_LESUNG_2)).toHaveLength(2)
  })

  it('die eigene Absage zählt, nicht die eines anderen am selben Platz — gefragt wird mit der eigenen Person', async () => {
    vermerkt.push({ task_key: K_LESUNG, person_id: 'p-x', created_at: vorMinuten(30) })
    await absagen(K_LESUNG)
    expect(abfragen.find((p) => p.startsWith('absagen'))).toContain('person_id=eq.p-ich')
  })

  it('lässt sich nicht lesen, ob schon gemeldet ist, wird gemeldet — eine Meldung zu viel statt einer, die fehlt', async () => {
    abgesagtVor(1)
    await absagen(K_LESUNG)
    lesenKaputt = true
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      uhr += 60e3
      expect((await absagen(K_LESUNG)).status).toBe(200)
      expect(pushes).toHaveLength(2)
      expect(fehler).toHaveBeenCalledWith('substitute/absage: schon gemeldet?', 'absagen nicht lesbar')
    } finally {
      fehler.mockRestore()
    }
  })
})
