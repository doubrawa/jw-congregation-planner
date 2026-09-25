import { useApp } from '../app/context'
import { FS_TIME_OPTIONS } from '../data/fs'
import { useT } from '../i18n/useT'
import type { FsRule } from '../data/types'
import { WOCHENTAGE_AB_MONTAG, wochentagNameAusWd } from '../planen/wochentage'
import { Switch } from '../components/Switch'

/**
 * Grundplan der Treffpunkte (Einstellungen): regelmäßige Zeiten/Orte je
 * Versammlung und Gruppe. Regeln anlegen/ändern/löschen; jede Änderung setzt
 * die Wochenpläne neu auf (einzelne Wochen bleiben im Planen-Tab anpassbar).
 *
 * **Eine Karte je Abschnitt, alle in derselben Farbe** (T108, Vorschlag des
 * Betreibers). Bis zum 21.9.2026 stand alles in einer Karte, getrennt nur von
 * einer kleinen grauen Zeile: Beim Scrollen war die Überschrift schnell aus dem
 * Bild, die Zeilen sahen überall gleich aus, und der „+"-Knopf eines Abschnitts
 * stand unmittelbar über der Überschrift des nächsten — man tippte leicht in
 * die falsche Gruppe. Jetzt trägt jede Karte ihren Abschnitt in der Überschrift,
 * und der Knopf steht sichtbar in seiner Karte. Die gemeinsame Farbe hält die
 * Karten als eine Sache zusammen; der Erklärtext steht einmal, in der ersten.
 */
export function FsRulesPanel({ onlyGroup = null }: { onlyGroup?: string | null }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()

  const wdName = (d: number): string => wochentagNameAusWd(d, state.lang)
  const freqOptions: ReadonlyArray<[number, string]> = [
    [0, t.fsFreqW],
    [1, t.fsFreqM1],
    [2, t.fsFreqM2],
    [3, t.fsFreqM3],
    [4, t.fsFreqM4],
  ]

  // Gruppenaufseher: nur der Abschnitt der eigenen Gruppe — eine Karte, kein
  // leerer Rahmen um sie herum.
  const sections: ReadonlyArray<{ grp: string | null; title: string }> = onlyGroup
    ? state.groups.filter((g) => g.id === onlyGroup).map((g) => ({ grp: g.id, title: tu(g.name) }))
    : [{ grp: null, title: t.versammlungCard }, ...state.groups.map((g) => ({ grp: g.id, title: tu(g.name) }))]

  const upd = (id: string, patch: Partial<Pick<FsRule, 'wd' | 'monthly' | 'time' | 'place' | 'skipCong'>>) =>
    dispatch({ type: 'fsRuleUpdate', id, patch })

  return (
    <>
      {sections.map((sec, i) => (
        <div key={sec.grp || 'vers'} className="panel panel--pb16" data-farbe="neutral">
          {/* Zwei übersetzte Bausteine statt eines neuen Satzes je Sprache —
              wie „Vorsitz · Unter der Woche" im Personen-Detail. */}
          <h2 className="panel-label fsr-label">{`${t.fsShort} · ${sec.title}`}</h2>
          {i === 0 && <p className="panel-hint">{t.fsGrundDesc}</p>}

          {state.fsRules
            .filter((r) => r.grp === sec.grp)
            .map((rule) => (
              <div key={rule.id} className="fsr-row">
                <div className="fsr-line">
                  {/* Wochentag und Häufigkeit nebeneinander, solange beide ganz
                      lesbar sind — sonst bricht die Häufigkeit in eine zweite
                      Reihe um, und das ✕ bleibt rechts daneben (einstellungen.css). */}
                  <div className="fsr-wahl">
                    <select
                      className="fs-select"
                      value={rule.wd}
                      aria-label={t.a11yWeekday}
                      onChange={(e) => upd(rule.id, { wd: Number(e.target.value) })}
                    >
                      {WOCHENTAGE_AB_MONTAG.map((d) => (
                        <option key={d} value={d}>
                          {wdName(d)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="fs-select"
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
                  </div>
                  <button
                    type="button"
                    className="fs-remove"
                    aria-label={t.a11yRemove}
                    onClick={() => dispatch({ type: 'fsRuleRemove', id: rule.id })}
                  >
                    ✕
                  </button>
                </div>

                <div className="fsr-line">
                  <select
                    className="fs-select fs-select--time"
                    value={rule.time}
                    aria-label={t.a11yTime}
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
                    dir="auto"
                    value={rule.place}
                    placeholder={t.fsOrtPh}
                    aria-label={t.fsOrtPh}
                    onChange={(e) => upd(rule.id, { place: e.target.value })}
                  />
                </div>

                {sec.grp != null && (
                  <div className="fsr-skip">
                    <Switch
                      on={rule.skipCong}
                      label={t.fsSkipCong}
                      onToggle={() => upd(rule.id, { skipCong: !rule.skipCong })}
                    />
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
    </>
  )
}
