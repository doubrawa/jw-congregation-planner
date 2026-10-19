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
 * Ab hier steht beim Planen links die Spalte der Wochen (Entwurf
 * `GDesktopPlanen`, gezeichnet für 1440 px): Menü 248, Wochen 260 und
 * Zuteilen 320 lassen dem Plan noch 572 px — bei Schriftstufe 1,45 wächst das
 * Menü auf 304 px (T128). Darunter führt „Planung" auf die Seite aller Wochen.
 */
export const WOCHEN_SPALTE_BREITE = '(min-width: 1400px)'

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
