import { useMemo } from 'react'
import { useApp } from '../app/context'
import { langChoices, useLangNames } from '../i18n/langnames'
import { fill, useT } from '../i18n/useT'
import { Sheet } from './Sheet'

/**
 * Sprach-Sheet: durchsuchbare vollständige jw.org-Liste. Zwei Modi
 * (state.langSheetFor): Versammlungssprache wählen ('cong') oder eine weitere
 * Programmsprache für den Import hinzufügen ('alt').
 *
 * Die Namen stehen in der Bediensprache (`langChoices`), gespeichert wird der
 * jw.org-Sprachcode — derselbe Wert, den die Datenbank führt und den der
 * Import braucht. Ein Name ist keine Kennung.
 */
export function LanguageSheet() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const gen = useLangNames(state.lang)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alle = useMemo(() => langChoices(state.lang), [state.lang, gen])
  const altMode = state.langSheetFor === 'alt'
  const close = () => dispatch({ type: 'closeLangSheet' })
  const pick = (code: string) =>
    dispatch(altMode ? { type: 'addProgLang', code } : { type: 'setCongLang', code })
  const isActive = (code: string) =>
    altMode ? state.progLangs.includes(code) : state.congLang === code

  // Gesucht wird über beide Namen: wer „Hebräisch" tippt, findet עברית, und wer
  // עברית tippt, findet es auch. Nach einem Sprachwechsel weiß man oft nur noch
  // den einen von beiden.
  const query = state.langSearch.trim().toLowerCase()
  const filtered = alle.filter(
    (l) => !query || l.label.toLowerCase().includes(query) || l.deutsch.toLowerCase().includes(query),
  )

  return (
    <Sheet
      variante="lang"
      label={t.a11yCongLang}
      title={altMode ? t.progLangsLbl : t.versSprache}
      sub={`${fill(t.langCount, { n: filtered.length })} · ${t.langListNote}`}
      onClose={close}
    >
      <input
        type="text"
        dir="auto"
        className="lang-search"
        placeholder={t.langSearchPh}
        aria-label={t.langSearchPh}
        value={state.langSearch}
        onChange={(e) => dispatch({ type: 'setLangSearch', text: e.target.value })}
      />
      <div className="lang-list">
        {filtered.map((l) => {
          const active = isActive(l.key)
          return (
            <button
              key={l.key}
              type="button"
              className={active ? 'lang-row is-active' : 'lang-row'}
              onClick={() => pick(l.key)}
            >
              <span>{l.label}</span>
              {active && <span className="lang-check">✓</span>}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
