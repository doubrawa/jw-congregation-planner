import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { langLabel, useLangNames } from '../i18n/langnames'
import { useT } from '../i18n/useT'
import { EinstellZeile } from './EinstellZeile'

/**
 * **Programmsprachen** (T121, Zeile in `GEinstellungen`): die Sprache der
 * Versammlung — sie bestimmt das Arbeitsheft beim Import — und weitere
 * Sprachen, in denen das Programm zusätzlich kommt. Gewählt wird im
 * Sprachen-Blatt der App (`openLangSheet`); entfernt mit zwei Tipps.
 *
 * Am Handy eine Unteransicht, am Desktop unter „Versammlung".
 */
export function SprachenInhalt() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Gespeichert ist der jw.org-Code; angezeigt wird der Name in der Bediensprache.
  useLangNames(state.lang)
  const name = (code: string) => langLabel(code, state.lang)

  return (
    <>
      <section className="karte einst-karte">
        <EinstellZeile name={t.versSprache} wert={name(state.congLang)} onTipp={() => dispatch({ type: 'openLangSheet' })} />
        <p className="klein-text einst-hinweis">{t.versSpracheDesc}</p>
      </section>
      <section className="karte einst-karte">
        <h2 className="abschnitt-titel karte-titel">{t.progLangsLbl}</h2>
        {state.progLangs.map((code) => (
          <div key={code} className="einst-zeile einst-zeile--entfernbar">
            <span className="einst-zeile-name">{name(code)}</span>
            <EntfernenKnopf
              className="rund-knopf rund-knopf--feld"
              frage={t.entfernenSicher}
              onEntfernen={() => dispatch({ type: 'removeProgLang', code })}
            />
          </div>
        ))}
        <button type="button" className="zeile-hinzu" onClick={() => dispatch({ type: 'openLangSheet', mode: 'alt' })}>
          <Zeichen name="plus" />
          {t.spracheHinzu}
        </button>
        <p className="klein-text einst-hinweis">{t.progLangsDesc}</p>
      </section>
    </>
  )
}
