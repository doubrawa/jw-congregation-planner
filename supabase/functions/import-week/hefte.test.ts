import { describe, expect, it } from 'vitest'
import { VERTEILUNG_WOCHEN } from '../../../src/data/aufbewahrung'
import { BASE, discoverWeeks, type Holen, RUECKBLICK_WOCHEN } from './hefte'

/**
 * **Ein Neuaufbau bringt ein Jahr Wochen mit** (18.10.2026).
 *
 * `versammlung-zuruecksetzen.mjs` leert `weeks`, und bis zu diesem Tag holte
 * die Wochensuche danach nur, was die drei Ausgaben ab der laufenden anboten.
 * Die Auswertung (T126) rechnet über ein Jahr — sie hätte nach dem Neuaufbau
 * monatelang nichts gezeigt, obwohl jw.org die Wochen weiter führt.
 *
 * Verteidigt wird hier, was die Suche dafür können muss, und was nicht
 * passieren darf:
 *  - eine Ausgabe finden, die der Index nicht mehr nennt (gemessen am
 *    18.10.2026: acht Einträge, der älteste November/Dezember 2025;
 *    `september-oktober-2025-mwb` antwortet trotzdem mit allen Wochenlinks);
 *  - nicht weiter zurück als bis zum Montag vor einem Jahr — so lange behält
 *    die App Wochen, Älteres räumte die Datenbank in der nächsten Nacht;
 *  - keine künftige Ausgabe raten, die noch nicht erschienen ist;
 *  - über den Jahreswechsel zählen (November/Dezember → Januar/Februar).
 *
 * Die Uhr steht in jedem Fall fest (`heute`). **Kein übernommener
 * jw.org-Inhalt:** Index und Ausgabenseiten tragen nur die gemessene Form der
 * Links, die Seitennamen sind aus dem Datum gebaut.
 */

const TAG = 864e5
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const ADRESSEN = ['januar-februar', 'maerz-april', 'mai-juni', 'juli-august', 'september-oktober', 'november-dezember']

/** Der Index, wie er am 18.10.2026 dastand: acht Ausgaben, die älteste November/Dezember 2025. */
const INDEX_18_10_2026 = [
  'november-dezember-2025-mwb', 'januar-februar-2026-mwb', 'maerz-april-2026-mwb', 'mai-juni-2026-mwb',
  'juli-august-2026-mwb', 'september-oktober-2026-mwb', 'november-dezember-2026-mwb', 'januar-februar-2027-mwb',
]

/** Der Seitenname einer Woche in den drei gemessenen Formen (siehe `wochen-slug.ts`). */
function wochenName(montag: Date): string {
  const sonntag = new Date(montag.getTime() + 6 * TAG)
  const [t1, m1, j1] = [montag.getUTCDate(), MONATE[montag.getUTCMonth()], montag.getUTCFullYear()]
  const [t2, m2, j2] = [sonntag.getUTCDate(), MONATE[sonntag.getUTCMonth()], sonntag.getUTCFullYear()]
  const spanne = j1 !== j2 ? `${t1}-${m1}-${j1}-${t2}-${m2}-${j2}` : m1 !== m2 ? `${t1}-${m1}-${t2}-${m2}-${j2}` : `${t1}-${t2}-${m1}-${j1}`
  return `Programm-für-die-Leben-und-Dienst-Zusammenkunft-${spanne}`
}

/**
 * Die Seite einer Ausgabe: je Woche, deren Montag in ihre zwei Monate fällt,
 * ein Link — prozentkodiert wie bei jw.org („f%C3%BCr").
 */
function ausgabenSeite(slug: string): string {
  const m = /^([a-z]+-[a-z]+)-(\d{4})-mwb$/.exec(slug)
  const paar = ADRESSEN.indexOf(m?.[1] ?? '')
  const jahr = Number(m?.[2])
  const links: string[] = []
  const tag = new Date(Date.UTC(jahr, 2 * paar, 1))
  while (tag.getUTCDay() !== 1) tag.setUTCDate(tag.getUTCDate() + 1)
  for (; tag.getUTCMonth() <= 2 * paar + 1 && tag.getUTCFullYear() === jahr; tag.setUTCDate(tag.getUTCDate() + 7)) {
    links.push(`<a href="${encodeURI(`/de/bibliothek/jw-arbeitsheft/${slug}/${wochenName(tag)}/`)}">Woche</a>`)
  }
  return `<html><body>${links.join('\n')}</body></html>`
}

