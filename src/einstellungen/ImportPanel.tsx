import { useApp } from '../app/context'
import { fill, useT } from '../i18n/useT'
import { useWochenImport } from './useWochenImport'

/**
 * Programm-Import: holt die nächste Woche von jw.org (Produktion) bzw.
 * simuliert eine Beispielwoche (Demo). Der Ablauf selbst steht in
 * `useWochenImport` — derselbe Knopf steht auf dem Start-Bildschirm, sobald
 * die Programme knapp werden.
 */
export function ImportPanel() {
  const { state } = useApp()
  const { t } = useT()
  const { importieren, knopf, geladenBis } = useWochenImport()

  return (
    <div className="panel panel--pb16" data-farbe="neutral">
      <h2 className="panel-label">{t.importCard}</h2>
      <p className="panel-hint">{t.importDesc}</p>
      <div className="imp-status">
        <span className="kv-key">
          {geladenBis ? fill(t.geladenBis, { datum: geladenBis }) : t.geladenNichts}
        </span>
        {geladenBis && (
          <span className="imp-count">{fill(t.wochenGeladen, { n: state.weeks.length })}</span>
        )}
      </div>
      <button type="button" className="btn-outline imp-btn" onClick={() => void importieren()}>
        {knopf}
      </button>
    </div>
  )
}
