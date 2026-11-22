/*
 * Tests des Kalender-Abos — `_shared/kalender.ts` und die Edge Function
 * `kalender`.
 *
 * Das Abo bringt die eigenen Aufgaben in den Kalender des Handys, und zwar
 * ohne Anmeldung: Der geheime Link ist der Ausweis. Zwei Fehlerarten kosten
 * hier etwas:
 *
 *  - **zu viel im Kalender**: ein Entwurf, den der Planer noch umstellt (nicht
 *    gesendet), eine Absage, eine ausgefallene Zusammenkunft, der Platz eines
 *    Namensvetters — oder ein Link, der einem anderen Kalender etwas zeigt.
 *  - **zu wenig im Kalender**: eine gesendete oder zugesagte Aufgabe fehlt,
 *    oder die Kalender-App liest den Text nicht (Zeilen zu lang, ein Komma im
 *    Ort zerlegt den Wert, eine falsche Stunde).
 *
 * Aufbau des zweiten Teils wie `trolley.test.ts`: die echte index.ts wird
 * geladen (`Deno` als Global), `fetch` stellt Anmeldung und REST nach und
 * wertet die Filter aus — eine Attrappe, die alles zurückgibt, sähe einen
 * verlorenen Filter nicht.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { pruefsumme } from '../_shared/anmeldung.ts'
import { fsKey, helferKey, punktKey } from '../_shared/aufgaben-schluessel.ts'
import {
  eigenePlaetze,
  type KalenderTermin,
  kalenderGefaltet,
  kalenderMaskiert,
  kalenderTermine,
  kalenderText,
  type PlatzDaten,
} from '../_shared/kalender.ts'
import { STANDARD_ZEITEN } from '../_shared/planung.ts'
import { type FsInstance, type ServiceRow, tagebuchSchluessel, uebersetzerFuer, type Week } from '../_shared/zuteilungen.ts'
import { kalenderTexte } from '../kalender/texte.ts'
import { filterWert, jsonRes, nurSpalten, ohneFragment } from './attrappe.ts'

/* ---- Fixture ------------------------------------------------------------- */

const CONG = 'cong-1'
const SIMON = { id: 'p-simon', name: 'Simon Krüger' }
const W1 = '2026-09-07' // Dienstag 8.9., Sonntag 13.9.
const W2 = '2026-09-14'
const W3 = '2026-09-21'

