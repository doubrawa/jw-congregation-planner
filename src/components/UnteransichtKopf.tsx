import type { ReactNode } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import '../bausteine/bausteine.css'

/**
 * **Der Kopf einer Unteransicht** (T121, Baustein `kopfZurueck`): Zurück, der
 * Titel, rechts, was die Ansicht anbietet. Er steht an der Stelle des
 * Bereichstitels — in „Woche einrichten" und „Plan bearbeiten" —, am Handy
 * unter dem Kopf des Planens. Zurück führt in die Ansicht darüber, nicht aus
 * dem Bereich hinaus.
 */
export function UnteransichtKopf({
  titel,
  onZurueck,
  children,
}: {
  titel: string
  onZurueck: () => void
  children?: ReactNode
}) {
  const { t } = useT()
  return (
    <div className="unteransicht-kopf">
      <button type="button" className="rund-knopf" aria-label={t.a11yZurueck} onClick={onZurueck}>
        <Zeichen name="zurueck" />
      </button>
      <h1 className="seitentitel">{titel}</h1>
      {children}
    </div>
  )
}
