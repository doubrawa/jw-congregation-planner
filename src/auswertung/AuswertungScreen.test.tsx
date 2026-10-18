/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { deutschFinder, sichtbareTexte } from '../../tests/deutsch-erkennen'
import { fremdsprachigerBestand, type FremdBestand } from '../../tests/fremdsprachiger-bestand'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { datumsFormat, zeitspanne } from '../components/datum-anzeige'
import { abwesenheitenVon } from '../data/absence'
import { auswerten, ZEITRAEUME, type Zeitraum } from '../data/auswertung'
import { displayName } from '../data/helpers'
import { fromIso, tagNach } from '../data/meeting-dates'
import { allePlaetze, platzKey } from '../data/plaetze'
import { bereichVon } from '../data/planning'
import type { Absage, FsInstance, Lang, Week } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { AuswertungScreen } from './AuswertungScreen'
import { WarteBalken } from './Diagramme'
import { HINWEISE_SICHTBAR } from './Hinweise'

/**
 * **Die Auswertung, wie man sie sieht** (T126): am Handy der Überblick mit vier
 * Kacheln zu den Unteransichten, ab dem Tablet alles auf einer Seite. Was die
 * Zahlen bedeuten, prüft `data/auswertung.test.ts` — hier geht es darum, dass
 * die Seite zeigt, was die Rechnung ergibt, dass jeder Weg hinein auch wieder
 * hinausführt und dass kein deutsches Wort in einer fremden Sprache stehen
 * bleibt.
 */

const t = dict('de')

/** Montag, 12. Oktober 2026: Die vier Testwochen (7.9.–4.10.) liegen zurück. */
const MONTAG = '2026-10-12'
const UHR = new Date(2026, 9, 12, 9, 0)

const DEMO = demoZustand()

/**
 * `n` abgeschlossene Wochen vor dem 12. Oktober, reihum aus den vier Testwochen
 * — so reicht der Verlauf über das Vierteljahr hinaus, und die Wahl des
 * Zeitraums ändert etwas.
 */
function verlauf(n: number): { weeks: Week[]; fsWeeks: FsInstance[][] } {
  const weeks: Week[] = []
  const fsWeeks: FsInstance[][] = []
  for (let vor = n; vor >= 1; vor--) {
    const i = (n - vor) % DEMO.weeks.length
    weeks.push({ ...structuredClone(DEMO.weeks[i]!), start: tagNach(MONTAG, -7 * vor) })
    fsWeeks.push(structuredClone(DEMO.fsWeeks[i] ?? []))
  }
  return { weeks, fsWeeks }
}

const VERLAUF = verlauf(20)

/** Trifft die Abfrage zu? Ab dem Tablet alles auf einer Seite, ab dem Desktop mit der Tabelle. */
function breite(geraet: 'handy' | 'tablet' | 'desktop') {
  const passt: string[] = { handy: [], tablet: ['(min-width: 768px)'], desktop: ['(min-width: 768px)', '(min-width: 1180px)'] }[geraet]
  window.matchMedia = vi.fn((abfrage: string) => ({ matches: passt.includes(abfrage) })) as unknown as typeof window.matchMedia
}

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...DEMO,
    ...VERLAUF,
    screen: 'auswertung',
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    planner: true,
    ...over,
  }
}

