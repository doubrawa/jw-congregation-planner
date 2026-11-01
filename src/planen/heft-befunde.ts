import type { Befund } from '../../supabase/functions/import-week/befunde.ts'
import { isSong } from '../data/helpers'
import type { Lang, PartItem, Week } from '../data/types'
import { langLabel } from '../i18n/langnames'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

/**
 * **Ein Befund aus dem Arbeitsheft als Zeile** im Blatt „Programm holen"
 * (31.10.2026) und über dem Plan der Woche (1.11.2026) — in der Sprache des
 * Lesers. Der Server schickt Schlüssel mit Stelle (`befunde.ts`), keine Sätze;
 * das Protokoll und `heft-pruefen.mjs` sagen dasselbe auf Deutsch
 * (`befundAufDeutsch`).
 */
export interface BefundZeile {
  /** Wo: „Punkt 7", ein Abschnitt (Programmsprache) oder eine Sprache — `null` für die ganze Woche. */
  stelle: string | null
  /** Der Titel des Punkts, wie das Heft ihn schreibt. */
  titel?: string
  /** Was dort ist. */
  text: string
}

type BefundTexte = Pick<
  Dict,
  | 'heftPunkt'
  | 'heftZeitraum'
  | 'heftLied'
  | 'heftLeer'
  | 'heftNummern'
  | 'heftUnvollstaendig'
  | 'heftUnbekannt'
  | 'heftBibellesung'
  | 'heftStudium'
  | 'heftGliederung'
>

/** Ein Programmpunkt, wie die gezeigte Woche ihn nennt. */
interface Punkt {
  nr?: number
  titel: string
}

/**
 * **Wo die Stellen eines Befunds in der gezeigten Woche stehen** — aus ihr,
 * nicht aus dem Befund, und so übersetzt wie dort.
 *
 * Der Befund trägt bewusst keine Überschrift: Sie stünde in der Sprache der
 * Versammlung, auch wenn eine andere Fassung gezeigt wird. Und einen Punkt
 * nennt er mit seiner Kennung, weil seine Nummer nicht hält: Verschiebt der
 * Planer einen Punkt, bleiben die Nummern an ihrer Stelle (`swapKeepNums`) —
 * „Punkt 5" aus dem Import wäre danach ein anderer.
 */
export interface Stellen {
  /** Die Überschrift des Abschnitts dieser Art — `null`, wenn die Woche keinen hat (dann steht die Zeile ohne Stelle, nie der Schlüssel). */
  abschnitt: (kind: string) => string | null
  /** Nummer und Titel des Punkts mit dieser Kennung — `null`, wenn es ihn nicht mehr gibt (dann gilt, was der Import sah). */
  punkt: (iid: string) => Punkt | null
}

/** Die Stellen in `week`, der gezeigten Fassung der Woche, übersetzt mit ihrem `tpw`. */
export function stellenIn(week: Week, tpw: (s: string) => string): Stellen {
  const sections = week.mid.sections
  return {
    abschnitt: (kind) => {
      const label = sections.find((s) => s.kind === kind)?.label
      return label ? tpw(label) : null
    },
    punkt: (iid) => {
      const p = sections.flatMap((s) => s.items).find((i): i is PartItem => !isSong(i) && i.iid === iid)
      return p ? { nr: p.num, titel: tpw(p.title) } : null
    },
  }
}

/**
 * Die Kennungen der Punkte, an denen etwas geraten ist — die Marken im Plan.
 *
 * Ohne den Nummernsprung: Er nennt den Punkt **nach** der Lücke, und an dem
 * ist nichts geraten — davor fehlt womöglich einer. Die Zeile im Kasten sagt
 * das; eine Marke „Beim Holen geraten" schickte den Planer an die falsche
 * Stelle (Review 1.11.2026).
 */
export function geratenePunkte(befunde: readonly Befund[] | undefined): Set<string> {
  return new Set((befunde ?? []).flatMap((b) => (b.art !== 'nummern' && 'iid' in b ? [b.iid] : [])))
}

/**
 * Die Zeile zu einem Befund, mit den Stellen aus der gezeigten Woche
 * (`stellenIn`).
 *
 * `null` für eine Art, die dieses Bündel noch nicht kennt: Die Function wird
 * vor der App ausgerollt, und ein Gerät behält sein Bündel, bis es neu lädt.
 * Bis zum Review am 31.10.2026 warf das Blatt dann beim Zeichnen.
 */
export function befundZeile(b: Befund, t: BefundTexte, stellen: Stellen, lang: Lang): BefundZeile | null {
  // Ein Punkt, wie die Woche ihn jetzt zeigt; gibt es ihn nicht mehr, wie der Import ihn sah.
  const punkt = (imImport: { iid: string; nr: number; titel?: string }): Pick<BefundZeile, 'stelle' | 'titel'> => {
    const jetzt = stellen.punkt(imImport.iid)
    return { stelle: fill(t.heftPunkt, { n: jetzt?.nr ?? imImport.nr }), titel: jetzt?.titel ?? imImport.titel }
  }
  switch (b.art) {
    case 'zeitraum':
      return { stelle: null, text: t.heftZeitraum }
    case 'lied':
      return { stelle: stellen.abschnitt(b.abschnitt), text: t.heftLied }
    case 'leer':
      return { stelle: stellen.abschnitt(b.abschnitt), text: t.heftLeer }
    case 'nummern':
      return { ...punkt(b), text: t.heftNummern }
    case 'unvollstaendig':
      return { ...punkt(b), text: t.heftUnvollstaendig }
    case 'unbekannt':
      return { ...punkt(b), text: t.heftUnbekannt }
    case 'bibellesung':
      return { stelle: stellen.abschnitt(b.abschnitt), text: t.heftBibellesung }
    case 'studium':
      return { stelle: stellen.abschnitt(b.abschnitt), text: t.heftStudium }
    case 'gliederung':
      return { stelle: langLabel(b.sprache, lang), text: t.heftGliederung }
    default: {
      // Kennt der Compiler eine Art, die hier fehlt, übersetzt die Datei nicht.
      const neu: never = b
      void neu
      return null
    }
  }
}
