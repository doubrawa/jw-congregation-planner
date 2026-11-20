import type { Lang } from '../src/data/types'
import { APP_LANGS, LOCALES } from '../src/i18n/langs'
import { langChoices } from '../src/i18n/langnames'
import { DE, dict } from '../src/i18n/ui'
import { codeGruppiert } from '../supabase/functions/_shared/anmeldung.ts'
import { FRAG } from '../supabase/functions/_shared/i18n/translate-data.ts'
import { ziffernSatz } from '../supabase/functions/_shared/i18n/ziffern-der-sprache.ts'

/**
 * **Deutsch in einer fremdsprachigen Oberfläche finden** (T123) — zwei Wege,
 * je nach Schrift der Zielsprache.
 *
 * - **Kyrillisch und Arabisch** (ru, uk, ar, fa): Jedes lateinische Wort ist
 *   verdächtig. Was dort stehen darf, ist eine kurze, geschlossene Liste — der
 *   Produktname, „jw.org", Kürzel wie „PDF" oder „XML", die Namen der
 *   App-Sprachen in ihrer eigenen Schrift — dazu die erfundenen Namen des
 *   Bestands (`fremdsprachiger-bestand.ts`). Das findet auch Englisch, das
 *   durchrutscht, und nicht nur Wörter aus dem Wörterbuch.
 * - **Lateinische Schrift** (en, es, fr, it, pl, ro, tr): Ein Wort ist deutsch,
 *   wenn es im deutschen Wörterbuch oder unter den kanonisch deutschen
 *   Programm-Begriffen steht **und** nirgends in den Texten der Zielsprache —
 *   „Start", „Admin", „Plan" oder „Partner" heißen dort ebenso. Dazu jedes ä,
 *   ö, ü und ß (Türkisch kennt ö und ü selbst).
 *
 * Die Ablesung gehört dazu: Textknoten **einzeln** (nicht `textContent`, das
 * Nachbarn ohne Trenner verklebt), dazu alles, was ein Vorleseprogramm sagt
 * oder ein Feld vorbelegt — `aria-label`, `title`, `placeholder`, `alt`,
 * `aria-description`, `aria-roledescription`, `aria-valuetext` und der Wert
 * eines Textfelds.
 */

/** Ein deutscher Rest: das verdächtige Wort und die Zeile, in der es steht. */
export interface DeutscherRest {
  wort: string
  zeile: string
}

/** Was in Kyrillisch und Arabisch lateinisch dastehen darf — mit Grund. */
const LATEIN_ERLAUBT: Record<string, string> = {
  Versammlung: 'Produktname „Versammlung.app" (die Wortmarke ist ausgenommen, aber er steht auch im Kopf, solange keine Versammlung geladen ist)',
  app: 'Produktname „Versammlung.app"',
  jw: '„jw.org"',
  org: '„jw.org"',
  PDF: 'Dateiformat',
  XML: 'Dateiformat (Vortragsplan)',
  QR: 'QR-Code',
  // Film „Erste Schritte" (22.10.2026): Gerät und Browser, wie Google und Apple
  // sie auch auf Russisch und Ukrainisch schreiben (wie `pushPromptIos`).
  Android: 'Name des Betriebssystems',
  iPhone: 'Name des Geräts',
  Safari: 'Name des Browsers',
  // Wo Push geht, wenn die App den Push-Dienst eines Browsers nicht kennt
  // (`toastPushDienstUnbekannt`) — auf Russisch und Ukrainisch lateinisch wie Safari.
  Chrome: 'Name des Browsers',
  Edge: 'Name des Browsers',
  Firefox: 'Name des Browsers',
  S: 'Formularnummer „S-89"',
  Zoom: 'Name des Dienstes (Zoom-Ordner)',
  // „Per Nachricht" im Blatt „Link senden" (24.10.2026): die Dienste, wie sie
  // sich auch auf Russisch und Ukrainisch schreiben.
  WhatsApp: 'Name des Dienstes',
  Signal: 'Name des Dienstes',
  SMS: 'Kurznachricht — so steht es auf jedem Handy',
  // Die Kürzel der Publikationen schreibt das Arbeitsheft auch auf Ukrainisch
  // und Russisch lateinisch („th урок 2") — gemessen, siehe REF in translate-data.ts.
  th: 'Kürzel einer Publikation, wie das Arbeitsheft es schreibt',
  lmd: 'Kürzel einer Publikation, wie das Arbeitsheft es schreibt',
  lff: 'Kürzel einer Publikation, wie das Arbeitsheft es schreibt',
  wcg: 'Kürzel einer Publikation, wie das Arbeitsheft es schreibt',
}

/**
 * Die App-Sprachen heißen in der Sprachwahl in ihrer eigenen Schrift
 * („Español", „Türkçe") — in jeder Oberfläche gleich. Gelesen aus der Tabelle,
 * nicht abgeschrieben.
 */
