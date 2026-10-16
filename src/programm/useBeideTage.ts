import { useApp } from '../app/context'
import { DESKTOP_BREITE, useMedia } from '../components/useMedia'

/**
 * **Stehen beide Zusammenkünfte nebeneinander?** (T121, Entwurf
 * `GDesktopWoche`) — am Desktop, außer im Predigtdienst.
 *
 * Dann gibt es keine Wahl des Tages: Der Bildschirm zeigt die ganze Woche,
 * und wer ihn ausdruckt, bekommt beide Zusammenkünfte. Eine Stelle für die
 * Frage, weil die Ansicht und der Kopf des Ausdrucks (`druckThema`) sie beide
 * stellen; gingen sie auseinander, druckte der Kopf „Wochenende" über ein
 * Blatt mit beiden Tagen.
 */
export function useBeideTage(): boolean {
  const { state } = useApp()
  const desktop = useMedia(DESKTOP_BREITE)
  return desktop && state.tab !== 'fs'
}
