import { useApp } from '../app/context'
import { FS_BASE } from '../data/demo'
import { FS_TIME_OPTIONS, fsDate } from '../data/fs'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { FsRule } from '../data/types'

/**
 * Grundplan der Treffpunkte (Einstellungen): regelmäßige Zeiten/Orte je
 * Versammlung und Gruppe. Regeln anlegen/ändern/löschen; jede Änderung setzt
 * die Wochenpläne neu auf (einzelne Wochen bleiben im Planen-Tab anpassbar).
 */
export function FsRulesPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()

  const wdOptions = [1, 2, 3, 4, 5, 6, 0]
  const wdName = (d: number): string =>
    fsDate(FS_BASE, 0, d).toLocaleDateString(LOCALES[state.lang], { weekday: 'long' })
  const freqOptions: ReadonlyArray<[number, string]> = [
    [0, t.fsFreqW],
    [1, t.fsFreqM1],
    [2, t.fsFreqM2],
    [3, t.fsFreqM3],
    [4, t.fsFreqM4],
  ]

  const sections: ReadonlyArray<{ grp: string; title: string }> = [
    { grp: '', title: t.fsVersSection },
    ...state.groups.map((g) => ({ grp: g.id, title: tu(g.name) })),
  ]

  const upd = (id: string, patch: Partial<Pick<FsRule, 'wd' | 'monthly' | 'time' | 'place' | 'skipCong'>>) =>
    dispatch({ type: 'fsRuleUpdate', id, patch })

  return (
    <div className="panel panel--pb16" data-farbe="neutral">
      <div className="panel-label">{t.fsGrundplan}</div>
      <p className="panel-hint">{t.fsGrundDesc}</p>

      {sections.map((sec) => (
        <div key={sec.grp || 'vers'} className="fsr-section">
          <div className="fsr-section-title">{sec.title}</div>

          {state.fsRules
            .filter((r) => r.grp === sec.grp)
            .map((rule) => (
              <div key={rule.id} className="fsr-row">
                <div className="fsr-line">
                  <select
                    className="fs-select fsr-grow"
                    value={rule.wd}
                    aria-label="Wochentag"
                    onChange={(e) => upd(rule.id, { wd: Number(e.target.value) })}
                  >
                    {wdOptions.map((d) => (
                      <option key={d} value={d}>
                        {wdName(d)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="fs-select fsr-grow"
                    value={rule.monthly}
                    aria-label={t.fsFreqW}
                    onChange={(e) => upd(rule.id, { monthly: Number(e.target.value) })}
                  >
                    {freqOptions.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="fs-remove"
                    aria-label="✕"
                    onClick={() => dispatch({ type: 'fsRuleRemove', id: rule.id })}
                  >
                    ✕
                  </button>
                </div>

                <div className="fsr-line">
                  <select
                    className="fs-select fs-select--time"
                    value={rule.time}
                    aria-label="Zeit"
                    onChange={(e) => upd(rule.id, { time: e.target.value })}
                  >
                    {FS_TIME_OPTIONS.map((tm) => (
                      <option key={tm} value={tm}>
                        {tm}
                      </option>
                    ))}
                  </select>
                  <input
                    className="fsr-input"
                    type="text"
                    value={rule.place}
                    placeholder={t.fsOrtPh}
                    aria-label={t.fsOrtPh}
                    onChange={(e) => upd(rule.id, { place: e.target.value })}
                  />
                </div>

                {sec.grp !== '' && (
                  <div className="fsr-skip">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.skipCong}
                      aria-label={t.fsSkipCong}
                      className={rule.skipCong ? 'switch is-on' : 'switch'}
                      onClick={() => upd(rule.id, { skipCong: !rule.skipCong })}
                    >
                      <span className="switch-knob" />
                    </button>
                    <span className="fsr-skip-label">{t.fsSkipCong}</span>
                  </div>
                )}
              </div>
            ))}

          <button
            type="button"
            className="btn-outline fsr-add"
            onClick={() => dispatch({ type: 'fsRuleAdd', grp: sec.grp })}
          >
            {t.fsAdd}
          </button>
        </div>
      ))}
    </div>
  )
}