function sprachnamen(): string[] {
  return APP_LANGS.map((l) => l.label).filter((name) => /^\p{Script=Latin}+$/u.test(name))
}

const NICHT_LATEINISCH: ReadonlySet<string> = new Set(['ru', 'uk', 'ar', 'fa'])

/** Wörter einer Zeichenkette — Buchstabenfolgen ab `min` Zeichen. */
function woerter(text: string, min: number): string[] {
  return text.match(new RegExp(`\\p{L}{${min},}`, 'gu')) ?? []
}

/**
 * Die Wörter, die es in der Zielsprache gibt (klein geschrieben): ihr
 * Wörterbuch, ihre Programm-Begriffe, die Sprachnamen in ihrer Sprache — dort
 * steht „nicaragüense" mit ü —, Wochentage und Monate, wie Intl sie schreibt.
 * Verlangt die nachgeladenen Overlays und Sprachnamen (`loadOverlay`,
 * `loadLangNames`), sonst prüfte sie gegen den EN-Rückfall.
 */
function zielWoerter(ziel: Exclude<Lang, 'de'>, erfunden: ReadonlySet<string>): Set<string> {
  const dort = new Set<string>()
  const auchDort = (text: string) => woerter(text, 2).forEach((w) => dort.add(w.toLowerCase()))
  Object.values(dict(ziel)).forEach(auchDort)
  Object.values(FRAG[ziel] ?? {}).forEach(auchDort)
  langChoices(ziel).forEach((c) => auchDort(c.label))
  const ort = LOCALES[ziel]
  for (let monat = 0; monat < 12; monat++) {
    const tag = new Date(2026, monat, 5)
    for (const art of [{ month: 'long' }, { month: 'short' }, { day: 'numeric', month: 'long' }, { weekday: 'long' }, { weekday: 'short' }] as const) {
      auchDort(new Intl.DateTimeFormat(ort, art).format(tag))
    }
  }
  ;[...Object.keys(LATEIN_ERLAUBT), ...sprachnamen(), ...erfunden].forEach(auchDort)
  return dort
}

/** Deutsche Wörter (klein geschrieben): aus dem Wörterbuch und den kanonisch deutschen Programm-Begriffen. */
function deutscheWoerter(): Set<string> {
  const deutsch = new Set<string>()
  for (const wert of Object.values(DE)) for (const w of woerter(wert, 3)) deutsch.add(w.toLowerCase())
  for (const sprache of Object.values(FRAG)) for (const begriff of Object.keys(sprache)) for (const w of woerter(begriff, 3)) deutsch.add(w.toLowerCase())
  return deutsch
}

/** Was wie ein Anmelde-Code aussieht: zwei Gruppen, die erste mit vier Zeichen. */
export const CODE_FORM = /\b[A-Z0-9]{4} [A-Z0-9]{1,4}\b/g

/**
 * Anmelde-Codes herausnehmen: Sie stehen in jeder Sprache lateinisch da
 * („K7RD 2QWM" im Profil, beim Link einer Person, im Feld der Anmeldung) —
 * zum Abtippen, nicht zum Lesen. Herausgenommen wird nur, was die App selbst
 * so zeigt (`codeGruppiert`, auch ein angefangener Code im Feld); ein Wort mit
 * I oder O gehört nie dazu. Dass kein Text der App diese Form hat, hält
 * `deutsch-erkennen.test.ts` fest.
 */
export function ohneCodes(text: string): string {
  return text.replace(CODE_FORM, (span) => (codeGruppiert(span) === span ? ' ' : span))
}

/** E-Mail-Adressen und Links herausnehmen — sie gehören niemandem. */
function ohneAdressen(zeile: string): string {
  return zeile.replace(/[\w.+-]+@[\w.-]+/g, ' ').replace(/https?:\/\/\S+|localhost:\d+\S*/g, ' ')
}

/**
 * **Ziffern 0–9 in einer Sprache mit eigenen** (heute Persisch, `ziffernSatz`).
 * Dort steht jede Zahl der Oberfläche in den Ziffern der Sprache, wie das Datum
 * aus `Intl` daneben (Betreiber, 20.11.2026). Lateinisch bleiben darf, was man
 * abtippt oder aufruft statt liest — Adressen, Links, Anmelde-Codes —, die
 * Formularnummer „S-89" und eine Zahl, die zu einem Datum des Bestands gehört
 * (`daten`: eine erfundene Folge samt Zahl, etwa die Anschrift des Saals): Daten
 * stehen da, wie jemand sie eingegeben hat. `null` für Sprachen mit 0–9.
 */