const DIENSTE: ServiceRow[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Eine Zusammenkunft mit Bibellesung, einem Gespräch (Jonas) und den Mikrofonen (vorgegeben: Simon). */
function mitte(
  bibellesung: { name: string; pid?: string },
  mik: { name: string; pid?: string } = { name: 'Simon Krüger', pid: 'p-simon' },
): NonNullable<Week['mid']> {
  return {
    sections: [
      {
        label: 'SCHÄTZE AUS GOTTES WORT',
        items: [
          { iid: 'i3', num: 3, title: 'Bibellesung', names: [bibellesung] },
          { iid: 'i4', title: 'Gespräche beginnen', names: [{ name: 'Jonas Berger', pid: 'p-jonas' }] },
        ],
      },
    ],
    helpers: { mik: [mik, null] },
  } as NonNullable<Week['mid']>
}

/** Am Wochenende hat Simon die Mikrofone — ohne Id, nur mit Namen (Altdaten). */
const wochenende = (): NonNullable<Week['we']> => ({ sections: [], helpers: { mik: [{ name: 'Simon Krüger' }, null] } })

const WOCHEN: { start: string; data: Week }[] = [
  { start: W1, data: { mid: mitte({ name: 'Simon Krüger', pid: 'p-simon' }), we: wochenende() } },
  // Woche 2: die Wochenmitte fällt aus (Kongress) — auch Gesendetes kommt nicht.
  { start: W2, data: { mid: mitte({ name: 'Simon Krüger', pid: 'p-simon' }), we: { sections: [], helpers: {} }, dev: { mid: { cancelled: true } } } },
  // Woche 3: Ein Namensvetter mit anderer Id hat die Bibellesung — nicht Simons Platz.
  {
    start: W3,
    data: { mid: mitte({ name: 'Simon Krüger', pid: 'p-simon-2' }, { name: 'Jonas Berger', pid: 'p-jonas' }), we: { sections: [], helpers: {} } },
  },
]

const TREFFPUNKTE: { start: string; data: FsInstance[] }[] = [
  {
    start: W1,
    data: [
      { id: 'r1', wd: 3, time: '09:30', place: 'Königreichssaal', leader: 'Simon Krüger', lpid: 'p-simon' },
      // Auswärtiger Leiter (Freitext): gehört niemandem aus der Versammlung.
      { id: 'r2', wd: 6, time: '10:00', place: 'Bei Familie Albrecht, Gruppe 1', leader: 'Simon Krüger', lext: true },
    ],
  },
]

const daten = (patch: Partial<PlatzDaten> = {}): PlatzDaten => ({
  person: SIMON,
  wochen: WOCHEN,
  treffpunkte: TREFFPUNKTE,
  dienste: DIENSTE,
  zeiten: STANDARD_ZEITEN,
  saal: 'Hauptstraße 12, Musterstadt',
  ab: '2026-09-01',
  ...patch,
})

const BIBEL_W1 = punktKey(W1, 'mid', 'i3', 0)
const MIK_W1_MITTE = helferKey(W1, 'mid', 'mik', 0)
const MIK_W1_ENDE = helferKey(W1, 'we', 'mik', 0)
const LEITUNG_W1 = fsKey(W1, 'r1')
const BIBEL_W2 = punktKey(W2, 'mid', 'i3', 0)

/* ---- Teil 1: welche Plätze, welche Termine ------------------------------- */

describe('Die eigenen Plätze', () => {
  it('Programm, Hilfsdienste und Treffpunkt-Leitung — über die Person-Id, ohne Id über den Namen', () => {
    const p = eigenePlaetze(daten())
    expect(p.map((x) => x.key)).toEqual([BIBEL_W1, MIK_W1_MITTE, MIK_W1_ENDE, LEITUNG_W1])
    const bibel = p.find((x) => x.key === BIBEL_W1)!
    expect(bibel).toMatchObject({ tag: '2026-09-08', von: '19:00', bis: '20:45', titel: 'Bibellesung', ort: 'Hauptstraße 12, Musterstadt', art: 'zusammenkunft' })
    expect(p.find((x) => x.key === MIK_W1_ENDE)).toMatchObject({ tag: '2026-09-13', von: '10:00', bis: '11:45', titel: 'Mikrofone' })
    expect(p.find((x) => x.key === LEITUNG_W1)).toMatchObject({ tag: '2026-09-09', von: '09:30', bis: '10:30', ort: 'Königreichssaal', art: 'treffpunkt' })
  })

  it('nicht der Platz eines Namensvetters mit eigener Id — und nicht eine auswärtige Leitung unter demselben Namen', () => {
    const keys = eigenePlaetze(daten()).map((x) => x.key)
    expect(keys).not.toContain(punktKey(W3, 'mid', 'i3', 0))
    expect(keys).not.toContain(fsKey(W1, 'r2'))
    // Gegenprobe: Mit der Id des Namensvetters gehört ihm der Platz.
    expect(eigenePlaetze(daten({ person: { id: 'p-simon-2', name: 'Simon Krüger' } })).map((x) => x.key)).toContain(
      punktKey(W3, 'mid', 'i3', 0),
    )
  })

  it('eine ausgefallene Zusammenkunft bringt keinen Platz — die Woche daneben schon', () => {
    const keys = eigenePlaetze(daten()).map((x) => x.key)
    expect(keys).not.toContain(BIBEL_W2)
    // Gegenprobe: ohne den Ausfall steht sie da.
    const ohneAusfall = WOCHEN.map((w) => (w.start === W2 ? { ...w, data: { ...w.data, dev: undefined } } : w))
    expect(eigenePlaetze(daten({ wochen: ohneAusfall })).map((x) => x.key)).toContain(BIBEL_W2)
  })

  it('eine verlegte Zusammenkunft steht an ihrem neuen Tag und zu ihrer neuen Zeit', () => {
    const verlegt = [{ start: W1, data: { ...WOCHEN[0]!.data, dev: { mid: { wd: 4, time: '18:30' } } } }]
    expect(eigenePlaetze(daten({ wochen: verlegt })).find((x) => x.key === BIBEL_W1)).toMatchObject({
      tag: '2026-09-10',
      von: '18:30',
      bis: '20:15',
    })
  })

  it('nichts vor dem ersten Tag des Kalenders', () => {
    expect(eigenePlaetze(daten({ ab: '2026-09-10' })).map((x) => x.key)).toEqual([MIK_W1_ENDE])
  })
})

describe('Was davon in den Kalender kommt', () => {
  const plaetze = eigenePlaetze(daten())
  const gesendet = (...keys: string[]) => new Set(keys.map((k) => tagebuchSchluessel(k, 'Simon Krüger')))
  const TROLLEY = { id: 'r9', datum: '2026-09-19', von: '09:00:00', bis: '11:00:00', name: 'Trolley 3', ort: 'Königreichssaal', hinweis: 'Schlüssel im Fach' }

  it('gesendet heißt „offen", zugesagt heißt „bestätigt" — auch ohne Tagebuch', () => {
    const t = kalenderTermine(plaetze, { zusagen: new Map([[MIK_W1_ENDE, 'bestätigt']]), gesendet: gesendet(BIBEL_W1) }, [], '2026-09-01')
    expect(t.map((x) => [x.uid, x.zusage])).toEqual([
      [BIBEL_W1, 'offen'],
      [MIK_W1_ENDE, 'bestätigt'],
    ])
  })

  it('ein Entwurf (nicht gesendet, nicht zugesagt) kommt nicht — eine Absage auch gesendet nicht', () => {
    const t = kalenderTermine(
      plaetze,
      { zusagen: new Map([[MIK_W1_MITTE, 'verhindert']]), gesendet: gesendet(MIK_W1_MITTE) },
      [],
      '2026-09-01',
    )
    expect(t).toEqual([])
  })

  it('Trolley-Schichten stehen ohne Zusage darin, ab dem ersten Tag, mit Uhrzeit ohne Sekunden', () => {
    const t = kalenderTermine([], { zusagen: new Map(), gesendet: new Set() }, [TROLLEY, { ...TROLLEY, id: 'r0', datum: '2026-08-01' }], '2026-09-01')
    expect(t).toEqual([
      { uid: 'trolley|r9', tag: '2026-09-19', von: '09:00', bis: '11:00', titel: 'Trolley 3', ort: 'Königreichssaal', art: 'trolley', zusage: null, hinweis: 'Schlüssel im Fach' },
    ])
  })

  it('nach Tag und Uhrzeit', () => {
    const t = kalenderTermine(plaetze, { zusagen: new Map(), gesendet: gesendet(LEITUNG_W1, MIK_W1_ENDE, BIBEL_W1) }, [TROLLEY], '2026-09-01')
    expect(t.map((x) => `${x.tag} ${x.von}`)).toEqual(['2026-09-08 19:00', '2026-09-09 09:30', '2026-09-13 10:00', '2026-09-19 09:00'])
  })
})

/* ---- Teil 2: der Text ---------------------------------------------------- */

/** Den gefalteten Text wieder auffalten (RFC 5545, 3.1). */
const aufgefaltet = (text: string): string[] => text.replace(/\r\n /g, '').split('\r\n').filter(Boolean)

describe('Der Kalendertext', () => {
  const termin = (patch: Partial<KalenderTermin> = {}): KalenderTermin => ({
    uid: BIBEL_W1,
    tag: '2026-09-08',
    von: '19:00',
    bis: '20:45',
    titel: 'Bibellesung',
    ort: 'Hauptstraße 12, Musterstadt',
    art: 'zusammenkunft',
    zusage: 'offen',
    ...patch,
  })
  const beschriftung = { name: 'Versammlung.app · Meine Aufgaben', titel: (t: KalenderTermin) => t.titel, notiz: () => 'Noch nicht bestätigt; bitte in der App.', url: 'https://app.test/#go=aufgaben' }
  const JETZT = new Date('2026-09-07T08:00:00Z')

  it('mit Zeitzone, ganzer Zusammenkunft, Zusage als Stand und einer Kennung, die über Abrufe gleich bleibt', () => {
    const zeilen = aufgefaltet(kalenderText([termin()], beschriftung, JETZT))
    expect(zeilen[0]).toBe('BEGIN:VCALENDAR')
    expect(zeilen.at(-1)).toBe('END:VCALENDAR')
    expect(zeilen).toContain('BEGIN:VTIMEZONE')
    expect(zeilen).toContain('TZID:Europe/Berlin')
    expect(zeilen).toContain('DTSTART;TZID=Europe/Berlin:20260908T190000')
    expect(zeilen).toContain('DTEND;TZID=Europe/Berlin:20260908T204500')
    expect(zeilen).toContain('DTSTAMP:20260907T080000Z')
    expect(zeilen).toContain(`UID:${BIBEL_W1}@versammlung.app`)
    expect(zeilen).toContain('STATUS:TENTATIVE')
    expect(zeilen).toContain('URL:https://app.test/#go=aufgaben')
    // Bestätigt wird CONFIRMED; ein Trolley hat gar keinen Stand.
    expect(aufgefaltet(kalenderText([termin({ zusage: 'bestätigt' })], beschriftung, JETZT))).toContain('STATUS:CONFIRMED')
    expect(aufgefaltet(kalenderText([termin({ zusage: null, art: 'trolley' })], beschriftung, JETZT)).some((z) => z.startsWith('STATUS'))).toBe(false)
  })

  it('Komma, Semikolon und Gegenschrägstrich im Text sind maskiert — der Ort bleibt ein Wert', () => {
    const zeilen = aufgefaltet(kalenderText([termin()], beschriftung, JETZT))
    expect(zeilen).toContain('LOCATION:Hauptstraße 12\\, Musterstadt')
    expect(zeilen).toContain('DESCRIPTION:Noch nicht bestätigt\\; bitte in der App.')
    expect(kalenderMaskiert('a\\b\nc')).toBe('a\\\\b\\nc')
  })

  it('jede Zeile höchstens 75 Byte, mit CRLF — und nie mitten in einem Zeichen gefaltet', () => {
    const lang = 'Чтение Библии и обсуждение — '.repeat(6)
    const text = kalenderText([termin({ titel: lang })], beschriftung, JETZT)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false)
    for (const zeile of text.split('\r\n')) expect(new TextEncoder().encode(zeile).length, zeile).toBeLessThanOrEqual(75)
    // Kein Ersatzzeichen: Jedes Stück ist für sich gültiges UTF-8, und aufgefaltet steht der Titel ganz da.
    expect(text.includes(String.fromCharCode(0xfffd))).toBe(false)
    expect(aufgefaltet(text)).toContain(`SUMMARY:${lang}`)
    // Gegenprobe der Faltung: eine kurze Zeile bleibt eine.
    expect(kalenderGefaltet('SUMMARY:Bibellesung')).toBe('SUMMARY:Bibellesung')
  })
})

