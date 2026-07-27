import { useState } from 'react'
import { useApp } from '../app/context'
import { promptInstall } from '../lib/install'
import { useT } from '../i18n/useT'
import { useInstallAvailable, usePush } from './usePush'
import './pushprompt.css'

const DISMISS_KEY = 'cp:pushPromptOff'

/**
 * Freundlicher Opt-in-Hinweis für Benachrichtigungen — im „richtigen Moment"
 * (auf „Meine Aufgaben", sobald jemand Zuteilungen hat) statt versteckt im
 * Profil. Der native Berechtigungs-Dialog wird erst durch „Aktivieren" ausgelöst.
 * iOS im Browser: Installations-Anleitung (Push geht erst als App). Chromium:
 * zusätzlich „App installieren". Einmal weggeklickt (localStorage), kehrt der
 * Hinweis nicht wieder; aktivieren geht weiter jederzeit über das Profil.
 */
export function PushPrompt() {
  const { state } = useApp()
  const { t } = useT()
  const { production, supported, needsInstall, subscribed, enable } = usePush()
  const installAvail = useInstallAvailable()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  // Nur im Produktionsmodus, mit anstehenden Aufgaben, noch nicht abonniert und
  // nicht weggeklickt. Und nur, wenn Push überhaupt erreichbar ist (direkt,
  // per iOS-Installation oder per Chromium-Installation).
  if (!production || subscribed || dismissed || state.myTasks.length === 0) return null
  if (!supported && !needsInstall && !installAvail) return null

  return (
    <div className="push-prompt">
      <div className="push-prompt-head">
        <span className="push-prompt-icon" aria-hidden="true">
          🔔
        </span>
        <span className="push-prompt-title">{t.pushPromptTitle}</span>
        <button
          type="button"
          className="push-prompt-x"
          aria-label={t.a11yClose}
          onClick={dismiss}
        >
          ✕
        </button>
      </div>
      <p className="push-prompt-text">{needsInstall && !supported ? t.pushPromptIos : t.pushPromptText}</p>
      {(supported || installAvail) && (
        <div className="push-prompt-actions">
          {supported ? (
            <button type="button" className="push-prompt-btn" onClick={() => void enable()}>
              {t.pushAktivieren}
            </button>
          ) : (
            <button type="button" className="push-prompt-btn" onClick={() => void promptInstall()}>
              {t.appInstallieren}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
