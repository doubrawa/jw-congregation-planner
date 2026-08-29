import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { dict, loadOverlay, NOTIF_TITLE_KEY, type Dict } from './ui'
import { DEMO_NOTIFICATIONS } from '../data/testdaten'

/**
 * **Der Titel jeder Mitteilung ist ein Schlüssel — sonst bleibt er deutsch.**
 *
 * Eine Mitteilung steht **kanonisch deutsch** in der Datenbank; die Glocke
 * übersetzt sie erst beim Anzeigen. Für den Rumpf besorgt das der
 * Fragment-Übersetzer (`tu`), für den **Titel** eine feste Zuordnung:
 * `NOTIF_TITLE_KEY` in `i18n/ui.ts`. Was dort nicht steht, wird unverändert
 * ausgegeben — auf Deutsch, in allen 33 Fremdsprachen, ohne Fehler und ohne
 * dass irgendwo etwas rot würde.
 *
 * Die Titel entstehen an **fünf** Stellen, drei davon außerhalb der App:
 *
 *  - `src/app/reducer.ts` — Import und Verhinderung,
 *  - `supabase/functions/send-reminders/index.ts` — die Erinnerung,
 *  - `supabase/functions/substitute/texte.ts` — Ersatz gesucht/gefunden,
 *  - `supabase/functions/send-plan/texte.ts` — „Plan senden" und der Entzug
 *    einer bestätigten Zuteilung (T99),
 *  - `src/data/testdaten.ts` — der Demo-Bestand (er sieht aus wie echte Daten
 *    und wird auch so angezeigt).
 *
 * Vier Quellen, eine Tabelle, und niemand, der sie zusammenhält: Genau diese
 * Bauart hat hier schon zweimal zu einem stillen Auseinanderlaufen geführt
 * (B8, T40). Deshalb liest diese Prüfung die Titel aus dem **Quelltext** der
 * Erzeuger, statt sie abzuschreiben.
 */

/** Quelltext von `src/` — über Vite, ohne Node-Abhängigkeit. */
const SRC = import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
/** Dasselbe für die Edge Functions; sie liegen außerhalb von `src/`. */
const EDGE = import.meta.glob('../../supabase/functions/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const quelle = (endet: string): string => {
  const treffer = Object.entries({ ...SRC, ...EDGE }).find(([p]) => p.endsWith(endet))
  if (!treffer) throw new Error(`Quelltext nicht gefunden: ${endet}`)
  return treffer[1]
}

/**
 * Titel, die der Reducer schreibt.
 *
 * Beide Erzeuger nehmen den Titel als **zweites** Argument hinter der Art
 * (`makeNotif('import', 'Programm importiert', …)`,
 * `pushNotif(state.notifs, 'import', …)`).
 *
 * `zuteilungsNotif` stand hier als dritter Erzeuger. Mit T99 ist er entfallen:
 * Zuteilen meldet nichts mehr an die Planer, die Nachricht geht stattdessen an
 * die eingeteilte Person — und zwar aus `send-plan`.
 */
