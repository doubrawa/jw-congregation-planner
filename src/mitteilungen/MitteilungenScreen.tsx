import { useApp } from '../app/context'
import { sichtbareMitteilungen } from '../app/mitteilungen'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { rechteVon } from '../data/rechte'
import type { Notification } from '../data/types'
import { useT } from '../i18n/useT'
import { AlleGelesen } from './AlleGelesen'
import { Mitteilung } from './Mitteilung'
import { PushKarte } from './PushKarte'
import { useMitteilungenNachladen } from './useMitteilungenNachladen'
import './mitteilungen.css'

/**
 * **Mitteilungen** (T121, Entwürfe `GMitteilungen` und
 * `GDesktopMitteilungen`): eine eigene Seite statt der Glocke, die sich über
 * die Seite legte. Oben die Karte, um Benachrichtigungen einzuschalten, dann
 * „Neu" mit dem, was sich gleich hier erledigen lässt, und „Früher".
 *
 * Am Handy steht statt der Kopfzeile Zurück und „Alle gelesen"
 * (`UnterseiteKopf`); ab dem Tablet steht „Alle gelesen" hier neben dem Titel.
 *
 * „Alle löschen" (T140) steht auf jeder Breite unter den Mitteilungen, mit
 * zwei Tipps wie jedes Löschen. Was vorbei ist, fällt ohnehin heraus
 * (`notificationsAus`); der Knopf bleibt, weil der Betreiber ihn vermisste
 * („Mitteilungen löschen gibt's nicht mehr"). Am Ende der Liste und nicht
 * neben dem Titel: Dort wäre der rot umrandete Knopf das Auffälligste der
 * Seite — vor allem, was man hier lesen und beantworten soll.
 */
export function MitteilungenScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  useMitteilungenNachladen()
  const sichtbar = sichtbareMitteilungen(state.notifs, rechteVon(state).zuteilen)
  const neu = sichtbar.filter((n) => !n.read)
  const frueher = sichtbar.filter((n) => n.read)

  return (
    <section className="screen mitteilungen">
      <div className="mitteilungen-kopf">
        <h1 className="seitentitel seitentitel--gross">{t.mitteilungen}</h1>
        {neu.length > 0 && <AlleGelesen className="knopf-umriss mitteilungen-alle" />}
      </div>
      <PushKarte />
      {sichtbar.length === 0 && <p className="karte mitteilungen-leer">{t.keineMitteilungen}</p>}
      <Abschnitt titel={t.mitteilungenNeu} liste={neu} art="neu" />
      <Abschnitt titel={t.mitteilungenFrueher} liste={frueher} art="frueher" />
      {sichtbar.length > 0 && (
        <div className="mitteilungen-fuss">
          <EntfernenKnopf className="knopf-umriss knopf-entfernen" text={t.alleLoeschen} onEntfernen={() => dispatch({ type: 'clearNotifs' })} />
        </div>
      )}
    </section>
  )
}

/** „Neu" oder „Früher": eine Überschrift und eine Karte — leer gar nichts. */
function Abschnitt({
  titel,
  liste,
  art,
}: {
  titel: string
  liste: readonly Notification[]
  art: 'neu' | 'frueher'
}) {
  if (liste.length === 0) return null
  return (
    <section className="mitteilungen-abschnitt" data-abschnitt={art}>
      <h2 className="abschnitt-titel">{titel}</h2>
      <div className="karte">
        {liste.map((n) => (
          <Mitteilung key={n.id} notif={n} />
        ))}
      </div>
    </section>
  )
}
