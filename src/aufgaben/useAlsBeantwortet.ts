import { useApp } from '../app/context'

/**
 * **Beantwortet ist gelesen** (16.10.2026): Wer zu einer Aufgabe absagt oder
 * doch bestätigt, hat die Mitteilungen zu ihr beantwortet. „Ich kann nicht" in
 * der Glocke öffnete nur das Absage-Blatt — die Mitteilung blieb danach „Neu",
 * ohne dass es darunter noch etwas zu tun gab.
 *
 * Gilt für jeden Weg, der eine Aufgabe beantwortet: das Absage-Blatt und das
 * Absagen beim Eintragen einer Abwesenheit (T181). Wer abbricht, hat nichts
 * beantwortet; offline wird nichts gespeichert (wie in `Mitteilung`).
 */
export function useAlsBeantwortet(): (taskId: string) => void {
  const { state, dispatch } = useApp()
  return (taskId) => {
    if (state.staleAt) return
    for (const n of state.notifs) {
      if (n.taskId === taskId && !n.read) dispatch({ type: 'mitteilungGelesen', id: n.id })
    }
  }
}
