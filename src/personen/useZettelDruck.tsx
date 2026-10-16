import { useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { dict, loadOverlay } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { AnmeldeZettelBogen } from './AnmeldeZettelBogen'
import { sprachDerVersammlung, useLinksAusstellen } from './useLinksAusstellen'
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
 *
 * **Jede Stelle räumt nur ihren eigenen Druck ab** (`meiner`). Am Desktop
 * stehen die Konto-Karte und „Links senden" nebeneinander, jede mit diesem
 * Hook. Fragten beide nur das Kennzeichen am Wurzelelement, nähme die erste,
 * die nach dem Druck dran ist, es weg — und die andere fände es nicht mehr
 * und ließe ihren Bogen samt Codes im DOM stehen.
 */
export function useZettelDruck(): ZettelDruck {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const ausstellen = useLinksAusstellen()
  const [satz, setSatz] = useState<ZettelSatz | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const meiner = useRef(false)
  /** Steht die Stelle noch? Nach dem Warten wird nur gedruckt, wenn ja. */
  const eingehaengt = useRef(false)

  useEffect(() => {
    eingehaengt.current = true
    const fertig = () => {
      if (!meiner.current) return
      meiner.current = false
      delete document.documentElement.dataset.print
      setSatz(null)
    }
    window.addEventListener('afterprint', fertig)
    return () => {
      eingehaengt.current = false
      window.removeEventListener('afterprint', fertig)
      fertig()
    }
  }, [])

  const drucken = async (personen: readonly Person[]) => {
    if (laeuft || personen.length === 0) return
    setLaeuft(true)
    try {
      const r = await ausstellen(
        personen.map((p) => p.id),
        false,
      )
      if (!r) return
      if (r.links.length === 0) {
        dispatch({ type: 'showToast', text: t.linkFehler })
        return
      }
      const lang = sprachDerVersammlung(state.congLang)
      const [{ zettelSatz }] = await Promise.all([import('./zettel-satz'), loadOverlay(lang)])
      const neu = zettelSatz(r.links, {
        namen: new Map(personen.map((p) => [p.id, displayName(p)])),
        lang,
        t: dict(lang),
        versammlung: state.congregation.name,
      })
      if (r.fehler) dispatch({ type: 'showToast', text: t.linkFehler })
      // Ist die Stelle beim Warten verschwunden (Blatt zu, anderer Bildschirm),
      // wird nicht gedruckt. Bis zum 16.10.2026 kam der Druckdialog trotzdem —
      // ohne Bogen —, und das Kennzeichen blieb am Wurzelelement stehen, weil
      // das Aufräumen schon gelaufen war: Jeder spätere Druck blieb leer.
      if (!eingehaengt.current) return
      flushSync(() => setSatz(neu))
      meiner.current = true
      document.documentElement.dataset.print = DRUCK
      window.print()
    } finally {
      setLaeuft(false)
    }
  }

  return { drucken, laeuft, bogen: satz && <AnmeldeZettelBogen satz={satz} /> }
}
