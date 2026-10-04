import { useT } from '../i18n/useT'
import { useZweiTipp } from './useZweiTipp'
import './components.css'

/**
 * **✕ mit Rückfrage** (4.10.2026): „Generell soll beim Löschen in der App
 * vorher gefragt werden."
 *
 * Der erste Tipp fragt („Wirklich löschen?"), erst der zweite entfernt; ein
 * Tipp daneben bricht ab — dieselbe Zwei-Tipp-Bestätigung wie beim Löschen
 * einer Person und beim Leeren (`useZweiTipp`). Geschärft wird aus dem runden
 * ✕ eine Pille mit Text (`.entfernen.is-armed` in `components.css`); die Form
 * davor bringt `className` mit, sie ist je Liste eine andere.
 *
 * `frage` ist für das, was nur herausgenommen wird, nicht gelöscht — eine
 * Person aus einer Schicht, eine Sprache aus dem Programm: „Wirklich
 * entfernen?" (`entfernenSicher`).
 *
 * Ein eigener Baustein, weil jede Zeile ihren eigenen Zustand braucht.
 */
export function EntfernenKnopf({
  className,
  onEntfernen,
  frage,
}: {
  className: string
  onEntfernen: () => void
  frage?: string
}) {
  const { t } = useT()
  const entfernen = useZweiTipp(onEntfernen)
  return (
    <button
      type="button"
      className={entfernen.armed ? `${className} entfernen is-armed` : `${className} entfernen`}
      // Geschärft sagt der Text selbst, was geschieht; das ✕ davor braucht den Namen.
      aria-label={entfernen.armed ? undefined : t.a11yRemove}
      onClick={entfernen.onClick}
      onBlur={entfernen.onBlur}
    >
      {entfernen.armed ? (frage ?? t.loeschenSicher) : '✕'}
    </button>
  )
}
