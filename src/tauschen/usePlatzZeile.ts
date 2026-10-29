import { useApp } from '../app/context'
import { mitAbstand } from '../aufgaben/aufgabe-anzeige'
import { platzTermin } from '../data/tausch'
import { aufgabenTermin, useT } from '../i18n/useT'

/**
 * Ein Platz des Tauschs in einer Zeile: der Dienst und sein Termin, davor der
 * Abstand in Worten — wie bei den eigenen Aufgaben („Mikrofone · In 13 Tagen ·
 * So, 20. September · 10:00"). `null`, wenn seine Woche nicht geladen ist.
 */
export function usePlatzZeile(): (key: string) => string | null {
  const { state } = useApp()
  const i18n = useT()
  return (key) => {
    const p = platzTermin(state.weeks, state.services, state.congregation.times, key)
    return p ? `${i18n.tu(p.dienst)} · ${mitAbstand(aufgabenTermin(p, i18n), p.at, state.lang)}` : null
  }
}
