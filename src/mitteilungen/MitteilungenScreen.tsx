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
 * „Alle löschen" (T140) steht auf jeder Breite neben dem Titel, mit zwei Tipps
 * wie jedes Löschen. Mit dem Entwurf war es am 12.10.2026 gegangen — was
 * vorbei ist, fällt ohnehin heraus (`notificationsAus`) —, der Betreiber
 * vermisste es beim Testen: „Mitteilungen löschen gibt's nicht mehr."
 * Am Handy nicht im Kopf: Neben „Alle gelesen" fehlt dort in vielen Sprachen
 * der Platz („Oznacz wszystkie jako przeczytane").
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
        {sichtbar.length > 0 && (
          <div className="mitteilungen-aktionen">
            {neu.length > 0 && <AlleGelesen className="knopf-umriss mitteilungen-alle" />}
            <EntfernenKnopf className="knopf-umriss knopf-entfernen" text={t.alleLoeschen} onEntfernen={() => dispatch({ type: 'clearNotifs' })} />
          </div>
        )}
      </div>
      <PushKarte />
      {sichtbar.length === 0 && <p className="karte mitteilungen-leer">{t.keineMitteilungen}</p>}
      <Abschnitt titel={t.mitteilungenNeu} liste={neu} art="neu" />
      <Abschnitt titel={t.mitteilungenFrueher} liste={frueher} art="frueher" />
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