/* ---- Teil 3: die Function ------------------------------------------------- */

const TOKEN = 'A'.repeat(43)

interface AboZeile {
  person_id: string
  congregation_id: string
  token_hash: string
  sprache: string
  erstellt_at: string
  abgerufen_at: string | null
}

const MEMBERS = [
  { user_id: 'u-simon', person_id: 'p-simon', congregation_id: CONG },
  { user_id: 'u-ohne-person', person_id: null, congregation_id: CONG },
]
const PERSONS = [
  { id: 'p-simon', fn: 'Simon', ln: 'Krüger', congregation_id: CONG },
  { id: 'p-jonas', fn: 'Jonas', ln: 'Berger', congregation_id: CONG },
]

let handler: (req: Request) => Promise<Response>
let authUser: string | null
let abos: AboZeile[]
let tagebuch: { task_key: string; name: string; congregation_id: string }[]
let zusagen: { task_key: string; status: string; congregation_id: string }[]
let geschrieben: { method: string; path: string; body: unknown }[]
let gelesen: string[]
/** Die Datenbank weist das Löschen eines Abos ab (503). */
let loeschenScheitert: boolean
/** Das Netz reißt beim Vermerk des Abrufs ab (`fetch` wirft). */
let vermerkWirft: boolean

/** Die Werte eines `spalte=in.("a","b")`-Filters — oder null. */
function inListe(path: string, spalte: string): string[] | null {
  const m = new RegExp(`[?&]${spalte}=in\\.([^&]*)`).exec(path)
  if (!m) return null
  return [...decodeURIComponent(m[1]!).matchAll(/"([^"]*)"/g)].map((t) => t[1]!)
}

