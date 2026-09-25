import { LOGO } from '../lib/logo'

/**
 * Kopf der Anmelde-Seiten: Logo, Wortmarke und darunter ein Satz — auf der
 * Anmeldung, wofür die App da ist (T113), beim Passwort-Reset, was zu tun ist.
 */
export function LoginKopf({ untertitel }: { untertitel: string }) {
  return (
    <header className="login-head">
      <img className="login-logo" src={LOGO} alt="" width={72} height={72} />
      {/* `wbr` statt festem Umbruch: der Name steht auf einer Zeile und
          bricht erst, wenn schmales Gerät oder große Schrift ihn drängen. */}
      <h1 className="login-wordmark">
        Versammlung
        <wbr />
        .app
      </h1>
      <p className="login-sub">{untertitel}</p>
    </header>
  )
}
