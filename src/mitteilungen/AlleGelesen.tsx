import { useApp } from '../app/context'
import { useT } from '../i18n/useT'

/**
 * „Alle gelesen" — am Handy im Kopf der Seite (`UnterseiteKopf`), ab dem
 * Tablet neben dem Titel. Zwei Orte, ein Knopf: Was er tut, steht einmal hier.
 */
export function AlleGelesen({ className }: { className: string }) {
  const { dispatch } = useApp()
  const { t } = useT()
  return (
    <button type="button" className={className} onClick={() => dispatch({ type: 'markAllRead' })}>
      {t.alleGelesen}
    </button>
  )
}