/**
 * jw.org als Attrappe: Der Index nennt `index`, jede andere Ausgabe antwortet
 * auch — außer denen in `fehlt` (404 wie bei einer Seite, die es nicht gibt).
 */
function netz({ index = INDEX_18_10_2026, fehlt = [] as string[] } = {}) {
  const geholt: string[] = []
  const holen: Holen = (url) => {
    geholt.push(url)
    if (url === `${BASE}/de/bibliothek/jw-arbeitsheft/`) {
      return Promise.resolve(`<html><body>${index.map((s) => `<a href="/de/bibliothek/jw-arbeitsheft/${s}/">Ausgabe</a>`).join('\n')}</body></html>`)
    }
    const slug = /\/jw-arbeitsheft\/([a-z]+-[a-z]+-\d{4}-mwb)\/$/.exec(url)?.[1]
    if (slug && !fehlt.includes(slug)) return Promise.resolve(ausgabenSeite(slug))
    return Promise.reject(new Error(`HTTP 404 bei ${url}`))
  }
  /** Die Ausgaben, die angefragt wurden — ohne den Index. */
  const ausgaben = () => geholt.map((u) => /\/jw-arbeitsheft\/([^/]+)\/$/.exec(u)?.[1]).filter(Boolean)
  return { holen, ausgaben }
}

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`)
const starts = (wochen: { start: Date }[]) => wochen.map((w) => w.start.toISOString().slice(0, 10))

/** „Heute" — Sonntag, 18. Oktober 2026. Der Montag vor einem Jahr ist der 13. Oktober 2025. */
const HEUTE = new Date('2026-10-18T10:00:00Z')

describe('discoverWeeks: ein Jahr zurück', () => {
  it('die Woche ab dem Montag vor einem Jahr kommt aus einer Ausgabe, die der Index nicht mehr nennt', async () => {
    // So fragt `wochen-importieren.mjs --ab 2025-10-13`: nach der Woche davor.
    const { holen, ausgaben } = netz()
    const wochen = await discoverWeeks(holen, tag('2025-10-06'), HEUTE)
    expect(starts(wochen)[0]).toBe('2025-10-13')
    expect(wochen[0]?.url).toContain('/september-oktober-2025-mwb/')
    expect(ausgaben()).toEqual(['september-oktober-2025-mwb', 'november-dezember-2025-mwb', 'januar-februar-2026-mwb'])
  })

  it('die Kette läuft lückenlos weiter — über den Wechsel der Ausgaben hinweg', async () => {
    const { holen } = netz()
    const wochen = starts(await discoverWeeks(holen, tag('2025-10-06'), HEUTE))
    expect(wochen.slice(0, 5)).toEqual(['2025-10-13', '2025-10-20', '2025-10-27', '2025-11-03', '2025-11-10'])
  })

  it('über den Jahreswechsel folgt auf November/Dezember Januar/Februar des nächsten Jahres', async () => {
    const { holen, ausgaben } = netz()
    const wochen = starts(await discoverWeeks(holen, tag('2025-12-22'), HEUTE))
    expect(ausgaben()).toEqual(['november-dezember-2025-mwb', 'januar-februar-2026-mwb', 'maerz-april-2026-mwb'])
    // Die Woche über den Jahreswechsel steht in der alten Ausgabe, die nächste in der neuen.
    expect(wochen).toContain('2025-12-29')
    expect(wochen).toContain('2026-01-05')
  })

  it('schreibt die Ausgabe, wie jw.org: „maerz", nicht „märz"', async () => {
    // Im April 2026 reicht das Jahr bis März/April 2025 — eine Ausgabe, die
    // der Index längst nicht mehr nennt.
    const { holen, ausgaben } = netz()
    const wochen = await discoverWeeks(holen, tag('2025-04-14'), new Date('2026-04-20T10:00:00Z'))
    expect(ausgaben()[0]).toBe('maerz-april-2025-mwb')
    expect(starts(wochen)[0]).toBe('2025-04-21')
  })
})

describe('discoverWeeks: nicht weiter als ein Jahr', () => {
  it('Wochen vor dem Montag vor einem Jahr liefert sie nicht — auch nicht aus derselben Ausgabe', async () => {
    // September/Oktober 2025 beginnt am 1. September; die Frist ist der 13. Oktober.
    const { holen } = netz()
    const wochen = starts(await discoverWeeks(holen, tag('2025-08-25'), HEUTE))
    expect(wochen[0]).toBe('2025-10-13')
    expect(wochen.every((s) => s >= '2025-10-13')).toBe(true)
  })

  it('ältere Ausgaben fragt sie gar nicht erst an', async () => {
    const { holen, ausgaben } = netz()
    await discoverWeeks(holen, tag('2024-01-01'), HEUTE)
    expect(ausgaben()[0]).toBe('september-oktober-2025-mwb')
    expect(ausgaben().some((s) => s?.endsWith('-2024-mwb') || s === 'juli-august-2025-mwb')).toBe(false)
  })

  it('die Grenze ist dieselbe wie beim Laden der App (`VERTEILUNG_WOCHEN`)', () => {
    // Liefen sie auseinander, holte ein Neuaufbau, was die Datenbank in der
    // nächsten Nacht räumt — oder die Auswertung begänne mit einer Lücke.
    expect(RUECKBLICK_WOCHEN).toBe(VERTEILUNG_WOCHEN)
  })
})

describe('discoverWeeks: was der Index nicht nennt', () => {
  it('eine künftige Ausgabe, die er nicht nennt, ist noch nicht erschienen — sie wird nicht angefragt', async () => {
    // Nach der letzten Woche von November/Dezember 2026: Der Index reicht bis
    // Januar/Februar 2027, März/April 2027 gibt es noch nicht.
    const { holen, ausgaben } = netz()
    await discoverWeeks(holen, tag('2026-12-28'), HEUTE)
    expect(ausgaben()).toEqual(['november-dezember-2026-mwb', 'januar-februar-2027-mwb'])
  })

  it('fehlt eine vergangene bei jw.org, fehlen nur ihre Wochen — die übrigen kommen', async () => {
    // `wochen-importieren.mjs` sieht den Sprung und meldet ihn als Lücke.
    const { holen } = netz({ fehlt: ['september-oktober-2025-mwb'] })
    const wochen = starts(await discoverWeeks(holen, tag('2025-10-06'), HEUTE))
    expect(wochen[0]).toBe('2025-11-03')
  })

  it('fehlt eine, die der Index nennt, ist das ein Fehler — wie bisher', async () => {
    const { holen } = netz({ fehlt: ['november-dezember-2025-mwb'] })
    await expect(discoverWeeks(holen, tag('2025-10-06'), HEUTE)).rejects.toThrow(/404/)
  })
})

describe('discoverWeeks: der Alltag bleibt, wie er war', () => {
  it('ab heute: die drei Ausgaben ab der laufenden, nichts Vergangenes', async () => {
    const { holen, ausgaben } = netz()
    const wochen = starts(await discoverWeeks(holen, HEUTE, HEUTE))
    expect(ausgaben()).toEqual(['september-oktober-2026-mwb', 'november-dezember-2026-mwb', 'januar-februar-2027-mwb'])
    expect(wochen).toContain('2026-10-19')
  })

  it('am Sonntag, dem 1. März, gehört die laufende Woche noch zur Ausgabe Januar/Februar', async () => {
    /*
     * Bis zum 18.10.2026 zählte der heutige Monat, nicht die gefragte Woche:
     * Die App fragt nach der Vorwoche (16. Februar), die laufende begann am
     * 23. Februar — und die Ausgabe Januar/Februar fiel aus der Suche, weil
     * sie im Februar endet. „Holen" bekam dann schon den 2. März.
     */
    const { holen } = netz()
    const wochen = starts(await discoverWeeks(holen, tag('2026-02-16'), new Date('2026-03-01T10:00:00Z')))
    expect(wochen.find((s) => s > '2026-02-16')).toBe('2026-02-23')
  })

  it('ein unlesbares Datum findet keine Woche — und holt dafür nichts', async () => {
    const { holen, ausgaben } = netz()
    expect(await discoverWeeks(holen, new Date('kein-datum'), HEUTE)).toEqual([])
    expect(ausgaben()).toEqual([])
  })
})
