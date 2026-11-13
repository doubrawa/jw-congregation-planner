/*
 * Die Edge Function `substitute`, Aufruf 'absage' (`absage.ts`): eine Absage
 * denen melden, die planen (13.11.2026).
 *
 * „Der Planer erfährt es sofort", verspricht das Blatt beim Absagen. Bis dahin
 * stand die Absage nur in der Glocke von Admin und Planern — ohne Push, und wer
 * als Gruppenaufseher den Treffpunkt geplant hatte, erfuhr nichts. Geprüft wird
 * hier, **wer** es erfährt und auf welchem Weg, und vor allem, was nicht gehen
 * darf: Die Function schreibt mit der Service-Role in fremde Glocken — im
 * Namen eines anderen absagen oder beliebige Leute anschreiben darf niemand.
 *
 * Der REST-Zugang ist eine Attrappe des `Rest`-Vertrags (`_shared/rest.ts`),
 * die Filter wirklich auswertet; das Zustellen fängt ein Mitschreiber ab.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { APP_LANGS } from '../../../src/i18n/langs'
import { dict, loadOverlay, NOTIF_TITLE_KEY } from '../../../src/i18n/ui'
import { fsKey, helferKey, punktKey } from '../_shared/aufgaben-schluessel.ts'
import { alsFreitext } from '../_shared/i18n/freitext.ts'
import type { Rest } from '../_shared/rest.ts'
import type { FsInstance, SubscriptionRow, Week } from '../_shared/zuteilungen.ts'
import { absageMelden, NACHRICHT_MAX } from '../substitute/absage.ts'
import { substituteTexte, TITEL_ABGESAGT } from '../substitute/texte.ts'
import { filterWert, nurSpalten } from './attrappe.ts'

const CONG = 'cong-1'
const MONTAG = '2026-09-07' // Dienstag 8.9., Samstag 12.9., Sonntag 13.9.
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
const K_FREMD = punktKey(MONTAG, 'mid', 'k2', 0) // der eines anderen
const K_OHNE_ID = punktKey(MONTAG, 'mid', 'k4', 0) // steht nur mit meinem Namen da (Altbestand)
const K_VETTER = punktKey(MONTAG, 'mid', 'k5', 0) // ein fremder Name ohne Person-Id
const K_MIK = helferKey(MONTAG, 'mid', 'mik', 0) // mein Hilfsdienst
const K_GRUPPE = fsKey(MONTAG, 'r1') // mein Treffpunkt der Gruppe 1
const K_VERSAMMLUNG = fsKey(MONTAG, 'r2') // mein Versammlungstreffpunkt
const K_GRUPPE_FREMD = fsKey(MONTAG, 'r3') // der Treffpunkt eines anderen

function frischeWoche(): Week {
  return {
    start: MONTAG,
    mid: {
      date: '7.–13. September',
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
    we: { date: '7.–13. September', sections: [], helpers: {} },
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

interface Push {
  an: string[]
  titel: (lang: string | null) => string
  body: string
  url: string
  tag?: string
}

let woche: Week
let glocken: Glockenzeile[]
let pushes: Push[]
let abfragen: string[]
/** Die Glocke nimmt nichts an (Datenbank weg). */
let glockeKaputt: boolean
/** Die Wechsel der Regelzeit (`congregations.zeiten_ab`) — ohne Angabe keiner. */
let zeitenAb: Array<{ ab: string; tab: 'mid' | 'we'; wd: number; time: string }>

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
      rows = filterWert(path, 'start') === MONTAG ? [{ data: JSON.parse(JSON.stringify(woche)) as Week }] : []
    } else if (path.startsWith('fs_weeks')) {
      rows = filterWert(path, 'start') === MONTAG ? [{ data: TREFFPUNKTE }] : []
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
    return (body as Glockenzeile[]).map((_, i) => ({ id: `n${i}` })) as T[]
  },
  async userId(): Promise<string | null> {
    return null
  },
}

const zustellen = async (subs: SubscriptionRow[], titel: (lang: string | null) => string, body: string, url: string, tag?: string) => {
  pushes.push({ an: subs.map((s) => s.user_id), titel, body, url, tag })
}

beforeEach(() => {
  woche = frischeWoche()
  glocken = []
  pushes = []
  abfragen = []
  glockeKaputt = false
  zeitenAb = []
})

const absagen = (taskKey: string, wer = U_ICH, nachricht = '', heute = HEUTE) =>
  absageMelden(rest, wer, { taskKey, nachricht, heute, appUrl: APP }, zustellen)
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
    expect(push.titel('en')).toBe('Assignment declined')
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
    glocken = []
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

  it('ein Schlüssel, der keiner ist, oder ein Platz, den es nicht gibt', async () => {
    expect((await absagen('quatsch')).status).toBe(400)
    expect(await antwort(await absagen(punktKey(MONTAG, 'mid', 'gibt-es-nicht', 0)))).toEqual({ status: 404, body: { error: 'slot-not-found' } })
    expect(await antwort(await absagen(punktKey('2026-09-14', 'mid', 'k3', 0)))).toEqual({ status: 404, body: { error: 'slot-not-found' } })
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
    await absagen(K_LESUNG)
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
