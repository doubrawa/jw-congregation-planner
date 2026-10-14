import { useApp } from '../app/context'
import { fill, useT } from '../i18n/useT'
import { useWochenImport } from './useWochenImport'

/**
 * **Programm-Import**: holt die nächste Woche von jw.org. Der Ablauf steht in
 * `useWochenImport` — derselbe Knopf steht auf dem Start, sobald die Programme
 * knapp werden.
 *
 * Der Entwurf der Einstellungen (T121) zeigt den Import nicht mehr: Er zieht in
 * Phase 10 in die Wochenspalte links (`GWochen`, `GImport`). Bis dahin steht er
 * hier als letzte Karte.
 */
export function ProgrammKarte() {
  const { state } = useApp()
  const { t } = useT()
  const { importieren, knopf, geladenBis } = useWochenImport()

  return (
    <section className="karte einst-karte">
      <h2 className="abschnitt-titel karte-titel">{t.importCard}</h2>
      <p className="klein-text">{t.importDesc}</p>
      <p className="einst-stand">
        <span>{geladenBis ? fill(t.geladenBis, { datum: geladenBis }) : t.geladenNichts}</span>
        {geladenBis && <span className="klein-text">{fill(t.wochenGeladen, { n: state.weeks.length })}</span>}
      </p>
      <button type="button" className="knopf-umriss einst-import" onClick={() => void importieren()}>
        {knopf}
      </button>
    </section>
  )
}
