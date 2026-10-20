import { useApp } from '../app/context'
import { Sheet } from '../components/Sheet'
import { aufgabenZeilen, useT } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { aufgabeWann } from './aufgabe-anzeige'
import { GesuchText } from './Angebot'
import './aufgaben.css'

/**
 * **Das Blatt beim Öffnen der App** (T121). Es legt zweierlei vor:
 *
 *  1. **Offene Zuteilungen** — je Aufgabe Bestätigen oder „Ich kann nicht"
 *     (das Absage-Blatt), unten „Alle bestätigen" für alles auf einmal.
 *  2. **Offene Ersatzgesuche** — freiwillig (T69). Sie erreichten bis dahin
 *     nur, wer von selbst unter „Aufgaben" nachsah oder über einen Push
 *     hereinkam; die übrigen erfuhren nie davon.
 *
 * Beides in **einem** Blatt und aus derselben Ableitung: eine zweite Mechanik
 * neben dem Bestätigen wäre ein zweiter Ort, an dem so etwas vergessen wird.
 *
 * **„Später" legt es weg** — auch mit offenen Zuteilungen. Bis zum 12.10.2026
 * hielt das Blatt, bis alles bestätigt war; wer gerade nur nachsehen wollte,
 * kam an nichts anderes heran. Beim nächsten Öffnen liegt es wieder da
 * (`login`), und die Zahl am Menüpunkt erinnert dazwischen.
 */
export function OeffnenBlatt() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const offen = state.myTasks.filter((task) => task.status === 'offen')
  const gesuche = state.substituteReqs
  const spaeter = () => dispatch({ type: 'closeConfirm' })

  return (
    <Sheet
      label={offen.length > 0 ? t.confirmTitle : t.einspringenTitle}
      title={offen.length > 0 ? t.confirmTitle : t.einspringenTitle}
      sub={offen.length > 0 ? zahlBinden(`${t.dashZuBest}: ${offen.length}`) : t.einspringenHint}
      schliessen={false}
      onClose={spaeter}
    >
      <div className="sheet-inhalt oeffnen-liste">
        {offen.map((task) => {
          const { titel, unter } = aufgabenZeilen(task, i18n)
          return (
            <div key={task.id} className="oeffnen-aufgabe">
              <div className="oeffnen-text">
                <span className="oeffnen-wann">{aufgabeWann(task, state.lang, i18n)}</span>
                <span className="oeffnen-titel">{titel}</span>
                {unter && <span className="klein-text">{unter}</span>}
              </div>
              <div className="oeffnen-knoepfe">
                <button type="button" className="knopf-haupt" onClick={() => dispatch({ type: 'confirmTask', id: task.id })}>
                  {t.bestaetigen}
                </button>
                <button type="button" className="knopf-leise" onClick={() => dispatch({ type: 'openAbsage', id: task.id })}>
                  {t.kannNicht}
                </button>
              </div>
            </div>
          )
        })}

        {gesuche.length > 0 && (
          <section className={offen.length > 0 ? 'oeffnen-gesuche is-nach' : 'oeffnen-gesuche'}>
            {offen.length > 0 && (
              <>
                <h3 className="abschnitt-titel">{t.einspringenTitle}</h3>
                <p className="klein-text">{t.einspringenHint}</p>
              </>
            )}
            {gesuche.map((req) => (
              <div key={req.key} className="oeffnen-aufgabe">
                <GesuchText req={req} />
                <div className="oeffnen-knoepfe">
                  <button type="button" className="knopf-dunkel" onClick={() => dispatch({ type: 'takeSubstitute', key: req.key })}>
                    {t.uebernehmen}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
      <div className="sheet-fuss oeffnen-fuss">
        {offen.length > 1 ? (
          <button type="button" className="knopf-umriss" onClick={() => dispatch({ type: 'confirmAll' })}>
            {t.alleBestaetigen}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="knopf-leise" onClick={spaeter}>
          {t.spaeter}
        </button>
      </div>
    </Sheet>
  )
}