const fakeFetch = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<Response> => {
  const url = ohneFragment(input)
  const method = init?.method ?? 'GET'
  if (url.includes('/auth/v1/user')) return authUser ? jsonRes({ id: authUser }) : new Response('unauthorized', { status: 401 })
  const path = url.slice(url.indexOf('/rest/v1/') + '/rest/v1/'.length)
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (method !== 'GET') geschrieben.push({ method, path, body })
  else gelesen.push(path)
  const cong = filterWert(path, 'congregation_id')

  if (path.startsWith('kalender_abos')) {
    if (method === 'DELETE' && loeschenScheitert) return new Response('kaputt', { status: 503 })
    if (method === 'PATCH' && vermerkWirft) throw new TypeError('Netz weg')
    if (method === 'POST') {
      for (const z of body as AboZeile[]) abos = [...abos.filter((a) => a.person_id !== z.person_id), z]
      return new Response(null, { status: 201 })
    }
    const hash = filterWert(path, 'token_hash')
    const person = filterWert(path, 'person_id')
    const treffer = abos.filter((a) => (hash === null || a.token_hash === hash) && (person === null || a.person_id === person))
    if (method === 'DELETE') abos = abos.filter((a) => !treffer.includes(a))
    if (method === 'PATCH') for (const a of treffer) Object.assign(a, body)
    return method === 'GET' ? jsonRes(nurSpalten(treffer, path)) : new Response(null, { status: 204 })
  }
  if (method !== 'GET') return new Response(null, { status: 204 })
  if (path.startsWith('members')) return jsonRes(nurSpalten(MEMBERS.filter((m) => m.user_id === filterWert(path, 'user_id')), path))
  if (path.startsWith('persons')) {
    return jsonRes(nurSpalten(PERSONS.filter((p) => p.id === filterWert(path, 'id') && p.congregation_id === cong), path))
  }
  if (path.startsWith('congregations')) {
    if (filterWert(path, 'id') !== CONG) return jsonRes([])
    return jsonRes([{ mid_wd: 2, mid_time: '19:00', we_wd: 0, we_time: '10:00', zeiten_ab: [], hall: 'Hauptstraße 12, Musterstadt' }])
  }
  if (cong !== CONG) return jsonRes([])
  if (path.startsWith('weeks')) return jsonRes(WOCHEN.filter((w) => w.start >= (filterWert(path, 'start', 'gte') ?? '')))
  if (path.startsWith('fs_weeks')) return jsonRes(TREFFPUNKTE)
  if (path.startsWith('services')) return jsonRes(DIENSTE)
  if (path.startsWith('trolley_termine')) {
    const oder = decodeURIComponent(/[?&]or=([^&]*)/.exec(path)?.[1] ?? '')
    const schicht = { id: 'r9', trolley_id: 'tr3', datum: '2026-09-19', von: '09:00:00', bis: '11:00:00', person_id: 'p-jonas', partner_id: 'p-simon' }
    return jsonRes(oder.includes(`partner_id.eq.${schicht.partner_id}`) ? [schicht] : [])
  }
  if (path.startsWith('trolleys')) return jsonRes([{ id: 'tr3', name: 'Trolley 3', ort: 'Königreichssaal', hinweis: '' }])
  if (path.startsWith('confirmations')) {
    const keys = inListe(path, 'task_key') ?? []
    return jsonRes(nurSpalten(zusagen.filter((z) => keys.includes(z.task_key) && z.congregation_id === cong), path))
  }
  if (path.startsWith('assignment_log')) {
    const keys = inListe(path, 'task_key') ?? []
    return jsonRes(nurSpalten(tagebuch.filter((z) => keys.includes(z.task_key) && z.congregation_id === cong), path))
  }
  return jsonRes([])
}

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>
  const env: Record<string, string> = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', APP_URL: 'https://app.test/' }
  g.Deno = { env: { get: (k: string) => env[k] }, serve: (h: (req: Request) => Promise<Response>) => (handler = h) }
  g.fetch = fakeFetch
  await import('../kalender/index.ts')
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-07T08:00:00Z'))
  authUser = 'u-simon'
  abos = [{ person_id: 'p-simon', congregation_id: CONG, token_hash: await pruefsumme(TOKEN), sprache: 'de', erstellt_at: '2026-09-01T10:00:00Z', abgerufen_at: null }]
  tagebuch = [
    { task_key: BIBEL_W1, name: 'Simon Krüger', congregation_id: CONG },
    { task_key: LEITUNG_W1, name: 'Simon Krüger', congregation_id: CONG },
  ]
  zusagen = [{ task_key: MIK_W1_ENDE, status: 'bestätigt', congregation_id: CONG }]
  geschrieben = []
  gelesen = []
  loeschenScheitert = false
  vermerkWirft = false
})

