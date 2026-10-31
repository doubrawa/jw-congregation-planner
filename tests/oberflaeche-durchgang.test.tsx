/** @vitest-environment happy-dom */
import { appendFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { AppState } from '../src/app/context'
import type { Lang } from '../src/data/types'
import { loadLangNames } from '../src/i18n/langnames'
import { APP_LANGS } from '../src/i18n/langs'
import { loadOverlay } from '../src/i18n/ui'
import { deutschFinder, sichtbareTexte } from './deutsch-erkennen'
import { ERFUNDEN_MUSTER, fremdsprachigerBestand, type FremdBestand } from './fremdsprachiger-bestand'

/**
 * **Ein Durchgang durch die ganze Oberfläche, in einer fremden Sprache**
 * (T123, Teil 2) — jeder Knopf, jedes Feld, jede Auswahl, wie ein Mensch es
 * täte, der alles einmal anfasst.
 *
 * `src/i18n/oberflaeche-fremdsprache.test.tsx` misst ausgewählte Zustände:
 * die Bildschirme, ein paar Blätter, die Sonderlagen. Was erst hinter einem
 * Tipp aufgeht — ein Blatt mit eigenem Zustand, ein Toast, ein Druckbogen, die
 * Meldung eines Felds —, sah es nur, wenn jemand den Zustand eigens beschrieb.
 * Genau dort überlebt eine fehlende Übersetzung am längsten.
 *
 * Deshalb sucht dieser Durchgang die Zustände selbst:
 *
 *  1. Er startet auf jedem Bildschirm, jedem Reiter und in den Sonderlagen
 *     (`STARTS`) — mit der Uhr im Bestand und mit dem Bestand ohne deutsche
 *     Wörter (`fremdsprachiger-bestand.ts`).
 *  2. Von jeder neuen Ansicht aus tippt er jeden Knopf an, füllt jedes
 *     Textfeld (einmal mit einer erfundenen Folge, einmal leer) und stellt jede
 *     Auswahl um — immer auf frisch gezeichneter App, damit kein Schritt vom
 *     vorigen abhängt. Gleichartige Knöpfe (die Zeilen einer Liste) zählen
 *     einmal je Ort: im Blatt nach seiner Überschrift, auf dem Bildschirm je
 *     Start, im Rahmen (Menü, Kopf) einmal überhaupt.
 *  3. Jede Ansicht wird abgelesen wie in `deutsch-erkennen.ts` beschrieben —
 *     Text, `aria-label`, `title`, `placeholder`, `alt`, Feldwerte, unter
 *     `body`, also samt Blättern, Toasts und Druckbögen.
 *
 * **In der Suite läuft er auf Ukrainisch, eine Ebene tief.** Ukrainisch, weil
 * dort jedes lateinische Wort auffällt — Deutsch wie Englisch, nicht nur
 * Wörter aus dem Wörterbuch. Eine Ebene, weil jede Ansicht frisch gezeichnet
 * wird: drei Ebenen in allen elf Sprachen dauern über eine Stunde. Den vollen
 * Durchgang startet man von Hand:
 *
 *     T123_SPRACHEN=alle T123_TIEFE=3 npx vitest run tests/oberflaeche-durchgang.test.tsx
 *
 * (`T123_SPRACHEN=en,fr`, `T123_STARTS=planen-mid,personen`, `T123_TIEFE=2` —
 * ein Lauf je Bash-Aufruf sollte unter zehn Minuten bleiben; drei Ebenen in
 * einer Sprache sind etwa fünf.)
 */

vi.mock('../src/app/hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../src/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: () => {} }))

const { default: App } = await import('../src/App')

// jsdom kennt das alles nicht: Die Gesten fragen nach `matchMedia`, der Druck
// ruft `print`, und ein Sprung zum Bereich (das Einspringen auf „Meine
// Aufgaben") rollt mit `scrollIntoView` — ohne ihn fiele der Bildschirm in
// seine Fehlergrenze, und der Durchgang sähe statt der Aufgaben die
// Fehlermeldung.
window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as typeof window.matchMedia
window.print = () => {}
Element.prototype.scrollIntoView = () => {}

type Fremd = Exclude<Lang, 'de'>
const FREMD: Fremd[] = APP_LANGS.map((l) => l.code).filter((c): c is Fremd => c !== 'de')

/** Von Hand gestartet (`T123_SPRACHEN=…`): alle Starts, drei Ebenen, sofern nicht anders gewählt. */
const VON_HAND = Boolean(process.env.T123_SPRACHEN)
const SPRACHEN: Fremd[] = (() => {
  const wahl = process.env.T123_SPRACHEN
  if (!wahl) return ['uk']
  return wahl === 'alle' ? FREMD : (wahl.split(',') as Fremd[])
})()
const TIEFE = Number(process.env.T123_TIEFE ?? (VON_HAND ? 3 : 1))

/** Wo der Durchgang beginnt — jeder Bildschirm, jeder Reiter, die Sonderlagen. */
const STARTS: Array<[string, Partial<AppState>]> = [
  ['start', { screen: 'start' }],
  ['programm-mid', { screen: 'programm', tab: 'mid', terminGewaehlt: true }],
  ['programm-we', { screen: 'programm', tab: 'we', terminGewaehlt: true }],
  ['programm-treffpunkte', { screen: 'programm', tab: 'fs', fsBereich: 'treffpunkte', terminGewaehlt: true }],
  ['programm-besuche', { screen: 'programm', tab: 'fs', fsBereich: 'gruppenbesuche', terminGewaehlt: true }],
  ['programm-trolleys', { screen: 'programm', tab: 'fs', fsBereich: 'trolleys', terminGewaehlt: true }],
  ['programm-plaene', { screen: 'programm', tab: 'wp', terminGewaehlt: true }],
  ['aufgaben', { screen: 'aufgaben' }],
  ['mitteilungen', { screen: 'mitteilungen' }],
  ['planen-mid', { screen: 'planen', tab: 'mid', terminGewaehlt: true }],
  ['planen-we', { screen: 'planen', tab: 'we', terminGewaehlt: true }],
  ['planen-treffpunkte', { screen: 'planen', tab: 'fs', fsBereich: 'treffpunkte', terminGewaehlt: true }],
  ['planen-besuche', { screen: 'planen', tab: 'fs', fsBereich: 'gruppenbesuche', terminGewaehlt: true }],
  ['planen-grundplan', { screen: 'planen', tab: 'fs', fsBereich: 'grundplan', terminGewaehlt: true }],
  ['planen-trolleys', { screen: 'planen', tab: 'fs', fsBereich: 'trolleys', terminGewaehlt: true }],
  ['planen-plaene', { screen: 'planen', tab: 'wp', terminGewaehlt: true }],
  ['planen-zusagen', { screen: 'planen', tab: 'zusagen', terminGewaehlt: true }],
  ['planung', { screen: 'planung' }],
  // Unter der Uhr des Bestands liegt noch keine Woche zurück: nur der leere
  // Zustand. Die Ansichten mit Zahlen liest `src/auswertung/AuswertungScreen.test.tsx`.
  ['auswertung', { screen: 'auswertung' }],
  ['personen', { screen: 'personen' }],
  ['personen-detail', { screen: 'personen', selectedPersonId: 'p9' }],
  ['einstellungen', { screen: 'einstellungen' }],
  ['profil', { screen: 'profil' }],
  ['anmeldung', { screen: 'login', userId: null, congregationId: null }],
  ['blatt-beim-oeffnen', { screen: 'start', confirmOpen: true }],
  ['versammlungssprache', { screen: 'einstellungen', langSheetOpen: true, langSheetFor: 'cong' }],
  ['weitere-sprache', { screen: 'einstellungen', langSheetOpen: true, langSheetFor: 'alt' }],
  ['dienst-freigabe', { screen: 'einstellungen', svcSheet: 'mik' }],
  ['offline', { screen: 'start', staleAt: Date.UTC(2026, 8, 7, 7) }],
  ['versammlung-leer', { screen: 'start', dataEmpty: true, planner: false }],
  ['laedt', { screen: 'start', dataStatus: 'loading' }],
  ['ohne-versammlung-abgemeldet', { screen: 'login', userId: null, congregationId: null, keineVersammlung: true }],
  ['ladefehler', { screen: 'start', dataStatus: 'error' }],
  ['verkuendiger', { screen: 'start', planner: false }],
  ['verkuendiger-programm', { screen: 'programm', planner: false, tab: 'mid', terminGewaehlt: true }],
  ['planer', { screen: 'start', planner: false, zuteiler: true }],
  ['ohne-eigene-person', { screen: 'start', personId: null }],
  ['keine-wochen', { screen: 'programm', weeks: [], fsWeeks: [] }],
]

/**
 * Die Starts der Suite: ein Bildschirm je Thema, dazu die Anmeldung. Die
 * übrigen Reiter und Sonderlagen kommen im Durchgang von Hand hinzu.
 */
const KERN = new Set(['start', 'programm-mid', 'programm-treffpunkte', 'aufgaben', 'mitteilungen', 'planen-mid', 'personen-detail', 'einstellungen', 'profil', 'anmeldung'])

const GEWAEHLTE_STARTS = (() => {
  const wahl = process.env.T123_STARTS
  if (wahl) return STARTS.filter(([name]) => wahl.split(',').includes(name))
  return VON_HAND ? STARTS : STARTS.filter(([name]) => KERN.has(name))
})()

/**
 * Was der Durchgang finden darf, weil es so gewollt ist — mit Grund.
 *
 * Die Sprachnamen der Versammlungssprachen kommen von jw.org, je Bediensprache
 * aus dem „Lesen in"-Umschalter abgelesen (`langnames.ts`). Wo jw.org einen
 * Namen nicht übersetzt, steht er dort englisch — und hier ebenso.
 */
const GEWOLLT: Partial<Record<Fremd, Record<string, string>>> = {
  uk: {
    'Cameroon Sign Language': 'jw.org führt den Namen auf Ukrainisch englisch',
    'Swahili (Katanga)': 'jw.org führt den Namen auf Ukrainisch englisch',
  },
}

const KLICKBAR =
  'button, [role="button"], [role="tab"], [role="switch"], [role="radio"], [role="checkbox"], [role="option"], [role="menuitem"], a[href], summary, input[type="checkbox"], input[type="radio"]'
const FELD = 'input[type="text"], input:not([type]), input[type="email"], input[type="search"], textarea'

const offen = (el: Element) => !el.closest('[inert]') && !(el as HTMLButtonElement).disabled
const klickbare = () => [...document.body.querySelectorAll<HTMLElement>(KLICKBAR)].filter(offen)
const felder = () => [...document.body.querySelectorAll<HTMLInputElement>(FELD)].filter(offen)
/** Die Wahl der App-Sprache bleibt draußen — sie stellt die Oberfläche um, und das ist kein Befund. */
const auswahlen = () =>
  [...document.body.querySelectorAll<HTMLSelectElement>('select')].filter(
    (el) => offen(el) && ![...el.options].some((o) => o.value === 'de'),
  )

type Schritt = { tippe: number } | { fuelle: number; wert: string } | { waehle: number; option: number }

/** Erfundene Folgen und Ziffern gleich machen — damit gleichartige Zeilen als eine zählen. */
const normal = (text: string) => text.replace(ERFUNDEN_MUSTER, 'X').replace(/\d+/g, '#').trim().slice(0, 40)
const art = (el: Element) =>
  [el.tagName, el.className, el.getAttribute('role'), el.parentElement?.className, normal(el.textContent ?? ''), normal(el.getAttribute('aria-label') ?? ''), (el as HTMLInputElement).placeholder].join('|')
/** Wo ein Element steht: im Blatt (nach seiner Überschrift), auf dem Bildschirm (je Start) oder im Rahmen. */
const ort = (el: Element, start: string) => {
  const blatt = el.closest('[role="dialog"]')
  if (blatt) return `blatt:${normal(blatt.getAttribute('aria-label') ?? '')}`
  return el.closest('.app-content') ? `bildschirm:${start}` : 'rahmen'
}
/** Woran eine Ansicht zu erkennen ist: Blätter, Überschriften, ein Druckbogen. */
const ansicht = () =>
  normal(
    [
      ...[...document.body.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute('aria-label') ?? ''),
      ...[...document.body.querySelectorAll('h1, h2')].map((h) => h.textContent ?? ''),
      document.body.querySelector('.druck-bogen') ? 'bogen' : '',
    ].join('|'),
  ) + document.body.querySelectorAll('[role="dialog"]').length

/** Ausstehendes erledigen lassen — ein Aufruf ohne Server scheitert, und erst danach kommt sein Toast. */
async function ruhe(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  })
}

