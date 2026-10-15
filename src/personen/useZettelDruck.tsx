import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { congAppCode } from '../i18n/langs'
import { dict, loadOverlay } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { alsAnmeldeLink, linksAusstellen } from '../lib/links-ausstellen'
import { AnmeldeZettelBogen } from './AnmeldeZettelBogen'
import type { ZettelSatz } from './zettel-satz'

/** Das Kennzeichen am Wurzelelement, solange gedruckt wird (`print-anmeldezettel.css`). */
const DRUCK = 'anmeldezettel'

export interface ZettelDruck {
  /** Für diese Personen Links ausstellen und ihre Zettel drucken. */
  drucken(personen: readonly Person[]): Promise<void>
  /** Wird gerade ausgestellt? Dann wartet ein zweiter Tipp. */
  laeuft: boolean
  /** Der Bogen — wer den Hook nutzt, setzt ihn irgendwo ein (er hängt sich selbst unter `body`). */
  bogen: ReactNode
}

/**
 * **Zettel drucken** (T121, Phase 8): für die genannten Personen je einen
 * neuen Link ausstellen — er ersetzt den alten samt Zettel —, die Zettel bauen
 * und drucken. Nach dem Druckdialog verschwindet der Bogen wieder aus dem DOM:
 * Die Codes darauf melden an.
 *
 * Wer abbricht und noch einmal druckt, bekommt neue Links, die des ersten
 * Versuchs gelten dann nicht mehr. Gewollt: Ein Code, der auf keinem Papier
 * steht, soll auch niemanden anmelden.
 *
 * Gedruckt wird erst, wenn der Bogen im DOM steht (`flushSync`) — und nicht
 * aus einem Effekt heraus: Den ruft React im Entwicklungsbetrieb zweimal, und
 * dann kämen zwei Druckdialoge.
 */
export function useZettelDruck(): ZettelDruck {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [satz, setSatz] = useState<ZettelSatz | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    const fertig = () => {
      if (document.documentElement.dataset.print !== DRUCK) return
      delete document.documentElement.dataset.print
      setSatz(null)
    }
    window.addEventListener('afterprint', fertig)
    return () => {
      window.removeEventListener('afterprint', fertig)
      if (document.documentElement.dataset.print === DRUCK) delete document.documentElement.dataset.print
    }
  }, [])

  const drucken = async (personen: readonly Person[]) => {
    if (laeuft || personen.length === 0) return
    // Wie beim Senden: Die Function ruft man am Reducer vorbei — offline also gar nicht erst.
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
    setLaeuft(true)
    const lang = congAppCode(state.congLang) ?? 'de'
    try {
      const r = await linksAusstellen(
        personen.map((p) => p.id),
        { senden: false, lang },
      )
      if (r.links.length > 0) dispatch({ type: 'linksAusgestellt', links: r.links.map((l) => alsAnmeldeLink(l, new Date())) })
      if (r.links.length === 0) {
        dispatch({ type: 'showToast', text: t.linkFehler })
        return
      }
      const [{ zettelSatz }] = await Promise.all([import('./zettel-satz'), loadOverlay(lang)])
      const neu = zettelSatz(r.links, {
        namen: new Map(personen.map((p) => [p.id, displayName(p)])),
        lang,
        t: dict(lang),
        versammlung: state.congregation.name,
      })
      if (r.fehler) dispatch({ type: 'showToast', text: t.linkFehler })
      flushSync(() => setSatz(neu))
      document.documentElement.dataset.print = DRUCK
      window.print()
    } finally {
      setLaeuft(false)
    }
  }

  return { drucken, laeuft, bogen: satz && <AnmeldeZettelBogen satz={satz} /> }
}