function titelAusReducer(): string[] {
  const text = quelle('app/reducer.ts')
  const gefunden = new Set<string>()
  for (const m of text.matchAll(/makeNotif\(\s*'[^']*',\s*'([^']+)'/g)) gefunden.add(m[1] ?? '')
  for (const m of text.matchAll(/pushNotif\(\s*[^,]+,\s*'[^']*',\s*'([^']+)'/g)) gefunden.add(m[1] ?? '')
  return [...gefunden]
}

/** Titel, die die Erinnerungs-Function in die Glocke schreibt. */
function titelAusErinnerung(): string[] {
  const text = quelle('send-reminders/index.ts')
  return [...text.matchAll(/^\s*title: '([^']+)',/gm)].map((m) => m[1] ?? '')
}

/**
 * Titel der beiden Functions, die sie als benannte Konstanten führen —
 * Ersatzsuche und „Plan senden". Beide Dateien halten es gleich: `TITEL_…`
 * ist zugleich der kanonisch deutsche Text und der Schlüssel für die Glocke.
 */
function titelAusKonstanten(datei: string): string[] {
  const text = quelle(datei)
  return [...text.matchAll(/export const TITEL_\w+ = '([^']+)'/g)].map((m) => m[1] ?? '')
}

const titelAusErsatz = (): string[] => titelAusKonstanten('substitute/texte.ts')
const titelAusPlan = (): string[] => titelAusKonstanten('send-plan/texte.ts')
/**
 * Die Erinnerungs-Function schreibt einen Titel als Literal in die Zeile
 * (`titelAusErinnerung`) und einen über die benannte Konstante
 * `TITEL_UNERREICHBAR` — die Sammelmeldung an die Planer, die seit T99 auch in
 * die Glocke geht. Beide Wege werden gelesen, sonst bliebe der zweite
 * unbemerkt deutsch.
 */
const titelAusErinnerungsKonstanten = (): string[] => titelAusKonstanten('send-reminders/texte.ts')

const ALLE_ERZEUGTEN = [
  ...titelAusReducer(),
  ...titelAusErinnerung(),
  ...titelAusErinnerungsKonstanten(),
  ...titelAusErsatz(),
  ...titelAusPlan(),
  ...DEMO_NOTIFICATIONS.map((n) => n.title),
]

beforeAll(async () => {
  await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
})

describe('Jeder erzeugte Mitteilungs-Titel steht in der Zuordnung', () => {
  it('die Prüfung findet überhaupt Titel — an jeder der vier Quellen', () => {
    /*
      Ohne diese Zeile wäre ein zu enger Ausdruck von „alles in Ordnung" nicht
      zu unterscheiden. Und genau das passiert leicht: Die Erzeuger sind
      Funktionsaufrufe über mehrere Zeilen; ein Umbau der Formatierung reicht,
      damit ein Muster ins Leere greift.
    */
    expect(titelAusReducer().length, 'reducer.ts').toBeGreaterThan(1)
    expect(titelAusErinnerung().length, 'send-reminders').toBeGreaterThan(0)
    expect(titelAusErsatz().length, 'substitute/texte.ts').toBe(2)
    expect(titelAusPlan().length, 'send-plan/texte.ts').toBe(2)
    expect(DEMO_NOTIFICATIONS.length, 'Demo-Bestand').toBeGreaterThan(0)
  })

  it('kein Titel fehlt in NOTIF_TITLE_KEY', () => {
    const fehlend = [...new Set(ALLE_ERZEUGTEN)].filter((t) => !(t in NOTIF_TITLE_KEY))
    expect(fehlend, `ohne Schlüssel: ${fehlend.join(', ')}`).toEqual([])
  })

  it('und die Zuordnung beschreibt nur Titel, die es wirklich gibt', () => {
    // Ein Eintrag, den niemand mehr erzeugt, ist toter Ballast — und verdeckt,
    // dass der wirkliche Titel inzwischen anders lautet.
    const erzeugt = new Set(ALLE_ERZEUGTEN)
    const tot = Object.keys(NOTIF_TITLE_KEY).filter((t) => !erzeugt.has(t))
    expect(tot, `niemand erzeugt: ${tot.join(', ')}`).toEqual([])
  })
})

describe('Und jeder Schlüssel liefert in jeder Sprache einen eigenen Text', () => {
  const SCHLUESSEL = [...new Set(Object.values(NOTIF_TITLE_KEY))]

  it.each(SCHLUESSEL)('%s', (key) => {
    const deutsch = dict('de')[key as keyof Dict]
    expect(deutsch, `${key} fehlt auf Deutsch`).toBeTruthy()
    for (const { code } of APP_LANGS) {
      if (code === 'de') continue
      const text = dict(code)[key as keyof Dict]
      expect(text, `${code}/${key} ist leer`).toBeTruthy()
      expect(text, `${code}/${key} blieb deutsch`).not.toBe(deutsch)
    }
  })
})
