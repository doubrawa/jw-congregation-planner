import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { Punkt } from '../bausteine/Punkt'
import { zusammenkunftName } from '../components/anlass-name'
import { anwesenheitDer, heuteZuZaehlen } from '../data/anwesenheit'
import { displayName } from '../data/helpers'
import { useT } from '../i18n/useT'
import { AnwesenheitFormular } from './AnwesenheitFormular'
import './anwesenheit.css'

/**
 * **Anwesende eintragen — auf dem Start** (T152): für den Saalordner und den
 * Zoom-Ordner, sobald ihre Zusammenkunft begonnen hat, und bis zum Ende des
 * Tages. Gezählt wird, während sie läuft; das Formular steht gleich in der
 * Karte, ohne Umweg. Am nächsten Tag ist die Karte fort — nachtragen können
 * Admin und Planer im Programm oder in der Auswertung.
 *
 * Gerechnet wird mit der Uhr bei jedem Zeichnen: Der Start zeichnet bei jeder
 * Änderung neu, und wer um 19:05 hereinschaut, hat die App eben geöffnet.
 */
export function AnwesenheitKarte() {
  const { state } = useApp()
  const { t } = useT()
  if (state.staleAt !== null) return null
  const me = eigenePerson(state)
  const ich = me ? { id: me.id, name: displayName(me) } : null
  const zaehlen = heuteZuZaehlen(state.weeks, state.congregation.times, ich, new Date())
  if (zaehlen.length === 0) return null
  return (
    <>
      {zaehlen.map(({ week, tab }) => (
        <section key={`${week.start}|${tab}`} className="karte karte--held anwesend-karte" aria-label={t.anwesendTitel}>
          <div className="aufgabe-wann">
            <Punkt art="du" />
            <span>{zusammenkunftName(tab, t)}</span>
          </div>
          <h2 className="anwesend-karte-titel">{t.anwesendTitel}</h2>
          <AnwesenheitFormular woche={week.start} tab={tab} eintrag={anwesenheitDer(state.anwesenheit, week.start, tab)} />
        </section>
      ))}
    </>
  )
}
