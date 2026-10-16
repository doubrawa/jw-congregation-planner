import { RECHTE_STUFE_KEY } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { useApp } from './context'

/**
 * **Die Leiste der Ansicht** (befristet, T124): Solange der Admin die App als
 * eine andere Stufe ansieht, steht sie auf jedem Bildschirm — mit einem Tipp
 * zurück zum eigenen Recht. Sie sagt auch, dass das Tun darin echt ist: Die
 * Datenbank kennt nur das Recht des Admins.
 */
export function AnsichtLeiste() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  if (!state.planner || !state.ansicht) return null
  return (
    <div className="ansicht-leiste" role="status">
      <div className="ansicht-leiste-text">
        <strong>{fill(t.ansichtLeiste, { stufe: t[RECHTE_STUFE_KEY[state.ansicht.stufe]] })}</strong>
        <div className="ansicht-leiste-hinweis">{t.ansichtLeisteHinweis}</div>
      </div>
      <button type="button" className="knopf-pille" onClick={() => dispatch({ type: 'setAnsicht', ansicht: null })}>
        {t.ansichtBeenden}
      </button>
    </div>
  )
}