function zeige(state: AppState) {
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AuswertungScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

/** Was die Rechnung für diesen Zustand ergibt — dieselben Eingaben wie die Seite. */
function rechnung(s: AppState, zeitraum: Zeitraum = 12) {
  return auswerten({
    weeks: s.weeks,
    fsWeeks: s.fsWeeks,
    persons: s.persons,
    services: s.services,
    groups: s.groups,
    abwesend: abwesenheitenVon(s.absences, s.weeks, s.congregation.times),
    absagen: s.absagen,
    heute: MONTAG,
    zeitraum,
  })
}

const titel = (c: HTMLElement) => c.querySelector('h1')?.textContent
const zeitraumZeile = (c: HTMLElement) => c.querySelector('.aw-zeitraum-zeile')?.textContent ?? ''
const knopf = (c: HTMLElement, text: string) => {
  const gefunden = [...c.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)
  if (!gefunden) throw new Error(`Kein Knopf „${text}"`)
  return gefunden
}
/** Der Knopf Zurück im Kopf einer Unteransicht — in jeder Sprache derselbe Ort. */
const zurueck = (c: HTMLElement) => fireEvent.click(c.querySelector('.unteransicht-kopf > button')!)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(UHR)
  breite('handy')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('Am Handy: der Überblick', () => {
  it('oben der Zeitraum — zwölf, sechs oder drei Monate, zwölf gewählt — und was er umfasst', () => {
    const { container } = zeige(zustand())
    expect(titel(container)).toBe(t.navAuswertung)
    const wahl = container.querySelector(`[role="group"][aria-label="${t.awZeitraum}"]`)!
    expect([...wahl.querySelectorAll('button')].map((b) => b.textContent)).toEqual(ZEITRAEUME.map((m) => zeitspanne(m, 'month', 'de')))
    expect(wahl.querySelector('[aria-pressed="true"]')?.textContent).toBe(zeitspanne(12, 'month', 'de'))
    const a = rechnung(zustand())
    expect(zeitraumZeile(container)).toContain(zeitspanne(20, 'week', 'de'))
    expect(zeitraumZeile(container)).toContain(`Zusammenkünfte: ${a.grundlage.zusammenkuenfte}`)
  })

  it('drei Monate rechnen nur die letzten dreizehn Wochen', () => {
    const { container } = zeige(zustand())
    const vorher = container.querySelector('.aw-kennzahl-wert')?.textContent
    fireEvent.click(knopf(container, zeitspanne(3, 'month', 'de')))
    expect(zeitraumZeile(container)).toContain(zeitspanne(13, 'week', 'de'))
    const a = rechnung(zustand(), 3)
    expect(container.querySelector('.aw-kennzahl-wert')?.textContent).toBe(String(a.kennzahlen.zuteilungen))
    expect(a.kennzahlen.zuteilungen).toBeLessThan(Number(vorher))
  })

  it('die Kennzahlen sind die der Rechnung', () => {
    const { container } = zeige(zustand())
    const a = rechnung(zustand())
    const werte = [...container.querySelectorAll('.aw-kennzahlen .aw-kennzahl')].map((k) => ({
      wert: k.querySelector('.aw-kennzahl-wert')?.textContent,
      text: k.querySelector('.aw-kennzahl-text')?.textContent,
    }))
    expect(werte).toEqual([
      { wert: String(a.kennzahlen.zuteilungen), text: t.awZuteilungen },
      { wert: `${a.kennzahlen.eingeteilt} von ${a.kennzahlen.mitBereichen}`, text: t.awEingeteilt },
      { wert: String(a.kennzahlen.nie), text: t.awNieDran },
    ])
  })

  it('was auffällt: die ersten sechs, „Alle Hinweise" bringt den Rest', () => {
    const { container } = zeige(zustand())
    const a = rechnung(zustand())
    expect(a.hinweise.length, 'der Verlauf braucht mehr als sechs Hinweise').toBeGreaterThan(HINWEISE_SICHTBAR)
    expect(container.querySelectorAll('.aw-hinweis')).toHaveLength(HINWEISE_SICHTBAR)
    expect(container.querySelector('.aw-abschnitt-kopf .klein-text')?.textContent).toBe(`Hinweise: ${a.hinweise.length}`)
    fireEvent.click(knopf(container, t.awAlleHinweise))
    expect(container.querySelectorAll('.aw-hinweis')).toHaveLength(a.hinweise.length)
    fireEvent.click(knopf(container, t.awWeniger))
    expect(container.querySelectorAll('.aw-hinweis')).toHaveLength(HINWEISE_SICHTBAR)
  })

  it('ein Hinweis öffnet die Person — Zurück im Kopf führt in den Überblick', () => {
    const { container } = zeige(zustand())
    const a = rechnung(zustand())
    const h0 = a.hinweise[0]!
    const erste = DEMO.persons.find((p) => h0.art !== 'absagen' && p.id === h0.pid)!
    const hinweis = container.querySelector('.aw-hinweis')!
    expect(hinweis.querySelector('.aw-hinweis-titel')?.textContent).toContain(displayName(erste))
    fireEvent.click(hinweis)
    expect(titel(container)).toBe(displayName(erste))
    // Die Wochen des Zeitraums als Felder: zwanzig, in Reihen zu dreizehn — und
    // die Überschrift nennt so viele, wie dastehen, nicht die 52 des Zeitraums.
    expect(container.querySelectorAll('.aw-woche')).toHaveLength(20)
    expect(container.querySelectorAll('.aw-wochen-reihe')).toHaveLength(2)
    expect(container.textContent).toContain(`Die letzten ${zeitspanne(20, 'week', 'de')}`)
    zurueck(container)
    expect(titel(container)).toBe(t.navAuswertung)
  })

  it('die Last: je Person mit Bereich ein Balken — als Tabelle und zurück', () => {
    const { container } = zeige(zustand())
    const a = rechnung(zustand())
    const karte = () => container.querySelector('.aw-last-karte')!
    expect(karte().querySelectorAll('.aw-last-balken')).toHaveLength(a.kennzahlen.last.length)
    expect(karte().querySelectorAll('.aw-last-balken.is-oben')).toHaveLength(10)
    fireEvent.click(knopf(container, t.awAlsTabelle))
    expect(karte().querySelectorAll('tbody tr')).toHaveLength(a.kennzahlen.last.length)
    expect(karte().querySelector('.aw-last')).toBeNull()
    fireEvent.click(knopf(container, t.awAlsDiagramm))
    expect(karte().querySelector('tbody')).toBeNull()
  })

  it('höchstens zehn in der Last: keine „zehn oberen" — die Balken grau wie ihre Legende', () => {
    // Bis zum 17.10.2026 waren dann alle Balken Minze, die Legende grau.
    const wenige = zustand({ persons: DEMO.persons.slice(0, 8) })
    const { container } = zeige(wenige)
    const karte = container.querySelector('.aw-last-karte')!
    const balken = karte.querySelectorAll('.aw-last-balken:not(.is-leer)')
    expect(balken.length, 'kein Balken mit Zuteilungen').toBeGreaterThan(0)
    expect(karte.querySelectorAll('.aw-last-balken.is-oben')).toHaveLength(0)
    const legende = [...karte.querySelectorAll('.aw-legende-eintrag')].map((e) => e.textContent)
    expect(legende).not.toContain(t.awLegendeOben)
    expect(legende).toContain(t.awZuteilungen)
  })

  it.each([
    [t.awVerteilungTitel, '.aw-gruppe'],
    [t.awEinseitigTitel, '.aw-person-karte'],
    [t.awWartezeitenTitel, '.feld-wahl'],
    [t.awWeiteresTitel, '.aw-treffpunkt-gruppe'],
  ])('die Kachel „%s" öffnet ihre Unteransicht — Zurück führt in den Überblick', (name, marke) => {
    const { container } = zeige(zustand())
    expect(container.querySelectorAll('.aw-kachel')).toHaveLength(4)
    fireEvent.click([...container.querySelectorAll('.aw-kachel')].find((k) => k.querySelector('.aw-kachel-titel')?.textContent === name)!)
    expect(titel(container)).toBe(name)
    expect(container.querySelector(marke), `${name}: ohne Inhalt`).not.toBeNull()
    expect(container.querySelector('.aw-kachel')).toBeNull()
    zurueck(container)
    expect(titel(container)).toBe(t.navAuswertung)
  })

  it('aus einer Unteransicht geöffnet, führt Zurück von der Person in die Unteransicht', () => {
    const { container } = zeige(zustand())
    fireEvent.click([...container.querySelectorAll('.aw-kachel')][0]!)
    const name = container.querySelector('.aw-zeile-name')!
    const wer = name.textContent
    fireEvent.click(name)
    expect(titel(container)).toBe(wer)
    zurueck(container)
    expect(titel(container)).toBe(t.awVerteilungTitel)
  })

  it('ohne abgeschlossene Woche im Zeitraum steht ein Satz da statt der Zahlen', () => {
    const { container } = zeige(zustand({ weeks: DEMO.weeks.map((w) => ({ ...w, start: tagNach(w.start, 35) })), fsWeeks: DEMO.fsWeeks }))
    expect(container.querySelector('.aw-leer')?.textContent).toBe(t.awKeineDaten)
    expect(container.querySelector('.aw-kennzahlen')).toBeNull()
    expect(container.querySelector('.aw-kachel')).toBeNull()
  })
})

describe('Ab dem Tablet: alles auf einer Seite', () => {
  it('Überblick, Verteilung, Einseitig, Wartezeiten und Treffpunkte — ohne Kacheln', () => {
    breite('tablet')
    const { container } = zeige(zustand())
    expect(container.querySelector('.auswertung--breit')).not.toBeNull()
    expect(container.querySelector('.aw-kachel')).toBeNull()
    const abschnitte = [...container.querySelectorAll('section[aria-label]')].map((s) => s.getAttribute('aria-label'))
    for (const name of [t.awWasAuffaellt, t.awLastTitel, t.awVerteilungTitel, t.awEinseitigTitel, t.awWartezeitenTitel, t.awWeiteresTitel]) {
      expect(abschnitte, name).toContain(name)
    }
    // Die Tabelle Person × Bereich passte am Tablet nur mit Rollbalken.
    expect(container.querySelector('.aw-matrix')).toBeNull()
  })

  it('ab dem Desktop die Tabelle Person × Bereich statt der Karten', () => {
    breite('desktop')
    const { container } = zeige(zustand())
    expect(container.querySelector('.aw-person-karte')).toBeNull()
    const matrix = container.querySelector('.aw-matrix')!
    expect(matrix.querySelectorAll('tbody tr').length).toBeGreaterThan(10)
    // Zelle für Zelle ein Satz für Vorleseprogramme: „Name, Bereich: Wert" —
    // und der Kopf liest den ganzen Namen, auch wo er kurz und senkrecht steht.
    expect(matrix.querySelector('tbody td')?.getAttribute('aria-label')).toMatch(/^.+, .+: .+$/)
    const vorsitz = [...matrix.querySelectorAll('thead th')].find((th) => th.getAttribute('aria-label')?.startsWith(t.privVorsitz))!
    expect(vorsitz.getAttribute('aria-label')).toBe(`${t.privVorsitz} · ${t.tabMid}`)
    expect([...vorsitz.querySelectorAll('.aw-matrix-kopf > span')].map((s) => s.textContent)).toEqual([t.privVorsitz, t.unterDerWoche])
  })

  it('ein Name in der Tabelle öffnet die Person', () => {
    breite('desktop')
    const { container } = zeige(zustand())
    const name = container.querySelector('.aw-matrix .aw-zeile-name')!
    const wer = name.textContent
    fireEvent.click(name)
    expect(titel(container)).toBe(wer)
    expect(container.querySelector('.aw-matrix')).toBeNull()
    zurueck(container)
    expect(container.querySelector('.aw-matrix')).not.toBeNull()
  })
})

/* ---- Absagen ----------------------------------------------------------------- */

/** Absagen von `pid` auf den ersten Platz des Bereichs in den letzten `n` Wochen des Verlaufs. */
function absagenIn(bereich: string, n: number, pid: string): Absage[] {
  return VERLAUF.weeks.slice(-n).map((w) => {
    const platz = [...allePlaetze(w.mid, DEMO.services)].find((p) => bereichVon(p) === bereich)
    if (!platz) throw new Error(`kein Platz ${bereich} am ${w.start}`)
    return { personId: pid, taskKey: platzKey(platz, w.start, 'mid') }
  })
}

describe('Absagen (T126)', () => {
  /** Wer im Überblick zuerst auffällt — so öffnet ein Tipp auf den ersten Hinweis die Person. */
  const erster = (): string => {
    const h = rechnung(zustand()).hinweise[0]!
    if (h.art === 'absagen') throw new Error('der erste Hinweis gilt keiner Person')
    return h.pid
  }
  const mitAbsagen = () => zustand({ absagen: absagenIn('gebet', 3, erster()) })
  const kachel = (c: HTMLElement, name: string) =>
    [...c.querySelectorAll<HTMLElement>('.aw-kachel')].find((k) => k.querySelector('.aw-kachel-titel')?.textContent === name)!
  const karte = (c: HTMLElement) => c.querySelector(`section[aria-label="${t.awAbsagenTitel}"]`)!
  const prozent = (anteil: number) => new Intl.NumberFormat(LOCALES.de, { style: 'percent', maximumFractionDigits: 1 }).format(anteil)
  /** Der Hinweis auf die Absagen — „Alle Hinweise" gedrückt, wenn er hinter den ersten sechs steht. */
  const absagenHinweis = (c: HTMLElement, s: AppState) => {
    const i = rechnung(s).hinweise.findIndex((h) => h.art === 'absagen')
    expect(i, 'kein Hinweis auf die Absagen').toBeGreaterThan(-1)
    if (i >= HINWEISE_SICHTBAR) fireEvent.click(knopf(c, t.awAlleHinweise))
    return c.querySelectorAll<HTMLElement>('.aw-hinweis')[i]!
  }

  it('die Kachel zählt sie, die Unteransicht je Bereich — gegen alle Zuteilungen des Bereichs', () => {
    const s = mitAbsagen()
    const a = rechnung(s)
    expect(a.absagen).toHaveLength(1)
    const z = a.absagen[0]!
    expect(z).toMatchObject({ bereich: 'gebet', n: 3 })
    const { container } = zeige(s)
    expect(kachel(container, t.awWeiteresTitel).textContent).toContain(fill(t.awAbsagenZahl, { n: '3' }))
    fireEvent.click(kachel(container, t.awWeiteresTitel))
    const zeilen = karte(container).querySelectorAll('.aw-zeile')
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]!.querySelector('.aw-zeile-zahl')?.textContent).toBe(
      `${fill(t.awAbsagenZahl, { n: '3' })} · ${fill(t.awAnteilVon, { anteil: prozent(z.anteil), m: String(z.von) })}`,
    )
    // Er fällt auf — in der Problemfarbe wie sein Hinweis.
    expect(zeilen[0]!.querySelector('.aw-mini-wert.is-problem')).not.toBeNull()
  })

  it('die Kachel zählt wie die Liste nur Absagen mit Bereich — die Person auch die ohne', () => {
    // Betreiber 18.10.2026: Eine Absage auf einem Platz, den es nicht mehr
    // gibt, steht in keiner Zeile der Liste, also auch nicht in der Kachel.
    const pid = erster()
    const weg = { personId: pid, taskKey: `${VERLAUF.weeks.at(-1)!.start}|mid|part|weg|0` }
    const s = zustand({ absagen: [...absagenIn('gebet', 3, pid), weg] })
    const a = rechnung(s)
    expect(a.grundlage.absagen).toHaveLength(4)
    expect(a.absagen.map((z) => [z.bereich, z.n])).toEqual([['gebet', 3]])
    const { container } = zeige(s)
    expect(kachel(container, t.awWeiteresTitel).textContent).toContain(fill(t.awAbsagenZahl, { n: '3' }))
    fireEvent.click(container.querySelector('.aw-hinweis')!)
    const kennzahlen = [...container.querySelectorAll('.aw-kennzahlen.is-vier .aw-kennzahl')].map((k) => [
      k.querySelector('.aw-kennzahl-text')?.textContent,
      k.querySelector('.aw-kennzahl-wert')?.textContent,
    ])
    expect(kennzahlen).toContainEqual([t.awAbsagen, '4'])
  })

  it('ohne Absagen ein Satz statt der Liste', () => {
    const { container } = zeige(zustand())
    expect(kachel(container, t.awWeiteresTitel).textContent).toContain(fill(t.awAbsagenZahl, { n: '0' }))
    fireEvent.click(kachel(container, t.awWeiteresTitel))
    expect(karte(container).querySelector('.aw-zeile')).toBeNull()
    expect(karte(container).querySelector('.aw-leer')?.textContent).toBe(t.awKeineAbsagen)
  })

  it('der Hinweis „Viele Absagen" führt am Handy in die Unteransicht und nennt den Bereich', () => {
    const s = mitAbsagen()
    const { container } = zeige(s)
    const hinweis = absagenHinweis(container, s)
    const titelText = hinweis.querySelector('.aw-hinweis-titel')?.textContent
    fireEvent.click(hinweis)
    expect(titel(container)).toBe(t.awWeiteresTitel)
    const name = karte(container).querySelector('.aw-zeile-name')?.textContent ?? ''
    expect(name).not.toBe('')
    expect(titelText).toBe(fill(t.awHinweisAbsagen, { bereich: name }))
  })

  it('ab dem Tablet rollt der Hinweis zu den Absagen, statt die Seite zu wechseln', () => {
    breite('tablet')
    const gerollt: Element[] = []
    const vorher = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      gerollt.push(this)
    }
    try {
      const s = mitAbsagen()
      const { container } = zeige(s)
      fireEvent.click(absagenHinweis(container, s))
      expect(gerollt.map((e) => e.getAttribute('aria-label'))).toEqual([t.awWeiteresTitel])
      expect(container.querySelector('.auswertung--breit')).not.toBeNull()
    } finally {
      if (vorher) Element.prototype.scrollIntoView = vorher
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('die Person nennt ihre Absagen', () => {
    const { container } = zeige(mitAbsagen())
    fireEvent.click(container.querySelector('.aw-hinweis')!)
    const kennzahlen = [...container.querySelectorAll('.aw-kennzahlen.is-vier .aw-kennzahl')].map((k) => [
      k.querySelector('.aw-kennzahl-text')?.textContent,
      k.querySelector('.aw-kennzahl-wert')?.textContent,
    ])
    expect(kennzahlen).toContainEqual([t.awAbsagen, '3'])
  })
})

/* ---- Wartezeiten -------------------------------------------------------------- */

/**
 * **Wartet lange** (Betreiber 17.10.2026): Wer im Bereich schon eingeteilt ist,
 * wartet nicht — er steht mit „geplant: …" hinten, sein Balken bleibt grau.
 * Wochen, in denen jemand ganz fehlte, zählen nicht: „davon abwesend: …".
 */
describe('Wartezeiten: geplant und abwesend', () => {
  /** Die Unteransicht „Wartezeiten" mit diesem Bereich, alle Zeilen offen. */
  function wartezeitenZeilen(c: HTMLElement, bereich: string): HTMLElement[] {
    fireEvent.click([...c.querySelectorAll<HTMLElement>('.aw-kachel')].find((k) => k.querySelector('.aw-kachel-titel')?.textContent === t.awWartezeitenTitel)!)
    const wahl = c.querySelector<HTMLSelectElement>('.feld-wahl')!
    if (wahl.value !== bereich) fireEvent.change(wahl, { target: { value: bereich } })
    expect(wahl.value).toBe(bereich)
    const abschnitt = c.querySelector<HTMLElement>(`section[aria-label="${t.awWartetLaengsten}"]`)!
    const mehr = abschnitt.querySelector<HTMLElement>('.aw-mehr')
    if (mehr) fireEvent.click(mehr)
    return [...abschnitt.querySelectorAll<HTMLElement>('.aw-zeile')]
  }

  it('wer schon geplant ist, steht mit „geplant: …" hinten und wartet nicht mehr lange', () => {
    // Der, der am längsten wartet, bekommt in der kommenden Woche einen Platz
    // dieses Bereichs.
    const vorher = rechnung(zustand()).wartezeiten
    const w = vorher.find((x) => x.ueblich !== null && x.warten.some((z) => z.lange))
    if (!w) throw new Error('niemand wartet lange')
    const wartet = w.warten.find((z) => z.lange)!
    const zuteilung = { name: displayName(DEMO.persons.find((p) => p.id === wartet.pid)!), pid: wartet.pid }
    const kommend = { ...structuredClone(DEMO.weeks[0]!), start: tagNach(MONTAG, 7) }
    const platz = [...allePlaetze(kommend.mid, DEMO.services)].find((p) => bereichVon(p) === w.bereich)
    if (!platz) throw new Error(`kein Platz ${w.bereich}`)
    if (platz.art === 'helper') (kommend.mid.helpers[platz.svc.key] ??= [])[platz.pos] = zuteilung
    else Object.assign(platz.slot, zuteilung)
    const s = zustand({ weeks: [...VERLAUF.weeks, kommend], fsWeeks: [...VERLAUF.fsWeeks, []] })
    const nachher = rechnung(s).wartezeiten.find((x) => x.bereich === w.bereich)!
    expect(nachher.warten.find((z) => z.pid === wartet.pid)).toMatchObject({ geplant: tagNach(MONTAG, 7), lange: false })

    const { container } = zeige(s)
    const zeilen = wartezeitenZeilen(container, w.bereich)
    const geplant = fill(t.awGeplant, { datum: datumsFormat('de', 'tagMonatKurz').format(fromIso(tagNach(MONTAG, 7))) })
    const mitPlan = zeilen.filter((z) => z.querySelector('.aw-zeile-zahl')?.textContent?.includes(geplant))
    expect(mitPlan.length).toBe(nachher.warten.filter((z) => z.geplant !== null).length)
    expect(mitPlan.length).toBeGreaterThan(0)
    expect(zeilen.slice(-mitPlan.length)).toEqual(mitPlan)
  })

  it('rot ist nur, wer wirklich lange wartet — derselbe Abstand ohne „lange" bleibt grau', () => {
    const balken = (lange: boolean) => render(<WarteBalken wochen={10} ueblich={2} lange={lange} max={52} aria="" />).container
    expect(balken(true).querySelector('.aw-wert.is-ueber')).not.toBeNull()
    cleanup()
    const grau = balken(false)
    expect(grau.querySelector('.aw-wert.is-ueber')).toBeNull()
    // Der graue Balken reicht trotzdem bis zu den zehn Wochen.
    expect((grau.querySelector('.aw-wert') as HTMLElement).style.width).toBe(`${(10 / 52) * 100}%`)
  })

  it('wer nach dem letzten Mal ganz fehlte, dem steht „davon abwesend: …" da', () => {
    const a0 = rechnung(zustand())
    const w = a0.wartezeiten.find((x) => x.ueblich !== null && x.warten.some((z) => z.wochen !== null && z.wochen >= 3))!
    const z0 = w.warten.find((z) => z.wochen !== null && z.wochen >= 3)!
    // Von der Woche nach dem letzten Mal bis vor die laufende: ganz weg.
    const weg = { id: 'weg', personId: z0.pid, userId: null, from: tagNach(z0.zuletzt!, 7), to: tagNach(MONTAG, -1), reason: '' }
    const s = zustand({ absences: [weg] })
    const z = rechnung(s).wartezeiten.find((x) => x.bereich === w.bereich)!.warten.find((x) => x.pid === z0.pid)!
    // Nach dem letzten Mal war er in jeder Woche weg, in der etwas stattfand —
    // das geht von der Wartezeit ab.
    expect(z.wochen).toBe(z0.wochen)
    expect(z.abwesend).toBeGreaterThanOrEqual(2)
    expect(z.wartend).toBe(z.wochen! - z.abwesend)
    const { container } = zeige(s)
    const zeile = wartezeitenZeilen(container, w.bereich).find((r) => r.querySelector('.aw-zeile-name')?.textContent === displayName(DEMO.persons.find((p) => p.id === z0.pid)!))!
    expect(zeile.querySelector('.aw-zeile-zahl')?.textContent).toContain(fill(t.awDavonAbwesend, { dauer: zeitspanne(z.abwesend, 'week', 'de') }))
  })
})

/* ---- In einer fremden Sprache ------------------------------------------------ */

/**
 * Jede Ansicht einmal ansehen und jede Wahl darin einmal drücken — die
 * Unteransichten, die Person, die Seite am Tablet und am Desktop. Gelesen wird wie im
 * Durchgang durch die ganze Oberfläche (`tests/oberflaeche-durchgang.test.tsx`),
 * der die Auswertung nicht erreicht: Seine Uhr steht vor den Testwochen.
 */
function allesAblesen(state: AppState): string[] {
  const zeilen: string[] = []
  const lesen = () => zeilen.push(...sichtbareTexte())
  const wahlenDruecken = (c: HTMLElement) => {
    for (let i = 0; i < c.querySelectorAll('.wahl-knopf').length; i++) {
      fireEvent.click(c.querySelectorAll<HTMLElement>('.wahl-knopf')[i]!)
      lesen()
    }
  }

  breite('handy')
  let { container } = zeige(state)
  lesen()
  const mehr = [...container.querySelectorAll<HTMLElement>('.aw-mehr')]
  mehr.forEach((m) => fireEvent.click(m))
  lesen()
  for (let i = 0; i < 4; i++) {
    fireEvent.click(container.querySelectorAll<HTMLElement>('.aw-kachel')[i]!)
    lesen()
    wahlenDruecken(container)
    container.querySelectorAll<HTMLElement>('.aw-mehr').forEach((m) => fireEvent.click(m))
    lesen()
    zurueck(container)
  }
  fireEvent.click(container.querySelector('.aw-hinweis')!)
  lesen()
  cleanup()

  for (const geraet of ['tablet', 'desktop'] as const) {
    breite(geraet)
    ;({ container } = zeige(state))
    lesen()
    wahlenDruecken(container)
    cleanup()
  }
  return zeilen
}

describe('In einer fremden Sprache steht nichts Deutsches da', () => {
  let bestand: FremdBestand
  const SPRACHEN = ['en', 'uk', 'ar', 'fr'] as const satisfies readonly Exclude<Lang, 'de'>[]

  beforeAll(async () => {
    await Promise.all(SPRACHEN.map((code) => loadOverlay(code)))
    bestand = await fremdsprachigerBestand()
  })

  /** Der Bestand ohne deutsche Namen, über zwanzig Wochen gestreckt wie oben. */
  function fremd(lang: Lang): AppState {
    const z = bestand.zustand
    const weeks: Week[] = []
    const fsWeeks: FsInstance[][] = []
    for (let vor = 20; vor >= 1; vor--) {
      const i = (20 - vor) % z.weeks.length
      weeks.push({ ...structuredClone(z.weeks[i]!), start: tagNach(MONTAG, -7 * vor) })
      fsWeeks.push(structuredClone(z.fsWeeks[i] ?? []))
    }
    return { ...structuredClone(z), weeks, fsWeeks, screen: 'auswertung', lang, congLang: lang }
  }

  it.each(SPRACHEN)('%s', (lang) => {
    const finde = deutschFinder(lang, bestand.erfunden)
    const zeilen = allesAblesen(fremd(lang))
    expect(zeilen.length, 'kaum etwas gelesen').toBeGreaterThan(300)
    const reste = [...new Set(zeilen.flatMap((zeile) => finde(zeile).map((r) => `„${r.wort}" in „${zeile.slice(0, 100)}"`)))]
    expect(reste).toEqual([])
  })

  it('die Ziffern der Legende und der Achse kommen aus der Sprache — auf Persisch', async () => {
    // Bis zum 17.10.2026 standen „1–3", „4–9", „10" und „0" fest da, daneben „۱۲" aus Intl.
    await loadOverlay('fa')
    const fa = dict('fa')
    breite('desktop')
    const { container } = zeige(fremd('fa'))
    const zahl = new Intl.NumberFormat(LOCALES.fa ?? 'fa')
    const legende = [...container.querySelectorAll('.aw-matrix-karte .aw-legende-eintrag')].map((e) => e.textContent)
    expect(legende.slice(0, 3)).toEqual([
      `${zahl.format(1)}–${zahl.format(3)}`,
      `${zahl.format(4)}–${zahl.format(9)}`,
      fill(fa.awUndMehr, { n: zahl.format(10) }),
    ])
    expect(legende.join(' ')).not.toMatch(/[0-9]/)
    const achse = container.querySelector(`section[aria-label="${fa.awWartetLaengsten}"] .aw-achse span`)
    expect(achse?.textContent).toBe(zahl.format(0))
  })

  it('die Probe findet Deutsch, wo es steht', () => {
    // Dieselben Ansichten auf Deutsch, mit den Augen der fremden Prüfungen gelesen.
    const zeilen = allesAblesen(fremd('de'))
    for (const lang of ['uk', 'en'] as const) {
      expect(zeilen.flatMap(deutschFinder(lang, bestand.erfunden)).length, lang).toBeGreaterThan(50)
    }
  })
})