export function ziffernFinder(ziel: Lang, daten: RegExp): ((zeile: string) => DeutscherRest[]) | null {
  if (!ziffernSatz(ziel)) return null
  const datenMitZahl = new RegExp(`(?:${daten.source})\\s*[0-9]+`, 'g')
  return (zeile) => {
    const text = ohneCodes(ohneAdressen(zeile)).replace(/\bS-89\b/g, ' ').replace(datenMitZahl, ' ')
    return (text.match(/[0-9]+/g) ?? []).map((wort) => ({ wort, zeile }))
  }
}

/**
 * Ein Prüfer für eine Zielsprache: liefert zu einer Zeile die deutschen Reste.
 * Adressen, Links und Anmelde-Codes werden vorher herausgenommen — sie gehören
 * niemandem.
 */
export function deutschFinder(ziel: Exclude<Lang, 'de'>, erfunden: ReadonlySet<string>): (zeile: string) => DeutscherRest[] {
  // Ohne Rücksicht auf Groß und Klein: Das Feld für den Anmelde-Code schreibt
  // jede Eingabe groß, auch eine erfundene Folge.
  const erlaubt = new Set([...Object.keys(LATEIN_ERLAUBT), ...sprachnamen(), ...erfunden].map((w) => w.toLowerCase()))
  const frei = (wort: string) => !erlaubt.has(wort.toLowerCase())
  const lateinisch = !NICHT_LATEINISCH.has(ziel)
  const dort = lateinisch ? zielWoerter(ziel, erfunden) : new Set<string>()
  const deutsch = lateinisch ? new Set([...deutscheWoerter()].filter((w) => !dort.has(w))) : null
  // Türkisch schreibt ö und ü selbst.
  const umlaut = ziel === 'tr' ? /[äßÄ]/ : /[äöüßÄÖÜ]/
  return (zeile) => {
    const text = ohneCodes(ohneAdressen(zeile))
    if (!deutsch) {
      return (text.match(/[A-Za-zÀ-ɏ]{2,}/g) ?? []).filter(frei).map((wort) => ({ wort, zeile }))
    }
    const reste = woerter(text, 2)
      .filter((w) => frei(w) && deutsch.has(w.toLowerCase()))
      .map((wort) => ({ wort, zeile }))
    // Ein Umlaut in einem Wort, das die Zielsprache nicht kennt.
    for (const wort of woerter(text, 1)) {
      if (umlaut.test(wort) && frei(wort) && !dort.has(wort.toLowerCase())) reste.push({ wort, zeile })
    }
    return reste
  }
}

/** Was nur der Fehlersuche dient oder der Eigenname des Programms ist — bewusst unübersetzt. */
const NICHT_ABLESEN = '.seitenmenue-app, .login-wordmark, .prof-build, .prof-diag, script, style'

const ATTRIBUTE = ['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'aria-valuetext'] as const

/**
 * Alles, was sichtbar ist oder vorgelesen wird — unter `body`, denn Blätter,
 * Toasts und Druckbögen hängen sich dort an, nicht im Container der App.
 *
 * **Ein Gang für Texte und Attribute**, der einen ausgenommenen Teilbaum als
 * Ganzes überspringt (`FILTER_REJECT`). Bis zum 31.10.2026 fragte jeder
 * Textknoten und jedes Element mit Attribut seine ganze Ahnenreihe gegen die
 * Selektoren von `NICHT_ABLESEN` ab — in jsdom ein großer Posten der
 * langsamsten Proben. Reihenfolge und Auswahl sind dieselben geblieben: erst
 * die Texte, dann die Attribute, dann die Felder.
 */
export function sichtbareTexte(wurzel: ParentNode = document.body, { felder: mitFeldern = true } = {}): string[] {
  const texte: string[] = []
  const attribute: string[] = []
  if (!(wurzel as Element).closest?.(NICHT_ABLESEN)) {
    const gang = document.createTreeWalker(wurzel as Node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(NICHT_ABLESEN) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    })
    for (let n = gang.nextNode(); n; n = gang.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.nodeValue?.trim()
        if (text) texte.push(text)
        continue
      }
      for (const attr of ATTRIBUTE) {
        const wert = (n as Element).getAttribute(attr)?.trim()
        if (wert) attribute.push(wert)
      }
    }
  }
  // Die Werte der Felder lässt aus, wer nur prüft, was die App selbst schreibt
  // (die Ziffern): In einem Feld steht, was jemand getippt hat.
  return [...texte, ...attribute, ...(mitFeldern ? feldWerte(wurzel) : [])]
}

/** Die Werte der Textfelder — was jemand getippt hat; `sichtbareTexte` hängt sie hinten an. */
export function feldWerte(wurzel: ParentNode = document.body): string[] {
  const felder: string[] = []
  for (const feld of wurzel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], input:not([type]), input[type="search"], textarea')) {
    const wert = feld.value.trim()
    if (wert) felder.push(wert)
  }
  return felder
}
