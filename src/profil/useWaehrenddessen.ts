import { useState } from 'react'
import { useApp } from '../app/context'
import { useT } from '../i18n/useT'

/**
 * **Einmal sperren, solange eine Function gefragt wird** — für die Knöpfe der
 * Profil-Karten „Anmeldung" und „Kalender". Offline geht keiner davon: Statt des
 * Aufrufs kommt der Hinweis. Meldet die Arbeit `false` oder wirft sie, sagt ein
 * Hinweis, dass es nicht ging, und der Knopf ist wieder frei — ein fehlendes
 * Bündel nach einem Deploy (`qr-bild`) ließe ihn sonst für immer grau.
 *
 * `bereich` steht vor der Meldung in der Konsole („[zugang]", „[kalender]").
 */
export function useWaehrenddessen(bereich: string) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [laeuft, setLaeuft] = useState(false)

  const waehrenddessen = async (arbeit: () => unknown): Promise<void> => {
    if (laeuft) return
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
    setLaeuft(true)
    try {
      if ((await arbeit()) === false) dispatch({ type: 'showToast', text: t.zugangFehler })
    } catch (err) {
      console.error(`[${bereich}]`, err instanceof Error ? err.message : String(err))
      dispatch({ type: 'showToast', text: t.zugangFehler })
    } finally {
      setLaeuft(false)
    }
  }

  return { laeuft, waehrenddessen }
}