interface Ergebnis {
  befunde: string[]
  ansichten: number
  blaetter: Set<string>
  toasts: Set<string>
  boegen: number
}

async function durchgang(lang: Fremd, bestand: FremdBestand, tiefe: number, starts = STARTS): Promise<Ergebnis> {
  const finde = deutschFinder(lang, bestand.erfunden)
  const gewollt = GEWOLLT[lang] ?? {}
  const befunde = new Map<string, string>()
  const blaetter = new Set<string>()
  const toasts = new Set<string>()
  let boegen = 0
  const zeige = async (over: Partial<AppState>, pfad: Schritt[]): Promise<boolean> => {
    render(<App start={() => ({ ...structuredClone(bestand.zustand), lang, congLang: lang, ...over })} />)
    for (const s of pfad) {
      if ('tippe' in s) {
        const el = klickbare()[s.tippe]
        if (!el) return false
        fireEvent.click(el)
      } else if ('fuelle' in s) {
        const el = felder()[s.fuelle]
        if (!el) return false
        fireEvent.focus(el)
        fireEvent.change(el, { target: { value: s.wert } })
        fireEvent.blur(el)
      } else {
        const el = auswahlen()[s.waehle]
        const option = el?.options[s.option]
        if (!el || !option) return false
        fireEvent.change(el, { target: { value: option.value } })
      }
    }
    if (pfad.length) await ruhe()
    return true
  }
  const gemacht = new Set<string>()
  const gesehen = new Set<string>()
  const warteschlange: Array<[string, Partial<AppState>, Schritt[]]> = starts.map(([name, over]) => [name, over, []])
  for (let eintrag = warteschlange.shift(); eintrag; eintrag = warteschlange.shift()) {
    const [name, over, pfad] = eintrag
    try {
      if (!(await zeige(over, pfad))) continue
      const wo = [name, ...pfad.map((s) => ('tippe' in s ? s.tippe : 'fuelle' in s ? `feld ${s.fuelle}` : `wahl ${s.waehle}.${s.option}`))].join(' › ')
      for (const zeile of sichtbareTexte()) {
        if (zeile in gewollt) continue
        for (const rest of finde(zeile)) {
          const schluessel = `„${rest.wort}" in „${zeile.slice(0, 120)}"`
          if (!befunde.has(schluessel)) befunde.set(schluessel, wo)
        }
      }
      document.body.querySelectorAll('[role="dialog"]').forEach((d) => blaetter.add(normal(d.getAttribute('aria-label') ?? '')))
      document.body.querySelectorAll('.toast').forEach((t) => toasts.add(t.textContent ?? ''))
      if (document.body.querySelector('.druck-bogen')) boegen++
      const sicht = `${name}|${ansicht()}`
      const schonGesehen = gesehen.has(sicht)
      gesehen.add(sicht)
      if (schonGesehen || pfad.length >= tiefe) continue
      const neu = (s: string) => !gemacht.has(s) && (gemacht.add(s), true)
      klickbare().forEach((el, i) => {
        if (neu(`${ort(el, name)}|k|${art(el)}`)) warteschlange.push([name, over, [...pfad, { tippe: i }]])
      })
      felder().forEach((el, i) => {
        if (!neu(`${ort(el, name)}|f|${art(el)}`)) return
        warteschlange.push([name, over, [...pfad, { fuelle: i, wert: [...bestand.erfunden][0] ?? 'Xabebo' }]])
        warteschlange.push([name, over, [...pfad, { fuelle: i, wert: '' }]])
      })
      auswahlen().forEach((el, i) => {
        if (!neu(`${ort(el, name)}|w|${art(el)}`)) return
        for (let o = 0; o < Math.min(el.options.length, 6); o++) warteschlange.push([name, over, [...pfad, { waehle: i, option: o }]])
      })
    } finally {
      cleanup()
    }
  }
  return { befunde: [...befunde].map(([was, wo]) => `${was}  ← ${wo}`), ansichten: gesehen.size, blaetter, toasts, boegen }
}