const abrufen = (token: string | null) => handler(new Request(`https://test.functions/kalender${token === null ? '' : `?t=${token}`}`))
const verwalten = (body: unknown, wer: string | null = authUser) => {
  authUser = wer
  return handler(new Request('https://test.functions/kalender', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify(body) }))
}

describe('Abrufen — der Link ist der Ausweis', () => {
  it('ohne Link, mit falsch geformtem und mit unbekanntem Link: 404, und gelesen wird nichts als die Prüfsumme', async () => {
    for (const t of [null, 'kurz', 'B'.repeat(43)]) {
      const res = await abrufen(t)
      expect(res.status, String(t)).toBe(404)
      expect(await res.text()).toBe('Not found')
    }
    expect(gelesen.every((p) => p.startsWith('kalender_abos'))).toBe(true)
    expect(geschrieben).toEqual([])
  })

  it('mit gültigem Link: der Kalender mit den gesendeten und zugesagten Aufgaben — ohne Entwurf, Absage, Ausfall und fremde Plätze', async () => {
    const res = await abrufen(TOKEN)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    const zeilen = aufgefaltet(await res.text())
    const uids = zeilen.filter((z) => z.startsWith('UID:'))
    expect(uids).toEqual([
      `UID:${BIBEL_W1}@versammlung.app`,
      `UID:${LEITUNG_W1}@versammlung.app`,
      `UID:${MIK_W1_ENDE}@versammlung.app`,
      'UID:trolley|r9@versammlung.app',
    ])
    // Die Mikrofone der Wochenmitte sind ein Entwurf: weder gesendet noch zugesagt.
    expect(uids.join()).not.toContain(MIK_W1_MITTE)
    expect(zeilen).toContain('X-WR-CALNAME:Versammlung.app · Meine Aufgaben')
    expect(zeilen).toContain('LOCATION:Hauptstraße 12\\, Musterstadt')
    // Die Notiz: wohin der Termin gehört, dann der Stand der Zusage. Die
    // Bibellesung trägt ihre Nummer, die Mikrofone keine, der Treffpunkt gehört
    // zu keiner Zusammenkunft.
    expect(zeilen).toContain('DESCRIPTION:Zusammenkunft unter der Woche · Punkt 3\\nNoch nicht bestätigt – bestätige es in der App.')
    expect(zeilen).toContain('DESCRIPTION:Zusammenkunft am Wochenende\\nBestätigt.')
    expect(zeilen).toContain('DESCRIPTION:Noch nicht bestätigt – bestätige es in der App.')
    // Keine Namen anderer: Jonas steht weder als Gesprächspartner noch als Trolley-Partner darin.
    expect(zeilen.join('\n')).not.toContain('Jonas')
  })

  it('jeder Abruf setzt den Zeitpunkt des letzten Abrufs — nur am eigenen Abo', async () => {
    await abrufen(TOKEN)
    expect(geschrieben).toEqual([{ method: 'PATCH', path: 'kalender_abos?person_id=eq.p-simon', body: { abgerufen_at: '2026-09-07T08:00:00.000Z' } }])
  })

  it('reißt beim Vermerk das Netz ab, bekommt die Kalender-App ihren Kalender trotzdem', async () => {
    vermerkWirft = true
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await abrufen(TOKEN)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('BEGIN:VEVENT')
      expect(fehler).toHaveBeenCalledWith('[kalender] abgerufen_at', 'Netz weg')
    } finally {
      fehler.mockRestore()
    }
  })

  it('Titel und Notizen in der Sprache des Abos — Positivkontrolle: der Übersetzer übersetzt hier wirklich', async () => {
    const tr = uebersetzerFuer()('ru')
    expect(tr('Bibellesung')).not.toBe('Bibellesung')
    abos[0]!.sprache = 'ru'
    const zeilen = aufgefaltet(await (await abrufen(TOKEN)).text())
    expect(zeilen).toContain(`SUMMARY:${tr('Bibellesung')}`)
    expect(zeilen).toContain('DESCRIPTION:Встреча в будние дни · Пункт 3\\nЕщё не подтверждено – подтвердите в приложении.')
    expect(zeilen).toContain(`X-WR-CALNAME:Versammlung.app · ${kalenderTexte('ru').meineAufgaben}`)
    // Der Name des Trolleys sind Daten — unübersetzt.
    expect(zeilen).toContain('SUMMARY:Trolley 3')
  })

  it('Zusagen und Tagebuch nur für die eigenen Plätze — beide Tabellen wachsen mit der ganzen Versammlung', async () => {
    await abrufen(TOKEN)
    for (const tabelle of ['confirmations', 'assignment_log']) {
      const abfrage = gelesen.filter((p) => p.startsWith(tabelle))
      expect(abfrage, tabelle).toHaveLength(1)
      expect(inListe(abfrage[0]!, 'task_key')?.sort()).toEqual([BIBEL_W1, LEITUNG_W1, MIK_W1_ENDE, MIK_W1_MITTE].sort())
    }
  })
})

