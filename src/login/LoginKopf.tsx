import { LOGO } from '../lib/logo'

/**
 * Kopf der Anmeldung: Logo, Wortmarke und darunter, wofür die App da ist
 * (T113). Die Überschrift der Seite ist der Titel darunter („Anmelden") —
 * die Wortmarke ist deshalb ein Absatz, keine zweite `h1`.
 */
export function LoginKopf({ untertitel }: { untertitel: string }) {
  return (
    <header className="login-head">
      <img className="login-logo" src={LOGO} alt="" width={72} height={72} />
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