let bestand: FremdBestand

beforeAll(async () => {
  // Die Uhr im Bestand (Montag, 7. September 2026): Die Ansichten zeigen nur, was noch kommt.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
  await Promise.all(FREMD.map((code) => loadOverlay(code)))
  await Promise.all(FREMD.map((code) => loadLangNames(code)))
  bestand = await fremdsprachigerBestand()
})
afterEach(cleanup)

describe('Durchgang durch die ganze Oberfläche (T123)', () => {
  it.each(SPRACHEN)('%s: nirgends ungeklärtes Deutsch', async (lang) => {
    const { befunde, ansichten, blaetter, toasts, boegen } = await durchgang(lang, bestand, TIEFE, GEWAEHLTE_STARTS)
    if (VON_HAND) {
      // Was der Durchgang gesehen hat — in die Datei, die `T123_BERICHT` nennt.
      const bericht = process.env.T123_BERICHT
      const zeilen = [`${lang}: ${ansichten} Ansichten, ${blaetter.size} Blätter, ${toasts.size} Toasts, ${boegen} mit Druckbogen`]
      if (bericht) appendFileSync(bericht, [...zeilen, '', ...blaetter, '', ...toasts, '', ...befunde, '', ''].join('\n'))
    } else {
      // Die Gegenprobe zur leeren Liste: Ein Durchgang, der nichts öffnet, fände
      // auch nichts. Gemessen am 16.10.2026: 29 Blätter, 3 Toasts, ein Bogen.
      expect(blaetter.size, 'kaum ein Blatt aufgegangen').toBeGreaterThan(20)
      expect(toasts.size, 'kaum ein Toast gesehen').toBeGreaterThan(1)
      expect(boegen, 'kein Druckbogen gesehen').toBeGreaterThan(0)
    }
    expect(befunde).toEqual([])
  }, 900_000)

  it('der Durchgang findet ein eingeschmuggeltes deutsches Wort', async () => {
    /*
      Gegenprobe zum Prüfer selbst: dieselbe Ansicht auf Deutsch, gelesen mit
      den Augen der ukrainischen Prüfung — und mit denen der englischen, die
      nach Wörtern statt nach der Schrift sucht.
    */
    render(<App start={() => ({ ...structuredClone(bestand.zustand), lang: 'de', congLang: 'de', screen: 'einstellungen' })} />)
    const texte = sichtbareTexte()
    for (const lang of ['uk', 'en'] as const) {
      const finde = deutschFinder(lang, bestand.erfunden)
      expect(texte.flatMap(finde).length, lang).toBeGreaterThan(10)
    }
  })
})
