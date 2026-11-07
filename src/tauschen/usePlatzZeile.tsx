import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { AufgabeWann } from '../aufgaben/AufgabeText'
import { platzTermin } from '../data/tausch'
import { useT } from '../i18n/useT'

/**
 * Ein Platz des Tauschs in einer Zeile: der Dienst und sein Termin, davor der
 * Abstand in Worten — wie bei den eigenen Aufgaben („Mikrofone · In 13 Tagen ·
 * So, 20. September · 10:00"), der Termin mit dem `lang` des Programms
 * (`AufgabeWann`). `null`, wenn seine Woche nicht geladen ist.
 */
export function usePlatzZeile(): (key: string) => ReactNode | null {
  const { state } = useApp()
  const { tu } = useT()
  return (key) => {
    const p = platzTermin(state.weeks, state.services, state.congregation.times, key)
    return p ? (
      <>
        {tu(p.dienst)} · <AufgabeWann task={p} />
      </>
    ) : null
  }
}
