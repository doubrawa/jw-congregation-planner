import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import type { FsBereich } from '../data/types'

/**
 * Reiter des Predigtdienstes beim Planen (T120): die Treffpunkte der Woche und
 * ihr Grundplan. Gestaltet wie die Reiter der Zusammenkünfte, damit beide
 * Themen dieselbe Bedienung haben.
 */
export function FsBereichTabs() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const bereiche: ReadonlyArray<[FsBereich, string]> = [
    ['treffpunkte', t.fsTreffpunkteTab],
    ['grundplan', t.fsGrundplan],
  ]
  return (
    <div className="meeting-tabs plan-tabs">
      {bereiche.map(([bereich, label]) => (
        <button
          key={bereich}
          type="button"
          className={state.fsBereich === bereich ? 'meeting-tab is-active' : 'meeting-tab'}
          aria-pressed={state.fsBereich === bereich}
          onClick={() => dispatch({ type: 'setFsBereich', bereich })}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
