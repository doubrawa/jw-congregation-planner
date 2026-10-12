import { useApp } from '../app/context'
import { handlungZu, mitteilungsZiel } from '../app/mitteilungen'
import { rechteVon } from '../data/rechte'
import type { Notification } from '../data/types'
import { NOTIF_TITLE_KEY } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { relativeZeit } from '../i18n/zeit'

/**
 * **Eine Mitteilung** (T121): Titel und wie lange es her ist, darunter der
 * Text — höchstens zwei Zeilen, ganz im Tooltip.
 *
 * **Ein Tipp führt dorthin, wo sie herkommt** (4.10.2026, `mitteilungsZiel`)
 * — und sie gilt damit als gelesen. Offline nicht: Gespeichert werden kann
 * dann nichts, und die Sperre (store.tsx) meldete statt des Sprungs bloß „nur
 * lesen". Das Ziel selbst ist Ansehen und geht auch offline.
 *
 * Eine neue trägt darunter, was man gleich hier tun kann (`handlungZu`). Wer
 * bestätigt oder übernimmt, hat sie damit gelesen; „Ich kann nicht" öffnet
 * erst das Blatt zum Absagen, und wer es abbricht, hat nichts beantwortet.
 */
export function Mitteilung({ notif }: { notif: Notification }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const titleKey = NOTIF_TITLE_KEY[notif.title]
  const text = tu(notif.text)
  const handlung = notif.read ? null : handlungZu(notif, state)

  const gelesen = () => {
    if (!notif.read && !state.staleAt) dispatch({ type: 'mitteilungGelesen', id: notif.id })
  }
  const oeffnen = () => {
    gelesen()
    const lage = { zuteilen: rechteVon(state).zuteilen, weeks: state.weeks, myTasks: state.myTasks }
    for (const aktion of mitteilungsZiel(notif, lage)) dispatch(aktion)
  }

  return (
    <div className={notif.read ? 'mitteilung' : 'mitteilung is-neu'}>
      <span className="mitteilung-punkt" aria-hidden="true" />
      <button type="button" className="mitteilung-link" onClick={oeffnen}>
        <span className="mitteilung-kopf">
          <span className="mitteilung-titel">{titleKey ? t[titleKey] : notif.title}</span>
          <span className="mitteilung-zeit">{relativeZeit(notif.at, state.lang)}</span>
        </span>
        <span className="mitteilung-text" title={text}>
          {text}
        </span>
      </button>
      {handlung?.art === 'bestaetigen' && (
        <div className="mitteilung-handlungen">
          <button
            type="button"
            className="knopf-haupt"
            onClick={() => {
              gelesen()
              dispatch({ type: 'confirmTask', id: handlung.id })
            }}
          >
            {t.bestaetigen}
          </button>
          <button type="button" className="knopf-umriss" onClick={() => dispatch({ type: 'openAbsage', id: handlung.id })}>
            {t.kannNicht}
          </button>
        </div>
      )}
      {handlung?.art === 'uebernehmen' && (
        <div className="mitteilung-handlungen">
          <button
            type="button"
            className="knopf-dunkel"
            onClick={() => {
              gelesen()
              dispatch({ type: 'takeSubstitute', key: handlung.id })
            }}
          >
            {t.uebernehmen}
          </button>
        </div>
      )}
    </div>
  )
}