describe('Verwalten — mit der Sitzung, die Person aus der Mitgliedszeile', () => {
  it('ohne Sitzung 401, ohne Person 403, ohne bekannte Aktion 400 — geschrieben wird nichts', async () => {
    expect((await verwalten({ aktion: 'ausstellen' }, null)).status).toBe(401)
    expect((await verwalten({ aktion: 'ausstellen' }, 'u-ohne-person')).status).toBe(403)
    expect((await verwalten({ aktion: 'loeschen' }, 'u-simon')).status).toBe(400)
    expect(geschrieben).toEqual([])
  })

  it('OPTIONS beantwortet die Vorfrage des Browsers', async () => {
    const res = await handler(new Request('https://test.functions/kalender', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('Ausstellen: ein neuer Link — gespeichert nur als Prüfsumme, der alte gilt nicht mehr', async () => {
    const res = await verwalten({ aktion: 'ausstellen', sprache: 'en', person_id: 'p-jonas' })
    const { url } = (await res.json()) as { url: string }
    const neu = new URL(url).searchParams.get('t')!
    expect(url.startsWith('https://test.supabase.co/functions/v1/kalender?t=')).toBe(true)
    expect(neu).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // Die Person aus der Mitgliedszeile, nicht aus dem Rumpf.
    expect(abos).toEqual([expect.objectContaining({ person_id: 'p-simon', token_hash: await pruefsumme(neu), sprache: 'en', abgerufen_at: null })])
    expect(JSON.stringify(abos)).not.toContain(neu)
    expect((await abrufen(TOKEN)).status).toBe(404)
    expect((await abrufen(neu)).status).toBe(200)
  })

  it('eine unbekannte Sprache wird Deutsch', async () => {
    await verwalten({ aktion: 'ausstellen', sprache: 'constructor' })
    expect(abos[0]!.sprache).toBe('de')
  })

  it('Stand: wann ausgestellt und wann zuletzt abgerufen — ohne Prüfsumme', async () => {
    const { abo } = (await (await verwalten({ aktion: 'stand' })).json()) as { abo: Record<string, unknown> }
    expect(abo).toEqual({ erstellt_at: '2026-09-01T10:00:00Z', abgerufen_at: null })
  })

  it('Beenden: Der Link gilt nicht mehr, und der Stand sagt „kein Abo"', async () => {
    expect(await (await verwalten({ aktion: 'beenden' })).json()).toEqual({ ok: true })
    expect(geschrieben).toEqual([{ method: 'DELETE', path: 'kalender_abos?person_id=eq.p-simon', body: undefined }])
    expect((await abrufen(TOKEN)).status).toBe(404)
    expect(await (await verwalten({ aktion: 'stand' })).json()).toEqual({ abo: null })
  })

  it('Beenden, das nicht durchkommt, meldet einen Fehler — denn der Link gilt dann weiter', async () => {
    loeschenScheitert = true
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await verwalten({ aktion: 'beenden' })
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'fehler' })
      expect((await abrufen(TOKEN)).status).toBe(200)
    } finally {
      fehler.mockRestore()
    }
  })
})
