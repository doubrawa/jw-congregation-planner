import { useAppSelector } from './context'
import { diensteAlphabetisch } from '../data/dienste'
import type { Lang, Service } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { bibelbuecherGeladen, makeTr } from '../i18n/translate'

/** Die letzten Eingaben von `diensteDerSprache` und ihr Ergebnis. */
let zuletzt: { services: readonly Service[]; lang: Lang; buecher: boolean; ergebnis: readonly Service[] } | null = null

/**
 * **Die Dienste alphabetisch in der Sprache des Lesers** (`diensteAlphabetisch`)
 * — mit demselben Übersetzer wie `useT().tu`; `makeTr('de')` lässt den Namen,
 * wie er ist.
 *
 * Für dieselben Eingaben dasselbe Ergebnis, an den Referenzen erkannt (wie
 * `abwesenheitenVon`): Reducer und Bausteine teilen so eine Liste, und was sie
 * in ein `useMemo` legen, rechnet nicht bei jedem Zeichnen neu. Der Stand der
 * Bibelbücher gehört zum Schlüssel wie bei `useT`: Ein Übersetzer von vor ihrem
 * Laden lässt Buchnamen deutsch, und ein Name mit Buch und Zahl stünde sonst
 * nach seiner deutschen Form einsortiert.
 */
export function diensteDerSprache(services: readonly Service[], lang: Lang): readonly Service[] {
  const buecher = bibelbuecherGeladen()
  if (zuletzt && zuletzt.services === services && zuletzt.lang === lang && zuletzt.buecher === buecher) {
    return zuletzt.ergebnis
  }
  const ergebnis = diensteAlphabetisch(services, makeTr(lang), LOCALES[lang])
  zuletzt = { services, lang, buecher, ergebnis }
  return ergebnis
}

/**
 * Die Dienste so, wie jede Liste sie zeigt — Einstellungen, Programm, Planen,
 * Plan senden, Zusagen, Auswertung, Zeitleiste. `state.services` steht in der
 * Folge des Anlegens und gehört in keine Liste.
 */
export function useDienste(): readonly Service[] {
  const services = useAppSelector((s) => s.services)
  const lang = useAppSelector((s) => s.lang)
  return diensteDerSprache(services, lang)
}
