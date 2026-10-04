import { useAppDispatch } from '../app/context'
import { useT } from '../i18n/useT'
import { useZweiTipp } from './useZweiTipp'

/**
 * **Eine Abwesenheit entfernen — mit Rückfrage** (4.10.2026).
 *
 * Der erste Tipp auf „✕" fragt („Wirklich löschen?"), erst der zweite löscht;
 * ein Tipp daneben bricht ab. Dieselbe Zwei-Tipp-Bestätigung wie beim
 * Löschen einer Person (`useZweiTipp`). Ein eigener Baustein, weil jede Zeile
 * ihren eigenen Zustand braucht — in der Abwesenheiten-Karte (`AbsencePanel`)
 * und in der Zeitleiste des Personen-Details (`PersonTimeline`).
 */
export function AbwesenheitEntfernen({ id, className }: { id: string; className: string }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  const entfernen = useZweiTipp(() => dispatch({ type: 'removeAbsence', id }))
  return (
    <button
      type="button"
      className={entfernen.armed ? `${className} is-armed` : className}
      // Geschärft sagt der Text selbst, was geschieht; das ✕ davor braucht den Namen.
      aria-label={entfernen.armed ? undefined : t.a11yRemove}
      onClick={entfernen.onClick}
      onBlur={entfernen.onBlur}
    >
      {entfernen.armed ? t.loeschenSicher : '✕'}
    </button>
  )
}
