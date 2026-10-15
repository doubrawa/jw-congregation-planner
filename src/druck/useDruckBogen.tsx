import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useAppSelector } from '../app/context'
import { isRTL } from '../i18n/langs'
import './druck-bogen.css'

/** Das Kennzeichen am Wurzelelement: Im Druck steht dann nur der Bogen (`druck-bogen.css`). */
export const BOGEN = 'bogen'

export interface DruckBogen {
  /** Den Bogen zeichnen und den Druckdialog öffnen. */
  drucken(inhalt: ReactNode): void
  /** Der Bogen als Portal unter `body` — `null`, solange nichts gedruckt wird. */
  bogen: ReactNode
}

/**
 * **Einen Druckbogen drucken** (T121, Phase 9; Entwürfe `GDruck…`).
 *
 * Ein Bogen ist kein Bildschirm, der gedruckt wird, sondern eigenes Papier:
 * feste A4-Blätter mit Kopf und Fuß (`DruckBlatt`). Er steht nur für die Dauer
 * des Druckdialogs im DOM, direkt unter `body` (Portal) — so blendet das
 * Kennzeichen `data-print="bogen"` im Druck alles andere mit einer Regel aus,
 * gleich, von welchem Bildschirm aus gedruckt wird.
 *
 * **Erst zeichnen, dann drucken — im selben Klick:** `flushSync` legt den Bogen
 * sofort ins DOM, bevor der Druckdialog das Blatt aufnimmt. Kein Effekt nach dem
 * Rendern: Den ließe StrictMode in der Entwicklung zweimal laufen, und es gingen
 * zwei Druckdialoge auf.
 *
 * **Jede Stelle räumt nur ihren eigenen Druck ab** (`meiner`): Der
 * Wochenstreifen zeichnet seinen Inhalt dreimal, also gibt es diesen Hook
 * mehrfach zugleich — wie beim Anmelde-Zettel (`useZettelDruck`).
 *
 * **Jeder Druck zeichnet neu** (`nr`): Meldet ein Browser kein `afterprint`,
 * steht der vorige Bogen beim nächsten Druck noch da — und React behielte für
 * den neuen Inhalt die Verteilung auf die Blätter, die `Bogen` für den alten
 * gemessen hat. Die zweite Woche käme dann mit den Blättern der ersten heraus.
 */
export function useDruckBogen(): DruckBogen {
  const lang = useAppSelector((s) => s.lang)
  const [druck, setDruck] = useState<{ nr: number; inhalt: ReactNode } | null>(null)
  const meiner = useRef(false)

  useEffect(() => {
    const fertig = () => {
      if (!meiner.current) return
      meiner.current = false
      delete document.documentElement.dataset.print
      setDruck(null)
    }
    window.addEventListener('afterprint', fertig)
    return () => {
      window.removeEventListener('afterprint', fertig)
      fertig()
    }
  }, [])

  const drucken = useCallback((inhalt: ReactNode) => {
    flushSync(() => setDruck((vorher) => ({ nr: (vorher?.nr ?? 0) + 1, inhalt })))
    meiner.current = true
    document.documentElement.dataset.print = BOGEN
    window.print()
  }, [])

  const bogen =
    druck === null
      ? null
      : createPortal(
          <div key={druck.nr} className="druck-bogen" lang={lang} dir={isRTL(lang) ? 'rtl' : 'ltr'} aria-hidden="true" inert>
            {druck.inhalt}
          </div>,
          document.body,
        )
  return { drucken, bogen }
}
