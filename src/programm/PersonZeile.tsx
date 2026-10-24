import { useT } from '../i18n/useT'

/**
 * **Eine Person an einem Platz** (T121): Punkt, Name, Rolle — der eigene Platz
 * als „Du", mit dem Punkt in Minze. Dieselbe Zeile im Programm und an den
 * Treffpunkten; ab dem Tablet ohne Punkt, „Du" als Pille (`programm.css`).
 *
 * **Wem der Platz gehört, entscheidet der Aufrufer** — „Id vor Name", wie
 * überall: im Programm `gehoertZu`, am Treffpunkt über `fsLeiterZuteilung`,
 * denn ein Leiter als Freitext gehört niemandem hier. Fragte diese Zeile
 * selbst nach dem Namen, bekäme ein Namensgleicher den Freitext als „Du".
 *
 * Gedruckt wird der Name, nicht „Du": Der Aushang gilt allen (`nur-druck`).
 *
 * `leer` steht statt „— offen —" auf einem leeren Platz, den niemand planen
 * muss — dem Schlussgebet am Wochenende (T133).
 */
export function PersonZeile({ name, rolle, du, leer }: { name: string; rolle?: string; du: boolean; leer?: string }) {
  const { t } = useT()
  const klasse = du ? 'prog-person is-du' : name ? 'prog-person' : 'prog-person is-offen'
  return (
    <div className={klasse}>
      <span className="prog-person-punkt" aria-hidden="true" />
      {du && <span className="prog-du">{t.chipDu}</span>}
      <span className={du ? 'prog-name nur-druck' : 'prog-name'}>{name || leer || t.offenDash}</span>
      {rolle && <span className="prog-role">{rolle}</span>}
    </div>
  )
}
