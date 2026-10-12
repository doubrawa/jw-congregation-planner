import type { PlatzLage } from '../data/saal'
import { useT } from '../i18n/useT'
import { LAGE_KLASSE } from './platz-anzeige'

/**
 * **Ein Platz beim Planen** (T121, Entwurf `GPlanen`): der Punkt nach seiner
 * Lage — voll zugesagt oder nichts zu bestätigen, blass wartet, rot ein
 * Problem, gestrichelt offen —, der Name, die Rolle und rechts, was nicht
 * stimmt. Ein Tipp öffnet das Zuteilen.
 *
 * Ein offener Platz heißt „Zuteilen": Er sagt, was hier zu tun ist. „Wartet"
 * steht sichtbar bei der Rolle, wie im Entwurf; die übrigen Stufen nennt der
 * Punkt — und für Vorleseprogramme `status`, außer er steht schon sichtbar da
 * (die Absage als Hinweis).
 */
export function PlatzZeile({
  name,
  rolle,
  lage,
  hinweis,
  status,
  onClick,
}: {
  name: string
  rolle?: string
  lage: PlatzLage
  /** Was nicht stimmt, rot am Ende der Zeile („abwesend", „abgesagt"). */
  hinweis?: string
  /** Die Stufe der Zusage als Wort — wo es eine gibt. */
  status?: string
  onClick: () => void
}) {
  const { t } = useT()
  const rolleText = [rolle, lage === 'wartet' ? status : undefined].filter(Boolean).join(' · ')
  const stufeSichtbar = lage === 'wartet' || status === hinweis
  return (
    <button type="button" className={`platz ${LAGE_KLASSE[lage]}`} onClick={onClick}>
      <span className="platz-punkt" aria-hidden="true" />
      <span className="platz-name">{lage === 'offen' ? t.spurZuteilen : name}</span>
      {rolleText && <span className="platz-rolle">{rolleText}</span>}
      {hinweis && <span className="platz-hinweis">{hinweis}</span>}
      {status && !stufeSichtbar && <span className="sr-only">{status}</span>}
    </button>
  )
}
