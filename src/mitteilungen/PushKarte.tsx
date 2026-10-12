import { useInstallAvailable, usePush } from '../components/usePush'
import { useT } from '../i18n/useT'
import { promptInstall } from '../lib/install'

/**
 * **Keine Zuteilung verpassen** (T121): die Karte oben auf den Mitteilungen,
 * um Benachrichtigungen auf diesem Gerät einzuschalten. Die Berechtigung fragt
 * erst „Aktivieren" an, nie die Karte selbst — ein abgelehnter Dialog sperrt
 * den Browser dauerhaft. Auf dem iPhone im Browser steht stattdessen die
 * Anleitung (Push geht dort erst als App); bietet der Browser die Installation
 * an, führt der Knopf dorthin.
 *
 * Bis zum Umbau stand der Hinweis unter „Meine Aufgaben" und ließ sich
 * wegklicken — dort war er Werbung. Hier steht er, wo man nach Mitteilungen
 * sieht, und geht von selbst: sobald das Gerät ein Abo hat, und auch, wenn der
 * Browser die Berechtigung schon verweigert hat. Dann richtete „Aktivieren"
 * nichts mehr aus.
 */
export function PushKarte() {
  const { t } = useT()
  const { angemeldet, supported, needsInstall, verweigert, subscribed, enable } = usePush()
  const installAvail = useInstallAvailable()

  if (!angemeldet || subscribed || verweigert) return null
  if (!supported && !needsInstall && !installAvail) return null

  return (
    <section className="karte push-karte">
      <span className="push-karte-text">
        <span className="push-karte-titel">{t.pushPromptTitle}</span>
        <span className="klein-text">{needsInstall && !supported ? t.pushPromptIos : t.pushPromptText}</span>
      </span>
      {supported ? (
        <button type="button" className="knopf-pille push-karte-knopf" onClick={() => void enable()}>
          {t.pushAktivieren}
        </button>
      ) : (
        installAvail && (
          <button type="button" className="knopf-pille push-karte-knopf" onClick={() => void promptInstall()}>
            {t.appInstallieren}
          </button>
        )
      )}
    </section>
  )
}
