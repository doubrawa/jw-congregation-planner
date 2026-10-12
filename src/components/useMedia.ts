import { useEffect, useState } from 'react'

/*
 * Die Umbrüche des neuen Designs (T121) — dieselben Zahlen wie in den
 * Stylesheets. CSS kann sie nicht lesen; geteilt werden sie hier nur zwischen
 * den Ansichten, die am Desktop etwas anderes **zeigen**, nicht bloß anders
 * anordnen.
 */

/** Ab hier steht das Menü als schmale Leiste am Rand, und Knöpfe tragen ihr Wort. */
export const TABLET_BREITE = '(min-width: 768px)'

/** Ab hier steht das Menü fest links, und Ansichten zeigen nebeneinander, was am Handy untereinander steht. */
export const DESKTOP_BREITE = '(min-width: 1180px)'

/**
 * **Trifft eine Medienabfrage zu?** — und ein neuer Render, wenn sich das
 * ändert (Fenster breiter gezogen, Tablet gedreht).
 *
 * Für den Fall, dass eine Ansicht am Desktop **anderes** zeigt, nicht nur
 * anders anordnet — dann reicht CSS nicht. Ohne `matchMedia` (jsdom in
 * Proben ohne Attrappe) gilt die Abfrage als nicht erfüllt: die Handy-Fassung.
 */
export function useMedia(abfrage: string): boolean {
  const [passt, setPasst] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(abfrage).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const liste = window.matchMedia(abfrage)
    const pruefen = () => setPasst(liste.matches)
    pruefen()
    liste.addEventListener?.('change', pruefen)
    return () => liste.removeEventListener?.('change', pruefen)
  }, [abfrage])
  return passt
}
