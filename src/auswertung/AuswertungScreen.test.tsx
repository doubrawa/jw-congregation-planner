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
import { zeitspanne } from '../components/datum-anzeige'
import { abwesenheitenVon } from '../data/absence'
import { auswerten, ZEITRAEUME, type Zeitraum } from '../data/auswertung'
import { displayName } from '../data/helpers'
import { tagNach } from '../data/meeting-dates'
import type { FsInstance, Lang, Week } from '../data/types'
import { dict, loadOverlay } from '../i18n/ui'
import { AuswertungScreen } from './AuswertungScreen'
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
    const erste = DEMO.persons.find((p) => p.id === a.hinweise[0]!.pid)!
    const hinweis = container.querySelector('.aw-hinweis')!
    expect(hinweis.querySelector('.aw-hinweis-titel')?.textContent).toContain(displayName(erste))
    fireEvent.click(hinweis)
    expect(titel(container)).toBe(displayName(erste))
    // Die Wochen des Zeitraums als Felder: zwanzig, in Reihen zu dreizehn.
    expect(container.querySelectorAll('.aw-woche')).toHaveLength(20)
    expect(container.querySelectorAll('.aw-wochen-reihe')).toHaveLength(2)
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

  it('die Probe findet Deutsch, wo es steht', () => {
    // Dieselben Ansichten auf Deutsch, mit den Augen der fremden Prüfungen gelesen.
    const zeilen = allesAblesen(fremd('de'))
    for (const lang of ['uk', 'en'] as const) {
      expect(zeilen.flatMap(deutschFinder(lang, bestand.erfunden)).length, lang).toBeGreaterThan(50)
    }
  })
})
