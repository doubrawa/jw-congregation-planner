import { useRef } from 'react'
import { useApp } from '../app/context'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { copyText } from '../lib/clipboard'
import { linkNachricht, linkTexteLaden, type LinkNachricht } from './link-nachricht'
import { sprachDerVersammlung, useLinksAusstellen } from './useLinksAusstellen'

/** Wie der Text hinausgeht: über das Teilen des Geräts oder in die Zwischenablage. */
export type Weitergabe = 'teilen' | 'kopieren'

/**
 * **Link und Code als Nachricht weitergeben** — für das Blatt „Link senden"
 * einer Person und die Liste unter „Links senden".
 *
 * Der Text entsteht je Person beim ersten Tipp und bleibt, solange die Stelle
 * steht: Der Code liegt nur als Prüfsumme in der Datenbank, ein zweiter Tipp
 * nimmt deshalb denselben Text, statt den eben geteilten Link durch einen neuen
 * zu ersetzen. Und Safari lässt das Teilen nur kurz nach dem Tipp zu: Dauerte
 * das Ausstellen zu lange, teilt erst der nächste Tipp — mit diesem Text.
 *
 * `true`, wenn der Text kopiert oder geteilt ist.
 */
export function useNachrichtWeitergeben(): (person: Person, art: Weitergabe) => Promise<boolean> {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const ausstellen = useLinksAusstellen()
  const texte = useRef(new Map<string, LinkNachricht>())
  const lang = sprachDerVersammlung(state.congLang)
  const melden = (text: string) => dispatch({ type: 'showToast', text })

  const textHolen = async (person: Person): Promise<LinkNachricht | null> => {
    const da = texte.current.get(person.id)
    if (da) return da
    // Die Texte **vor** dem Ausstellen laden: Scheitert es danach, liefe der
    // Fehler ins Leere, und jeder weitere Tipp ersetzte den Link erneut.
    try {
      await linkTexteLaden(lang)
    } catch {
      melden(t.linkFehler)
      return null
    }
    const r = await ausstellen([person.id])
    if (!r) return null
    const neu = r.links[0]
    if (!neu) {
      melden(t.linkFehler)
      return null
    }
    const n = await linkNachricht(person, neu, { lang, versammlung: state.congregation.name })
    texte.current.set(person.id, n)
    return n
  }

  return async (person, art) => {
    const n = await textHolen(person)
    if (!n) return false
    if (art === 'kopieren') {
      if (!(await copyText(n.text))) {
        melden(t.nochmalTippen)
        return false
      }
      melden(fill(t.toastNachrichtKopiert, { name: person.fn || displayName(person) }))
      return true
    }
    try {
      await navigator.share({ title: n.titel, text: n.text })
      return true
    } catch (fehler) {
      // Abgebrochen, oder Safari ließ das Teilen nach dem Warten auf den
      // Server nicht mehr zu: Der Text bleibt bereit, der nächste Tipp teilt ihn.
      if (!(fehler instanceof DOMException && fehler.name === 'AbortError')) melden(t.nochmalTippen)
      return false
    }
  }
}
