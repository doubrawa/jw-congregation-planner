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
import { datumsFormat, monatsName, zeitspanne } from '../components/datum-anzeige'
import { abwesenheitenVon } from '../data/absence'
import { auswerten, istKnapp, lageVon, personBild, TREFFPUNKT_BEREICH, ZEITRAEUME, type Einteilung, type Zeitraum } from '../data/auswertung'
import { displayName, privSetzen, privWert } from '../data/helpers'
import { fromIso, tagNach } from '../data/meeting-dates'
import { allePlaetze, platzKey } from '../data/plaetze'
import { bereichVon } from '../data/planning'
import type { Absage, FsInstance, Lang, Week } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { bereichsName, bereichsTeile } from '../personen/priv-label'
import { AuswertungScreen } from './AuswertungScreen'
import { HINWEISE_SICHTBAR } from './Hinweise'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Die Auswertung, wie man sie sieht** (T126): am Handy der Überblick mit fünf
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
/**
 * Ein ganzes Jahr: Erst darin warten die nie Eingeteilten länger als doppelt so
 * lange wie üblich — die Wartezeiten rechnen über das Jahr (Jahresprobe
 * 18.10.2026), der übliche Abstand des Gebets liegt bei vierzehn Wochen.
 */
const JAHR = verlauf(52)

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
    expect(zeitraumZeile(container)).toContain(zahlBinden(`Zusammenkünfte: ${a.grundlage.zusammenkuenfte}`))
    // Auch die Spanne bindet ihre Zahlen (T128: „2026|г." bei 320 px) — nirgends
    // steht ein Leerzeichen zwischen Zahl und Wort.
    expect(zeitraumZeile(container)).not.toMatch(/\p{Nd}\.? (?=\p{L})/u)
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
    expect(container.querySelector('.aw-abschnitt-kopf .klein-text')?.textContent).toBe(zahlBinden(`Hinweise: ${a.hinweise.length}`))
    fireEvent.click(knopf(container, t.awAlleHinweise))
    expect(container.querySelectorAll('.aw-hinweis')).toHaveLength(a.hinweise.length)
    fireEvent.click(knopf(container, t.awWeniger))
    expect(container.querySelectorAll('.aw-hinweis')).toHaveLength(HINWEISE_SICHTBAR)
  })

  it('ein Hinweis öffnet die Person — Zurück im Kopf führt in den Überblick', () => {
    const { container } = zeige(zustand())
    const a = rechnung(zustand())
    const h0 = a.hinweise[0]!
    if (!('pid' in h0)) throw new Error('der erste Hinweis gilt keiner Person')
    const erste = DEMO.persons.find((p) => p.id === h0.pid)!
    const hinweis = container.querySelector('.aw-hinweis')!
    expect(hinweis.querySelector('.aw-hinweis-titel')?.textContent).toContain(displayName(erste))
    fireEvent.click(hinweis)
    expect(titel(container)).toBe(displayName(erste))
    // Die Wochen des Zeitraums je Monat, der neueste oben: zwanzig, vom 25. Mai
    // bis zum 5. Oktober — und die Überschrift nennt so viele, wie dastehen,
    // nicht die 52 des Zeitraums.
    expect(container.querySelectorAll('.aw-woche')).toHaveLength(20)
    expect([...container.querySelectorAll('.aw-monat-name')].map((m) => m.textContent)).toEqual(
      ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'].map((m) => monatsName(`${m}-01`, 'de')),
    )
    expect([...container.querySelectorAll('.aw-jahr')].map((j) => j.textContent)).toEqual(['2026'])
    expect(container.textContent).toContain(zahlBinden(`Die letzten ${zeitspanne(20, 'week', 'de')}`))
    zurueck(container)
    expect(titel(container)).toBe(t.navAuswertung)
  })

  it('die Karte „Wie sich die Last verteilt" ist fort — sie zeigte Struktur, keinen Befund', () => {
    // Jahresprobe 18.10.2026: Die zehn oberen lagen auf ihrer Erwartung.
    const { container } = zeige(zustand())
    expect(container.querySelector('.aw-last-karte')).toBeNull()
    expect(container.querySelector('.aw-last-balken')).toBeNull()
  })

  /** Öffnet die Engpässe über ihre Kachel — und gibt die Kachel zurück, wie sie davor dastand. */
  function engpaesseOeffnen(c: HTMLElement): string {
    const kachel = [...c.querySelectorAll<HTMLElement>('.aw-kachel')].find((k) => k.querySelector('.aw-kachel-titel')?.textContent === t.awEngpaesseTitel)!
    const text = kachel.textContent ?? ''
    fireEvent.click(kachel)
    return text
  }
  const knappeKarte = (c: HTMLElement) => c.querySelector(`section[aria-label="${t.awKnappeBereiche}"]`)
  const vierWochen = zeitspanne(4, 'week', 'de')

  it('kein Bereich knapp: Die Kachel zählt null, die Unteransicht sagt es in einem Satz — und nennt keinen Bereich (T139, T145)', () => {
    // In den Testwochen ist jeder höchstens alle vierzehn Wochen dran. Bis zum
    // 24.10.2026 stand trotzdem „Am knappsten: Gebete" auf der Kachel.
    const a = rechnung(zustand())
    expect(a.engpaesse.filter(istKnapp)).toEqual([])
    const { container } = zeige(zustand())
    expect(engpaesseOeffnen(container)).toContain(fill(t.awKnappeZahl, { n: '0' }))
    expect(knappeKarte(container)).toBeNull()
    expect(container.querySelector('.aw-leer')?.textContent).toBe(fill(t.awKeinEngpass, { dauer: vierWochen }))
    expect(container.querySelector('.aw-erklaerung')?.textContent).toBe(fill(t.awEngpaesseText, { dauer: vierWochen }))
    // Bis zum 25.10.2026 standen darunter alle Bereiche — „es reichen
    // problematische Bereiche" (Betreiber).
    expect(container.querySelectorAll('.aw-zeile')).toHaveLength(0)
  })

  it('nur die knappen Bereiche stehen da, mit dem Rat, mehr Personen freizugeben — einer, den niemand hat, und einer mit zwei Personen', () => {
    const a0 = rechnung(zustand())
    // Den knappsten Bereich nimmt man allen, den zweiten allen bis auf zwei.
    const [niemand, zwei] = [a0.engpaesse[0]!.bereich, a0.engpaesse[1]!.bereich]
    const mitZwei = DEMO.persons.filter((p) => privWert(p.priv, zwei)).slice(0, 2).map((p) => p.id)
    const persons = DEMO.persons.map((p) => {
      const priv = { ...p.priv }
      privSetzen(priv, niemand, false)
      if (!mitZwei.includes(p.id)) privSetzen(priv, zwei, false)
      return { ...p, priv }
    })
    const s = zustand({ persons })
    const { engpaesse } = rechnung(s)
    const knappe = engpaesse.filter(istKnapp)
    expect(knappe.map((z) => z.bereich)).toEqual([niemand, zwei])
    expect(knappe[0]!.abstand).toBeNull()

    const { container } = zeige(s)
    expect(engpaesseOeffnen(container)).toContain(fill(t.awKnappeZahl, { n: '2' }))
    const karte = knappeKarte(container)!
    const name = (b: string) => bereichsName(b, DEMO.services, t, (x) => x)
    expect([...karte.querySelectorAll('.aw-zeile')].map((z) => [z.querySelector('.aw-zeile-name')?.textContent, z.querySelector('.aw-zeile-zahl')?.textContent])).toEqual([
      [name(niemand), t.awNiemandHatIhn],
      [name(zwei), fill(t.awAlleDauer, { dauer: zeitspanne(Math.max(1, Math.round(knappe[1]!.abstand!)), 'week', 'de') })],
    ])
    expect(karte.querySelectorAll('.aw-zeile')[1]!.querySelector('.klein-text')?.textContent).toContain(fill(t.awPersonenZahl, { n: '2' }))
    expect(karte.textContent).toContain(t.awMehrFreigeben)
    expect(container.querySelector('.aw-leer')).toBeNull()
    // Nur die knappen — die übrigen Bereiche stehen nicht darunter (T145).
    expect(engpaesse.length).toBeGreaterThan(2)
    expect(container.querySelectorAll('.aw-zeile')).toHaveLength(2)
  })

  it.each([
    [t.awVerteilungTitel, '.aw-gruppe'],
    [t.awEinseitigTitel, '.aw-person-karte'],
    [t.awWartezeitenTitel, '.feld-wahl'],
    [t.awEngpaesseTitel, '.aw-erklaerung'],
    [t.awWeiteresTitel, '.aw-treffpunkt-gruppe'],
  ])('die Kachel „%s" öffnet ihre Unteransicht — Zurück führt in den Überblick', (name, marke) => {
    const { container } = zeige(zustand())
    expect(container.querySelectorAll('.aw-kachel')).toHaveLength(5)
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
    for (const name of [t.awWasAuffaellt, t.awEngpaesseTitel, t.awVerteilungTitel, t.awEinseitigTitel, t.awWartezeitenTitel, t.awWeiteresTitel]) {
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
    // Hinter dem Doppelpunkt steht die Zahl gebunden (T128) — `\s` trifft beide Leerzeichen.
    expect(matrix.querySelector('tbody td')?.getAttribute('aria-label')).toMatch(/^.+, .+:\s.+$/)
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

/* ---- Die Wochen einer Person ------------------------------------------------- */

/**
 * **Die Wochen einer Person als Kalender** (Entwurf `GWochenbildKalender`,
 * 23.10.2026): je Monat eine Zeile, der neueste oben, je Woche zwei Felder,
 * daneben die Aufgaben. Bis dahin stand je Woche ein Feld — eine Aufgabe
 * verdeckte den Hilfsdienst, und von zwei Zusammenkünften einer Woche zeigte
 * das Bild eine. Was gezählt wird, prüft `data/auswertung.test.ts`; hier, dass
 * jede Zusammenkunft ihr Feld bekommt und neben dem Monat steht, was sie brachte.
 */
describe('Die Wochen einer Person', () => {
  /** Öffnet die Person am Desktop über ihren Namen in der Tabelle — so ist jede zu erreichen, nicht nur die mit Hinweis. */
  function oeffnen(s: AppState, pid: string): HTMLElement {
    breite('desktop')
    const { container } = zeige(s)
    const name = displayName(s.persons.find((p) => p.id === pid)!)
    const knopf = [...container.querySelectorAll<HTMLElement>('.aw-matrix .aw-zeile-name')].find((b) => b.textContent === name)
    if (!knopf) throw new Error(`${name} steht nicht in der Tabelle`)
    fireEvent.click(knopf)
    expect(titel(container)).toBe(name)
    return container
  }
  /**
   * Die Zusammenkünfte („Montag|mid"), in denen `pid` einen Hilfsdienst bzw. eine
   * Aufgabe hatte. Die Einteilungen einmal gerechnet hereingeben: Eine Rechnung je
   * Aufruf kostete im Sortieren 32 s — über der Frist der CI (Review 24.10.2026).
   */
  const zusammenkuenfte = (einteilungen: readonly Einteilung[], pid: string, hilfsdienst: boolean) =>
    new Set(einteilungen.filter((e) => e.pid === pid && e.hilfsdienst === hilfsdienst).map((e) => `${e.start}|${e.tab}`))
  /** Ein Bereich, wie er neben dem Monat steht: kurz wie im Kopf der Tabelle. */
  const kurz = (bereich: string) => bereichsTeile(bereich, DEMO.services, t, (x) => x, true).join(' · ')
  const gebet = kurz('gebet')
  /** Ohne die Zahl dahinter („Gebete: 2" — der Doppelpunkt bindet sie, `zahlBinden`). */
  const ohneZahl = (text: string | null | undefined) => (text ?? '').replace(/:\s\d+$/u, '')
  /** Die Einträge neben den Monaten, der neueste zuerst: [Monat, Texte, abgesagt ja/nein]. */
  const monatsTexte = (c: HTMLElement) =>
    [...c.querySelectorAll('.aw-monat')].map((m) => [
      m.querySelector('.aw-monat-name')?.textContent,
      [...m.querySelectorAll('.aw-monat-text > span')].map((e) => [e.textContent, e.classList.contains('is-absage')]),
    ])

  it('jede Zusammenkunft mit Hilfsdienst ist grau oder „beides" — auch in einer Woche mit Aufgabe', () => {
    const s = zustand()
    const einteilungen = rechnung(s).grundlage.einteilungen
    // An dem, der am öftesten beides in einer Woche hatte, verdeckte das alte Bild am meisten.
    const woche = (z: string) => z.slice(0, 10)
    const beides = (pid: string) => {
      const aufgaben = new Set([...zusammenkuenfte(einteilungen, pid, false)].map(woche))
      return [...zusammenkuenfte(einteilungen, pid, true)].filter((z) => aufgaben.has(woche(z))).length
    }
    const pid = [...DEMO.persons].sort((a, b) => beides(b.id) - beides(a.id))[0]!.id
    expect(beides(pid), 'im Verlauf hat niemand Aufgabe und Hilfsdienst in einer Woche').toBeGreaterThan(0)
    const mitDienst = zusammenkuenfte(einteilungen, pid, true)
    const mitAufgabe = zusammenkuenfte(einteilungen, pid, false)
    const c = oeffnen(s, pid)
    expect(c.querySelectorAll('.aw-halb')).toHaveLength(2 * 20)
    expect(c.querySelectorAll('.aw-halb.is-dienst, .aw-halb.is-beides')).toHaveLength(mitDienst.size)
    expect(c.querySelectorAll('.aw-halb.is-aufgabe, .aw-halb.is-beides')).toHaveLength(mitAufgabe.size)
    expect(c.querySelectorAll('.aw-halb.is-beides')).toHaveLength([...mitDienst].filter((z) => mitAufgabe.has(z)).length)
  })

  it('beim Monat steht jede Aufgabe mit ihrem Bereich und jeder geleitete Treffpunkt — die Hilfsdienste nicht', () => {
    const s = zustand()
    const a = rechnung(s)
    // Betreiber 24.10.2026: „Geleitete dazu" — also jemand, der auch Treffpunkte leitet.
    const leitet = (pid: string, wi: number) => (VERLAUF.fsWeeks[wi] ?? []).some((inst) => inst.lpid === pid && !inst.lext)
    const pid = a.grundlage.einteilungen.find((e) => !e.hilfsdienst && e.bereich && VERLAUF.weeks.some((_, wi) => leitet(e.pid, wi)))?.pid
    if (!pid) throw new Error('im Verlauf leitet niemand mit Aufgaben einen Treffpunkt')
    const c = oeffnen(s, pid)
    const eigene = a.grundlage.einteilungen.filter((e) => e.pid === pid)
    const monatVon = (montag: string) => monatsName(`${montag.slice(0, 7)}-01`, 'de')
    const alle: string[] = []
    for (const [name, texte] of monatsTexte(c)) {
      const aufgaben = eigene.filter((e) => !e.hilfsdienst && monatVon(e.start) === name).map((e) => (e.bereich ? kurz(e.bereich) : t.awAufgabe))
      const treffpunkte = VERLAUF.weeks.some((w, wi) => monatVon(w.start) === name && leitet(pid, wi)) ? [kurz(TREFFPUNKT_BEREICH)] : []
      const gelesen = (texte as [string, boolean][]).map(([text]) => ohneZahl(text))
      expect([...gelesen].sort(), String(name)).toEqual([...new Set([...aufgaben, ...treffpunkte])].sort())
      alle.push(...gelesen)
    }
    expect(alle, 'kein Treffpunkt beim Monat').toContain(kurz(TREFFPUNKT_BEREICH))
  })

  it('eine Absage steht im Feld und daneben in der Problemfarbe — zwei im selben Monat mit der Zahl', () => {
    // Wer das Gebet hat und in den letzten drei Wochen unter der Woche nirgends stand.
    const einteilungen = rechnung(zustand()).grundlage.einteilungen
    const letzte = new Set(VERLAUF.weeks.slice(-3).map((w) => w.start))
    const frei = (pid: string) => !einteilungen.some((e) => e.pid === pid && e.tab === 'mid' && letzte.has(e.start))
    const pid = DEMO.persons.find((p) => p.priv.gebet && frei(p.id))!.id
    // Drei Absagen: 21. und 28. September, 5. Oktober.
    const s = zustand({ absagen: absagenIn('gebet', 3, pid) })
    const c = oeffnen(s, pid)
    expect(c.querySelectorAll('.aw-halb.is-abgesagt')).toHaveLength(3)
    const stand = fill(t.awEintragStand, { bereich: gebet, stand: t.awAbgesagt })
    const absagen = monatsTexte(c).flatMap(([monat, texte]) => (texte as [string, boolean][]).filter(([, rot]) => rot).map(([text]) => [monat, text]))
    expect(absagen).toEqual([
      [monatsName('2026-10-01', 'de'), stand],
      [monatsName('2026-09-01', 'de'), fill(t.awBereichZahl, { bereich: stand, n: '2' })],
    ])
    expect([...c.querySelectorAll('.aw-legende-eintrag')].map((e) => e.textContent)).toContain(t.awAbgesagt)
  })

  it('kommen die Wochen außer der Reihe, stehen die Monate trotzdem nach dem Datum — jedes Jahr einmal', () => {
    // Umgekehrt geladen; Treffpunkte laufen parallel zu den Wochen mit.
    const s = zustand({ weeks: [...VERLAUF.weeks].reverse(), fsWeeks: [...VERLAUF.fsWeeks].reverse() })
    const pid = rechnung(s).grundlage.einteilungen[0]!.pid
    const c = oeffnen(s, pid)
    expect([...c.querySelectorAll('.aw-monat-name')].map((m) => m.textContent)).toEqual(
      ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'].map((m) => monatsName(`${m}-01`, 'de')),
    )
    expect([...c.querySelectorAll('.aw-jahr')].map((j) => j.textContent)).toEqual(['2026'])
    // Alle zwanzig Wochen stehen da, keine doppelt.
    expect(c.querySelectorAll('.aw-woche')).toHaveLength(20)
  })

  it('was ansteht, steht gestrichelt oben — die Überschrift sagt es und zählt nur den Zeitraum', () => {
    // Die laufende und die nächste Woche: Testwoche 1 und 2 auf den 12. und 19. Oktober.
    const kommend = [0, 1].map((i) => ({ ...structuredClone(DEMO.weeks[i]!), start: tagNach(MONTAG, 7 * i) }))
    const s = zustand({ weeks: [...VERLAUF.weeks, ...kommend], fsWeeks: [...VERLAUF.fsWeeks, [], []] })
    const geplant = rechnung(s).grundlage.geplant.find((e) => !e.hilfsdienst && e.bereich && e.start === MONTAG)!
    const c = oeffnen(s, geplant.pid)
    // Betreiber 24.10.2026: „Ergänzen" — die Zahl bleibt die des Zeitraums.
    const kopf = (x: HTMLElement) => x.querySelector('.aw-wochen')?.closest('section')?.querySelector('h2')?.textContent
    expect(kopf(c)).toBe(fill(t.awLetzteUndKommend, { dauer: zeitspanne(20, 'week', 'de') }))
    const oben = c.querySelector('.aw-monat')!
    expect(oben.querySelector('.aw-monat-name')?.textContent).toBe(monatsName('2026-10-01', 'de'))
    expect(oben.querySelectorAll('.aw-halb.is-geplant.is-aufgabe, .aw-halb.is-geplant.is-beides').length).toBeGreaterThan(0)
    const texte = [...oben.querySelectorAll('.aw-monat-text > span')].map((e) => ohneZahl(e.textContent))
    expect(texte).toContain(fill(t.awEintragStand, { bereich: kurz(geplant.bereich!), stand: t.awGeplantKurz }))
    expect([...c.querySelectorAll('.aw-legende-eintrag')].map((e) => e.textContent)).toContain(t.awGeplantKurz)
    // Gegenprobe: Ohne die kommenden Wochen steht nichts Gestricheltes da, und die Überschrift bleibt kurz.
    cleanup()
    const ohne = oeffnen(zustand(), geplant.pid)
    expect(ohne.querySelector('.aw-halb.is-geplant')).toBeNull()
    expect(kopf(ohne)).toBe(fill(t.awLetzte, { dauer: zeitspanne(20, 'week', 'de') }))
  })

  it('die laufende Woche nach dem Tag: am Donnerstag ist der Dienstag gehalten, am Montag steht er aus', () => {
    // Betreiber 24.10.2026: „Nach dem Tag". Gezählt wird der Dienstag trotzdem erst ab Montag.
    const kommend = [0, 1].map((i) => ({ ...structuredClone(DEMO.weeks[i]!), start: tagNach(MONTAG, 7 * i) }))
    const s = zustand({ weeks: [...VERLAUF.weeks, ...kommend], fsWeeks: [...VERLAUF.fsWeeks, [], []] })
    const dienstag = rechnung(s).grundlage.geplant.find((e) => !e.hilfsdienst && e.start === MONTAG && e.tab === 'mid')!
    /** Das Feld unter der Woche in der laufenden Woche (Oktober: 5., 12., 19.). */
    const feld = (c: HTMLElement) => c.querySelector('.aw-monat')!.querySelectorAll('.aw-woche')[1]!.querySelector('.aw-halb')!.className
    vi.setSystemTime(new Date(2026, 9, 15, 9, 0))
    const donnerstag = feld(oeffnen(s, dienstag.pid))
    expect(donnerstag).toMatch(/is-(aufgabe|beides)/)
    expect(donnerstag).not.toContain('is-geplant')
    cleanup()
    vi.setSystemTime(UHR)
    expect(feld(oeffnen(s, dienstag.pid))).toContain('is-geplant')
  })
})

describe('Absagen (T126)', () => {
  /**
   * Wer als Erster „zu oft" dran ist — von Anfang an eingeteilt: Eine Absage
   * macht ihn nicht erst „dabei" (das täte sie bei einem, der nie dran war).
   */
  const erster = (): string => {
    const h = rechnung(zustand()).hinweise.find((x) => x.art === 'oft')
    if (h?.art !== 'oft') throw new Error('niemand ist zu oft dran')
    return h.pid
  }
  const mitAbsagen = () => zustand({ absagen: absagenIn('gebet', 3, erster()) })
  /** Öffnet die Person über ihren Hinweis „Zu oft" — „Alle Hinweise" gedrückt, wenn er hinten steht. */
  const personOeffnen = (c: HTMLElement, s: AppState, pid: string) => {
    const i = rechnung(s).hinweise.findIndex((h) => h.art === 'oft' && h.pid === pid)
    expect(i, `kein Hinweis zu ${pid}`).toBeGreaterThan(-1)
    if (i >= HINWEISE_SICHTBAR) fireEvent.click(knopf(c, t.awAlleHinweise))
    fireEvent.click(c.querySelectorAll<HTMLElement>('.aw-hinweis')[i]!)
    expect(titel(c)).toBe(displayName(DEMO.persons.find((p) => p.id === pid)!))
  }
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
    personOeffnen(container, s, pid)
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
    const s = mitAbsagen()
    const { container } = zeige(s)
    personOeffnen(container, s, erster())
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
 * Wochen, in denen jemand nicht eingeteilt werden konnte, zählen nicht: „davon
 * nicht einteilbar: …". Seit der Jahresprobe (18.10.2026) über das ganze Jahr,
 * und ein Hinweis je Bereich führt dorthin.
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

  /**
   * Der, der am längsten wartet, bekommt in der kommenden Woche einen Platz
   * seines Bereichs — mit den Wartezeiten des Bereichs danach.
   */
  function wartenderGeplant() {
    const vorher = rechnung(zustand(JAHR)).wartezeiten
    const w = vorher.find((x) => x.ueblich !== null && x.warten.some((z) => z.lange))
    if (!w) throw new Error('niemand wartet lange')
    const wartet = w.warten.find((z) => z.lange)!
    const zuteilung = { name: displayName(DEMO.persons.find((p) => p.id === wartet.pid)!), pid: wartet.pid }
    const kommend = { ...structuredClone(DEMO.weeks[0]!), start: tagNach(MONTAG, 7) }
    const platz = [...allePlaetze(kommend.mid, DEMO.services)].find((p) => bereichVon(p) === w.bereich)
    if (!platz) throw new Error(`kein Platz ${w.bereich}`)
    if (platz.art === 'helper') (kommend.mid.helpers[platz.svc.key] ??= [])[platz.pos] = zuteilung
    else Object.assign(platz.slot, zuteilung)
    const s = zustand({ weeks: [...JAHR.weeks, kommend], fsWeeks: [...JAHR.fsWeeks, []] })
    return { s, pid: wartet.pid, nachher: rechnung(s).wartezeiten.find((x) => x.bereich === w.bereich)! }
  }

  it('wer schon geplant ist, steht mit „geplant: …" hinten und wartet nicht mehr lange', () => {
    const { s, pid, nachher } = wartenderGeplant()
    expect(nachher.warten.find((z) => z.pid === pid)).toMatchObject({ geplant: tagNach(MONTAG, 7), lange: false })

    const { container } = zeige(s)
    const zeilen = wartezeitenZeilen(container, nachher.bereich)
    const geplant = fill(t.awGeplant, { datum: datumsFormat('de', 'tagMonatKurz').format(fromIso(tagNach(MONTAG, 7))) })
    const mitPlan = zeilen.filter((z) => z.querySelector('.aw-zeile-zahl')?.textContent?.includes(geplant))
    expect(mitPlan.length).toBe(nachher.warten.filter((z) => z.geplant !== null).length)
    expect(mitPlan.length).toBeGreaterThan(0)
    expect(zeilen.slice(-mitPlan.length)).toEqual(mitPlan)
  })

  it('„wartet lange" steht nur, wer wirklich lange wartet — wer schon geplant ist, nicht (T138)', () => {
    // Bis zum 24.10.2026 war das der rote Teil eines Balkens; der Geplante
    // wartete so lange wie die anderen, sein Balken blieb grau.
    const { s, pid, nachher } = wartenderGeplant()
    const { container } = zeige(s)
    const zeilen = wartezeitenZeilen(container, nachher.bereich)
    const marke = (z: HTMLElement) => z.querySelector('.aw-marke.is-problem')?.textContent ?? null
    expect(zeilen.map(marke)).toEqual(nachher.warten.map((z) => (z.lange ? t.awWartetLange : null)))
    expect(nachher.warten.some((z) => z.lange)).toBe(true)
    const name = displayName(DEMO.persons.find((p) => p.id === pid)!)
    expect(marke(zeilen.find((z) => z.querySelector('.aw-zeile-name')?.textContent === name)!)).toBeNull()
  })

  it('jede Zeile nennt Wartezeit und üblichen Abstand — „seit 14 Wochen · üblich: 6 Wochen" (T138)', () => {
    const w = rechnung(zustand(JAHR)).wartezeiten.find((x) => x.ueblich !== null && x.warten.some((z) => z.wochen !== null))!
    const { container } = zeige(zustand(JAHR))
    const zeilen = wartezeitenZeilen(container, w.bereich)
    const dauer = (wochen: number) => zeitspanne(wochen, 'week', 'de')
    const ueblich = zahlBinden(`${t.awUeblich}: ${dauer(Math.round(w.ueblich!))}`)
    expect(zeilen.map((z) => z.querySelector('.aw-zeile-zahl')?.textContent?.split(' · ').slice(0, 2))).toEqual(
      w.warten.map((z) => [z.wochen === null ? t.awNieImJahr : fill(t.awSeit, { dauer: dauer(z.wochen) }), ueblich]),
    )
  })

  it('wer nach dem letzten Mal ganz fehlte, dem steht „davon nicht einteilbar: …" da', () => {
    const a0 = rechnung(zustand())
    const w = a0.wartezeiten.find((x) => x.ueblich !== null && x.warten.some((z) => z.wochen !== null && z.wochen >= 3))!
    const z0 = w.warten.find((z) => z.wochen !== null && z.wochen >= 3)!
    // Von der Woche nach dem letzten Mal bis vor die laufende: ganz weg.
    const weg = { id: 'weg', personId: z0.pid, userId: null, from: tagNach(z0.zuletzt!, 7), to: tagNach(MONTAG, -1), reason: '' }
    const s = zustand({ absences: [weg] })
    const z = rechnung(s).wartezeiten.find((x) => x.bereich === w.bereich)!.warten.find((x) => x.pid === z0.pid)!
    // Nach dem letzten Mal war er in jeder Woche weg — das geht von der Wartezeit ab.
    expect(z.wochen).toBe(z0.wochen)
    expect(z.nichtEinteilbar).toBe(z.wochen! - 1)
    expect(z.wartend).toBe(1)
    const { container } = zeige(s)
    const zeile = wartezeitenZeilen(container, w.bereich).find((r) => r.querySelector('.aw-zeile-name')?.textContent === displayName(DEMO.persons.find((p) => p.id === z0.pid)!))!
    expect(zeile.querySelector('.aw-zeile-zahl')?.textContent).toContain(fill(t.awDavonNichtEinteilbar, { dauer: zeitspanne(z.nichtEinteilbar, 'week', 'de') }))
  })

  /** Der erste Hinweis „Lange Wartezeit" — „Alle Hinweise" gedrückt, wenn er hinter den ersten sechs steht. */
  function warteHinweis(c: HTMLElement, s: AppState): { knopf: HTMLElement; bereich: string } {
    const liste = rechnung(s).hinweise
    const i = liste.findIndex((h) => h.art === 'wartet')
    const h = liste[i]
    if (h?.art !== 'wartet') throw new Error('kein Hinweis „Lange Wartezeit"')
    if (i >= HINWEISE_SICHTBAR) fireEvent.click(knopf(c, t.awAlleHinweise))
    return { knopf: c.querySelectorAll<HTMLElement>('.aw-hinweis')[i]!, bereich: h.bereich }
  }

  it('wer lange wartet, steht je Bereich: der Hinweis öffnet am Handy die Wartezeiten mit diesem Bereich', () => {
    const s = zustand(JAHR)
    const { container } = zeige(s)
    const { knopf: hinweis, bereich } = warteHinweis(container, s)
    const name = bereichsName(bereich, DEMO.services, t, (x) => x)
    expect(hinweis.querySelector('.aw-hinweis-titel')?.textContent).toBe(fill(t.awHinweisWartezeit, { bereich: name }))
    fireEvent.click(hinweis)
    expect(titel(container)).toBe(t.awWartezeitenTitel)
    expect(container.querySelector<HTMLSelectElement>('.feld-wahl')?.value).toBe(bereich)
  })

  it('ab dem Tablet rollt er zu den Wartezeiten und stellt dort den Bereich ein', () => {
    breite('tablet')
    const gerollt: Element[] = []
    const vorher = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      gerollt.push(this)
    }
    try {
      const s = zustand(JAHR)
      const { container } = zeige(s)
      // Erst einen anderen Bereich wählen — der Hinweis stellt ihn zurück.
      const wahl = container.querySelector<HTMLSelectElement>(`section[aria-label="${t.awWartezeitenTitel}"] .feld-wahl`)!
      const { knopf: hinweis, bereich } = warteHinweis(container, s)
      const anderer = [...wahl.options].map((o) => o.value).find((v) => v !== bereich)!
      fireEvent.change(wahl, { target: { value: anderer } })
      expect(wahl.value).toBe(anderer)
      fireEvent.click(hinweis)
      expect(gerollt.map((e) => e.getAttribute('aria-label'))).toEqual([t.awWartezeitenTitel])
      expect(wahl.value).toBe(bereich)
    } finally {
      if (vorher) Element.prototype.scrollIntoView = vorher
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('die Wartezeiten rechnen über das Jahr — bei drei Monaten steht derselbe übliche Abstand da', () => {
    const { container } = zeige(zustand(JAHR))
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-kachel')].find((k) => k.querySelector('.aw-kachel-titel')?.textContent === t.awWartezeitenTitel)!)
    const jahr = container.querySelector('.aw-erklaerung')?.textContent
    zurueck(container)
    fireEvent.click(knopf(container, zeitspanne(3, 'month', 'de')))
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-kachel')].find((k) => k.querySelector('.aw-kachel-titel')?.textContent === t.awWartezeitenTitel)!)
    expect(container.querySelector('.aw-erklaerung')?.textContent).toBe(jahr)
  })
})

/* ---- Pflege der Bereiche ------------------------------------------------------ */

describe('Ohne Bereich eingeteilt (Jahresprobe)', () => {
  /** Der erste Hinweis „Ohne Bereich eingeteilt" und wen er meint. */
  const ohne = () => {
    const h = rechnung(zustand()).hinweise.find((x) => x.art === 'ohneBereich')
    if (h?.art !== 'ohneBereich') throw new Error('kein Hinweis „Ohne Bereich eingeteilt"')
    return h
  }

  it('der Hinweis nennt Bereich und Zahl — die Person zeigt den Bereich hinten, ohne Erwartung', () => {
    const h = ohne()
    const s = zustand()
    const { container } = zeige(s)
    fireEvent.click(knopf(container, t.awAlleHinweise))
    const name = displayName(DEMO.persons.find((p) => p.id === h.pid)!)
    const hinweis = [...container.querySelectorAll<HTMLElement>('.aw-hinweis')].find((b) => b.querySelector('.aw-hinweis-titel')?.textContent === fill(t.awHinweisOhneBereich, { name }))!
    const erster = h.bereiche[0]!
    expect(hinweis.querySelector('.aw-hinweis-detail')?.textContent).toContain(
      fill(t.awBereichZahl, { bereich: bereichsName(erster.bereich, DEMO.services, t, (x) => x), n: String(erster.n) }),
    )
    fireEvent.click(hinweis)
    expect(titel(container)).toBe(name)
    const zeilen = [...container.querySelectorAll(`section[aria-label="${t.awJeBereich}"] .aw-zeile`)]
    const ohneZeilen = zeilen.filter((z) => z.querySelector('.klein-text')?.textContent?.startsWith(t.awOhneBereich))
    expect(ohneZeilen.map((z) => z.querySelector('.aw-zeile-name')?.textContent)).toEqual(
      expect.arrayContaining(h.bereiche.map((b) => bereichsName(b.bereich, DEMO.services, t, (x) => x))),
    )
    // Ohne Erwartung, ohne „mehr" oder „weniger" — und hinter den eigenen Bereichen, die es tragen.
    for (const z of ohneZeilen) expect(z.querySelector('.aw-marke')).toBeNull()
    for (const z of zeilen.slice(0, zeilen.indexOf(ohneZeilen[0]!))) expect(z.querySelector('.aw-marke')).not.toBeNull()
    expect(zeilen.indexOf(ohneZeilen[0]!)).toBeGreaterThan(0)
    expect(zeilen.slice(zeilen.indexOf(ohneZeilen[0]!))).toEqual(ohneZeilen)
  })

  it('am Desktop steht die Zahl umrandet in der Tabelle — mit eigenem Eintrag in der Legende', () => {
    breite('desktop')
    const { container } = zeige(zustand())
    const zelle = container.querySelector('.aw-matrix .aw-zelle.is-ohne-bereich')!
    expect(zelle.textContent).toMatch(/^\d+$/)
    expect(zelle.closest('td')?.getAttribute('aria-label')).toContain(`${zelle.textContent}, ${t.awOhneBereich}`)
    const legende = [...container.querySelectorAll('.aw-matrix-karte .aw-legende-eintrag')].map((e) => e.textContent)
    expect(legende).toContain(t.awOhneBereichEingeteilt)
  })

  it('„Zu oft, zu selten" vergleicht Aufgaben und alles mit den Hilfsdiensten — die Schulungsaufgaben eigens nicht mehr', () => {
    const { container } = zeige(zustand())
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-kachel')][0]!)
    const wahl = container.querySelector(`[role="group"][aria-label="${t.awVergleich}"]`)!
    expect([...wahl.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t.awAufgaben, t.awHilfsdienste])
    expect(container.querySelector('.aw-erklaerung')?.textContent).toContain(t.awErklaerungOhneBereich)
  })
})

/* ---- In Worten statt als Balken (T138) ---------------------------------------- */

describe('„Zu oft, zu selten" in Worten (T138)', () => {
  /** Was neben dem Namen steht — gegen die gerundete Erwartung, wie sie in der Zeile steht. */
  function marke(z: { n: number; erwartet: number; lage: string }): string {
    const abstand = String(Math.abs(z.n - Math.round(z.erwartet)))
    return z.lage === 'oft' ? fill(t.awMehrN, { n: abstand }) : z.lage === 'selten' ? fill(t.awWenigerN, { n: abstand }) : t.awPasst
  }

  /** Die Unteransicht, alle Zeilen offen — je Zeile die Marke und die Zahlen. */
  function zeilenLesen(c: HTMLElement): [string | null | undefined, string | null | undefined][] {
    c.querySelectorAll<HTMLElement>('.aw-mehr').forEach((m) => fireEvent.click(m))
    return [...c.querySelectorAll<HTMLElement>('.aw-zeile')].map((z) => [
      z.querySelector('.aw-marke')?.textContent,
      z.querySelector('.aw-zeile-zahl')?.textContent,
    ])
  }

  it('je Person „6 mehr", „passt" oder „3 weniger" — darunter die Zahl gegen die Erwartung', () => {
    // Bis zum 24.10.2026 ein Balken mit Feld, Strich und Rot: „Das erschließt
    // sich nicht jedem so einfach, wie das zu lesen ist" (Betreiber).
    const s = zustand(JAHR)
    const v = rechnung(s).verteilungen.aufgaben
    const { container } = zeige(s)
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-kachel')][0]!)
    expect(zeilenLesen(container)).toEqual(
      [...v.oft, ...v.rahmen, ...v.selten].map((z) => [marke(z), fill(t.awTextAufgaben, { n: String(z.n), e: String(Math.round(z.erwartet)) })]),
    )
    // Alle drei Lagen kommen vor — und eine Erwartung, die erst gerundet aufgeht.
    expect(v.oft.length * v.rahmen.length * v.selten.length).toBeGreaterThan(0)
    expect([...v.oft, ...v.selten].some((z) => !Number.isInteger(z.erwartet))).toBe(true)
  })

  it('mit den Hilfsdiensten zählt die Zeile alles und nennt die Hilfsdienste darin', () => {
    const s = zustand(JAHR)
    const v = rechnung(s).verteilungen.hilfsdienste
    const { container } = zeige(s)
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-kachel')][0]!)
    fireEvent.click(knopf(container, t.awHilfsdienste))
    expect(zeilenLesen(container)).toEqual(
      [...v.oft, ...v.rahmen, ...v.selten].map((z) => [
        marke(z),
        `${fill(t.awTextGesamt, { n: String(z.n), e: String(Math.round(z.erwartet)) })} · ${fill(t.awDavonHilfsdienste, { n: String(z.hilfsdienste) })}`,
      ]),
    )
  })

  it('bei der Person trägt jeder eigene Bereich seine Marke — auch „mehr" und „weniger"', () => {
    const s = zustand(JAHR)
    const a = rechnung(s)
    const abwesend = abwesenheitenVon(s.absences, s.weeks, s.congregation.times)
    const bildVon = (pid: string) => personBild(a.grundlage, s.weeks, s.persons, abwesend, pid, { fsWeeks: s.fsWeeks, zeiten: s.congregation.times })!
    // Eine Person mit einem eigenen Bereich, der daneben liegt — sonst stünde überall „passt".
    const bild = s.persons.map((p) => bildVon(p.id)).find((b) => b?.bereiche.some((x) => x.hat && lageVon(x.n, x.erwartet) !== 'rahmen'))
    if (!bild) throw new Error('niemand liegt in einem Bereich daneben')
    breite('desktop')
    const { container } = zeige(s)
    const name = displayName(s.persons.find((p) => p.id === bild.pid)!)
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-matrix .aw-zeile-name')].find((b) => b.textContent === name)!)
    const zeilen = [...container.querySelectorAll<HTMLElement>(`section[aria-label="${t.awJeBereich}"] .aw-zeile`)]
    const eigene = bild.bereiche.filter((b) => b.hat)
    expect(zeilen.slice(0, eigene.length).map((z) => z.querySelector('.aw-marke')?.textContent)).toEqual(
      eigene.map((b) => marke({ ...b, lage: lageVon(b.n, b.erwartet) })),
    )
  })

  it('weder Diagramm noch Tabelle zur Wahl — die Zeilen sagen dieselben Zahlen', () => {
    const { container } = zeige(zustand())
    fireEvent.click([...container.querySelectorAll<HTMLElement>('.aw-kachel')][0]!)
    expect([...container.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'))).toEqual([t.awVergleich])
    expect(container.querySelector('.aw-ansicht table')).toBeNull()
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
  for (let i = 0; i < 5; i++) {
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

  /** Der Bestand ohne deutsche Namen, über `n` Wochen gestreckt wie oben. */
  function fremd(lang: Lang, n = 20): AppState {
    const z = bestand.zustand
    const weeks: Week[] = []
    const fsWeeks: FsInstance[][] = []
    for (let vor = n; vor >= 1; vor--) {
      const i = (n - vor) % z.weeks.length
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

  /*
   * Erst in einem Jahr warten welche lange: Die Hinweise „Lange Wartezeit"
   * liest ein eigener, schmaler Durchgang — der ganze über 52 Wochen dauerte
   * je Sprache zwanzig Sekunden.
   */
  it.each(SPRACHEN)('%s: die Hinweise eines Jahres', (lang) => {
    const finde = deutschFinder(lang, bestand.erfunden)
    const s = fremd(lang, 52)
    expect(rechnung(s).hinweise.some((h) => h.art === 'wartet'), 'kein Hinweis „Lange Wartezeit"').toBe(true)
    const { container } = zeige(s)
    fireEvent.click(container.querySelector<HTMLElement>('.aw-hinweise-karte .aw-mehr')!)
    const zeilen = sichtbareTexte()
    const reste = [...new Set(zeilen.flatMap((zeile) => finde(zeile).map((r) => `„${r.wort}" in „${zeile.slice(0, 100)}"`)))]
    expect(reste).toEqual([])
  })

  it('die Ziffern der Legende und der Marken kommen aus der Sprache — auf Persisch', async () => {
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
    // Die Achse der Wartezeiten ist mit den Balken gegangen (T138); gezählt wird jetzt in den Marken.
    const marken = [...container.querySelectorAll('.aw-marke')].map((e) => e.textContent ?? '')
    expect(marken.filter((m) => /\p{Nd}/u.test(m)).length).toBeGreaterThan(0)
    expect(marken.join(' ')).not.toMatch(/[0-9]/)
  })

  it('die Probe findet Deutsch, wo es steht', () => {
    // Dieselben Ansichten auf Deutsch, mit den Augen der fremden Prüfungen gelesen.
    const zeilen = allesAblesen(fremd('de'))
    for (const lang of ['uk', 'en'] as const) {
      expect(zeilen.flatMap(deutschFinder(lang, bestand.erfunden)).length, lang).toBeGreaterThan(50)
    }
  })
})
