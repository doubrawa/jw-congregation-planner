import { useApp } from '../app/context'
import type { Lang } from '../data/types'
import { congAppCode } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { alsAnmeldeLink, type Ausgestellt, linksAusstellen } from '../lib/links-ausstellen'

/** Die Sprache, in der Nachricht und Zettel hinausgehen: die der Versammlung — die Empfänger haben noch keine gewählt. */
export const sprachDerVersammlung = (congLang: string): Lang => congAppCode(congLang) ?? 'de'

/**
 * **Links ausstellen, wie es jede Stelle der App tut** (T121, Phase 8): das
 * Blatt „Link senden", „Links senden" und der Zettel-Druck. Dreimal stand
 * dasselbe da — offline gar nicht erst anfangen, die Sprache der Versammlung,
 * und was ausgestellt wurde, in den Zustand legen. Fehlte das Letzte an einer
 * Stelle, zeigte die Liste weiter „Ohne Link", obwohl der alte Link schon
 * ersetzt war.
 *
 * `null`: offline, nichts versucht (der Hinweis steht schon da).
 */
export function useLinksAusstellen(): (personIds: readonly string[]) => Promise<Ausgestellt | null> {
  const { state, dispatch } = useApp()
  const { t } = useT()
  return async (personIds) => {
    // Die Function ruft man am Reducer vorbei — offline also gar nicht erst:
    // Ein Link, der dabei entstünde, ersetzte den alten, und der Zustand
    // erführe es nie.
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return null
    }
    const r = await linksAusstellen(personIds)
    if (r.links.length > 0) dispatch({ type: 'linksAusgestellt', links: r.links.map((l) => alsAnmeldeLink(l, new Date())) })
    return r
  }
}
