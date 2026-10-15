import { Logo } from '../bausteine/Logo'

/**
 * Kopf der Anmeldung: Logo, Wortmarke und darunter, wofür die App da ist
 * (T113). Die Überschrift der Seite ist der Titel darunter („Anmelden") —
 * die Wortmarke ist deshalb ein Absatz, keine zweite `h1`.
 *
 * Das Logo groß, mit 4-6-8 Plätzen und ohne Kachel, in den Farben der
 * Darstellung (Entwurf `GAnmeldung`, T121 Phase 10). Bis dahin stand hier
 * `logo.svg` mit seiner Kachel — in Petrol und Gold auf Graphit.
 */
export function LoginKopf({ untertitel }: { untertitel: string }) {
  return (
    <header className="login-head">
      <Logo gross breite={150} className="login-logo" />
      {/* `wbr` statt festem Umbruch: der Name steht auf einer Zeile und
          bricht erst, wenn schmales Gerät oder große Schrift ihn drängen. */}
      <p className="login-wordmark">
        Versammlung
        <wbr />
        .app
      </p>
      <p className="login-sub">{untertitel}</p>
    </header>
  )
}
