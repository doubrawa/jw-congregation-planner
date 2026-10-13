import { useState } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import { useInstallAvailable, usePush } from '../components/usePush'
import { useT } from '../i18n/useT'
import { promptInstall } from '../lib/install'

/** Auf diesem Gerät weggeklickt — gilt für jedes Konto, wie Farbschema und Schrift. */
const WEG_KEY = 'pushKarteWeg'

/**
 * **Keine Zuteilung verpassen** (T121): die Karte oben auf den Mitteilungen,
 * um Benachrichtigungen auf diesem Gerät einzuschalten. Die Berechtigung fragt
 * erst „Aktivieren" an, nie die Karte selbst — ein abgelehnter Dialog sperrt
 * den Browser dauerhaft. Auf dem iPhone im Browser steht stattdessen die
 * Anleitung (Push geht dort erst als App); bietet der Browser die Installation
 * an, führt der Knopf dorthin.
 *
 * Sie geht von selbst, sobald das Gerät ein Abo hat, und auch, wenn der
 * Browser die Berechtigung schon verweigert hat — dann richtete „Aktivieren"
 * nichts mehr aus. **Und sie lässt sich wegklicken** (Entscheid vom
 * 13.10.2026, wie der Hinweis unter „Meine Aufgaben" bis zum Umbau): Das ✕
 * blendet sie auf diesem Gerät für immer aus; einschalten geht weiter im
 * Profil.
 */
export function PushKarte() {
  const { t } = useT()
  const { angemeldet, supported, needsInstall, verweigert, subscribed, enable } = usePush()
  const installAvail = useInstallAvailable()
  const [weg, setWeg] = useState(() => localStorage.getItem(WEG_KEY) === '1')

  if (!angemeldet || subscribed || verweigert || weg) return null
  if (!supported && !needsInstall && !installAvail) return null

  const wegklicken = () => {
    setWeg(true)
    try {
      localStorage.setItem(WEG_KEY, '1')
    } catch {
      // Ohne Speicher (privates Fenster) bleibt sie nur bis zum Neuladen weg.
    }
  }

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
      <button type="button" className="rund-knopf push-karte-weg" aria-label={t.pushKarteWeg} onClick={wegklicken}>
        <Zeichen name="kreuz" />
      </button>
    </section>
  )
}
