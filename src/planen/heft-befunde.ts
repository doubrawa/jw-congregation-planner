import type { Befund } from '../../supabase/functions/import-week/befunde.ts'
import type { Lang } from '../data/types'
import { langLabel } from '../i18n/langnames'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

/**
 * **Ein Befund aus dem Arbeitsheft als Zeile** im Blatt „Programm holen"
 * (31.10.2026) — in der Sprache des Lesers. Der Server schickt Schlüssel mit
 * Stelle (`befunde.ts`), keine Sätze; das Protokoll und `heft-pruefen.mjs`
 * sagen dasselbe auf Deutsch (`befundAufDeutsch`).
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

/**
 * `abschnittName` macht aus der Art eines Abschnitts (`schaetze`, `eroeffnung`
 * …) seine Überschrift — aus der Woche, die das Blatt zeigt, und so übersetzt
 * wie dort; `null`, wenn sie keinen Abschnitt dieser Art hat (dann steht die
 * Zeile ohne Stelle, nie der Schlüssel). Der Befund trägt bewusst nicht die
 * Überschrift: Sie stünde in der Sprache der Versammlung, auch wenn das Blatt
 * eine andere Fassung zeigt.
 *
 * `null` für eine Art, die dieses Bündel noch nicht kennt: Die Function wird
 * vor der App ausgerollt, und ein Gerät behält sein Bündel, bis es neu lädt.
 * Bis zum Review am 31.10.2026 warf das Blatt dann beim Zeichnen.
 */
export function befundZeile(
  b: Befund,
  t: BefundTexte,
  abschnittName: (kind: string) => string | null,
  lang: Lang,
): BefundZeile | null {
  switch (b.art) {
    case 'zeitraum':
      return { stelle: null, text: t.heftZeitraum }
    case 'lied':
      return { stelle: abschnittName(b.abschnitt), text: t.heftLied }
    case 'leer':
      return { stelle: abschnittName(b.abschnitt), text: t.heftLeer }
    case 'nummern':
      return { stelle: fill(t.heftPunkt, { n: b.nr }), text: t.heftNummern }
    case 'unvollstaendig':
      return { stelle: fill(t.heftPunkt, { n: b.nr }), titel: b.titel, text: t.heftUnvollstaendig }
    case 'unbekannt':
      return { stelle: fill(t.heftPunkt, { n: b.nr }), titel: b.titel, text: t.heftUnbekannt }
    case 'bibellesung':
      return { stelle: abschnittName(b.abschnitt), text: t.heftBibellesung }
    case 'studium':
      return { stelle: abschnittName(b.abschnitt), text: t.heftStudium }
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
